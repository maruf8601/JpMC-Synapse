/**
 * JpMC Synapse — Firebase Admin SDK & Server Firestore Operations
 * Provides trusted server-side access to Firestore and Firebase Cloud Messaging (FCM)
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { getApps, initializeApp, cert, getApp, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { getAuth, Auth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || 'sapient-pen-336609';

// Initialize Firebase Admin singleton
if (!getApps().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        initializeApp({
          credential: cert(creds),
          projectId: creds.project_id || PROJECT_ID,
        });
        console.log('[FirebaseAdmin] Initialized with FIREBASE_SERVICE_ACCOUNT_KEY.');
      } catch (err) {
        console.warn('[FirebaseAdmin] Failed parsing service account key, falling back to projectId:', err);
        initializeApp({ projectId: PROJECT_ID });
      }
    } else {
      // Uses Google Cloud Application Default Credentials (ADC) on Cloud Run, or fallback projectId
      initializeApp({
        projectId: PROJECT_ID,
      });
      console.log(`[FirebaseAdmin] Initialized with Project ID: ${PROJECT_ID}`);
    }
  } catch (err) {
    console.warn('[FirebaseAdmin] Initialization warning:', err);
  }
}

export const adminApp: App = getApp();
export const adminDb: Firestore = getFirestore();
export const adminMessaging: Messaging = getMessaging();
export const adminAuth: Auth = getAuth(adminApp);

export async function setAuthorizedUser(uid: string, data: { active: boolean; email?: string; role?: string; displayName?: string }): Promise<void> {
  await adminDb.collection('authorizedUsers').doc(uid).set({
    active: data.active,
    email: data.email || null,
    role: data.role || 'staff',
    displayName: data.displayName || null,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function isUserAuthorized(uid: string): Promise<boolean> {
  const docSnap = await adminDb.collection('authorizedUsers').doc(uid).get();
  return docSnap.exists && docSnap.data()?.active === true;
}

export interface DeviceRecord {
  deviceId: string;
  userId?: string;
  fcmToken: string;
  platform: 'web' | 'android' | 'ios';
  userAgent?: string;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
}

export interface NotificationDeliveryLog {
  deliveryId: string; // e.g. `${eventId}_${deviceId}_${minutesBefore}` or `briefing_${deviceId}_${date}`
  eventId?: string;
  deviceId: string;
  userId?: string;
  fcmToken: string;
  type: 'reminder_120m' | 'reminder_30m' | 'reminder_custom' | 'morning_briefing' | 'test_push';
  title: string;
  body: string;
  status: 'sent' | 'failed';
  error?: string;
  deliveredAt: string;
}

/**
 * Register or update device push token
 */
export async function registerDeviceInFirestore(device: DeviceRecord): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const docData = {
      ...device,
      updatedAt: nowIso,
      lastSeenAt: nowIso,
    };

    // Store in global devices collection for fast multicast queries
    await adminDb.collection('devices').doc(device.deviceId).set(docData, { merge: true });

    // Also store under user subcollection if userId provided
    if (device.userId) {
      await adminDb
        .collection('users')
        .doc(device.userId)
        .collection('devices')
        .doc(device.deviceId)
        .set(docData, { merge: true });
    }
  } catch (err) {
    console.error('[FirebaseAdmin] Failed to register device:', err);
    throw err;
  }
}

/**
 * Retrieve all active registered devices with notifications enabled
 */
export async function getActiveDevices(): Promise<DeviceRecord[]> {
  try {
    const snapshot = await adminDb
      .collection('devices')
      .where('notificationsEnabled', '==', true)
      .get();

    const devices: DeviceRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as DeviceRecord;
      if (data.fcmToken) {
        devices.push(data);
      }
    });
    return devices;
  } catch (err) {
    console.warn('[FirebaseAdmin] Could not query active devices from Firestore:', err);
    return [];
  }
}

