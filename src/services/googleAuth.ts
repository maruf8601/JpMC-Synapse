/**
 * JpMC Synapse — Google Workspace & Calendar Authentication
 * Production-ready OAuth 2.0 and Google Identity Services integration.
 * Scopes: https://www.googleapis.com/auth/calendar.events, https://www.googleapis.com/auth/drive.file
 * Origin: https://jpmc-synapse.onrender.com (and AI Studio Cloud Run preview environments)
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

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const CALENDAR_FULL_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const SCOPES = [
  'email',
  'profile',
  'openid',
  CALENDAR_SCOPE,
  CALENDAR_FULL_SCOPE,
  DRIVE_SCOPE,
];

// Resolved Google Client ID: prioritizes environment variable, falls back to config
export const GOOGLE_CLIENT_ID =
  ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string) ||
  firebaseConfig.oAuthClientId ||
  '103277329126-fppb2csm3a2nk3mngvk3ulantfjrqkd4.apps.googleusercontent.com';

export interface CalendarAuthState {
  isAuthorized: boolean;
  status: 'checking' | 'connected' | 'not_connected' | 'error';
  email: string | null;
  expiresAt: number | null;
  errorMessage?: string | null;
}

// In-memory token cache
let cachedAccessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let isSigningIn = false;

let calendarState: CalendarAuthState = {
  isAuthorized: false,
  status: 'checking',
  email: null,
  expiresAt: null,
  errorMessage: null,
};

const calendarListeners = new Set<(state: CalendarAuthState) => void>();

function notifyCalendarListeners() {
  calendarListeners.forEach((fn) => {
    try {
      fn({ ...calendarState });
    } catch (e) {
      console.warn('[googleAuth] Listener error:', e);
    }
  });
}

export function subscribeCalendarAuth(listener: (state: CalendarAuthState) => void): () => void {
  calendarListeners.add(listener);
  listener({ ...calendarState });
  return () => {
    calendarListeners.delete(listener);
  };
}

export function getCalendarAuthState(): CalendarAuthState {
  return { ...calendarState };
}

function clearCalendarToken() {
  cachedAccessToken = null;
  tokenExpiresAt = null;
  try {
    sessionStorage.removeItem('jpmc_gcal_token');
    sessionStorage.removeItem('jpmc_gcal_expires_at');
    sessionStorage.removeItem('jpmc_gcal_email');
  } catch {}
}

function setCalendarToken(token: string, expiresAt: number, email: string | null) {
  cachedAccessToken = token;
  tokenExpiresAt = expiresAt;
  try {
    sessionStorage.setItem('jpmc_gcal_token', token);
    sessionStorage.setItem('jpmc_gcal_expires_at', String(expiresAt));
    if (email) {
      sessionStorage.setItem('jpmc_gcal_email', email);
    }
  } catch {}

  calendarState = {
    isAuthorized: true,
    status: 'connected',
    email: email || calendarState.email,
    expiresAt,
    errorMessage: null,
  };
  notifyCalendarListeners();
}

/**
 * Verifies an access token against Google Calendar API v3
 * Requirement 11: Verify an actual Google Calendar API request succeeds before displaying "Connected"
 */
export async function verifyCalendarAccess(
  token: string
): Promise<{ valid: boolean; email?: string; error?: string; details?: string }> {
  try {
    // 1. Verify access to primary calendar events endpoint
    // This succeeds with both https://www.googleapis.com/auth/calendar.events and https://www.googleapis.com/auth/calendar
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      let userEmail = data.summary;
      // If summary is not an email address, fetch verified email from userinfo
      if (!userEmail || !userEmail.includes('@')) {
        try {
          const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (userinfoRes.ok) {
            const userinfo = await userinfoRes.json();
            if (userinfo.email) userEmail = userinfo.email;
          }
        } catch (_) {
          // ignore userinfo fallback error
        }
      }
      return { valid: true, email: userEmail || data.summary || undefined };
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData?.error?.message || '';
    const errReason =
      errData?.error?.errors?.[0]?.reason || errData?.error?.details?.[0]?.reason || '';

    if (res.status === 401) {
      return { valid: false, error: 'TOKEN_EXPIRED', details: errMsg };
    }

    if (res.status === 403) {
      if (
        errMsg.toLowerCase().includes('disabled') ||
        errMsg.toLowerCase().includes('not been used') ||
        errReason === 'SERVICE_DISABLED' ||
        errReason === 'accessNotConfigured'
      ) {
        return { valid: false, error: 'INSUFFICIENT_SCOPE_OR_API_DISABLED', details: errMsg };
      }
      if (
        errMsg.toLowerCase().includes('insufficient') ||
        errMsg.toLowerCase().includes('scope') ||
        errReason === 'insufficientPermissions'
      ) {
        return { valid: false, error: 'INSUFFICIENT_SCOPE_OR_API_DISABLED', details: errMsg };
      }
      return { valid: false, error: 'INSUFFICIENT_SCOPE_OR_API_DISABLED', details: errMsg };
    }

    return { valid: false, error: `HTTP_${res.status}`, details: errMsg };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'NETWORK_ERROR' };
  }
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
 * Initializes Google Calendar auth from session storage on startup/refresh
 * Requirement 12: Persist/re-establish connection appropriately after page refresh
 */
