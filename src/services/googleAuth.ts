/**
 * JpMC Synapse — Google Workspace & Firebase Auth Integration
 * Handles Sign In with Google, Access Token retrieval with 'https://www.googleapis.com/auth/drive.file' scope.
 */

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebaseClient';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
// Request consent to grant drive & calendar access
provider.setCustomParameters({
  prompt: 'consent',
  access_type: 'offline',
});

// In-memory token cache (Do NOT store access token in localStorage for security)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/auth/ensure-authorized', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (authErr) {
        console.warn('[initAuth] ensure-authorized failed:', authErr);
      }
      if (cachedAccessToken && onAuthSuccess) {
        onAuthSuccess(user, cachedAccessToken);
      }
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Could not obtain Google Access Token with Drive scope.');
    }

    cachedAccessToken = credential.accessToken;

    // Ensure user is authorized in Firestore authorizedUsers
    try {
      const idToken = await result.user.getIdToken();
      await fetch('/api/auth/ensure-authorized', {
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
      // User closed the popup window or initiated another action; this is intentional and non-fatal
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

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const hasCachedGoogleAuth = (): boolean => {
  return Boolean(cachedAccessToken);
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};
