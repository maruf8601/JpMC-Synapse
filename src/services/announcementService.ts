/**
 * JpMC Synapse — Announcement Client Service
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import { apiFetch } from '../config/api';
import { db, auth } from './firebaseClient';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  AnnouncementEntity,
  AnnouncementReceipt,
  AnnouncementReceiptDetail,
  AnnouncementReceiptsSummary,
} from '../domain/models';
import { getStoredUserSession } from './authService';
import { toDateSafe, toIsoSafe } from '../utils/dateSafe';

export async function getAuthToken(): Promise<string | undefined> {
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      return await currentUser.getIdToken();
    } catch {
      // Fall through to stored normal session
    }
  }
  const stored = getStoredUserSession();
  return stored?.token;
}

function parseFirestoreAnnouncementDoc(docSnap: any): AnnouncementEntity {
  const data = docSnap.data() || {};
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
    id: docSnap.id,
    title: data.title || '',
    message: data.message || '',
    priority: data.priority || 'normal',
    displayMode: data.displayMode || 'show_once',
    targetAudience: data.targetAudience || 'everyone',
    active: Boolean(data.active),
    status: data.status || 'published',
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
 * Fetches active announcements eligible for the authenticated user.
 * Tries API endpoint first; falls back to direct Firestore query if network fails.
 */
export async function fetchActiveAnnouncements(
  uid?: string,
  role: 'admin' | 'user' = 'user'
): Promise<AnnouncementEntity[]> {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await apiFetch('/api/announcements/active', {
      method: 'GET',
      headers,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.announcements)) {
        // Sanitize every item's date fields so no "Invalid Date" can leak
        return json.announcements.map((item: any) => {
          const startDate =
            toDateSafe(item.startAt) ||
            toDateSafe(item.startDate) ||
            toDateSafe(item.publishAt) ||
            toDateSafe(item.createdAt) ||
            new Date();
          const expiresDate =
            toDateSafe(item.expiresAt) ||
            toDateSafe(item.endDate) ||
            new Date(startDate.getTime() + 7 * 86400000);
          return {
            ...item,
            startAt: startDate.toISOString(),
            expiresAt: expiresDate.toISOString(),
          };
        });
      }
    }
  } catch (err) {
    console.warn('[Announcements] API fetch active announcements failed, falling back to Firestore:', err);
  }

  // Fallback to direct client Firestore
  try {
    const q = query(
      collection(db, 'announcements'),
      where('active', '==', true),
      where('status', '==', 'published')
    );
    const snap = await getDocs(q);
    const now = Date.now();
    const candidateList: AnnouncementEntity[] = [];

    snap.forEach((docSnap) => {
      const ann = parseFirestoreAnnouncementDoc(docSnap);
      const startMs = new Date(ann.startAt).getTime();
      const expiresMs = new Date(ann.expiresAt).getTime();

      if (now < startMs || now >= expiresMs) return;

      if (ann.targetAudience === 'admins_only' && role !== 'admin') return;
      if (ann.targetAudience === 'users_only' && role !== 'user') return;

      candidateList.push(ann);
    });

    const priorityWeight: Record<string, number> = { urgent: 1, important: 2, normal: 3 };
    candidateList.sort((a, b) => {
      const wA = priorityWeight[a.priority] || 3;
      const wB = priorityWeight[b.priority] || 3;
      if (wA !== wB) return wA - wB;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });

    return candidateList;
  } catch (err) {
    console.warn('[Announcements] Firestore fallback query unavailable:', err);
    return [];
  }
}

/**
 * Checks whether an announcement has already been seen or acknowledged by the user.
 */
export async function getAnnouncementReceiptForUser(
  announcementId: string,
  uid: string
): Promise<AnnouncementReceipt | null> {
  const receiptDocId = `${announcementId}_${uid}`;
  try {
    const snap = await getDoc(doc(db, 'announcementReceipts', receiptDocId));
    if (!snap.exists()) return null;
    const data = snap.data();
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
  } catch (err) {
    console.warn('[Announcements] Failed to read receipt from Firestore:', err);
    return null;
  }
}

/**
 * Evaluates active announcements against user's receipts and session dismissals,
 * returning the queue of announcements that must be shown as a popup.
 */
