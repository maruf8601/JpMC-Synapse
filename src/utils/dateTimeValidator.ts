/**
 * JpMC Synapse — Strict Date & Time Validation
 * Validates 24-hour time (00:00 through 23:59) and Gregorian calendar dates (rejects impossible dates like 2026-02-31).
 * Timezone: Asia/Dhaka (UTC+6)
 */

export function isValid24HourTime(timeStr?: string | null): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const trimmed = timeStr.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  return Boolean(match);
}

export function isValidIsoDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  if (m < 1 || m > 12 || d < 1 || d > 31) return false;

  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export interface SanitizedEventSchedule {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  ambiguities: string[];
  hasInvalidSchedule: boolean;
}

export function sanitizeSchedule(rawDate?: string | null, rawStartTime?: string | null, rawEndTime?: string | null): SanitizedEventSchedule {
  const ambiguities: string[] = [];
  let date: string | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  let hasInvalidSchedule = false;

  // 1. Date validation
  if (rawDate) {
    if (isValidIsoDate(rawDate)) {
      date = rawDate.trim();
    } else {
      ambiguities.push(`অবৈধ তারিখ (${rawDate}) পাওয়া গেছে। YYYY-MM-DD ফরম্যাটে সঠিক বাস্তব ক্যালেন্ডার তারিখ প্রয়োজন।`);
      hasInvalidSchedule = true;
    }
  } else {
    ambiguities.push('কর্মসূচির তারিখ উল্লেখ নেই (Event date is missing)');
  }

  // 2. Start Time validation
  if (rawStartTime) {
    if (isValid24HourTime(rawStartTime)) {
      startTime = rawStartTime.trim();
    } else {
      ambiguities.push(`অবৈধ শুরুর সময় (${rawStartTime}) পাওয়া গেছে। 00:00 থেকে 23:59 এর মধ্যে সঠিক সময় প্রয়োজন।`);
      hasInvalidSchedule = true;
    }
  } else {
    ambiguities.push('কর্মসূচি শুরুর সময় উল্লেখ নেই (Start time is missing)');
  }

  // 3. End Time validation (optional)
  if (rawEndTime) {
    if (isValid24HourTime(rawEndTime)) {
      endTime = rawEndTime.trim();
    } else {
      ambiguities.push(`অবৈধ সমাপ্তির সময় (${rawEndTime}) পাওয়া গেছে।`);
      hasInvalidSchedule = true;
    }
  }

  return {
    date,
    startTime,
    endTime,
    ambiguities,
    hasInvalidSchedule,
  };
}

export * from './dateSafe';
