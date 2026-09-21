/**
 * JpMC Synapse — Server-Side Announcement Service & Push Broadcaster
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import { adminDb, removeUndefinedFields, getActiveDevices } from './firebaseAdmin';
import { sendFcmPushNotification } from './reminderScheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  AnnouncementEntity,
  AnnouncementReceipt,
  AnnouncementReceiptDetail,
  AnnouncementReceiptsSummary,
} from '../domain/models';
import { toDateSafe, toIsoSafe } from '../utils/dateSafe';

function toTimestamp(val: any): Timestamp {
  const d = toDateSafe(val);
  return d ? Timestamp.fromDate(d) : Timestamp.now();
}

export function serializeAnnouncement(doc: any): AnnouncementEntity {
  const data = doc.data() || {};
  const startDate =
    toDateSafe(data.startAt) ||
    toDateSafe(data.startDate) ||
    toDateSafe(data.publishAt) ||
    toDateSafe(data.createdAt) ||
    new Date();
  const expiresDate =
    toDateSafe(data.expiresAt) ||
    toDateSafe(data.endDate) ||
    new Date(startDate.getTime() + 7 * 86400000);
  const createdDate = toDateSafe(data.createdAt) || new Date();
  const updatedDate = toDateSafe(data.updatedAt) || createdDate;
  const pushSentDate = toDateSafe(data.pushSentAt);

  return {
    id: doc.id,
    title: data.title || '',
    message: data.message || '',
    priority: data.priority || 'normal',
    displayMode: data.displayMode || 'show_once',
    targetAudience: data.targetAudience || 'everyone',
    active: data.active !== false,
    status: data.status || 'draft',
    startAt: startDate.toISOString(),
    expiresAt: expiresDate.toISOString(),
    sendPush: Boolean(data.sendPush),
    pushSentAt: pushSentDate ? pushSentDate.toISOString() : null,
    createdBy: data.createdBy || '',
    createdAt: createdDate.toISOString(),
    updatedAt: updatedDate.toISOString(),
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

    // Attach receipt stats to each announcement
    try {
      const receiptsSnap = await adminDb.collection('announcementReceipts').get();
      const statsMap = new Map<string, { viewedCount: number; acknowledgedCount: number }>();
      receiptsSnap.forEach((rDoc) => {
        const rData = rDoc.data();
        const aId = rData.announcementId || (rDoc.id.includes('_') ? rDoc.id.split('_')[0] : null);
        if (!aId) return;
        if (!statsMap.has(aId)) {
          statsMap.set(aId, { viewedCount: 0, acknowledgedCount: 0 });
        }
        const entry = statsMap.get(aId)!;
        entry.viewedCount++;
        if (rData.acknowledgedAt) {
          entry.acknowledgedCount++;
        }
      });

      for (const ann of list) {
        ann.stats = statsMap.get(ann.id) || { viewedCount: 0, acknowledgedCount: 0 };
      }
    } catch (err) {
      console.warn('[Announcements] Failed to attach receipts stats:', err);
    }

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
  const seenDate = toDateSafe(data.seenAt) || toDateSafe(data.viewedAt);
  const ackDate = toDateSafe(data.acknowledgedAt);

  return {
    announcementId,
    uid,
    displayName: data.displayName,
    email: data.email,
    seenAt: seenDate ? seenDate.toISOString() : null,
    viewedAt: seenDate ? seenDate.toISOString() : null,
    acknowledgedAt: ackDate ? ackDate.toISOString() : null,
    status: ackDate ? 'acknowledged' : 'viewed',
  };
}

/**
 * Record seen status for user
 */
export async function recordUserSeenAnnouncement(
  announcementId: string,
  uid: string,
  userData?: { displayName?: string; email?: string }
): Promise<void> {
  const docId = `${announcementId}_${uid}`;
  const nowTs = FieldValue.serverTimestamp();
  const payload: Record<string, any> = {
    announcementId,
    uid,
    seenAt: nowTs,
    viewedAt: nowTs,
  };
  if (userData?.displayName) payload.displayName = userData.displayName;
  if (userData?.email) payload.email = userData.email;

  await adminDb.collection('announcementReceipts').doc(docId).set(payload, { merge: true });
}

/**
 * Record explicit acknowledgement for user
 */
export async function recordUserAcknowledgedAnnouncement(
  announcementId: string,
  uid: string,
  userData?: { displayName?: string; email?: string }
): Promise<void> {
  const docId = `${announcementId}_${uid}`;
  const nowTs = FieldValue.serverTimestamp();
  const payload: Record<string, any> = {
    announcementId,
    uid,
    seenAt: nowTs,
    viewedAt: nowTs,
    acknowledgedAt: nowTs,
    status: 'acknowledged',
  };
  if (userData?.displayName) payload.displayName = userData.displayName;
  if (userData?.email) payload.email = userData.email;

  await adminDb.collection('announcementReceipts').doc(docId).set(payload, { merge: true });
}