/**
 * Check if a notification has already been delivered (idempotency check)
 */
export async function hasNotificationBeenDelivered(deliveryId: string): Promise<boolean> {
  try {
    const docSnap = await adminDb.collection('notificationDeliveries').doc(deliveryId).get();
    return docSnap.exists;
  } catch (err) {
    console.warn('[FirebaseAdmin] Delivery idempotency check failed:', err);
    return false;
  }
}

/**
 * Record a successful or failed notification delivery log
 */
export async function logNotificationDelivery(log: NotificationDeliveryLog): Promise<void> {
  try {
    await adminDb.collection('notificationDeliveries').doc(log.deliveryId).set(log);
  } catch (err) {
    console.error('[FirebaseAdmin] Failed to log delivery:', err);
  }
}

// In-memory fallback cache for Telegram messages & idempotency when Firestore is offline or restricted
const inMemoryTelegramMessages: any[] = [];
const inMemoryProcessedIds = new Set<string>();

/**
 * Check if a Telegram message has already been processed in Firestore or memory
 */
export async function isTelegramMessageProcessedInFirestore(
  chatId: string | number,
  messageId: number
): Promise<boolean> {
  const docId = `${chatId}_${messageId}`;
  if (inMemoryProcessedIds.has(docId)) {
    return true;
  }

  try {
    const docSnap = await adminDb.collection('telegramMessages').doc(docId).get();
    if (docSnap.exists) {
      inMemoryProcessedIds.add(docId);
      return true;
    }
    return false;
  } catch (err: any) {
    // Only log once or at debug level to prevent log clutter when Firestore lacks service account credentials
    if (!err?.message?.includes('PERMISSION_DENIED')) {
      console.warn('[FirebaseAdmin] Telegram message idempotency check warning:', err?.message || err);
    }
    return inMemoryProcessedIds.has(docId);
  }
}

/**
 * Save an ingested Telegram message record to Firestore (with in-memory fallback)
 */
export async function saveTelegramMessageToFirestore(record: {
  id: number;
  messageId: number;
  chatId: string;
  senderName: string;
  senderRole?: string;
  timestamp: string;
  rawText: string;
  hasDocument: boolean;
  documentType?: string;
  documentName?: string;
  status: string;
  extractedEventIds: string[];
  confidence: number;
  processedAt: string;
}): Promise<void> {
  const docId = `${record.chatId}_${record.messageId}`;
  inMemoryProcessedIds.add(docId);

  // Maintain recent 100 in-memory messages
  const existingIdx = inMemoryTelegramMessages.findIndex((m) => `${m.chatId}_${m.messageId}` === docId);
  if (existingIdx >= 0) {
    inMemoryTelegramMessages[existingIdx] = record;
  } else {
    inMemoryTelegramMessages.unshift(record);
    if (inMemoryTelegramMessages.length > 100) {
      inMemoryTelegramMessages.length = 100;
    }
  }

  try {
    await adminDb.collection('telegramMessages').doc(docId).set(record, { merge: true });
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED')) {
      console.error('[FirebaseAdmin] Failed to save Telegram message to Firestore:', err?.message || err);
    }
  }
}

/**
 * Retrieve recent Telegram messages from Firestore (with in-memory fallback)
 */
export async function getTelegramMessagesFromFirestore(limitCount: number = 50): Promise<any[]> {
  try {
    const snapshot = await adminDb
      .collection('telegramMessages')
      .orderBy('id', 'desc')
      .limit(limitCount)
      .get();

    const messages: any[] = [];
    snapshot.forEach((doc) => messages.push(doc.data()));
    if (messages.length > 0) {
      return messages;
    }
    return inMemoryTelegramMessages.slice(0, limitCount);
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED')) {
      console.warn('[FirebaseAdmin] Failed to query Telegram messages from Firestore:', err?.message || err);
    }
    return inMemoryTelegramMessages.slice(0, limitCount);
  }
}