export async function getPendingAnnouncementsForUser(
  uid: string,
  role: 'admin' | 'user' = 'user',
  sessionDismissedIds: string[] = []
): Promise<AnnouncementEntity[]> {
  const activeList = await fetchActiveAnnouncements(uid, role);
  if (!activeList || activeList.length === 0) return [];

  const pending: AnnouncementEntity[] = [];

  for (const item of activeList) {
    // If dismissed in this session and mode is show_every_open, don't repeatedly show in same session
    if (sessionDismissedIds.includes(item.id) && item.displayMode !== 'require_acknowledgement') {
      continue;
    }

    try {
      const receipt = await getAnnouncementReceiptForUser(item.id, uid);

      if (item.displayMode === 'require_acknowledgement') {
        if (!receipt?.acknowledgedAt) {
          pending.push(item);
        }
      } else if (item.displayMode === 'show_once') {
        if (!receipt?.seenAt && !receipt?.acknowledgedAt) {
          pending.push(item);
        }
      } else if (item.displayMode === 'show_every_open') {
        // Show every app open unless dismissed during current session
        if (!sessionDismissedIds.includes(item.id)) {
          pending.push(item);
        }
      }
    } catch {
      // If error checking receipt, include urgent/important items safely
      if (item.priority === 'urgent' || item.priority === 'important') {
        pending.push(item);
      }
    }
  }

  return pending;
}

/**
 * Records seen timestamp for an announcement.
 * Writes to Firestore and/or backend API. Throws only if both fail.
 */
export async function recordAnnouncementSeen(
  announcementId: string,
  uid: string,
  userData?: { displayName?: string; email?: string }
): Promise<void> {
  const receiptDocId = `${announcementId}_${uid}`;
  let firestoreSuccess = false;

  try {
    const payload: any = {
      announcementId,
      uid,
      seenAt: serverTimestamp(),
      viewedAt: serverTimestamp(),
    };
    if (userData?.displayName) payload.displayName = userData.displayName;
    if (userData?.email) payload.email = userData.email;

    await setDoc(doc(db, 'announcementReceipts', receiptDocId), payload, { merge: true });
    firestoreSuccess = true;
  } catch (err) {
    console.warn('[Announcements] Direct Firestore seen record error, trying API fallback:', err);
  }

  // Also notify backend API
  try {
    const token = await getAuthToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await apiFetch(`/api/announcements/${announcementId}/seen`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        displayName: userData?.displayName,
        email: userData?.email,
      }),
    });
    if (res.ok) {
      return;
    }
  } catch (apiErr) {
    if (!firestoreSuccess) {
      throw apiErr;
    }
  }

  if (!firestoreSuccess) {
    throw new Error('Failed to record seen status.');
  }
}

/**
 * Records explicit acknowledgement timestamp for an announcement.
 * Writes to Firestore and/or backend API. Throws only if both fail.
 * Strictly idempotent — repeated calls merge without duplication.
 */
