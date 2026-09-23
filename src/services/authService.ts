/**
 * JpMC Synapse — Authentication Service
 * Dual-Authentication Model:
 * 1. Normal User / Faculty: Full Name + Institutional Secret Code (server-side validated, persistent session)
 * 2. Admin: Google Sign-In (restricted to authorized administrator accounts only)
 */

import { auth } from './firebaseClient';
import { signOut, User } from 'firebase/auth';
import { googleSignIn, DRIVE_SCOPE } from './googleAuth';
import { apiFetch } from '../config/api';

export type AuthMethod = 'admin-google' | 'normal-user';

export interface UserSessionProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  active: boolean;
  authMethod: AuthMethod;
}

export interface StoredSession {
  token: string;
  sessionId: string;
  expiresAt: string;
  user: UserSessionProfile;
}

export interface AppAuthState {
  initialized: boolean;
  authenticated: boolean;
  authMethod: AuthMethod | null;
  role: 'admin' | 'user' | null;
  profile: UserSessionProfile | null;
}

const SESSION_STORAGE_KEY = 'jpmc_synapse_user_session_v1';
const ADMIN_SESSION_STORAGE_KEY = 'jpmc_synapse_admin_session_v1';

/**
 * Returns saved normal user session from localStorage if present
 */
export function getStoredUserSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.token && parsed.user) {
      return parsed;
    }
  } catch (e) {
    console.warn('[authService] Failed reading stored user session:', e);
  }
  return null;
}

/**
 * Clears saved normal user session
 */
export function clearStoredUserSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}

/**
 * Returns saved verified admin profile from localStorage if present
 */
export function getStoredAdminSession(): UserSessionProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.uid && parsed.role === 'admin') {
      return parsed;
    }
  } catch (e) {
    console.warn('[authService] Failed reading stored admin session:', e);
  }
  return null;
}

/**
 * Stores verified admin profile into localStorage for instant offline/relaunch startup
 */
export function storeAdminSession(profile: UserSessionProfile): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(profile));
  } catch {}
}

/**
 * Clears saved admin profile
 */
export function clearStoredAdminSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
  } catch {}
}

/**
 * Normal User Login: Validates Name + Institutional Secret Code on server
 * SECURITY: Never stores the secret code on the client.
 */
export async function loginNormalUser(name: string, accessCode: string): Promise<UserSessionProfile> {
  const trimmedName = name.trim();
  const trimmedCode = accessCode.trim();

  if (!trimmedName) {
    throw new Error('অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।');
  }
  if (!trimmedCode) {
    throw new Error('অনুগ্রহ করে প্রাতিষ্ঠানিক অ্যাক্সেস কোড লিখুন।');
  }

  let res: Response;
  try {
    res = await apiFetch('/api/auth/user-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: trimmedName,
        accessCode: trimmedCode,
      }),
    });
  } catch (networkErr) {
    console.warn('[authService] Network error during loginNormalUser:', networkErr);
    throw new Error('সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না।');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.success) {
    if (data.error === 'ACCESS_CODE_NOT_CONFIGURED') {
      throw new Error('সার্ভারে প্রাতিষ্ঠানিক অ্যাক্সেস কোড কনফিগার করা হয়নি।');
    }
    if (data.error === 'INVALID_ACCESS_CODE') {
      throw new Error('প্রাতিষ্ঠানিক অ্যাক্সেস কোড সঠিক নয়।');
    }
    if (data.error === 'NAME_REQUIRED') {
      throw new Error('অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।');
    }
    throw new Error('সার্ভারের সাথে সংযোগ স্থাপন করা যাচ্ছে না।');
  }

  const userProfile: UserSessionProfile = {
    uid: data.user.uid,
    email: data.user.email || '',
    displayName: data.user.displayName || trimmedName,
    role: 'user',
    active: true,
    authMethod: 'normal-user',
  };

  // Store session in localStorage (WITHOUT storing the access code)
  if (data.session?.token) {
    try {
      const sessionToSave: StoredSession = {
        token: data.session.token,
        sessionId: data.session.sessionId,
        expiresAt: data.session.expiresAt,
        user: userProfile,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionToSave));
    } catch (err) {
      console.warn('[authService] Failed writing session to localStorage:', err);
    }
  }

  return userProfile;
}

/**
 * Verifies stored session token with server asynchronously in the background.
 * Uses a strict 6-second timeout and never clears valid local credentials on network/cold-start issues.
 */
