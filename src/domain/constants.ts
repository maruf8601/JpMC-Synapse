/**
 * JpMC Synapse — Constants & Bangladesh (Asia/Dhaka) Locale Utilities
 */

import { Category } from './models';

export const CATEGORIES: Category[] = [
  'সভা',
  'একাডেমিক',
  'পরীক্ষা',
  'সেমিনার',
  'ওয়ার্কশপ',
  'প্রশিক্ষণ',
  'প্রশাসনিক',
  'জাতীয় দিবস',
  'ক্রয়/টেন্ডার',
  'ছাত্র বিষয়ক',
  'ব্যক্তিগত',
  'অন্যান্য'
];

export const CATEGORY_COLORS: Record<Category, { bg: string; text: string; border: string }> = {
  'সভা': { bg: 'bg-emerald-50 text-emerald-800', text: 'text-emerald-700', border: 'border-emerald-200' },
  'একাডেমিক': { bg: 'bg-teal-50 text-teal-800', text: 'text-teal-700', border: 'border-teal-200' },
  'পরীক্ষা': { bg: 'bg-amber-50 text-amber-800', text: 'text-amber-700', border: 'border-amber-200' },
  'সেমিনার': { bg: 'bg-sky-50 text-sky-800', text: 'text-sky-700', border: 'border-sky-200' },
  'ওয়ার্কশপ': { bg: 'bg-indigo-50 text-indigo-800', text: 'text-indigo-700', border: 'border-indigo-200' },
  'প্রশিক্ষণ': { bg: 'bg-cyan-50 text-cyan-800', text: 'text-cyan-700', border: 'border-cyan-200' },
  'প্রশাসনিক': { bg: 'bg-slate-100 text-slate-800', text: 'text-slate-700', border: 'border-slate-200' },
  'জাতীয় দিবস': { bg: 'bg-rose-50 text-rose-800', text: 'text-rose-700', border: 'border-rose-200' },
  'ক্রয়/টেন্ডার': { bg: 'bg-orange-50 text-orange-800', text: 'text-orange-700', border: 'border-orange-200' },
  'ছাত্র বিষয়ক': { bg: 'bg-violet-50 text-violet-800', text: 'text-violet-700', border: 'border-violet-200' },
  'ব্যক্তিগত': { bg: 'bg-zinc-100 text-zinc-800', text: 'text-zinc-700', border: 'border-zinc-200' },
  'অন্যান্য': { bg: 'bg-gray-100 text-gray-800', text: 'text-gray-700', border: 'border-gray-200' },
};

export const BENGALI_NUMERALS: Record<string, string> = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
};

export function toBengaliNumber(num: number | string): string {
  return String(num).replace(/[0-9]/g, (digit) => BENGALI_NUMERALS[digit] || digit);
}

export const BENGALI_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

export const BENGALI_WEEKDAYS = [
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
  'শনিবার',
];

/**
 * Returns current date in Asia/Dhaka timezone
 */
export function getDhakaNow(): Date {
  const now = new Date();
  // Format to Dhaka timezone UTC+6
  const dhakaString = now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
  return new Date(dhakaString);
}

/**
 * Returns current date string in Asia/Dhaka timezone (YYYY-MM-DD)
 */
export function getDhakaDateString(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
}

/**
 * Returns current time string in Asia/Dhaka timezone (HH:mm, 24-hour)
 */
export function getDhakaTimeString(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/**
 * Accurately determines if an event has already ended / is in the past in Asia/Dhaka (+06:00)
 */
export function isEventInPast(
  eventDate?: string | null,
  endTime?: string | null,
  startTime?: string | null
): boolean {
  if (!eventDate) return false;
  const todayDhaka = getDhakaDateString();
  if (eventDate < todayDhaka) return true;
  if (eventDate > todayDhaka) return false;

  // On the same day: if endTime or startTime has passed, treat as completed/historical
  const timeToCheck =
    endTime && endTime.trim() ? endTime.trim() : startTime && startTime.trim() ? startTime.trim() : null;
  if (!timeToCheck) return false;

  const nowDhakaTime = getDhakaTimeString();
  return timeToCheck < nowDhakaTime;
}

/**
 * Formats a Date or YYYY-MM-DD string into Bengali e.g. "বৃহস্পতিবার, ১৭ সেপ্টেম্বর ২০২৬"
 */
export function formatBengaliDate(dateInput?: Date | string | null): string {
  if (!dateInput) return 'তারিখ উল্লেখ নেই';
  let date: Date;
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
      return 'তারিখ উল্লেখ নেই';
    }
    date = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    date = dateInput;
  }

  if (isNaN(date.getTime())) {
    return 'তারিখ উল্লেখ নেই';
  }

  const weekday = BENGALI_WEEKDAYS[date.getDay()];
  const day = toBengaliNumber(date.getDate());
  const month = BENGALI_MONTHS[date.getMonth()];
  const year = toBengaliNumber(date.getFullYear());

  return `${weekday}, ${day} ${month} ${year}`;
}

