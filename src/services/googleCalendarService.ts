/**
 * JpMC Synapse — Google Calendar Integration Service
 * Real bidirectional synchronization using Google Calendar API v3
 * Scope: https://www.googleapis.com/auth/calendar.events
 * Timezone: Asia/Dhaka (+06:00)
 */

import { EventEntity } from '../domain/models';
import { getAccessToken, requestCalendarAccess } from './googleAuth';
import { eventRepository } from '../data/eventRepository';

export interface CalendarSyncResult {
  success: boolean;
  exportedCount: number;
  importedCount: number;
  errors: string[];
  lastSyncAt: string;
}

const GCAL_BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// Convert date and time to ISO 8601 with Dhaka offset (+06:00)
function toDhakaIsoDateTime(dateStr: string, timeStr?: string | null): string {
  const time = timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? `${timeStr}:00` : '09:00:00';
  return `${dateStr}T${time}+06:00`;
}

/**
 * Creates an event in Google Calendar
 */
export async function createGoogleCalendarEvent(
  event: EventEntity,
  options?: { interactive?: boolean }
): Promise<{ id: string; htmlLink?: string }> {
  let token = await getAccessToken();

  if (!token && options?.interactive) {
    try {
      token = await requestCalendarAccess('select_account');
    } catch (authErr: any) {
      if (authErr?.message === 'POPUP_CLOSED' || authErr?.message === 'ACCESS_DENIED') {
        throw new Error('CALENDAR_AUTH_CANCELLED');
      }
      throw authErr;
    }
  }

  if (!token) {
    throw new Error('GOOGLE_CALENDAR_AUTH_REQUIRED: Please sign in with Google to sync with Calendar.');
  }

  if (!event.eventDate) {
    throw new Error('INVALID_EVENT_DATE: Cannot create Google Calendar event without a valid date.');
  }

  const startIso = toDhakaIsoDateTime(event.eventDate, event.startTime);
  const endIso = event.endTime
    ? toDhakaIsoDateTime(event.eventDate, event.endTime)
    : toDhakaIsoDateTime(event.eventDate, '11:00'); // default 1-2h duration if end not set

  const body = {
    summary: `[JpMC] ${event.title}`,
    description: `${event.description || ''}\n\n📍 ভেন্যু: ${event.venue || 'নির্দিষ্ট করা নেই'}\n🏥 ক্যাটাগরি: ${event.category}\n🏷️ অগ্রাধিকার: ${event.priority}\n\nJpMC Synapse Schedule System (Asia/Dhaka)`,
    location: event.venue || undefined,
    start: {
      dateTime: startIso,
      timeZone: 'Asia/Dhaka',
    },
    end: {
      dateTime: endIso,
      timeZone: 'Asia/Dhaka',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 120 }, // 2 hours
        { method: 'popup', minutes: 30 },  // 30 minutes
      ],
    },
  };

  const res = await fetch(GCAL_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      throw new Error('GOOGLE_CALENDAR_AUTH_REQUIRED');
    }
    throw new Error(errorData.error?.message || `Google Calendar API error: ${res.statusText}`);
  }

  const data = await res.json();
  return { id: data.id, htmlLink: data.htmlLink };
}

/**
 * Updates an existing event in Google Calendar
 */
export async function updateGoogleCalendarEvent(
  calendarEventId: string,
  event: EventEntity
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('GOOGLE_CALENDAR_AUTH_REQUIRED');

  if (!event.eventDate) {
    throw new Error('INVALID_EVENT_DATE: Cannot update Google Calendar event without a valid date.');
  }

  const startIso = toDhakaIsoDateTime(event.eventDate, event.startTime);
  const endIso = event.endTime
    ? toDhakaIsoDateTime(event.eventDate, event.endTime)
    : toDhakaIsoDateTime(event.eventDate, '11:00');

  const body = {
    summary: `[JpMC] ${event.title}`,
    description: `${event.description || ''}\n\n📍 ভেন্যু: ${event.venue || 'নির্দিষ্ট করা নেই'}\n🏥 ক্যাটাগরি: ${event.category}`,
    location: event.venue || undefined,
    start: {
      dateTime: startIso,
      timeZone: 'Asia/Dhaka',
    },
    end: {
      dateTime: endIso,
      timeZone: 'Asia/Dhaka',
    },
  };

  const res = await fetch(`${GCAL_BASE_URL}/${calendarEventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('GOOGLE_CALENDAR_AUTH_REQUIRED');
    }
    throw new Error(`Google Calendar update failed: ${res.statusText}`);
  }
}

/**
 * Deletes an event in Google Calendar
 */
export async function deleteGoogleCalendarEvent(calendarEventId: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;

  try {
    await fetch(`${GCAL_BASE_URL}/${calendarEventId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.warn('[Google Calendar] Delete failed:', err);
  }
}

/**
 * Full Bidirectional Synchronization
 */
export async function syncWithGoogleCalendar(): Promise<CalendarSyncResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('GOOGLE_CALENDAR_AUTH_REQUIRED');
  }

  const errors: string[] = [];
  let exportedCount = 0;
  let importedCount = 0;

  // 1. Export local approved events that haven't been synced to Google Calendar yet
  const localApproved = eventRepository.getApprovedEvents();
  for (const event of localApproved) {
    if (!event.googleCalendarEventId && event.eventDate && event.startTime) {
      try {
        const { id } = await createGoogleCalendarEvent(event);
        eventRepository.updateEvent({
          ...event,
          googleCalendarEventId: id,
          syncStatus: 'synced',
        });
        exportedCount++;
      } catch (err: any) {
        errors.push(`Failed to export "${event.title}": ${err?.message || err}`);
      }
    }
  }

  // 2. Fetch recent events from Google Calendar for medical college schedules
  try {
    const now = new Date();
    const minTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const maxTime = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

    const fetchUrl = `${GCAL_BASE_URL}?timeMin=${encodeURIComponent(minTime)}&timeMax=${encodeURIComponent(maxTime)}&singleEvents=true&orderBy=startTime`;
    const res = await fetch(fetchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const gcalData = await res.json();
      const items = gcalData.items || [];

      for (const item of items) {
        const isJpMC = item.summary?.startsWith('[JpMC]') || (item.description && item.description.includes('JpMC Synapse'));
        const alreadyExists = localApproved.some(
          (e) => e.googleCalendarEventId === item.id || e.title === item.summary?.replace(/^\[JpMC\]\s*/, '')
        );

        // Import only new JpMC items that originated outside this client
        if (isJpMC && !alreadyExists && item.start?.dateTime) {
          const datePart = item.start.dateTime.slice(0, 10);
          const timePart = item.start.dateTime.slice(11, 16);
          const endTimePart = item.end?.dateTime ? item.end.dateTime.slice(11, 16) : null;

          eventRepository.addEvent({
            title: item.summary.replace(/^\[JpMC\]\s*/, ''),
            description: item.description || '',
            eventDate: datePart,
            startTime: timePart,
            endTime: endTimePart,
            venue: item.location || null,
            category: 'অন্যান্য',
            priority: 'normal',
            source: 'Google Calendar',
            googleCalendarEventId: item.id,
            reviewStatus: 'auto_approved',
            syncStatus: 'synced',
            confidence: 1.0,
          });
          importedCount++;
        }
      }
    }
  } catch (err: any) {
    errors.push(`Failed to fetch from Google Calendar: ${err?.message || err}`);
  }

  const lastSyncAt = new Date().toLocaleTimeString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    success: errors.length === 0,
    exportedCount,
    importedCount,
    errors,
    lastSyncAt: `আজ ${lastSyncAt} (Asia/Dhaka)`,
  };
}