export async function verifyStoredUserSession(): Promise<UserSessionProfile | null> {
  const session = getStoredUserSession();
  if (!session || !session.token) {
    return null;
  }

  try {
    const res = await apiFetch('/api/auth/verify-session', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionToken: session.token,
      }),
      timeoutMs: 6000,
    });

    if (res.status === 401 || res.status === 403) {
      console.warn('[authService] Session explicitly invalidated by server (401/403).');
      clearStoredUserSession();
      return null;
    }

    if (!res.ok) {
      // 5xx, gateway error, or Render cold start wake-up in progress
      // Return cached user profile so UI remains fully accessible
      console.warn('[authService] Server returned non-ok status during background session verification:', res.status);
      return session.user;
    }

    const data = await res.json();
    if (data.valid === false) {
      console.warn('[authService] Session rejected by server.');
      clearStoredUserSession();
      return null;
    }

    if (data.valid && data.user) {
      const userProfile: UserSessionProfile = {
        uid: data.user.uid,
        email: data.user.email || '',
        displayName: data.user.displayName || session.user.displayName,
        role: 'user',
        active: true,
        authMethod: 'normal-user',
      };
      // Keep cached session up to date
      try {
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ ...session, user: userProfile })
        );
      } catch {}
      return userProfile;
    }

    return session.user;
  } catch (err) {
    console.warn('[authService] Session verification network timeout/notice (using cached session):', err);
    // In case of Render cold start or offline, keep user authenticated with cached credentials
    return session.user;
  }
}

/**
 * Validates Google Administrator authorization with the backend server.
 * Uses a 6-second timeout and preserves admin access if the backend is cold or offline.
 */
export async function verifyAdminOnServer(firebaseUser: User): Promise<{
  authorized: boolean;
  profile?: UserSessionProfile;
  error?: string;
  offline?: boolean;
}> {
  try {
    const idToken = await firebaseUser.getIdToken();
    const verifyRes = await apiFetch('/api/auth/admin-verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      timeoutMs: 6000,
    });

    const data = await verifyRes.json().catch(() => ({}));

    if (verifyRes.status === 401 || verifyRes.status === 403 || (verifyRes.ok && data.authorized === false)) {
      clearStoredAdminSession();
      return {
        authorized: false,
        error: data.error || 'এই গুগল অ্যাকাউন্টটি অ্যাডমিনিস্ট্রেটর হিসেবে অনুমোদিত নয়।',
      };
    }

    if (!verifyRes.ok) {
      // Server error or Render cold start 502/503: do NOT sign out
      const cached = getStoredAdminSession();
      return {
        authorized: true,
        profile: cached || {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Admin',
          role: 'admin',
          active: true,
          authMethod: 'admin-google',
        },
        offline: true,
      };
    }

    const adminProfile: UserSessionProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: data.user?.displayName || firebaseUser.displayName || 'Admin',
      role: 'admin',
      active: true,
      authMethod: 'admin-google',
    };

    storeAdminSession(adminProfile);
    return {
      authorized: true,
      profile: adminProfile,
    };
  } catch (err) {
    console.warn('[authService] Admin verification network timeout/notice (keeping cached admin status):', err);
    const cached = getStoredAdminSession();
    return {
      authorized: true,
      profile: cached || {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || 'Admin',
        role: 'admin',
        active: true,
        authMethod: 'admin-google',
      },
      offline: true,
    };
  }
}

/**
 * Admin Login: Signs in with Google and validates administrator authorization
 */
export async function loginAdminGoogle(): Promise<UserSessionProfile> {
  const result = await googleSignIn();
  if (!result || !result.user) {
    throw new Error('USER_CANCELLED');
  }

  const idToken = await result.user.getIdToken();
  const verifyRes = await apiFetch('/api/auth/admin-verify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    timeoutMs: 10000,
  });

  const data = await verifyRes.json().catch(() => ({}));

  if (!verifyRes.ok || !data.authorized) {
    // Strictly sign out unauthorized Google account immediately
    clearStoredAdminSession();
    await signOut(auth).catch(() => {});
    throw new Error(
      data.error ||
        'এই গুগল অ্যাকাউন্টটি অ্যাডমিনিস্ট্রেটর হিসেবে অনুমোদিত নয়। সাধারণ ব্যবহারকারী হিসেবে আপনার নাম ও অ্যাক্সেস কোড দিয়ে প্রবেশ করুন।'
    );
  }

  // Clear any existing normal user session to avoid collision
  clearStoredUserSession();

  const adminProfile: UserSessionProfile = {
    uid: result.user.uid,
    email: result.user.email || '',
    displayName: data.user?.displayName || result.user.displayName || 'Admin',
    role: 'admin',
    active: true,
    authMethod: 'admin-google',
  };

  storeAdminSession(adminProfile);
  return adminProfile;
}

/**
 * Auth-method aware Logout:
 * If normal-user: terminates session token and clears localStorage. Does NOT call Firebase signOut().
 * If admin-google: signs out of Firebase Auth and clears stored admin session.
 */
export async function logoutUser(authMethod?: AuthMethod | null, sessionToken?: string): Promise<void> {
  clearStoredUserSession();
  clearStoredAdminSession();

  if (authMethod === 'normal-user') {
    const token = sessionToken || getStoredUserSession()?.token;
    if (token) {
      try {
        await apiFetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionToken: token }),
          timeoutMs: 4000,
        });
      } catch {}
    }
    return;
  }

  if (authMethod === 'admin-google') {
    try {
      await signOut(auth);
    } catch {}
    return;
  }

  // Fallback: clear both
  try {
    await signOut(auth);
  } catch {}
}
