/**
 * JpMC Synapse — Google Authentication & Drive Workspace Integration
 * Production-ready OAuth 2.0 and Google Identity Services integration.
 * Scopes: https://www.googleapis.com/auth/drive.file (incremental authorization for Drive backup only)
 * Origin: https://jpmc-synapse.onrender.com (and AI Studio Cloud Run preview environments)
 *
 * NOTE: All Google Calendar integrations have been completely removed.
 * JpMC Synapse uses its own internal Firestore-based calendar & scheduling engine.
 */

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebaseClient';
import { apiFetch } from '../config/api';
import firebaseConfig from '../../firebase-applet-config.json';

// Identity scopes for Admin Google Sign-In only
export const LOGIN_SCOPES = [
  'openid',
  'email',
  'profile',
];

// Incremental Google Drive authorization scope (requested ONLY inside Drive Backup)
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const SCOPES = LOGIN_SCOPES;

// Resolved Google Client ID: prioritizes environment variable, falls back to config
export const GOOGLE_CLIENT_ID =
  ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string) ||
  firebaseConfig.oAuthClientId ||
  '103277329126-fppb2csm3a2nk3mngvk3ulantfjrqkd4.apps.googleusercontent.com';

export interface DriveAuthState {
  isAuthorized: boolean;
  status: 'checking' | 'connected' | 'not_connected' | 'error';
  email: string | null;
  expiresAt: number | null;
  errorMessage?: string | null;
}

// In-memory token cache for Google Drive API operations
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let isSigningIn = false;

let driveState: DriveAuthState = {
  isAuthorized: false,
  status: 'not_connected',
  email: null,
  expiresAt: null,
  errorMessage: null,
};

const driveListeners = new Set<(state: DriveAuthState) => void>();

function notifyDriveListeners() {
  driveListeners.forEach((fn) => {
    try {
      fn({ ...driveState });
    } catch (e) {
      console.warn('[googleAuth] Listener error:', e);
    }
  });
}

export function subscribeDriveAuth(listener: (state: DriveAuthState) => void): () => void {
  driveListeners.add(listener);
  listener({ ...driveState });
  return () => {
    driveListeners.delete(listener);
  };
}

export function getDriveAuthState(): DriveAuthState {
  return { ...driveState };
}

function clearDriveToken() {
  cachedAccessToken = null;
  tokenExpiresAt = null;
  try {
    sessionStorage.removeItem('jpmc_drive_token');
    sessionStorage.removeItem('jpmc_drive_expires_at');
    sessionStorage.removeItem('jpmc_drive_email');
  } catch {}

  driveState = {
    isAuthorized: false,
    status: 'not_connected',
    email: null,
    expiresAt: null,
    errorMessage: null,
  };
  notifyDriveListeners();
}

function setDriveToken(token: string, expiresAt: number, email: string | null) {
  cachedAccessToken = token;
  tokenExpiresAt = expiresAt;
  try {
    sessionStorage.setItem('jpmc_drive_token', token);
    sessionStorage.setItem('jpmc_drive_expires_at', String(expiresAt));
    if (email) {
      sessionStorage.setItem('jpmc_drive_email', email);
    }
  } catch {}

  driveState = {
    isAuthorized: true,
    status: 'connected',
    email: email || driveState.email,
    expiresAt,
    errorMessage: null,
  };
  notifyDriveListeners();
}

/**
 * Dynamically loads Google Identity Services (GSI) script if not yet present
 */
function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('google-gsi-client');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => {
      console.warn('[googleAuth] Failed to load GSI script:', err);
      reject(err);
    };
    document.head.appendChild(script);
  });
}

/**
 * Verifies an access token against Google Drive API v3
 */
export async function verifyDriveAccess(
  token: string
): Promise<{ valid: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return { valid: true, email: data?.user?.emailAddress };
    }

    const errData = await res.json().catch(() => ({}));
    return { valid: false, error: errData?.error?.message || `HTTP_${res.status}` };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'NETWORK_ERROR' };
  }
}

/**
 * Initializes Drive auth from session storage on startup/refresh
 */
export async function initDriveAuth(): Promise<DriveAuthState> {
  try {
    const token = sessionStorage.getItem('jpmc_drive_token');
    const expiresAtStr = sessionStorage.getItem('jpmc_drive_expires_at');
    const email = sessionStorage.getItem('jpmc_drive_email');

    if (token && expiresAtStr) {
      const expiresAt = Number(expiresAtStr);
      if (Date.now() < expiresAt - 60000) {
        cachedAccessToken = token;
        tokenExpiresAt = expiresAt;
        driveState = {
          isAuthorized: true,
          status: 'connected',
          email: email || auth.currentUser?.email || null,
          expiresAt,
          errorMessage: null,
        };
        notifyDriveListeners();
        return driveState;
      }
    }
  } catch (e) {
    console.warn('[initDriveAuth] Error restoring session:', e);
  }

  clearDriveToken();
  return driveState;
}

/**
 * Requests Google Drive OAuth 2.0 authorization with drive.file scope.
 * Uses incremental authorization: this is called ONLY when an administrator
 * explicitly interacts with the Google Drive Backup / Export feature.
 */