export async function recordAnnouncementAcknowledged(
  announcementId: string,
  uid: string,
  userData?: { displayName?: string; email?: string }
): Promise<void> {
  const receiptDocId = `${announcementId}_${uid}`;
  let firestoreSuccess = false;

  try {
    const payload: any = {
      announcementId,
      uid,
      seenAt: serverTimestamp(),
      viewedAt: serverTimestamp(),
      acknowledgedAt: serverTimestamp(),
      status: 'acknowledged',
    };
    if (userData?.displayName) payload.displayName = userData.displayName;
    if (userData?.email) payload.email = userData.email;

    await setDoc(doc(db, 'announcementReceipts', receiptDocId), payload, { merge: true });
    firestoreSuccess = true;
  } catch (err) {
    console.warn('[Announcements] Direct Firestore acknowledgement error, trying API fallback:', err);
  }

  // Also call backend API
  try {
    const token = await getAuthToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await apiFetch(`/api/announcements/${announcementId}/acknowledge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        displayName: userData?.displayName,
        email: userData?.email,
      }),
    });
    if (res.ok) {
      return;
    }
  } catch (apiErr) {
    if (!firestoreSuccess) {
      throw apiErr;
    }
  }

  if (!firestoreSuccess) {
    throw new Error('স্বীকৃতি সংরক্ষণ করা যায়নি। অনুগ্রহ করে সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।');
  }
}

// ==========================================
// ADMIN ANNOUNCEMENT MANAGEMENT API CALLS
// ==========================================

export async function fetchAdminAnnouncements(): Promise<AnnouncementEntity[]> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await apiFetch('/api/admin/announcements', { headers });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.announcements)) {
        return json.announcements.map((item: any) => {
          const startDate =
            toDateSafe(item.startAt) ||
            toDateSafe(item.startDate) ||
            toDateSafe(item.publishAt) ||
            toDateSafe(item.createdAt) ||
            new Date();
          const expiresDate =
            toDateSafe(item.expiresAt) ||
            toDateSafe(item.endDate) ||
            new Date(startDate.getTime() + 7 * 86400000);
          return {
            ...item,
            startAt: startDate.toISOString(),
            expiresAt: expiresDate.toISOString(),
          };
        });
      }
    }
  } catch (err) {
    console.warn('[Announcements] Admin API fetch failed, falling back to direct Firestore:', err);
  }

  // Fallback to direct Firestore for admin user
  try {
    const snap = await getDocs(collection(db, 'announcements'));
    const list: AnnouncementEntity[] = [];
    snap.forEach((docSnap) => {
      list.push(parseFirestoreAnnouncementDoc(docSnap));
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (fErr) {
    console.error('[Announcements] Direct Firestore fallback for admin failed:', fErr);
    throw new Error('বিজ্ঞপ্তি তালিকা লোড করা যায়নি।');
  }
}

export async function createAdminAnnouncement(
  payload: Partial<AnnouncementEntity> & { title: string; message: string }
): Promise<AnnouncementEntity> {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const cleanPayload = {
    ...payload,
    startAt: toIsoSafe(payload.startAt),
    expiresAt: toIsoSafe(payload.expiresAt, new Date(Date.now() + 7 * 86400000).toISOString()),
  };

  try {
    const res = await apiFetch('/api/admin/announcements', {
      method: 'POST',
      headers,
      body: JSON.stringify(cleanPayload),
    });

    if (res.ok) {
      const json = await res.json();
      return json.announcement;
    }
  } catch (err) {
    console.warn('[Announcements] API creation failed, attempting direct Firestore:', err);
  }

  // Fallback direct Firestore create
  try {
    const user = auth.currentUser;
    const adminUid = user?.uid || 'admin';
    const newDocRef = doc(collection(db, 'announcements'));
    const startD = toDateSafe(cleanPayload.startAt) || new Date();
    const expD = toDateSafe(cleanPayload.expiresAt) || new Date(Date.now() + 7 * 86400000);

    const docData = {
      title: cleanPayload.title.trim(),
      message: cleanPayload.message.trim(),
      priority: cleanPayload.priority || 'normal',
      displayMode: cleanPayload.displayMode || 'show_once',
      targetAudience: cleanPayload.targetAudience || 'everyone',
      active: cleanPayload.active !== false,
      status: cleanPayload.status || 'draft',
      startAt: Timestamp.fromDate(startD),
      expiresAt: Timestamp.fromDate(expD),
      sendPush: Boolean(cleanPayload.sendPush),
      pushSentAt: null,
      createdBy: adminUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(newDocRef, docData);
    const createdSnap = await getDoc(newDocRef);
    return parseFirestoreAnnouncementDoc(createdSnap);
  } catch (fallbackErr: any) {
    console.error('[Announcements] Direct Firestore creation failed:', fallbackErr);
    throw new Error(fallbackErr?.message || 'Failed to create announcement');
  }
}

export async function updateAdminAnnouncement(
  id: string,
  payload: Partial<AnnouncementEntity>
): Promise<AnnouncementEntity> {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const cleanPayload = {
    ...payload,
    ...(payload.startAt ? { startAt: toIsoSafe(payload.startAt) } : {}),
    ...(payload.expiresAt ? { expiresAt: toIsoSafe(payload.expiresAt) } : {}),
  };

  try {
    const res = await apiFetch(`/api/admin/announcements/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(cleanPayload),
    });

    if (res.ok) {
      const json = await res.json();
      return json.announcement;
    }
  } catch (err) {
    console.warn(`[Announcements] API update for ${id} failed, attempting direct Firestore:`, err);
  }

  // Fallback direct Firestore update
  try {
    const docRef = doc(db, 'announcements', id);
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (cleanPayload.title !== undefined) updateData.title = cleanPayload.title.trim();
    if (cleanPayload.message !== undefined) updateData.message = cleanPayload.message.trim();
    if (cleanPayload.priority !== undefined) updateData.priority = cleanPayload.priority;
    if (cleanPayload.displayMode !== undefined) updateData.displayMode = cleanPayload.displayMode;
    if (cleanPayload.targetAudience !== undefined) updateData.targetAudience = cleanPayload.targetAudience;
    if (cleanPayload.active !== undefined) updateData.active = cleanPayload.active;
    if (cleanPayload.status !== undefined) updateData.status = cleanPayload.status;
    if (cleanPayload.startAt !== undefined) {
      const d = toDateSafe(cleanPayload.startAt);
      if (d) updateData.startAt = Timestamp.fromDate(d);
    }
    if (cleanPayload.expiresAt !== undefined) {
      const d = toDateSafe(cleanPayload.expiresAt);
      if (d) updateData.expiresAt = Timestamp.fromDate(d);
    }
    if (cleanPayload.sendPush !== undefined) updateData.sendPush = Boolean(cleanPayload.sendPush);

    await updateDoc(docRef, updateData);
    const updatedSnap = await getDoc(docRef);
    return parseFirestoreAnnouncementDoc(updatedSnap);
  } catch (fallbackErr: any) {
    console.error('[Announcements] Direct Firestore update failed:', fallbackErr);
    throw new Error(fallbackErr?.message || 'Failed to update announcement');
  }
}