/**
 * Formats 24h time "09:30" or "14:30" into readable 12h Bengali string e.g. "সকাল ০৯:৩০" / "বিকাল ০২:৩০"
 */
export function formatBengaliTime(timeStr?: string | null): string {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return 'সময় উল্লেখ নেই';
  }
  const [hourStr, minuteStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr || '0', 10);

  if (isNaN(hour) || isNaN(minute)) {
    return 'সময় উল্লেখ নেই';
  }

  let period = 'সকাল';
  let displayHour = hour;

  if (hour === 0) {
    period = 'রাত';
    displayHour = 12;
  } else if (hour < 6) {
    period = 'ভোর';
  } else if (hour < 12) {
    period = 'সকাল';
  } else if (hour === 12) {
    period = 'দুপুর';
  } else if (hour < 16) {
    period = 'দুপুর';
    displayHour = hour - 12;
  } else if (hour < 18) {
    period = 'বিকাল';
    displayHour = hour - 12;
  } else if (hour < 20) {
    period = 'সন্ধ্যা';
    displayHour = hour - 12;
  } else {
    period = 'রাত';
    displayHour = hour - 12;
  }

  const formattedHour = String(displayHour).padStart(2, '0');
  const formattedMin = String(minute).padStart(2, '0');

  return `${period} ${toBengaliNumber(formattedHour)}:${toBengaliNumber(formattedMin)}`;
}

/**
 * Calculates remaining time until next event e.g. "১ ঘণ্টা ২৫ মিনিট পর"
 */
export function calculateTimeUntil(
  eventDate?: string | null,
  startTime?: string | null
): { text: string; isPast: boolean; minutesDiff: number } {
  if (!eventDate || !startTime) {
    return { text: 'সময় নির্ধারিত হয়নি', isPast: false, minutesDiff: 999999 };
  }
  const [year, month, day] = eventDate.split('-').map(Number);
  const [hours, minutes] = startTime.split(':').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return { text: 'সময় নির্ধারিত হয়নি', isPast: false, minutesDiff: 999999 };
  }
  const eventTime = new Date(year, month - 1, day, hours, minutes);
  const now = getDhakaNow();

  const diffMs = eventTime.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes < 0) {
    const absMin = Math.abs(diffMinutes);
    if (absMin < 60) {
      return { text: `${toBengaliNumber(absMin)} মিনিট পূর্বে শুরু হয়েছে`, isPast: true, minutesDiff: diffMinutes };
    }
    const hoursPast = Math.floor(absMin / 60);
    return { text: `${toBengaliNumber(hoursPast)} ঘণ্টা পূর্বে শুরু হয়েছে`, isPast: true, minutesDiff: diffMinutes };
  }

  if (diffMinutes === 0) {
    return { text: 'এখন চলছে', isPast: false, minutesDiff: 0 };
  }

  if (diffMinutes < 60) {
    return { text: `${toBengaliNumber(diffMinutes)} মিনিট পর`, isPast: false, minutesDiff: diffMinutes };
  }

  const hoursRem = Math.floor(diffMinutes / 60);
  const minsRem = diffMinutes % 60;

  if (minsRem === 0) {
    return { text: `${toBengaliNumber(hoursRem)} ঘণ্টা পর`, isPast: false, minutesDiff: diffMinutes };
  }

  return { text: `${toBengaliNumber(hoursRem)} ঘণ্টা ${toBengaliNumber(minsRem)} মিনিট পর`, isPast: false, minutesDiff: diffMinutes };
}
