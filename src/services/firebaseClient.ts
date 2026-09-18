/**
 * JpMC Synapse — Firebase Client Initialization
 * Firestore + Firebase Authentication
 * Package: com.jpmc.synapse
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

/**
 * Initialize Cloud Firestore with experimentalForceLongPolling enabled.
 * In cloud preview iframes, Cloud Run, mobile webviews, and proxied networks,
 * standard WebChannel chunked streaming can fail or be blocked by proxies,
 * causing [code=unavailable] "Could not reach Cloud Firestore backend" errors.
 * Long polling uses standard HTTP POST requests that work reliably in all environments.
 */
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch {
  // If already initialized in current context
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;

/**
 * Validates Firestore / backend connectivity on demand without throwing unhandled exceptions.
 */
export async function testFirestoreConnection(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!navigator.onLine) {
    return false;
  }

  try {
    const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