export async function initCalendarAuth(): Promise<CalendarAuthState> {
  try {
    const token = sessionStorage.getItem('jpmc_gcal_token');
    const expiresAtStr = sessionStorage.getItem('jpmc_gcal_expires_at');
    const email = sessionStorage.getItem('jpmc_gcal_email');

    if (token && expiresAtStr) {
      const expiresAt = Number(expiresAtStr);
      // If token still valid for at least 60 seconds
      if (Date.now() < expiresAt - 60000) {
        calendarState = { ...calendarState, status: 'checking', email };
        notifyCalendarListeners();

        const verify = await verifyCalendarAccess(token);
        if (verify.valid) {
          cachedAccessToken = token;
          tokenExpiresAt = expiresAt;
          calendarState = {
            isAuthorized: true,
            status: 'connected',
            email: email || verify.email || null,
            expiresAt,
            errorMessage: null,
          };
          notifyCalendarListeners();
          return calendarState;
        }
      }
    }
  } catch (e) {
    console.warn('[initCalendarAuth] Error restoring session:', e);
  }

  // Not connected or expired
  clearCalendarToken();
  calendarState = {
    isAuthorized: false,
    status: 'not_connected',
    email: null,
    expiresAt: null,
    errorMessage: null,
  };
  notifyCalendarListeners();
  return calendarState;
}

/**
 * Requests Google Calendar OAuth 2.0 authorization with calendar.events scope.
 * Uses Google Identity Services (GSI) Token Client as primary modern standard,
 * with Firebase popup as robust fallback.
 */