export const requestDriveAccess = async (
  promptType: 'consent' | 'select_account' | '' = 'consent'
): Promise<string> => {
  driveState = { ...driveState, status: 'checking', errorMessage: null };
  notifyDriveListeners();

  // Try Google Identity Services (GSI) Token Client first
  try {
    await loadGsiScript();
    if ((window as any).google?.accounts?.oauth2) {
      return await new Promise<string>((resolve, reject) => {
        let isSettled = false;
        try {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: DRIVE_SCOPE,
            callback: async (response: any) => {
              if (isSettled) return;
              isSettled = true;

              if (response.error) {
                console.warn('[GSI Drive Token Error]:', response.error);
                if (response.error === 'popup_closed_by_user') {
                  driveState = {
                    ...driveState,
                    status: 'not_connected',
                    errorMessage: 'অনুমোদন উইন্ডো বন্ধ করা হয়েছে (Popup closed)',
                  };
                  notifyDriveListeners();
                  reject(new Error('POPUP_CLOSED'));
                  return;
                }
                if (response.error === 'access_denied') {
                  driveState = {
                    ...driveState,
                    status: 'not_connected',
                    errorMessage: 'ড্রাইভ অ্যাক্সেস অনুমতি দেওয়া হয়নি (Access denied)',
                  };
                  notifyDriveListeners();
                  reject(new Error('ACCESS_DENIED'));
                  return;
                }
                driveState = {
                  ...driveState,
                  status: 'error',
                  errorMessage: response.error_description || response.error,
                };
                notifyDriveListeners();
                reject(new Error(response.error_description || response.error));
                return;
              }

              const token = response.access_token;
              const expiresIn = Number(response.expires_in) || 3599;
              const expiresAt = Date.now() + expiresIn * 1000;

              const resolvedEmail = auth.currentUser?.email || null;
              setDriveToken(token, expiresAt, resolvedEmail);
              resolve(token);
            },
            error_callback: (err: any) => {
              if (isSettled) return;
              isSettled = true;
              console.warn('[GSI Drive Client Error]:', err);
              driveState = {
                ...driveState,
                status: 'error',
                errorMessage: err?.message || 'OAuth error',
              };
              notifyDriveListeners();
              reject(new Error(err?.message || 'OAuth error'));
            },
          });

          client.requestAccessToken({ prompt: promptType });
        } catch (initErr) {
          if (!isSettled) {
            isSettled = true;
            reject(initErr);
          }
        }
      });
    }
  } catch (gsiErr: any) {
    console.warn('[googleAuth] GSI Drive flow failed, trying Firebase popup fallback:', gsiErr?.message || gsiErr);
    if (gsiErr?.message === 'POPUP_CLOSED' || gsiErr?.message === 'ACCESS_DENIED') {
      throw gsiErr;
    }
  }

  // Fallback: Firebase Auth with GoogleAuthProvider containing Drive scope
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_SCOPE);
    provider.setCustomParameters({
      prompt: promptType === 'consent' ? 'consent' : 'select_account',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Access Token with Drive scope.');
    }

    const token = credential.accessToken;
    setDriveToken(token, Date.now() + 3599 * 1000, result.user.email || null);
    return token;
  } catch (fbErr: any) {
    if (fbErr?.code === 'auth/popup-closed-by-user') {
      driveState = { ...driveState, status: 'not_connected' };
      notifyDriveListeners();
      throw new Error('POPUP_CLOSED');
    }
    if (fbErr?.code === 'auth/popup-blocked') {
      driveState = {
        ...driveState,
        status: 'error',
        errorMessage: 'ব্রাউজার পপআপ ব্লক করেছে। সাইট সেটিংসে পপআপ অনুমোদন করুন।',
      };
      notifyDriveListeners();
      throw new Error('POPUP_BLOCKED');
    }

    driveState = {
      ...driveState,
      status: 'error',
      errorMessage: fbErr?.message || 'Authentication error',
    };
    notifyDriveListeners();
    throw fbErr;
  }
};

/**
 * Staff Institutional Google Sign In (Firebase Authentication)
 * Requests ONLY standard Firebase authentication identity scopes (openid, email, profile).
 * DOES NOT request any Calendar scope.
 * DOES NOT request Drive scope on initial login (incremental authorization for Drive backup).
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    // Default OIDC scopes: openid, email, profile only.
    // Zero external scopes added here.

    const result = await signInWithPopup(auth, provider);

    // Ensure authorized staff record exists in Firestore
    try {
      const idToken = await result.user.getIdToken();
      await apiFetch('/api/auth/ensure-authorized', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (authErr) {
      console.warn('[googleAuth] ensure-authorized failed:', authErr);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      return null;
    }
    if (error?.code === 'auth/popup-blocked') {
      throw new Error('POPUP_BLOCKED');
    }
    console.warn('Google Sign In:', error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Retrieves valid Google Drive Access Token (or restores from session storage)
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  // Check sessionStorage
  try {
    const token = sessionStorage.getItem('jpmc_drive_token');
    const expiresAtStr = sessionStorage.getItem('jpmc_drive_expires_at');
    if (token && expiresAtStr) {
      const expiresAt = Number(expiresAtStr);
      if (Date.now() < expiresAt - 60000) {
        cachedAccessToken = token;
        tokenExpiresAt = expiresAt;
        return token;
      }
    }
  } catch {}

  return null;
};

export const hasCachedGoogleAuth = (): boolean => {
  return Boolean(cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000);
};

export const logoutGoogle = async () => {
  clearDriveToken();
  await signOut(auth);
};

/**
 * Initializes Auth listeners on app start
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  // Initialize drive auth from session storage if present
  initDriveAuth();

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      try {
        const idToken = await user.getIdToken();
        await apiFetch('/api/auth/ensure-authorized', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (authErr) {
        console.warn('[initAuth] ensure-authorized failed:', authErr);
      }
      if (onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};
