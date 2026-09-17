/**
 * JpMC Synapse — Firebase Client Initialization
 * Firestore + Firebase Authentication
 * Package: com.jpmc.synapse
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'settings', 'connectivity_check'));
    return true;
  } catch (error: any) {
    if (error?.message && error.message.includes('the client is offline')) {
      console.warn('[Firestore] Client is in offline mode.');
      return false;
    }
    return true;
  }
}

// Initial connection check on module boot
testFirestoreConnection().catch((err) => {
  console.warn('[Firestore] Initial boot check:', err?.message || err);
});
