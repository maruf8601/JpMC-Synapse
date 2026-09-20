/**
 * JpMC Synapse — Cloudflare Worker Reminder & Briefing Engine
 * Executes 120-min, 30-min reminders and 07:30 Morning Briefing in Asia/Dhaka timezone (UTC+6)
 * Triggered by Cloudflare Workers Cron Triggers or HTTP trigger endpoints
 */

import { Env } from '../types';
import {
  firestoreGetDoc,
  firestoreSetDoc,
  firestoreQuery,
  sendFcmMessage,
} from '../firebase/workerFirebase';

export function getDhakaTimeParts(dateObj: Date = new Date()) {
  const dtfDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dhakaDateStr = dtfDate.format(dateObj); // YYYY-MM-DD

  const dtfTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dhakaTimeStr = dtfTime.format(dateObj); // HH:mm

  // Construct current timestamp in Dhaka
  const [year, month, day] = dhakaDateStr.split('-').map(Number);
  const [hour, minute] = dhakaTimeStr.split(':').map(Number);
  const dhakaCurrentMs = Date.UTC(year, month - 1, day, hour - 6, minute); // Dhaka is UTC+6

  return {
    now: new Date(dhakaCurrentMs),
    dhakaDateStr,
    dhakaTimeStr,
    dhakaCurrentMs,
  };
}

function getEventTimestampMs(eventDate: string, startTime: string): number | null {
  try {
    const [y, m, d] = eventDate.split('-').map(Number);
    const [hh, mm] = startTime.split(':').map(Number);
    if (!y || !m || !d || isNaN(hh) || isNaN(mm)) return null;
    return Date.UTC(y, m - 1, d, hh - 6, mm); // Asia/Dhaka is UTC+6
  } catch {
    return null;
  }
}

/**
 * Runs a single tick of the reminder processor
 */
export async function runWorkerSchedulerTick(env: Env): Promise<{
  success: boolean;
  checkedEventsCount: number;
  notificationsSent: number;
}> {
  const { dhakaDateStr, dhakaTimeStr, now } = getDhakaTimeParts();
  const nowMs = now.getTime();

  // 1. Fetch active devices with notifications enabled
  const devices = await firestoreQuery(env, 'devices', {
    filters: [{ field: 'notificationsEnabled', op: 'EQUAL', value: true }],
  });

  if (!devices || devices.length === 0) {
    return { success: true, checkedEventsCount: 0, notificationsSent: 0 };
  }

  // 2. Fetch reminder preferences
  let defaultReminder2h = true;
  let defaultReminder30m = true;
  const prefDoc = await firestoreGetDoc(env, 'settings', 'reminder_preferences');
  if (prefDoc) {
    if (typeof prefDoc.defaultReminder2h === 'boolean') defaultReminder2h = prefDoc.defaultReminder2h;
    if (typeof prefDoc.defaultReminder30m === 'boolean') defaultReminder30m = prefDoc.defaultReminder30m;
  }

  // 3. Query today and future events
  const events = await firestoreQuery(env, 'events', {
    filters: [
      { field: 'reviewStatus', op: 'EQUAL', value: 'auto_approved' },
      { field: 'eventDate', op: 'GREATER_THAN_OR_EQUAL', value: dhakaDateStr },
    ],
  });

  let notificationsSent = 0;

  for (const event of events) {
    if (!event.startTime || event.isCompleted) continue;

    const eventTimeMs = getEventTimestampMs(event.eventDate, event.startTime);
    if (!eventTimeMs) continue;

    const diffMinutes = Math.round((eventTimeMs - nowMs) / (60 * 1000));

    const baseOffsets: number[] = [];
    if (defaultReminder2h) baseOffsets.push(120);
    if (defaultReminder30m) baseOffsets.push(30);

    const customOffsets: number[] = Array.isArray(event.reminders)
      ? event.reminders.filter((r: any) => r.enabled).map((r: any) => Number(r.minutesBefore))
      : [];
    const targetOffsets = Array.from(new Set([...baseOffsets, ...customOffsets]));

    // Check target offsets
    for (const offset of targetOffsets) {
      // Trigger window: ±3 minutes
      if (diffMinutes >= offset - 3 && diffMinutes <= offset + 3) {
        const offsetLabel =
          offset === 120
            ? '২ ঘণ্টা'
            : offset === 30
            ? '৩০ মিনিট'
            : offset >= 60
            ? `${Math.round(offset / 60)} ঘণ্টা`
            : `${offset} মিনিট`;

        const title = `⏰ ${offsetLabel} পর কর্মসূচি: ${event.title}`;
        const venueText = event.venue && event.venue.trim() ? ` | ভেন্যু: ${event.venue.trim()}` : '';
        const body = `সময়: ${event.startTime}${venueText}\nজামালপুর মেডিকেল কলেজ`;

        for (const device of devices) {
          if (!device.fcmToken) continue;
          if (event.ownerUserId && device.userId !== event.ownerUserId) continue;

          const deliveryId = `${event.id}_${device.deviceId}_${offset}`;
          const existingDelivery = await firestoreGetDoc(env, 'notificationDeliveries', deliveryId);
          if (existingDelivery) continue;

          const res = await sendFcmMessage(env, {
            token: device.fcmToken,
            notification: { title, body },
            data: {
              eventId: event.id,
              type: offset === 120 ? 'reminder_120m' : offset === 30 ? 'reminder_30m' : 'reminder_custom',
              url: `/?eventId=${event.id}`,
            },
          });

          await firestoreSetDoc(env, 'notificationDeliveries', deliveryId, {
            deliveryId,
            eventId: event.id,
            deviceId: device.deviceId,
            userId: device.userId || null,
            fcmToken: device.fcmToken,
            type: offset === 120 ? 'reminder_120m' : 'reminder_30m',
            title,
            body,
            status: res.success ? 'sent' : 'failed',
            error: res.error || null,
            deliveredAt: new Date().toISOString(),
          });

          if (res.success) notificationsSent++;
        }
      }
    }
  }

  // 4. Also check if current time in Dhaka matches daily morning briefing (07:30)
  if (dhakaTimeStr >= '07:28' && dhakaTimeStr <= '07:33') {
    const briefingResult = await runWorkerMorningBriefing(env, false);
    notificationsSent += briefingResult.sentCount;
  }

  return {
    success: true,
    checkedEventsCount: events.length,
    notificationsSent,
  };
}

