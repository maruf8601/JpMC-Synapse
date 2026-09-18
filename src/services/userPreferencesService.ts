import { db } from './firebaseClient';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const CURRENT_ABOUT_VERSION = '1.0';

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