export async function deleteAdminAnnouncement(id: string): Promise<boolean> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await apiFetch(`/api/admin/announcements/${id}`, {
      method: 'DELETE',
      headers,
    });

    if (res.ok) {
      return true;
    }
  } catch (err) {
    console.warn(`[Announcements] API delete for ${id} failed, attempting direct Firestore delete:`, err);
  }

  try {
    await deleteDoc(doc(db, 'announcements', id));
    return true;
  } catch (err) {
    console.error('[Announcements] Direct Firestore delete failed:', err);
    throw new Error('বিজ্ঞপ্তি ডিলিট করতে সমস্যা হয়েছে।');
  }
}

export async function publishAdminAnnouncement(id: string): Promise<AnnouncementEntity> {
  return updateAdminAnnouncement(id, {
    status: 'published',
    active: true,
  });
}

export async function unpublishAdminAnnouncement(id: string): Promise<AnnouncementEntity> {
  return updateAdminAnnouncement(id, {
    status: 'draft',
    active: false,
  });
}

export async function sendAdminAnnouncementPush(
  id: string,
  force: boolean = false
): Promise<{ success: boolean; deviceCount: number; message?: string }> {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch(`/api/admin/announcements/${id}/send-push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ force }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Push broadcast failed' }));
    throw new Error(error.error || 'Failed to broadcast announcement push');
  }

  return await res.json();
}

/**
 * Fetches the user acknowledgement and view receipts for an announcement (Admin only).
 * Handles API fetch with direct Firestore fallback.
 */
export async function fetchAdminAnnouncementReceipts(
  announcementId: string
): Promise<AnnouncementReceiptsSummary> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await apiFetch(`/api/admin/announcements/${announcementId}/receipts`, {
      headers,
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success) {
        return {
          announcementId: json.announcementId,
          totalAuthorizedUsers: json.totalAuthorizedUsers ?? null,
          viewedCount: json.viewedCount || 0,
          acknowledgedCount: json.acknowledgedCount || 0,
          unseenCount: json.unseenCount ?? null,
          receipts: json.receipts || [],
        };
      }
    }
  } catch (err) {
    console.warn(`[Announcements] API receipts fetch for ${announcementId} failed, falling back:`, err);
  }

  // Fallback to direct client Firestore query for admin
  try {
    const q = query(
      collection(db, 'announcementReceipts'),
      where('announcementId', '==', announcementId)
    );
    const snap = await getDocs(q);
    const receipts: AnnouncementReceiptDetail[] = [];
    let viewedCount = 0;
    let acknowledgedCount = 0;

    snap.forEach((d) => {
      const data = d.data();
      const uid = data.uid || (d.id.startsWith(`${announcementId}_`) ? d.id.slice(announcementId.length + 1) : d.id);
      const isAck = Boolean(data.acknowledgedAt);
      if (isAck) acknowledgedCount++;
      viewedCount++;

      const viewedDate = toDateSafe(data.viewedAt) || toDateSafe(data.seenAt);
      const ackDate = toDateSafe(data.acknowledgedAt);

      receipts.push({
        uid,
        displayName: data.displayName || `ব্যবহারকারী (${uid.slice(0, 6)})`,
        email: data.email || null,
        role: data.role || 'user',
        viewedAt: viewedDate ? viewedDate.toISOString() : (ackDate ? ackDate.toISOString() : null),
        acknowledgedAt: ackDate ? ackDate.toISOString() : null,
        status: isAck ? 'acknowledged' : 'viewed',
      });
    });

    receipts.sort((a, b) => {
      const timeA = toDateSafe(a.acknowledgedAt)?.getTime() || toDateSafe(a.viewedAt)?.getTime() || 0;
      const timeB = toDateSafe(b.acknowledgedAt)?.getTime() || toDateSafe(b.viewedAt)?.getTime() || 0;
      return timeB - timeA;
    });

    return {
      announcementId,
      totalAuthorizedUsers: null,
      viewedCount,
      acknowledgedCount,
      unseenCount: null,
      receipts,
    };
  } catch (fErr) {
    console.error('[Announcements] Direct Firestore fallback for receipts failed:', fErr);
    throw new Error('স্বীকৃতি ও ভিউ ডেটা লোড করা যায়নি।');
  }
}
