/**
 * JpMC Synapse — Shared Safe Date & Time Handling Utility
 * Timezone: Asia/Dhaka (UTC+6)
 *
 * Robustly parses and formats dates from:
 * - Firestore Timestamp instance (.toDate())
 * - Serialized Firestore timestamp { seconds, nanoseconds } or { _seconds, _nanoseconds }
 * - Cloudflare Firestore REST format { timestampValue: "..." }
 * - ISO 8601 strings
 * - Epoch milliseconds / seconds numbers
 * - Standard JavaScript Date objects
 * - Legacy date fields (startDate, endDate, publishAt)
 *
 * Guaranteed NEVER to output the literal string "Invalid Date".
 */

export const DATE_UNAVAILABLE_TEXT_BN = 'তারিখ নির্ধারিত নয়';

/**
 * Safely converts any supported date representation into a valid Date object.
 * Returns null if the value is missing, empty, or unparseable.
 */
export function toDateSafe(value: any): Date | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // 1. Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // 2. Firestore Timestamp instance (Firebase Web Client SDK or Firebase Admin SDK)
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }

  // 3. Plain serialized timestamp object
  if (typeof value === 'object') {
    // Standard Firebase Client SDK JSON { seconds: 123456, nanoseconds: 0 }
    // or Firebase Admin SDK JSON { _seconds: 123456, _nanoseconds: 0 }
    const sec =
      typeof value.seconds === 'number'
        ? value.seconds
        : typeof value._seconds === 'number'
        ? value._seconds
        : null;

    if (sec !== null) {
      const nano =
        typeof value.nanoseconds === 'number'
          ? value.nanoseconds
          : typeof value._nanoseconds === 'number'
          ? value._nanoseconds
          : 0;
      const ms = sec * 1000 + Math.floor(nano / 1e6);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    // Cloudflare Firestore REST API format { timestampValue: "2026-09-20T12:00:00Z" }
    if (typeof value.timestampValue === 'string') {
      const d = new Date(value.timestampValue);
      return isNaN(d.getTime()) ? null : d;
    }

    // String wrapped in object
    if (typeof value.stringValue === 'string') {
      const d = new Date(value.stringValue);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // 4. Number (epoch timestamp in seconds or milliseconds)
  if (typeof value === 'number') {
    if (isNaN(value)) return null;
    // Numbers below 1e12 are likely seconds (epoch seconds); >= 1e12 are milliseconds
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  // 5. String
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      !trimmed ||
      trimmed === 'Invalid Date' ||
      trimmed === 'undefined' ||
      trimmed === 'null' ||
      trimmed === 'NaN'
    ) {
      return null;
    }

    // If it's a numeric string (e.g. "1726880000000")
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 1e12 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Formats a date for display in Asia/Dhaka timezone with Bengali date formatting.
 * Guaranteed never to return "Invalid Date".
 * Fallback: "তারিখ নির্ধারিত নয়"
 *
 * Example output: ২১ সেপ্টেম্বর ২০২৬
 */
export function formatDhakaDate(value: any): string {
  const date = toDateSafe(value);
  if (!date) return DATE_UNAVAILABLE_TEXT_BN;

  try {
    const formatted = date.toLocaleDateString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatted && formatted !== 'Invalid Date' ? formatted : DATE_UNAVAILABLE_TEXT_BN;
  } catch {
    return DATE_UNAVAILABLE_TEXT_BN;
  }
}

/**
 * Formats a date and time for display in Asia/Dhaka timezone with Bengali date-time formatting.
 * Guaranteed never to return "Invalid Date".
 * Fallback: "তারিখ নির্ধারিত নয়"
 *
 * Example output: ২১ সেপ্টেম্বর ২০২৬, বিকাল ৪:৩০
 */
export function formatDhakaDateTime(value: any): string {
  const date = toDateSafe(value);
  if (!date) return DATE_UNAVAILABLE_TEXT_BN;

  try {
    const formatted = date.toLocaleString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return formatted && formatted !== 'Invalid Date' ? formatted : DATE_UNAVAILABLE_TEXT_BN;
  } catch {
    return DATE_UNAVAILABLE_TEXT_BN;
  }
}

/**
 * Converts any supported date representation to a safe ISO 8601 string.
 * If invalid or null, returns the fallback ISO string or current time ISO.
 */
export function toIsoSafe(value: any, fallbackIso?: string): string {
  const date = toDateSafe(value);
  if (date) {
    return date.toISOString();
  }
  return fallbackIso || new Date().toISOString();
}

/**
 * Formats a date representation to HTML `<input type="datetime-local" />` format:
 * `YYYY-MM-DDTHH:mm`.
 * Computes based on local date/time so values don't get displaced by UTC conversion.
 */
export function toDateTimeLocalValue(value: any, fallbackDate?: Date): string {
  const date = toDateSafe(value) || (fallbackDate instanceof Date && !isNaN(fallbackDate.getTime()) ? fallbackDate : null);
  if (!date) return '';

  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Helper to extract notice start date from any canonical or legacy field name.
 */
export function extractNoticeStartDate(item: any): Date | null {
  if (!item) return null;
  return (
    toDateSafe(item.startAt) ||
    toDateSafe(item.startDate) ||
    toDateSafe(item.publishAt) ||
    toDateSafe(item.createdAt) ||
    null
  );
}

/**
 * Helper to extract notice expiry date from any canonical or legacy field name.
 */
export function extractNoticeExpiryDate(item: any): Date | null {
  if (!item) return null;
  return toDateSafe(item.expiresAt) || toDateSafe(item.endDate) || null;
}
