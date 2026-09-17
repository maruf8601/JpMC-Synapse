/**
 * JpMC Synapse — Server-Side Reminder & Morning Briefing Scheduler
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 *
 * Runs background check loop every 60 seconds:
 * - 2 hours (120 min) before meeting
 * - 30 minutes before meeting
 * - Custom offsets per event (if configured)
 * - 07:30 AM Daily Morning Briefing (configurable)
 *
 * Sends Firebase Cloud Messaging (FCM) Web Push notifications even when PWA/browser is CLOSED.
 * Guarantees zero duplicate sends using Firestore collection `notificationDeliveries`.
 */

import {
  adminDb,
  adminMessaging,
  getActiveDevices,
  hasNotificationBeenDelivered,
  logNotificationDelivery,
  NotificationDeliveryLog,
} from './firebaseAdmin';

interface SchedulerStatus {
  isRunning: boolean;
  lastTickAt: string | null;
  lastBriefingDateSent: string | null;
  totalNotificationsSent: number;
  totalErrors: number;
}

const schedulerStatus: SchedulerStatus = {
  isRunning: false,
  lastTickAt: null,
  lastBriefingDateSent: null,
  totalNotificationsSent: 0,
  totalErrors: 0,
};

let schedulerInterval: NodeJS.Timeout | null = null;
let isTickProcessing = false;

export function getSchedulerStatus(): SchedulerStatus {
  return { ...schedulerStatus };
}

/**
 * Gets current date and time in Asia/Dhaka (+06:00)
 */
export function getDhakaTimeParts() {
  const now = new Date();
  const dhakaDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }); // YYYY-MM-DD
  const dhakaTimeStr = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }); // HH:mm
  return { now, dhakaDateStr, dhakaTimeStr };
}

/**
 * Parse an event date and startTime into epoch milliseconds with +06:00 offset
 */
function getEventTimestampMs(eventDate: string, startTime: string): number | null {
  try {
    const isoString = `${eventDate}T${startTime}:00+06:00`;
    const ms = new Date(isoString).getTime();
    return isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}

/**
 * Sends FCM push notification to a device token with robust error logging
 */
export async function sendFcmPushNotification(params: {
  device: { deviceId: string; userId?: string; fcmToken: string };
  title: string;
  body: string;
  deliveryId: string;
  type: NotificationDeliveryLog['type'];
  eventId?: string;
  eventDate?: string;
  startTime?: string;
  venue?: string;
  url?: string;
}): Promise<boolean> {
  const { device, title, body, deliveryId, type, eventId, eventDate, startTime, venue, url } = params;

  // 1. Idempotency Check: Never send the same notification twice
  const alreadyDelivered = await hasNotificationBeenDelivered(deliveryId);
  if (alreadyDelivered) {
    return false;
  }

  const payloadData: Record<string, string> = {
    deliveryId,
    reminderType: type,
    eventId: eventId || '',
    eventDate: eventDate || '',
    startTime: startTime || '',
    venue: venue || '',
    title,
    body,
    url: url || '/',
    click_action: url || '/',
  };

  try {
    const message = {
      token: device.fcmToken,
      notification: {
        title,
        body,
      },
      data: payloadData,
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body,
          icon: '/pwa-192x192.png',
          badge: '/icon.svg',
          tag: deliveryId,
          requireInteraction: true,
          data: payloadData,
        },
        fcmOptions: {
          link: url || '/',
        },
      },
    };

    await adminMessaging.send(message as any);

    // 2. Log successful delivery in Firestore
    await logNotificationDelivery({
      deliveryId,
      eventId,
      deviceId: device.deviceId,
      userId: device.userId,
      fcmToken: device.fcmToken,
      type,
      title,
      body,
      status: 'sent',
      deliveredAt: new Date().toISOString(),
    });

    schedulerStatus.totalNotificationsSent++;
    console.log(`[FCM] Notification sent successfully: "${title}" -> ${device.deviceId.slice(0, 8)}...`);
    return true;
  } catch (err: any) {
    schedulerStatus.totalErrors++;
    console.error(`[FCM] Notification send failed for ${device.deviceId.slice(0, 8)}:`, err?.message || err);

    await logNotificationDelivery({
      deliveryId,
      eventId,
      deviceId: device.deviceId,
      userId: device.userId,
      fcmToken: device.fcmToken,
      type,
      title,
      body,
      status: 'failed',
      error: err?.message || 'Unknown FCM error',
      deliveredAt: new Date().toISOString(),
    });

    return false;
  }
}

/**
 * Checks for upcoming event reminders (120 min, 30 min, and custom offsets)
 */
