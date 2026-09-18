/**
 * JpMC Synapse — Server-Side Announcement Service & Push Broadcaster
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import { adminDb, removeUndefinedFields, getActiveDevices } from './firebaseAdmin';
import { sendFcmPushNotification } from './reminderScheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AnnouncementEntity, AnnouncementReceipt } from '../domain/models';

function toTimestamp(val: any): Timestamp {
  if (!val) return Timestamp.now();
  if (val instanceof Timestamp) return val;
  if (typeof val?.toDate === 'function') return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
}

export function serializeAnnouncement(doc: any): AnnouncementEntity {
  const data = doc.data() || {};
  const startAt = data.startAt?.toDate ? data.startAt.toDate().toISOString() : data.startAt || new Date().toISOString();
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString();
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString();
  const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || new Date().toISOString();
  const pushSentAt = data.pushSentAt?.toDate ? data.pushSentAt.toDate().toISOString() : data.pushSentAt || null;

  return {
    id: doc.id,
    title: data.title || '',
    message: data.message || '',
    priority: data.priority || 'normal',
    displayMode: data.displayMode || 'show_once',
    targetAudience: data.targetAudience || 'everyone',
    active: data.active !== false,
    status: data.status || 'draft',
    startAt,
    expiresAt,
    sendPush: Boolean(data.sendPush),
    pushSentAt,
    createdBy: data.createdBy || '',
    createdAt,
    updatedAt,
  };
}

/**
 * Creates a new announcement in Firestore
 */
export async function createAnnouncementInFirestore(
  data: Partial<AnnouncementEntity> & { title: string; message: string },
  adminUid: string
): Promise<AnnouncementEntity> {
  const docRef = adminDb.collection('announcements').doc();
  const nowTs = FieldValue.serverTimestamp();

  const startTimestamp = toTimestamp(data.startAt);
  const expiresTimestamp = toTimestamp(data.expiresAt || new Date(Date.now() + 7 * 86400000));

  const docData = removeUndefinedFields({
    title: data.title.trim(),
    message: data.message.trim(),
    priority: data.priority || 'normal',
    displayMode: data.displayMode || 'show_once',
    targetAudience: data.targetAudience || 'everyone',
    active: data.active !== false,
    status: data.status || 'draft',
    startAt: startTimestamp,
    expiresAt: expiresTimestamp,
    sendPush: Boolean(data.sendPush),
    pushSentAt: null,
    createdBy: adminUid,
    createdAt: nowTs,
    updatedAt: nowTs,
  });

  await docRef.set(docData);
  const createdSnap = await docRef.get();
  return serializeAnnouncement(createdSnap);
}

/**
 * Updates an existing announcement in Firestore
 */
export async function updateAnnouncementInFirestore(
  id: string,
  data: Partial<AnnouncementEntity>
): Promise<AnnouncementEntity | null> {
  const docRef = adminDb.collection('announcements').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const updatePayload: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (data.title !== undefined) updatePayload.title = data.title.trim();
  if (data.message !== undefined) updatePayload.message = data.message.trim();
  if (data.priority !== undefined) updatePayload.priority = data.priority;
  if (data.displayMode !== undefined) updatePayload.displayMode = data.displayMode;
  if (data.targetAudience !== undefined) updatePayload.targetAudience = data.targetAudience;
  if (data.active !== undefined) updatePayload.active = data.active;
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.startAt !== undefined) updatePayload.startAt = toTimestamp(data.startAt);
  if (data.expiresAt !== undefined) updatePayload.expiresAt = toTimestamp(data.expiresAt);
  if (data.sendPush !== undefined) updatePayload.sendPush = Boolean(data.sendPush);

  await docRef.update(removeUndefinedFields(updatePayload));
  const updatedSnap = await docRef.get();
  return serializeAnnouncement(updatedSnap);
}

/**
 * Deletes an announcement from Firestore
 */
export async function deleteAnnouncementFromFirestore(id: string): Promise<boolean> {
  try {
    await adminDb.collection('announcements').doc(id).delete();
    return true;
  } catch (err) {
    console.error('[Announcements] Failed to delete announcement:', err);
    return false;
  }
}

/**
 * Retrieves all announcements for administrators
 */
export async function getAllAnnouncementsForAdmin(): Promise<AnnouncementEntity[]> {
  try {
    let snapshot;
    try {
      snapshot = await adminDb.collection('announcements').orderBy('createdAt', 'desc').get();
    } catch {
      snapshot = await adminDb.collection('announcements').get();
    }

    const list: AnnouncementEntity[] = [];
    snapshot.forEach((doc) => {
      list.push(serializeAnnouncement(doc));
    });

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.warn('[Announcements] Error querying announcements for admin:', err);
    return [];
  }
}

/**
 * Retrieves active, unexpired, published announcements targeted for the given user
 */
