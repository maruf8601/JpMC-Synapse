/**
 * JpMC Synapse — Real Reminder & Notification Service
 * Web Notification API + Web Audio Chime + Asia/Dhaka Morning Briefing Engine
 * Replaces simulated "AlarmManager" with honest, robust Web/PWA Notification Architecture
 */

import { EventEntity } from '../domain/models';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

// Set of keys for already delivered notifications: `${eventId}_${minutesBefore}` or `briefing_${date}`
const deliveredNotifications = new Set<string>();

// Simple Web Audio API Synthesizer for pleasant hospital schedule alert
function playChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // First tone (523.25 Hz - C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.4);

    // Second higher tone (659.25 Hz - E5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.15);
    gain2.gain.setValueAtTime(0.2, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.6);
  } catch (err) {
    // Audio context might be restricted before user gesture
  }
}

/**
 * Returns current real Notification permission state
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Requests Notification permission from the browser / PWA
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      playChime();
      showNotification('JpMC Synapse বিজ্ঞপ্তি সক্রিয়', {
        body: 'জামালপুর মেডিকেল কলেজ সূচি রিমাইন্ডার ও সকাল ৭:৩০ ব্রিফিং এখন সক্রিয়।',
        tag: 'jpmc-permission-welcome',
      });
    }
    return perm as NotificationPermissionState;
  } catch (err) {
    console.warn('[Notification] Permission request failed:', err);
    return 'denied';
  }
}

/**
 * Shows browser notification if permitted
 * Uses ServiceWorkerRegistration.showNotification first (safe for Android/Mobile/PWA),
 * falling back to window.Notification constructor on desktop.
 */
export function showNotification(title: string, options?: NotificationOptions): boolean {
  if (getNotificationPermission() !== 'granted') return false;

  try {
    playChime();

    const fullOptions: NotificationOptions = {
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      ...options,
    };

    // 1. Try ServiceWorker showNotification first (Standard for Android Chrome, PWA & modern browsers)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg && 'showNotification' in reg) {
            reg.showNotification(title, fullOptions).catch((swErr) => {
              console.warn('[Notification] ServiceWorker showNotification promise error:', swErr);
            });
          }
        })
        .catch(() => {
          // If SW ready rejects, attempt desktop fallback
          tryDirectNotification(title, fullOptions);
        });
      return true;
    }

    // 2. Direct desktop Notification fallback
    return tryDirectNotification(title, fullOptions);
  } catch (err) {
    console.warn('[Notification] Failed to show notification:', err);
    return false;
  }
}

function tryDirectNotification(title: string, options: NotificationOptions): boolean {
  try {
    if (typeof Notification !== 'undefined') {
      new Notification(title, options);
      return true;
    }
  } catch (err) {
    console.warn('[Notification] Direct Notification constructor unsupported/failed:', err);
  }
  return false;
}

/**
 * Checks all events for scheduled reminders (2 hours before, 30 min before) and 07:30 Morning Briefing
 */
export function checkScheduledReminders(events: EventEntity[]): void {
  const now = new Date();

  // 1. Current Dhaka Date & Time
  const dhakaDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }); // YYYY-MM-DD
  const dhakaHourMin = now.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }); // HH:mm

  // Morning 07:30 Briefing Check
  const briefingKey = `briefing_${dhakaDate}`;
  if (dhakaHourMin >= '07:30' && dhakaHourMin <= '08:15' && !deliveredNotifications.has(briefingKey)) {
    deliveredNotifications.add(briefingKey);
    const todayEvents = events.filter((e) => e.eventDate === dhakaDate && e.reviewStatus === 'auto_approved');
    if (todayEvents.length > 0) {
      showNotification(`🌅 আজ ${dhakaDate}-এর সূচি ব্রিফিং (JpMC)`, {
        body: `আজ মোট ${todayEvents.length}টি সভা/একাডেমিক সূচি রয়েছে। প্রথম সূচি: "${todayEvents[0].title}" (${todayEvents[0].startTime})।`,
        tag: briefingKey,
      });
    }
  }

  // 2. Individual Event Reminders
  for (const event of events) {
    if (event.reviewStatus !== 'auto_approved' || !event.startTime || event.isCompleted) {
      continue;
    }

    try {
      // Event timestamp in Dhaka timezone (+06:00)
      const eventDateTimeIso = `${event.eventDate}T${event.startTime}:00+06:00`;
      const eventTimeMs = new Date(eventDateTimeIso).getTime();
      const nowMs = now.getTime();
      const diffMinutes = Math.round((eventTimeMs - nowMs) / (60 * 1000));

      // 2 Hours (120 min) alert window (between 115 and 125 min)
      if (diffMinutes >= 115 && diffMinutes <= 125) {
        const key = `${event.id}_120`;
        if (!deliveredNotifications.has(key)) {
          deliveredNotifications.add(key);
          showNotification(`⏰ ২ ঘণ্টা পর সূচি: ${event.title}`, {
            body: `সময়: ${event.startTime} | ভেন্যু: ${event.venue}\nজামালপুর মেডিকেল কলেজ`,
            tag: key,
          });
        }
      }

      // 30 Minutes alert window (between 25 and 35 min)
      if (diffMinutes >= 25 && diffMinutes <= 35) {
        const key = `${event.id}_30`;
        if (!deliveredNotifications.has(key)) {
          deliveredNotifications.add(key);
          showNotification(`🚨 ৩০ মিনিট পর সভা শুরু: ${event.title}`, {
            body: `সময়: ${event.startTime} | ভেন্যু: ${event.venue}\nপ্রস্তুত থাকুন।`,
            tag: key,
          });
        }
      }
    } catch {
      // Ignore date parsing issues on malformed dates
    }
  }
}
