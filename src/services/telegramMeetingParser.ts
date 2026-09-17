/**
 * JpMC Synapse — Real Gemini AI Notice & Schedule Extraction Engine
 * Server-Side Gemini 3.8 Flash Multi-modal Extraction with conflict detection
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { Category, Priority, EventEntity, ReviewStatus } from '../domain/models';
import { TODAY_STR } from '../data/mockEvents';
import { eventRepository } from '../data/eventRepository';

export interface ParsedMeetingResult {
  title: string;
  description: string;
  eventDate: string | null; // YYYY-MM-DD or null
  startTime: string | null; // HH:mm or null
  endTime: string | null;
  venue: string | null;
  category: Category;
  priority: Priority;
  committee?: string;
  participants?: string;
  confidence: number;
  conflicts: EventEntity[];
  extractedFields: {
    dateFound: boolean;
    timeFound: boolean;
    venueFound: boolean;
    priorityDetected: boolean;
  };
  ambiguities: string[];
  summaryBn: string;
  summaryEn: string;
}

export interface MultiEventExtractionResult {
  isEventRelated: boolean;
  events: ParsedMeetingResult[];
  rawText?: string;
  error?: string;
}

// Convert Bengali numerals to English
export function bengaliToEnglishDigits(str: string): string {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return str.replace(/[০-৯]/g, (d) => banglaDigits.indexOf(d).toString());
}

/**
 * Real Server-Side Gemini Extraction for Text and Attachments
 */
