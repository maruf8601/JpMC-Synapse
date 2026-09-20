import { db } from './firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const CURRENT_ABOUT_VERSION = '1.0';

export const ABOUT_SEEN_STORAGE_KEY = 'jpmc_synapse_about_seen_v1';

/**
 * Returns the canonical localStorage key to track whether a user has seen the About modal.
 * For Staff Account users: jpmc_about_seen_staff_<normalized-user-identifier>
 * For Google/Firebase authenticated users: jpmc_about_seen_<uid>
 */
export function getAboutSeenStorageKey(user: {
  uid?: string;
  authMethod?: string;
  displayName?: string;
}): string {
  const isStaff = user.authMethod === 'normal-user';

  if (isStaff) {
    // If uid is available (e.g. usr_...), use it; otherwise normalize displayName
    const identifier = user.uid
      ? user.uid.toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : (user.displayName || 'staff')
          .trim()
          .toLowerCase()
          .replace(/[\s\W]+/g, '_');
    return `jpmc_about_seen_staff_${identifier}`;
  }

  // Google / Firebase user
  const uid = user.uid || 'unknown_user';
  return `jpmc_about_seen_${uid}`;
}

/**
 * Checks if a specific authenticated user has seen the About modal on this device
 */
export function hasUserSeenAbout(user: {
  uid?: string;
  authMethod?: string;
  displayName?: string;
}): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const key = getAboutSeenStorageKey(user);
    // Also support backward compatibility with existing keys if present
    if (localStorage.getItem(key) === 'true') {
      return true;
    }
    if (user.uid && localStorage.getItem(`jpmc_about_version_${user.uid}`)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Marks that a specific authenticated user has seen the About modal on this device
 */
export function setUserSeenAbout(user: {
  uid?: string;
  authMethod?: string;
  displayName?: string;
}): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getAboutSeenStorageKey(user);
    localStorage.setItem(key, 'true');
    if (user.uid) {
      localStorage.setItem(`jpmc_about_version_${user.uid}`, CURRENT_ABOUT_VERSION);
    }
  } catch (err) {
    console.warn('[userPreferences] setUserSeenAbout error:', err);
  }
}

/**
 * Checks if the device has already shown and dismissed the About popup
 */
export function hasSeenAboutPopup(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(ABOUT_SEEN_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Records that the About popup has been shown and dismissed by the user on this device
 */
export function setAboutPopupSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ABOUT_SEEN_STORAGE_KEY, 'true');
  } catch (err) {
    console.warn('[userPreferences] setAboutPopupSeen error:', err);
  }
}

export async function getUserAboutVersionSeen(uid: string): Promise<string | null> {
  // Check local cache first for instant responsiveness
  try {
    const localVal = localStorage.getItem(`jpmc_about_version_${uid}`);
    if (localVal) {
      return localVal;
    }
  } catch {}

  // Fetch from Firestore userPreferences/{uid}
  try {
    const docRef = doc(db, 'userPreferences', uid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const version = snap.data()?.aboutVersionSeen || null;
      if (version) {
        try {
          localStorage.setItem(`jpmc_about_version_${uid}`, version);
        } catch {}
      }
      return version;
    }
  } catch (err) {
    console.warn('[userPreferences] getUserAboutVersionSeen warning:', err);
  }
  return null;
}

export async function setUserAboutVersionSeen(uid: string, version: string = CURRENT_ABOUT_VERSION): Promise<void> {
  // Always update local cache immediately
  try {
    localStorage.setItem(`jpmc_about_version_${uid}`, version);
  } catch {}

  // Persist to Firestore userPreferences/{uid}
  try {
    const docRef = doc(db, 'userPreferences', uid);
    await setDoc(
      docRef,
      {
        aboutVersionSeen: version,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[userPreferences] setUserAboutVersionSeen warning:', err);
  }
}
