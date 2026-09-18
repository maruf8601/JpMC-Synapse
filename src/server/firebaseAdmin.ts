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

/**
 * Recursively removes all keys whose value is undefined from an object or array.
 * Firestore strictly forbids `undefined` values anywhere in a document.
 * Primitives, Dates, arrays, and null values are preserved.
 */
export function removeUndefinedFields<T = any>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedFields(item)) as unknown as T;
  }

  // Handle plain objects (avoid mutating original)
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) {
      continue; // Omit undefined property entirely
    }
    cleaned[k] = removeUndefinedFields(v);
  }

  return cleaned as T;
}

export async function setAuthorizedUser(uid: string, data: { active: boolean; email?: string; role?: string; displayName?: string }): Promise<void> {
  const docData = removeUndefinedFields({
    active: data.active,
    email: data.email || null,
    role: data.role || 'staff',
    displayName: data.displayName || null,
    updatedAt: new Date().toISOString(),
  });
  await adminDb.collection('authorizedUsers').doc(uid).set(docData, { merge: true });
}

export async function isUserAuthorized(uid: string): Promise<boolean> {
  const docSnap = await adminDb.collection('authorizedUsers').doc(uid).get();
  return docSnap.exists && docSnap.data()?.active === true;
}

export interface DeviceRecord {
  deviceId: string;
  userId?: string;
  fcmToken: string;
  platform: 'web' | 'android' | 'ios' | 'pwa';
  userAgent?: string;
  notificationsEnabled: boolean;
  active?: boolean;
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
    const docData = removeUndefinedFields({
      ...device,
      userId: device.userId || null,
      userAgent: device.userAgent || null,
      updatedAt: nowIso,
      lastSeenAt: nowIso,
    });

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
    const safeLog = removeUndefinedFields({
      ...log,
      eventId: log.eventId || null,
      userId: log.userId || null,
      error: log.error || null,
    });
    await adminDb.collection('notificationDeliveries').doc(log.deliveryId).set(safeLog);
  } catch (err) {
    console.error('[FirebaseAdmin] Failed to log delivery:', err);
  }
}

// In-memory fallback cache for Telegram messages, events & idempotency when Firestore is offline or restricted
const inMemoryTelegramMessages: any[] = [];
const inMemoryProcessedIds = new Set<string>();
const inMemoryEvents: any[] = [];

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
 * All fields are strictly sanitized so that no undefined values ever reach Firestore.
 */