/**
 * Retrieves the full list of receipts and summary for an announcement (Admin only)
 */
export async function getAnnouncementReceiptsForAdmin(
  announcementId: string
): Promise<AnnouncementReceiptsSummary> {
  const receiptsMap = new Map<string, any>();

  // 1. Query receipts matching announcementId
  try {
    const qSnap = await adminDb
      .collection('announcementReceipts')
      .where('announcementId', '==', announcementId)
      .get();

    qSnap.forEach((doc) => {
      const data = doc.data();
      const uid =
        data.uid ||
        (doc.id.startsWith(`${announcementId}_`)
          ? doc.id.slice(announcementId.length + 1)
          : doc.id);
      receiptsMap.set(uid, { id: doc.id, ...data, uid });
    });
  } catch (err) {
    console.warn('[Announcements] Query by announcementId failed, falling back:', err);
  }

  // Also scan if doc id format prefix matches
  if (receiptsMap.size === 0) {
    try {
      const allReceiptsSnap = await adminDb.collection('announcementReceipts').get();
      allReceiptsSnap.forEach((doc) => {
        const data = doc.data();
        const matchesField = data.announcementId === announcementId;
        const matchesDocId = doc.id.startsWith(`${announcementId}_`);
        if (matchesField || matchesDocId) {
          const uid =
            data.uid ||
            (matchesDocId ? doc.id.slice(announcementId.length + 1) : doc.id);
          receiptsMap.set(uid, { id: doc.id, ...data, uid });
        }
      });
    } catch (err) {
      console.warn('[Announcements] Fallback scanning announcementReceipts failed:', err);
    }
  }

  // 2. Load user roster from authorizedUsers for display names, emails, and accurate total count
  let totalAuthorizedUsers: number | null = null;
  const usersRoster = new Map<string, { displayName: string; email: string | null; role?: string }>();

  try {
    const usersSnap = await adminDb.collection('authorizedUsers').get();
    let activeCount = 0;
    usersSnap.forEach((uDoc) => {
      const uData = uDoc.data();
      if (uData.active !== false) {
        activeCount++;
      }
      usersRoster.set(uDoc.id, {
        displayName:
          uData.displayName ||
          uData.name ||
          (uData.email ? uData.email.split('@')[0] : 'ইউজার'),
        email: uData.email || null,
        role: uData.role || 'user',
      });
    });
    totalAuthorizedUsers = activeCount > 0 ? activeCount : null;
  } catch (err) {
    console.warn('[Announcements] Could not load authorizedUsers for roster count:', err);
  }

  // 3. Build receipt details
  const receipts: AnnouncementReceiptDetail[] = [];
  let viewedCount = 0;
  let acknowledgedCount = 0;

  receiptsMap.forEach((rData, uid) => {
    const userInfo = usersRoster.get(uid);
    const displayName =
      rData.displayName ||
      userInfo?.displayName ||
      (rData.email ? rData.email.split('@')[0] : `ব্যবহারকারী (${uid.slice(0, 6)})`);
    const email = rData.email || userInfo?.email || null;
    const role = rData.role || userInfo?.role || 'user';

    const viewedDate = toDateSafe(rData.viewedAt) || toDateSafe(rData.seenAt);
    const ackDate = toDateSafe(rData.acknowledgedAt);

    const isAck = Boolean(ackDate);
    if (isAck) {
      acknowledgedCount++;
    }
    viewedCount++;

    receipts.push({
      uid,
      displayName,
      email,
      role,
      viewedAt: viewedDate ? viewedDate.toISOString() : (ackDate ? ackDate.toISOString() : null),
      acknowledgedAt: ackDate ? ackDate.toISOString() : null,
      status: isAck ? 'acknowledged' : 'viewed',
    });
  });

  // Sort: newest acknowledgedAt first, then newest viewedAt first
  receipts.sort((a, b) => {
    const timeA =
      toDateSafe(a.acknowledgedAt)?.getTime() ||
      toDateSafe(a.viewedAt)?.getTime() ||
      0;
    const timeB =
      toDateSafe(b.acknowledgedAt)?.getTime() ||
      toDateSafe(b.viewedAt)?.getTime() ||
      0;
    return timeB - timeA;
  });

  const unseenCount =
    totalAuthorizedUsers !== null ? Math.max(0, totalAuthorizedUsers - viewedCount) : null;

  return {
    announcementId,
    totalAuthorizedUsers,
    viewedCount,
    acknowledgedCount,
    unseenCount,
    receipts,
  };
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
