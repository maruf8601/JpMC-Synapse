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
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { AnnouncementEntity, AnnouncementReceipt } from '../domain/models';

export async function getAuthToken(): Promise<string | undefined> {
  const currentUser = auth.currentUser;
  if (!currentUser) return undefined;
  try {
    return await currentUser.getIdToken();
  } catch {
    return undefined;
  }
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
        return json.announcements;
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
      const data = docSnap.data();
      const startMs = data.startAt?.toDate ? data.startAt.toDate().getTime() : new Date(data.startAt || 0).getTime();
      const expiresMs = data.expiresAt?.toDate ? data.expiresAt.toDate().getTime() : new Date(data.expiresAt || Infinity).getTime();

      if (now < startMs || now >= expiresMs) return;

      if (data.targetAudience === 'admins_only' && role !== 'admin') return;
      if (data.targetAudience === 'users_only' && role !== 'user') return;

      candidateList.push({
        id: docSnap.id,
        title: data.title || '',
        message: data.message || '',
        priority: data.priority || 'normal',
        displayMode: data.displayMode || 'show_once',
        targetAudience: data.targetAudience || 'everyone',
        active: Boolean(data.active),
        status: data.status || 'published',
        startAt: data.startAt?.toDate ? data.startAt.toDate().toISOString() : data.startAt,
        expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt,
        sendPush: Boolean(data.sendPush),
        pushSentAt: data.pushSentAt?.toDate ? data.pushSentAt.toDate().toISOString() : data.pushSentAt,
        createdBy: data.createdBy || '',
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
      });
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
    console.error('[Announcements] Firestore fallback failed:', err);
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
    return {
      announcementId,
      uid,
      seenAt: data.seenAt?.toDate ? data.seenAt.toDate().toISOString() : data.seenAt,
      acknowledgedAt: data.acknowledgedAt?.toDate ? data.acknowledgedAt.toDate().toISOString() : data.acknowledgedAt,
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
 * Records seen timestamp for an announcement
 */
export async function recordAnnouncementSeen(announcementId: string, uid: string): Promise<void> {
  const receiptDocId = `${announcementId}_${uid}`;
  try {
    await setDoc(
      doc(db, 'announcementReceipts', receiptDocId),
      {
        announcementId,
        uid,
        seenAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // API fallback
    const token = await getAuthToken();
    if (token) {
      await apiFetch(`/api/announcements/${announcementId}/seen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    }
  }
}

/**
 * Records explicit acknowledgement timestamp for an announcement
 */
export async function recordAnnouncementAcknowledged(announcementId: string, uid: string): Promise<void> {
  const receiptDocId = `${announcementId}_${uid}`;
  try {
    await setDoc(
      doc(db, 'announcementReceipts', receiptDocId),
      {
        announcementId,
        uid,
        seenAt: serverTimestamp(),
        acknowledgedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // API fallback
    const token = await getAuthToken();
    if (token) {
      await apiFetch(`/api/announcements/${announcementId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
    }
  }
}

// ==========================================
// ADMIN ANNOUNCEMENT MANAGEMENT API CALLS
// ==========================================

export async function fetchAdminAnnouncements(): Promise<AnnouncementEntity[]> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch('/api/admin/announcements', { headers });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to fetch admin announcements');
  }
  const json = await res.json();
  return json.announcements || [];
}

export async function createAdminAnnouncement(
  payload: Partial<AnnouncementEntity> & { title: string; message: string }
): Promise<AnnouncementEntity> {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch('/api/admin/announcements', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Creation failed' }));
    throw new Error(error.error || 'Failed to create announcement');
  }

  const json = await res.json();
  return json.announcement;
}

export async function updateAdminAnnouncement(
  id: string,
  payload: Partial<AnnouncementEntity>
): Promise<AnnouncementEntity> {
  const token = await getAuthToken();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch(`/api/admin/announcements/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Update failed' }));
    throw new Error(error.error || 'Failed to update announcement');
  }

  const json = await res.json();
  return json.announcement;
}

export async function deleteAdminAnnouncement(id: string): Promise<boolean> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch(`/api/admin/announcements/${id}`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Delete failed' }));
    throw new Error(error.error || 'Failed to delete announcement');
  }

  return true;
}

export async function publishAdminAnnouncement(id: string): Promise<AnnouncementEntity> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch(`/api/admin/announcements/${id}/publish`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Publish failed' }));
    throw new Error(error.error || 'Failed to publish announcement');
  }

  const json = await res.json();
  return json.announcement;
}

export async function unpublishAdminAnnouncement(id: string): Promise<AnnouncementEntity> {
  const token = await getAuthToken();
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await apiFetch(`/api/admin/announcements/${id}/unpublish`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unpublish failed' }));
    throw new Error(error.error || 'Failed to unpublish announcement');
  }

  const json = await res.json();
  return json.announcement;
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