async function processUpcomingEventReminders(devices: any[]) {
  if (devices.length === 0) return;

  const { now, dhakaDateStr } = getDhakaTimeParts();
  const nowMs = now.getTime();

  // Read default reminder preferences from settings
  let defaultReminder2h = true;
  let defaultReminder30m = true;

  try {
    const prefDoc = await adminDb.collection('settings').doc('reminder_preferences').get();
    if (prefDoc.exists) {
      const prefData = prefDoc.data();
      if (typeof prefData?.defaultReminder2h === 'boolean') defaultReminder2h = prefData.defaultReminder2h;
      if (typeof prefData?.defaultReminder30m === 'boolean') defaultReminder30m = prefData.defaultReminder30m;
    }
  } catch (err) {
    // fallback to defaults if doc doesn't exist yet
  }

  // Fetch today and future approved events from Firestore
  try {
    const eventsSnapshot = await adminDb
      .collection('events')
      .where('reviewStatus', '==', 'auto_approved')
      .where('eventDate', '>=', dhakaDateStr)
      .get();

    if (eventsSnapshot.empty) return;

    for (const docSnap of eventsSnapshot.docs) {
      const event = docSnap.data();
      if (!event.startTime || event.isCompleted) continue;

      const eventTimeMs = getEventTimestampMs(event.eventDate, event.startTime);
      if (!eventTimeMs) continue;

      // Minutes difference between event start and current time
      const diffMinutes = Math.round((eventTimeMs - nowMs) / (60 * 1000));

      // Respect default preferences: only add 120 / 30 if enabled in settings
      const baseOffsets: number[] = [];
      if (defaultReminder2h) baseOffsets.push(120);
      if (defaultReminder30m) baseOffsets.push(30);

      // Merge custom event reminder offsets if defined
      const customOffsets: number[] = Array.isArray(event.reminders)
        ? event.reminders.filter((r: any) => r.enabled).map((r: any) => Number(r.minutesBefore))
        : [];
      const targetOffsets = Array.from(new Set([...baseOffsets, ...customOffsets]));

      // Filter target devices based on event ownership and audience
      const targetDevices = devices.filter((device) => {
        if (event.ownerUserId) {
          return device.userId === event.ownerUserId;
        }
        if (event.audience === 'personal') {
          return Boolean(event.ownerUserId && device.userId === event.ownerUserId);
        }
        // Official / College-wide events broadcast to all active devices
        return true;
      });

      if (targetDevices.length === 0) continue;

      for (const offset of targetOffsets) {
        // Trigger window: within ±3 minutes of target offset
        const lowerBound = offset - 3;
        const upperBound = offset + 3;

        if (diffMinutes >= lowerBound && diffMinutes <= upperBound) {
          const offsetLabel =
            offset === 120
              ? '২ ঘণ্টা'
              : offset === 30
              ? '৩০ মিনিট'
              : offset >= 60
              ? `${Math.round(offset / 60)} ঘণ্টা`
              : `${offset} মিনিট`;

          const title = `⏰ ${offsetLabel} পর কর্মসূচি: ${event.title}`;
          // Never invent venue: only include venue if explicitly provided
          const venueText = event.venue && event.venue.trim() ? ` | ভেন্যু: ${event.venue.trim()}` : '';
          const body = `সময়: ${event.startTime}${venueText}\nজামালপুর মেডিকেল কলেজ`;

          for (const device of targetDevices) {
            const deliveryId = `${event.id}_${device.deviceId}_${offset}`;
            const type = offset === 120 ? 'reminder_120m' : offset === 30 ? 'reminder_30m' : 'reminder_custom';

            await sendFcmPushNotification({
              device,
              title,
              body,
              deliveryId,
              type,
              eventId: event.id,
              eventDate: event.eventDate,
              startTime: event.startTime,
              venue: event.venue,
              url: `/?eventId=${event.id}`,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Scheduler] Error checking event reminders:', err);
  }
}

/**
 * Checks and dispatches 07:30 Morning Briefing for all registered devices
 */
export async function processDailyMorningBriefing(devices: any[], forceRun: boolean = false) {
  if (devices.length === 0) return;

  const { dhakaDateStr, dhakaTimeStr } = getDhakaTimeParts();

  // Read configured briefing settings (default "07:30", notifyWhenNoEventsToday = false)
  let targetBriefingTime = '07:30';
  let isBriefingEnabled = true;
  let notifyWhenNoEventsToday = false;

  try {
    const settingDoc = await adminDb.collection('settings').doc('reminder_preferences').get();
    if (settingDoc.exists) {
      const data = settingDoc.data();
      if (data?.dailyBriefingTime) targetBriefingTime = data.dailyBriefingTime;
      if (typeof data?.dailyBriefingEnabled === 'boolean') isBriefingEnabled = data.dailyBriefingEnabled;
      if (typeof data?.notifyWhenNoEventsToday === 'boolean') notifyWhenNoEventsToday = data.notifyWhenNoEventsToday;
    }
  } catch (err) {
    // default to 07:30 if settings not yet written
  }

  if (!isBriefingEnabled && !forceRun) return;

  if (!forceRun) {
    // Window: within 5 minutes of target briefing time (e.g. 07:30 - 07:35)
    const isTimeForBriefing =
      dhakaTimeStr >= targetBriefingTime &&
      dhakaTimeStr <= addMinutesToTimeStr(targetBriefingTime, 5);

    if (!isTimeForBriefing) return;
  }

  // Query today's approved events
  try {
    const todayEventsSnapshot = await adminDb
      .collection('events')
      .where('reviewStatus', '==', 'auto_approved')
      .where('eventDate', '==', dhakaDateStr)
      .get();

    const allTodayEvents: any[] = [];
    todayEventsSnapshot.forEach((doc) => allTodayEvents.push(doc.data()));
    allTodayEvents.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));

    for (const device of devices) {
      // Scope events for this device
      const userTodayEvents = allTodayEvents.filter((ev) => {
        if (ev.ownerUserId) {
          return device.userId === ev.ownerUserId;
        }
        if (ev.audience === 'personal') {
          return Boolean(ev.ownerUserId && device.userId === ev.ownerUserId);
        }
        return true;
      });

      const eventCount = userTodayEvents.length;

      // Respect preference: If notifyWhenNoEventsToday is false and 0 events, send nothing
      if (eventCount === 0 && !notifyWhenNoEventsToday) {
        continue;
      }

      const deliveryId = `briefing_${device.deviceId}_${dhakaDateStr}`;
      const title = `🌅 JpMC Synapse — আজকের কর্মসূচি (${dhakaDateStr})`;
      let body = `শুভ সকাল। আজ জামালপুর মেডিকেল কলেজে মোট ${eventCount}টি কর্মসূচি নির্ধারিত রয়েছে।`;

      if (eventCount === 0) {
        body = `শুভ সকাল। আজ কোনো আনুষ্ঠানিক সভা বা কর্মসূচি নির্ধারিত নেই।`;
      } else {
        const firstEvent = userTodayEvents[0];
        const secondEvent = userTodayEvents.length > 1 ? userTodayEvents[1] : null;

        const lines: string[] = [`আজ আপনার ${eventCount}টি কর্মসূচি রয়েছে:`];
        lines.push(`• ${firstEvent.startTime} — ${firstEvent.title}`);
        if (secondEvent) {
          lines.push(`• ${secondEvent.startTime} — ${secondEvent.title}`);
        }
        if (eventCount > 2) {
          lines.push(`এবং আরও ${eventCount - 2}টি কর্মসূচি রয়েছে।`);
        }
        body = lines.join('\n');
      }

      await sendFcmPushNotification({
        device,
        title,
        body,
        deliveryId,
        type: 'morning_briefing',
        eventDate: dhakaDateStr,
        url: '/?tab=home',
      });
    }

    schedulerStatus.lastBriefingDateSent = dhakaDateStr;
  } catch (err) {
    console.error('[Scheduler] Error in morning briefing dispatch:', err);
  }
}

function addMinutesToTimeStr(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

/**
 * Single tick execution of the scheduler
 */
export async function runSchedulerTick() {
  if (isTickProcessing) return;
  isTickProcessing = true;

  try {
    const devices = await getActiveDevices();
    schedulerStatus.lastTickAt = new Date().toISOString();

    if (devices.length > 0) {
      await processUpcomingEventReminders(devices);
      await processDailyMorningBriefing(devices);
    }
  } catch (err) {
    console.error('[Scheduler] Tick error:', err);
  } finally {
    isTickProcessing = false;
  }
}

/**
 * Starts the server-side reminder scheduler interval
 */
export function startReminderScheduler(intervalMs: number = 60 * 1000) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  schedulerStatus.isRunning = true;
  console.log(`[Scheduler] Reminder & Morning Briefing Scheduler started (Interval: ${intervalMs / 1000}s, Timezone: Asia/Dhaka)`);

  // Run initial tick immediately
  runSchedulerTick().catch((err) => console.warn('[Scheduler] Initial tick warning:', err));

  schedulerInterval = setInterval(() => {
    runSchedulerTick().catch((err) => console.warn('[Scheduler] Tick interval warning:', err));
  }, intervalMs);
}

export function stopReminderScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerStatus.isRunning = false;
  console.log('[Scheduler] Reminder scheduler stopped.');
}