export async function saveTelegramMessageToFirestore(record: {
  id: number;
  messageId: number;
  chatId: string;
  senderName: string;
  senderRole?: string;
  originalSenderName?: string;
  originalSenderRole?: string;
  timestamp: string;
  rawText: string;
  hasDocument: boolean;
  documentType?: 'pdf' | 'image' | 'text' | null;
  documentName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  telegramFileId?: string | null;
  caption?: string | null;
  processingStatus?: string | null;
  extractionStatus?: string | null;
  status: string;
  extractedEventIds: string[];
  confidence: number;
  receivedAt?: string | null;
  processedAt: string;
}): Promise<void> {
  const docId = `${record.chatId}_${record.messageId}`;
  inMemoryProcessedIds.add(docId);

  // Normalize documentType & documentName:
  // For text messages without document: documentType is 'text' (matching schema) and documentName is null.
  const safeDocType: 'pdf' | 'image' | 'text' = record.hasDocument
    ? (record.documentType || 'text')
    : 'text';
  const safeDocName: string | null = record.hasDocument ? (record.documentName || null) : null;

  const rawNormalized = {
    id: record.id,
    messageId: record.messageId,
    chatId: String(record.chatId),
    senderName: record.senderName || 'TelegramBot',
    senderRole: record.senderRole || 'Telegram',
    originalSenderName: record.originalSenderName || null,
    originalSenderRole: record.originalSenderRole || null,
    timestamp: record.timestamp,
    rawText: record.rawText || '',
    hasDocument: Boolean(record.hasDocument),
    documentType: safeDocType,
    documentName: safeDocName,
    mimeType: record.mimeType || (safeDocType === 'pdf' ? 'application/pdf' : null),
    fileSize: typeof record.fileSize === 'number' ? record.fileSize : null,
    telegramFileId: record.telegramFileId || null,
    caption: record.caption || null,
    processingStatus: record.processingStatus || 'processed',
    extractionStatus: record.extractionStatus || null,
    status: record.status,
    extractedEventIds: Array.isArray(record.extractedEventIds) ? record.extractedEventIds : [],
    confidence: typeof record.confidence === 'number' ? record.confidence : 0,
    receivedAt: record.receivedAt || new Date().toISOString(),
    processedAt: record.processedAt || new Date().toISOString(),
  };

  const safeRecord = removeUndefinedFields(rawNormalized);

  // Maintain recent 100 in-memory messages
  const existingIdx = inMemoryTelegramMessages.findIndex((m) => `${m.chatId}_${m.messageId}` === docId);
  if (existingIdx >= 0) {
    inMemoryTelegramMessages[existingIdx] = safeRecord;
  } else {
    inMemoryTelegramMessages.unshift(safeRecord);
    if (inMemoryTelegramMessages.length > 100) {
      inMemoryTelegramMessages.length = 100;
    }
  }

  try {
    await adminDb.collection('telegramMessages').doc(docId).set(safeRecord, { merge: true });
    console.log(`[FirebaseAdmin] Successfully saved Telegram message ${docId} to Firestore (status: ${safeRecord.status}, docType: ${safeRecord.documentType}).`);
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED')) {
      console.error('[FirebaseAdmin] Failed to save Telegram message to Firestore:', err?.message || err);
    }
  }
}

/**
 * Save an extracted event entity to Firestore with strict Firestore-safe serialization.
 * Ensures fields such as venue, date, time, description, ambiguities, etc. are never undefined.
 */
export async function saveExtractedEventToFirestore(event: {
  id: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  venue?: string | null;
  category?: string;
  priority?: string;
  source?: string;
  audience?: string;
  telegramMessageId?: number;
  telegramChatId?: string;
  sender?: string;
  originalText?: string;
  confidence?: number;
  reviewStatus: string;
  syncStatus?: string;
  ambiguities?: string[];
  reminders?: any[];
  createdAt?: string;
  updatedAt?: string;
}): Promise<any> {
  return saveCanonicalEventToFirestore(event);
}

/**
 * Canonical Event Persistence into Firestore (using Firebase Admin SDK)
 * Used by Quick Add, Manual Add, Review Center approval, and Telegram Ingestion.
 * Ensures strict Firestore-safe serialization and non-undefined fields.
 */