export const requestCalendarAccess = async (
  promptType: 'consent' | 'select_account' | '' = 'consent'
): Promise<string> => {
  calendarState = { ...calendarState, status: 'checking', errorMessage: null };
  notifyCalendarListeners();

  // Try Google Identity Services (GSI)
  try {
    await loadGsiScript();
    if ((window as any).google?.accounts?.oauth2) {
      return await new Promise<string>((resolve, reject) => {
        let isSettled = false;
        try {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: `${CALENDAR_SCOPE} ${CALENDAR_FULL_SCOPE} ${DRIVE_SCOPE}`,
            callback: async (response: any) => {
              if (isSettled) return;
              isSettled = true;

              if (response.error) {
                console.warn('[GSI Token Error]:', response.error);
                if (response.error === 'popup_closed_by_user') {
                  calendarState = {
                    ...calendarState,
                    status: 'not_connected',
                    errorMessage: 'অনুমোদন উইন্ডো বন্ধ করা হয়েছে (Popup closed)',
                  };
                  notifyCalendarListeners();
                  reject(new Error('POPUP_CLOSED'));
                  return;
                }
                if (response.error === 'access_denied') {
                  calendarState = {
                    ...calendarState,
                    status: 'not_connected',
                    errorMessage: 'ক্যালেন্ডার অ্যাক্সেস অনুমতি দেওয়া হয়নি (Access denied)',
                  };
                  notifyCalendarListeners();
                  reject(new Error('ACCESS_DENIED'));
                  return;
                }
                calendarState = {
                  ...calendarState,
                  status: 'error',
                  errorMessage: response.error_description || response.error,
                };
                notifyCalendarListeners();
                reject(new Error(response.error_description || response.error));
                return;
              }

              const token = response.access_token;
              const expiresIn = Number(response.expires_in) || 3599;
              const expiresAt = Date.now() + expiresIn * 1000;

              // Verify against live Calendar API before marking connected
              const verify = await verifyCalendarAccess(token);
              if (!verify.valid) {
                console.error('[GoogleCalendar] Token verification failed:', verify.error);
                calendarState = {
                  ...calendarState,
                  status: 'error',
                  errorMessage:
                    verify.error === 'INSUFFICIENT_SCOPE_OR_API_DISABLED'
                      ? 'গুগল ক্লাউড কনসোলে Google Calendar API সক্রিয় করুন বা ক্যালেন্ডার পারমিশন মঞ্জুর করুন।'
                      : 'ক্যালেন্ডার যাচাই ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।',
                };
                notifyCalendarListeners();
                reject(new Error('CALENDAR_VERIFICATION_FAILED'));
                return;
              }

              const resolvedEmail = verify.email || auth.currentUser?.email || null;
              setCalendarToken(token, expiresAt, resolvedEmail);
              resolve(token);
            },
            error_callback: (err: any) => {
              if (isSettled) return;
              isSettled = true;
              console.warn('[GSI Client Error]:', err);
              calendarState = {
                ...calendarState,
                status: 'error',
                errorMessage: err?.message || 'OAuth error',
              };
              notifyCalendarListeners();
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
    console.warn('[googleAuth] GSI flow failed, trying Firebase popup fallback:', gsiErr?.message || gsiErr);
    if (gsiErr?.message === 'POPUP_CLOSED' || gsiErr?.message === 'ACCESS_DENIED') {
      throw gsiErr;
    }
  }

  // Fallback: Firebase Auth with GoogleAuthProvider containing Calendar scope
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_SCOPE);
    provider.addScope(CALENDAR_FULL_SCOPE);
    provider.addScope(DRIVE_SCOPE);
    provider.setCustomParameters({
      prompt: promptType === 'consent' ? 'consent' : 'select_account',
      access_type: 'offline',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Access Token with Calendar scope.');
    }

    const token = credential.accessToken;
    const verify = await verifyCalendarAccess(token);
    if (!verify.valid) {
      throw new Error('Google Calendar permission was not granted or Calendar API is disabled.');
    }

    setCalendarToken(token, Date.now() + 3599 * 1000, result.user.email || null);
    return token;
  } catch (fbErr: any) {
    if (fbErr?.code === 'auth/popup-closed-by-user') {
      calendarState = { ...calendarState, status: 'not_connected' };
      notifyCalendarListeners();
      throw new Error('POPUP_CLOSED');
    }
    if (fbErr?.code === 'auth/popup-blocked') {
      calendarState = {
        ...calendarState,
        status: 'error',
        errorMessage: 'ব্রাউজার পপআপ ব্লক করেছে। সাইট সেটিংসে পপআপ অনুমোদন করুন।',
      };
      notifyCalendarListeners();
      throw new Error('POPUP_BLOCKED');
    }

    calendarState = {
      ...calendarState,
      status: 'error',
      errorMessage: fbErr?.message || 'Authentication error',
    };
    notifyCalendarListeners();
    throw fbErr;
  }
};

/**
 * Staff Institutional Google Sign In (Firebase Authentication)
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string | null } | null> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    provider.addScope(CALENDAR_SCOPE);
    provider.addScope(CALENDAR_FULL_SCOPE);
    provider.addScope(DRIVE_SCOPE);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    // If access token was returned in sign-in credential, verify & cache it
    if (credential?.accessToken) {
      const verify = await verifyCalendarAccess(credential.accessToken);
      if (verify.valid) {
        setCalendarToken(credential.accessToken, Date.now() + 3599 * 1000, result.user.email || null);
      }
    }

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
 * Retrieves valid Google Access Token (or checks session storage)
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && tokenExpiresAt && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  // Check sessionStorage
  try {
    const token = sessionStorage.getItem('jpmc_gcal_token');
    const expiresAtStr = sessionStorage.getItem('jpmc_gcal_expires_at');
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

export const logoutCalendar = () => {
  clearCalendarToken();
  calendarState = {
    isAuthorized: false,
    status: 'not_connected',
    email: null,
    expiresAt: null,
    errorMessage: null,
  };
  notifyCalendarListeners();
};

export const logoutGoogle = async () => {
  logoutCalendar();
  await signOut(auth);
};

/**
 * Initializes Auth listeners on app start
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  // Initialize calendar auth from session storage
  initCalendarAuth();

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
