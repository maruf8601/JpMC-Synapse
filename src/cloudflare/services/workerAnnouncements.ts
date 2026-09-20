/**
 * JpMC Synapse — Cloudflare Worker Announcements Service
 * Institutional notice dissemination, push notifications, and read/acknowledgment receipts.
 */

import { Env } from '../types';
import {
  firestoreGetDoc,
  firestoreSetDoc,
  firestoreDeleteDoc,
  firestoreQuery,
  sendFcmMessage,
} from '../firebase/workerFirebase';

export async function broadcastAnnouncementPush(
  env: Env,
  announcementId: string
): Promise<{ success: boolean; sentCount: number; error?: string }> {
  const ann = await firestoreGetDoc(env, 'announcements', announcementId);
  if (!ann) return { success: false, sentCount: 0, error: 'ANNOUNCEMENT_NOT_FOUND' };

  const devices = await firestoreQuery(env, 'devices', {
    filters: [{ field: 'notificationsEnabled', op: 'EQUAL', value: true }],
  });

  if (!devices || devices.length === 0) {
    return { success: true, sentCount: 0 };
  }

  const priorityEmoji = ann.priority === 'urgent' ? '🚨' : '📢';
  const title = `${priorityEmoji} [জরুরি নোটিশ] ${ann.title}`;
  const body = `${(ann.content || '').slice(0, 100)}\nজামালপুর মেডিকেল কলেজ`;

  let sentCount = 0;
  for (const dev of devices) {
    if (!dev.fcmToken) continue;

    const deliveryId = `announcement_${announcementId}_${dev.deviceId}`;
    const res = await sendFcmMessage(env, {
      token: dev.fcmToken,
      notification: { title, body },
      data: {
        type: 'announcement',
        announcementId,
        url: `/?announcementId=${announcementId}`,
      },
    });

    await firestoreSetDoc(env, 'notificationDeliveries', deliveryId, {
      deliveryId,
      announcementId,
      deviceId: dev.deviceId,
      userId: dev.userId || null,
      fcmToken: dev.fcmToken,
      type: 'announcement',
      title,
      body,
      status: res.success ? 'sent' : 'failed',
      deliveredAt: new Date().toISOString(),
    });

    if (res.success) sentCount++;
  }

  return { success: true, sentCount };
}