/**
 * Executes the Daily Morning Briefing
 */
export async function runWorkerMorningBriefing(
  env: Env,
  forceRun: boolean = false
): Promise<{ success: boolean; sentCount: number }> {
  const { dhakaDateStr } = getDhakaTimeParts();

  const devices = await firestoreQuery(env, 'devices', {
    filters: [{ field: 'notificationsEnabled', op: 'EQUAL', value: true }],
  });

  if (!devices || devices.length === 0) {
    return { success: true, sentCount: 0 };
  }

  // Fetch today's approved events
  const todayEvents = await firestoreQuery(env, 'events', {
    filters: [
      { field: 'reviewStatus', op: 'EQUAL', value: 'auto_approved' },
      { field: 'eventDate', op: 'EQUAL', value: dhakaDateStr },
    ],
  });

  if (todayEvents.length === 0 && !forceRun) {
    return { success: true, sentCount: 0 };
  }

  let title = `🌅 আজকের কর্মসূচি (${todayEvents.length}টি)`;
  let body = '';
  if (todayEvents.length === 0) {
    title = '🌅 আজকের কর্মসূচি';
    body = 'আজ কোনো পূর্বনির্ধারিত কর্মসূচি নেই।\nজামালপুর মেডিকেল কলেজ';
  } else {
    body = todayEvents
      .slice(0, 3)
      .map((e) => `• ${e.startTime || 'সময় নির্ধারণহীন'}: ${e.title}`)
      .join('\n');
    if (todayEvents.length > 3) {
      body += `\n...আরও ${todayEvents.length - 3}টি কর্মসূচি রয়েছে`;
    }
  }

  let sentCount = 0;
  for (const device of devices) {
    if (!device.fcmToken) continue;

    const deliveryId = `briefing_${device.deviceId}_${dhakaDateStr}`;
    if (!forceRun) {
      const existing = await firestoreGetDoc(env, 'notificationDeliveries', deliveryId);
      if (existing) continue;
    }

    const res = await sendFcmMessage(env, {
      token: device.fcmToken,
      notification: { title, body },
      data: {
        type: 'morning_briefing',
        date: dhakaDateStr,
        url: '/',
      },
    });

    await firestoreSetDoc(env, 'notificationDeliveries', deliveryId, {
      deliveryId,
      deviceId: device.deviceId,
      userId: device.userId || null,
      fcmToken: device.fcmToken,
      type: 'morning_briefing',
      title,
      body,
      status: res.success ? 'sent' : 'failed',
      error: res.error || null,
      deliveredAt: new Date().toISOString(),
    });

    if (res.success) sentCount++;
  }

  return { success: true, sentCount };
}