export async function parseNoticeWithGemini(
  rawText: string,
  options?: {
    documentBase64?: string;
    documentMimeType?: string;
    telegramTimestamp?: string;
  }
): Promise<MultiEventExtractionResult> {
  try {
    const res = await fetch('/api/extract-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rawText,
        documentBase64: options?.documentBase64,
        documentMimeType: options?.documentMimeType,
        telegramTimestamp: options?.telegramTimestamp,
        timezone: 'Asia/Dhaka (UTC+6)',
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Server extraction failed (${res.status})`);
    }

    const data = await res.json();
    const rawEvents = data.events || [];

    const parsedEvents: ParsedMeetingResult[] = rawEvents.map((item: any) => {
      const dateStr = item.date || null;
      const startTimeStr = item.startTime || null;
      const venueStr = typeof item.venue === 'string' && item.venue.trim() ? item.venue.trim() : null;

      const ambiguities: string[] = Array.isArray(item.ambiguities) ? [...item.ambiguities] : [];

      let confidence = 0;
      if (typeof item.confidence === 'number' && !isNaN(item.confidence) && item.confidence >= 0 && item.confidence <= 1) {
        confidence = item.confidence;
      } else {
        confidence = 0;
        ambiguities.push('AI confidence score পাওয়া যায়নি।');
      }

      const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
      const hasMeaningfulTitle = rawTitle.length > 0 && !/^[\s-_.,]*$/.test(rawTitle);
      if (!hasMeaningfulTitle) {
        ambiguities.push('ইভেন্টের শিরোনাম নির্ধারণ প্রয়োজন।');
      }

      const rawCategory = typeof item.category === 'string' ? item.category.trim() : '';
      const category: Category = (rawCategory && ['সভা', 'একাডেমিক', 'পরীক্ষা', 'সেমিনার', 'ওয়ার্কশপ', 'প্রশিক্ষণ', 'প্রশাসনিক', 'জাতীয় দিবস', 'ক্রয়/টেন্ডার', 'ছাত্র বিষয়ক', 'ব্যক্তিগত', 'অন্যান্য'].includes(rawCategory))
        ? (rawCategory as Category)
        : 'অন্যান্য';

      // Check conflicts against already approved events in local repo
      const conflicts = (dateStr && startTimeStr)
        ? eventRepository.getApprovedEvents().filter(
            (e) => e.eventDate === dateStr && e.startTime === startTimeStr
          )
        : [];

      return {
        title: hasMeaningfulTitle ? rawTitle : 'শিরোনাম নির্ধারণ প্রয়োজন',
        description: item.description || rawText,
        eventDate: dateStr,
        startTime: startTimeStr,
        endTime: item.endTime || null,
        venue: venueStr,
        category,
        priority: (item.priority as Priority) || 'normal',
        confidence,
        conflicts,
        extractedFields: {
          dateFound: Boolean(dateStr),
          timeFound: Boolean(startTimeStr),
          venueFound: Boolean(venueStr),
          priorityDetected: item.priority !== 'normal',
        },
        ambiguities,
        summaryBn: `সূচি: ${hasMeaningfulTitle ? rawTitle : 'শিরোনাম প্রয়োজন'} | তারিখ: ${dateStr || 'অনির্দিষ্ট'} | সময়: ${startTimeStr || 'অনির্দিষ্ট'} | ভেন্যু: ${venueStr || 'অনির্দিষ্ট'}`,
        summaryEn: `Event: ${hasMeaningfulTitle ? rawTitle : 'Title needed'} | Date: ${dateStr || 'Unspecified'} | Time: ${startTimeStr || 'Unspecified'} | Venue: ${venueStr || 'Unspecified'}`,
      };
    });

    return {
      isEventRelated: Boolean(data.isEventRelated),
      events: parsedEvents,
      rawText,
    };
  } catch (error: any) {
    console.warn('[Gemini Parser] Server extraction unavailable, utilizing local fallback:', error?.message);
    // Graceful offline fallback
    const single = parseTelegramMeetingTextLocalFallback(rawText);
    return {
      isEventRelated: true,
      events: [single],
      rawText,
      error: error?.message,
    };
  }
}

/**
 * Local Fallback parser for offline capability
 */
export function parseTelegramMeetingTextLocalFallback(rawInput: string): ParsedMeetingResult {
  const text = rawInput.trim();
  const normalized = bengaliToEnglishDigits(text);

  const today = new Date();
  let targetDate = new Date(today);
  let dateFound = false;

  const lower = normalized.toLowerCase();

  if (/আগামীকাল|কাল\b|tomorrow/i.test(lower)) {
    targetDate.setDate(today.getDate() + 1);
    dateFound = true;
  } else if (/পরশু|আগামী পরশু|day after tomorrow/i.test(lower)) {
    targetDate.setDate(today.getDate() + 2);
    dateFound = true;
  } else if (/আজ\b|today/i.test(lower)) {
    dateFound = true;
  }

  const dateStr = dateFound ? targetDate.toISOString().split('T')[0] : null;

  // Time extraction
  let timeStr: string | null = null;
  const timeMatch = lower.match(/(?:বেলা|দুপুর|সকাল|সন্ধ্যা|বিকাল|রাত)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|মি\.|ঘণ্টা|টায়|টা)?/i);
  if (timeMatch && timeMatch[1]) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (/দুপুর|বিকাল|সন্ধ্যা|রাত|pm/i.test(lower) && hour < 12) {
      hour += 12;
    }
    timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  // Venue extraction
  let venueStr: string | null = null;
  const venues = [
    'সম্মেলন কক্ষ',
    'কনফারেন্স রুম',
    'অধ্যক্ষের কার্যালয়',
    'টিচার্স লাউঞ্জ',
    'লেকচার গ্যালারি ১',
    'লেকচার গ্যালারি ২',
    'প্যাথলজি ল্যাব',
    'লাইব্রেরি হল',
  ];
  for (const v of venues) {
    if (text.includes(v)) {
      venueStr = v;
      break;
    }
  }

  const ambiguities: string[] = [];
  if (!dateStr) ambiguities.push('তারিখ নির্ধারিত করা সম্ভব হয়নি');
  if (!timeStr) ambiguities.push('শুরুর সময় অনুপস্থিত');
  if (!venueStr) ambiguities.push('ভেন্যু নির্দিষ্ট করা নেই');
  ambiguities.push('AI confidence score পাওয়া যায়নি।');

  const rawTitle = text.split('\n')[0].trim().slice(0, 60);
  const hasTitle = rawTitle.length > 0 && !/^[\s-_.,]*$/.test(rawTitle);
  if (!hasTitle) {
    ambiguities.push('ইভেন্টের শিরোনাম নির্ধারণ প্রয়োজন।');
  }

  const isMeeting = /মিটিং|সভা|কনফারেন্স|meeting|council/i.test(lower);
  const category: Category = isMeeting ? 'সভা' : 'অন্যান্য';

  return {
    title: hasTitle ? rawTitle : 'শিরোনাম নির্ধারণ প্রয়োজন',
    description: text,
    eventDate: dateStr,
    startTime: timeStr,
    endTime: null,
    venue: venueStr,
    category,
    priority: /জরুরি|জরুরী|urgent/i.test(lower) ? 'urgent' : 'normal',
    confidence: 0,
    conflicts: [],
    extractedFields: {
      dateFound: Boolean(dateStr),
      timeFound: Boolean(timeStr),
      venueFound: Boolean(venueStr),
      priorityDetected: /জরুরি|জরুরী|urgent/i.test(lower),
    },
    ambiguities,
    summaryBn: `বিজ্ঞপ্তি: ${text.slice(0, 40)}...`,
    summaryEn: `Notice: ${text.slice(0, 40)}...`,
  };
}

// Backward-compatible synchronous export
export function parseTelegramMeetingText(rawInput: string): ParsedMeetingResult {
  return parseTelegramMeetingTextLocalFallback(rawInput);
}