export async function getActiveAnnouncementsForUser(
  userUid: string,
  userRole: 'admin' | 'user'
): Promise<AnnouncementEntity[]> {
  try {
    const snapshot = await adminDb
      .collection('announcements')
      .where('active', '==', true)
      .where('status', '==', 'published')
      .get();

    const now = Date.now();
    const candidateList: AnnouncementEntity[] = [];

    for (const doc of snapshot.docs) {
      const ann = serializeAnnouncement(doc);
      const startMs = new Date(ann.startAt).getTime();
      const expiresMs = new Date(ann.expiresAt).getTime();

      // Check current time validity
      if (now < startMs || now >= expiresMs) {
        continue;
      }

      // Check target audience
      if (ann.targetAudience === 'admins_only' && userRole !== 'admin') {
        continue;
      }
      if (ann.targetAudience === 'users_only' && userRole !== 'user') {
        continue;
      }

      candidateList.push(ann);
    }

    // Sort by priority (urgent > important > normal) then oldest startAt first
    const priorityWeight: Record<string, number> = {
      urgent: 1,
      important: 2,
      normal: 3,
    };

    candidateList.sort((a, b) => {
      const wA = priorityWeight[a.priority] || 3;
      const wB = priorityWeight[b.priority] || 3;
      if (wA !== wB) return wA - wB;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });

    return candidateList;
  } catch (err) {
    console.warn('[Announcements] Error querying active announcements for user:', err);
    return [];
  }
}

/**
 * Retrieves interaction receipt for a user and announcement
 */
export async function getAnnouncementReceipt(
  announcementId: string,
  uid: string
): Promise<AnnouncementReceipt | null> {
  const docId = `${announcementId}_${uid}`;
  const snap = await adminDb.collection('announcementReceipts').doc(docId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    announcementId,
    uid,
    seenAt: data.seenAt?.toDate ? data.seenAt.toDate().toISOString() : data.seenAt,
    acknowledgedAt: data.acknowledgedAt?.toDate ? data.acknowledgedAt.toDate().toISOString() : data.acknowledgedAt,
  };
}

/**
 * Record seen status for user
 */
export async function recordUserSeenAnnouncement(announcementId: string, uid: string): Promise<void> {
  const docId = `${announcementId}_${uid}`;
  await adminDb.collection('announcementReceipts').doc(docId).set(
    {
      announcementId,
      uid,
      seenAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Record explicit acknowledgement for user
 */
export async function recordUserAcknowledgedAnnouncement(announcementId: string, uid: string): Promise<void> {
  const docId = `${announcementId}_${uid}`;
  await adminDb.collection('announcementReceipts').doc(docId).set(
    {
      announcementId,
      uid,
      seenAt: FieldValue.serverTimestamp(),
      acknowledgedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Sends broadcast push notification to target audience devices
 */
export async function sendAnnouncementPushBroadcast(
  announcementId: string,
  force: boolean = false
): Promise<{ success: boolean; deviceCount: number; message?: string }> {
  const docRef = adminDb.collection('announcements').doc(announcementId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { success: false, deviceCount: 0, message: 'Announcement not found.' };
  }

  const announcement = serializeAnnouncement(snap);

  if (!force && announcement.pushSentAt) {
    return {
      success: false,
      deviceCount: 0,
      message: 'Push notification has already been broadcast for this announcement.',
    };
  }

  const allDevices = await getActiveDevices();
  let targetDevices = allDevices;

  if (announcement.targetAudience === 'admins_only' || announcement.targetAudience === 'users_only') {
    const adminUids = new Set<string>();
    try {
      const authUsersSnap = await adminDb.collection('authorizedUsers').where('role', '==', 'admin').get();
      authUsersSnap.forEach((d) => adminUids.add(d.id));
    } catch (err) {
      console.warn('[Announcements] Failed to fetch admin UIDs for push targeting:', err);
    }

    if (announcement.targetAudience === 'admins_only') {
      targetDevices = allDevices.filter((d) => d.userId && adminUids.has(d.userId));
    } else if (announcement.targetAudience === 'users_only') {
      targetDevices = allDevices.filter((d) => !d.userId || !adminUids.has(d.userId));
    }
  }

  let sentCount = 0;
  for (const device of targetDevices) {
    const deliveryId = `announcement_${announcement.id}_${device.deviceId}`;
    const truncatedBody =
      announcement.message.length > 140
        ? announcement.message.slice(0, 137) + '...'
        : announcement.message;

    const sent = await sendFcmPushNotification({
      device,
      title: announcement.title || 'জরুরি বিজ্ঞপ্তি',
      body: truncatedBody,
      deliveryId,
      type: 'announcement',
      url: `/?announcementId=${announcement.id}`,
    });

    if (sent) sentCount++;
  }

  await docRef.update({
    pushSentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true, deviceCount: sentCount };
}