export async function saveCanonicalEventToFirestore(event: any): Promise<any> {
  const eventId = event.id || `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const nowIso = new Date().toISOString();

  const rawNormalized = {
    id: eventId,
    title: (event.title || 'শিরোনাম নির্ধারণ প্রয়োজন').trim(),
    description: event.description || '',
    eventDate: event.eventDate || null,
    startTime: event.startTime || null,
    endTime: event.endTime || null,
    venue: event.venue || null,
    category: event.category || 'অন্যান্য',
    priority: event.priority || 'normal',
    source: event.source || 'Manual',
    audience: event.audience || 'official',
    telegramMessageId: event.telegramMessageId ?? null,
    telegramChatId: event.telegramChatId ? String(event.telegramChatId) : null,
    googleCalendarEventId: event.googleCalendarEventId || null,
    calendarId: event.calendarId || null,
    lastCalendarSyncAt: event.lastCalendarSyncAt || null,
    isGCalSynced: Boolean(event.isGCalSynced),
    sender: event.sender || null,
    committee: event.committee || null,
    participants: event.participants || null,
    originalText: event.originalText || '',
    confidence: typeof event.confidence === 'number' ? event.confidence : null,
    reviewStatus: event.reviewStatus || 'auto_approved',
    syncStatus: event.syncStatus || 'synced',
    isAllDay: Boolean(event.isAllDay),
    isCompleted: Boolean(event.isCompleted),
    ambiguities: Array.isArray(event.ambiguities) ? event.ambiguities : [],
    reminders: Array.isArray(event.reminders) ? event.reminders : [],
    createdAt: event.createdAt || nowIso,
    updatedAt: nowIso,
    createdBy: event.createdBy || 'staff',
    visibility: event.visibility || 'institutional',
  };

  const safeEvent = removeUndefinedFields(rawNormalized);

  // In-memory fallback update
  const existingIdx = inMemoryEvents.findIndex((e) => e.id === eventId);
  if (existingIdx >= 0) {
    inMemoryEvents[existingIdx] = safeEvent;
  } else {
    inMemoryEvents.unshift(safeEvent);
    if (inMemoryEvents.length > 300) {
      inMemoryEvents.length = 300;
    }
  }

  try {
    await adminDb.collection('events').doc(eventId).set(safeEvent, { merge: true });
    console.log(
      `[FirebaseAdmin] Successfully persisted canonical event ${eventId} to Firestore (source: ${safeEvent.source}, date: ${safeEvent.eventDate}, time: ${safeEvent.startTime}, title: "${safeEvent.title.slice(0, 30)}").`
    );
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED')) {
      console.error('[FirebaseAdmin] Failed to persist canonical event to Firestore:', err?.message || err);
    }
  }

  return safeEvent;
}

/**
 * Delete an event document from Firestore and in-memory cache
 */
export async function deleteEventFromFirestore(eventId: string): Promise<boolean> {
  const existingIdx = inMemoryEvents.findIndex((e) => e.id === eventId);
  if (existingIdx >= 0) {
    inMemoryEvents.splice(existingIdx, 1);
  }

  try {
    await adminDb.collection('events').doc(eventId).delete();
    console.log(`[FirebaseAdmin] Deleted event ${eventId} from Firestore.`);
    return true;
  } catch (err: any) {
    console.error(`[FirebaseAdmin] Failed to delete event ${eventId} from Firestore:`, err?.message || err);
    return false;
  }
}

/**
 * Retrieve recent events from Firestore (with in-memory fallback)
 */
export async function getEventsFromFirestore(limitCount: number = 150): Promise<any[]> {
  try {
    let snapshot;
    try {
      snapshot = await adminDb
        .collection('events')
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();
    } catch {
      // Fallback if index on createdAt is absent
      snapshot = await adminDb.collection('events').limit(limitCount).get();
    }

    const events: any[] = [];
    snapshot.forEach((doc) => events.push(doc.data()));
    if (events.length > 0) {
      // Sort in-memory to guarantee consistent reverse chronological ordering
      events.sort((a, b) => {
        const timeA = a.createdAt || `${a.eventDate || '9999-99-99'} ${a.startTime || '00:00'}`;
        const timeB = b.createdAt || `${b.eventDate || '9999-99-99'} ${b.startTime || '00:00'}`;
        return timeB.localeCompare(timeA);
      });
      return events;
    }
    return inMemoryEvents.slice(0, limitCount);
  } catch (err: any) {
    if (!err?.message?.includes('PERMISSION_DENIED')) {
      console.warn('[FirebaseAdmin] Failed to query events from Firestore:', err?.message || err);
    }
    return inMemoryEvents.slice(0, limitCount);
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

/**
 * Retrieve a single Telegram message by chatId and messageId
 */
export async function getTelegramMessageByIdFromFirestore(
  chatId: string | number,
  messageId: number
): Promise<any | null> {
  const docId = `${chatId}_${messageId}`;
  try {
    const doc = await adminDb.collection('telegramMessages').doc(docId).get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (err: any) {
    console.warn('[FirebaseAdmin] Failed to query single Telegram message:', err?.message || err);
  }

  const memMatch = inMemoryTelegramMessages.find((m) => `${m.chatId}_${m.messageId}` === docId);
  return memMatch || null;
}

