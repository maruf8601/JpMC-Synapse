/**
 * JpMC Synapse — Server-Side Gemini Event Extractor
 * Uses @google/genai SDK with model 'gemini-3.8-flash'
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { GoogleGenAI, Type } from '@google/genai';
import { sanitizeSchedule } from '../utils/dateTimeValidator';

export interface ExtractedEventItem {
  title: string;
  date: string | null;      // YYYY-MM-DD or null
  startTime: string | null; // HH:mm (24-hour) or null
  endTime: string | null;   // HH:mm (24-hour) or null
  venue: string | null;     // Venue name or null
  description: string;
  category: string;
  priority: 'normal' | 'important' | 'urgent';
  confidence: number;       // 0.0 to 1.0
  ambiguities: string[];
}

export interface GeminiExtractionResult {
  isEventRelated: boolean;
  events: ExtractedEventItem[];
  rawText?: string;
  processedAt: string;
}

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function extractEventsWithGemini(params: {
  rawText?: string;
  documentBase64?: string;
  documentMimeType?: string;
  telegramTimestamp?: string;
  timezone?: string;
}): Promise<GeminiExtractionResult> {
  const {
    rawText = '',
    documentBase64,
    documentMimeType = 'application/pdf',
    telegramTimestamp,
    timezone = 'Asia/Dhaka (UTC+6)',
  } = params;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }); // YYYY-MM-DD
  const currentDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Dhaka' });

  const ai = getAIClient();

  const systemInstruction = `You are the executive scheduling intelligence engine for Jamalpur Medical College (JpMC), located in Jamalpur, Bangladesh.
Current reference date in Bangladesh (Asia/Dhaka): ${todayStr} (${currentDayOfWeek}).
Default Timezone: ${timezone}.

Your mission is to read official medical college notices, Telegram channel broadcasts, administrative circulars, clinical announcements, and meeting notices in Bengali, English, or mixed Bengali-English.

CRITICAL ARCHITECTURAL RULES:
1. ABSOLUTELY NO SILENT DEFAULTS:
   - If time is not explicitly stated in the text, 'startTime' MUST be null.
   - If venue/location is not stated in the text, 'venue' MUST be null.
   - If date cannot be determined with high certainty, 'date' MUST be null.
   - NEVER fabricate or guess dates, times, or venues.
   - For every missing or uncertain piece of information, add a clear explanatory entry in the 'ambiguities' array (in Bengali or English), e.g., "কর্মসূচির সময় উল্লেখ নেই (Start time not specified)", "নির্দিষ্ট ভেন্যু বা কক্ষ নম্বর অনুপস্থিত (Venue not specified)".

2. MULTIPLE EVENTS HANDLING:
   - A single circular or message may contain ZERO, ONE, or MULTIPLE distinct meetings or schedules.
   - If multiple events are scheduled (e.g. Phase 2 viva on Sunday, Phase 3 viva on Tuesday), extract each as an independent item in the 'events' array.
   - If the message is purely conversational or unrelated to schedules, set isEventRelated = false and events = [].

3. MEDICAL COLLEGE VOCABULARY & ENTITIES:
   - Recognize terms: বিভাগীয় প্রধান (HOD), ফেজ (Phase 1, 2, 3, 4), টার্ম (Term), আইটেম (Item), কার্ড (Card), ভাইভা (Viva), অসপি (OSCE), ওটি কমপ্লেক্স (OT Complex), সিএমই (CME), ইন্টার্ন ডাক্তার (Intern Doctor), একাডেমিক কাউন্সিল (Academic Council), সংক্রামক ব্যাধি/সংক্রমণ প্রতিরোধ (Infection Control), অধ্যক্ষের কার্যালয় (Principal Office), সম্মেলন কক্ষ (Conference Room), লেকচার গ্যালারি ১/২/৩ (Lecture Gallery 1/2/3), টিচার্স লাউঞ্জ (Teachers Lounge).

4. CATEGORIES:
   - Must be one of: 'সভা', 'একাডেমিক', 'পরীক্ষা', 'সেমিনার', 'ওয়ার্কশপ', 'প্রশিক্ষণ', 'প্রশাসনিক', 'জাতীয় দিবস', 'ক্রয়/টেন্ডার', 'ছাত্র বিষয়ক', 'ব্যক্তিগত', 'অন্যান্য'.

5. PRIORITY:
   - 'urgent' if marked জরুরি, জরুরী, urgent, emergency, অবিলম্বে.
   - 'important' if marked বিশেষ, গুরুত্বপূর্ণ, important.
   - 'normal' otherwise.

6. DATE FORMAT:
   - 'date' must be 'YYYY-MM-DD' if known, or null.
   - 'startTime' and 'endTime' must be 24-hour 'HH:mm' if known, or null. Convert Bengali numerals (০-৯) to standard numbers.`;

  const contents: any[] = [];

  // Add document if attached (image or PDF)
  if (documentBase64) {
    contents.push({
      inlineData: {
        data: documentBase64,
        mimeType: documentMimeType,
      },
    });
  }

  // Add text prompt
  let promptText = `Please parse the following notice text and extract all events.\n`;
  if (telegramTimestamp) {
    promptText += `Notice Timestamp: ${telegramTimestamp}\n`;
  }
  if (rawText) {
    promptText += `Notice Content:\n"""\n${rawText}\n"""\n`;
  } else if (!documentBase64) {
    promptText += `No notice content provided.\n`;
  }

  contents.push({ text: promptText });

  let response: any = null;
  let lastError: any = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isEventRelated: {
                type: Type.BOOLEAN,
                description: 'True if notice announces one or more meetings, exams, or events',
              },
              events: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Concise official title of the event',
                    },
                    date: {
                      type: Type.STRING,
                      description: 'YYYY-MM-DD format, or null if missing',
                    },
                    startTime: {
                      type: Type.STRING,
                      description: 'HH:mm 24-hour format, or null if missing',
                    },
                    endTime: {
                      type: Type.STRING,
                      description: 'HH:mm 24-hour format, or null if missing',
                    },
                    venue: {
                      type: Type.STRING,
                      description: 'Exact venue or room name, or null if missing',
                    },
                    description: {
                      type: Type.STRING,
                      description: 'Full description and context of the meeting',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'Category name (e.g. সভা, একাডেমিক, পরীক্ষা, সেমিনার)',
                    },
                    priority: {
                      type: Type.STRING,
                      enum: ['normal', 'important', 'urgent'],
                    },
                    confidence: {
                      type: Type.NUMBER,
                      description: 'Confidence score from 0.0 to 1.0',
                    },
                    ambiguities: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'List of ambiguities or missing fields that need review',
                    },
                  },
                  required: [
                    'title',
                    'description',
                    'category',
                    'priority',
                    'confidence',
                    'ambiguities',
                  ],
                },
              },
            },
            required: ['isEventRelated', 'events'],
          },
        },
      });
      break;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Gemini Extractor] Attempt ${attempt} failed: ${err?.message}`);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  if (!response) {
    throw lastError || new Error('Gemini extraction failed after 3 attempts.');
  }

  const responseText = response.text || '{}';
  const parsed = JSON.parse(responseText);

  // Normalize nulls & safety
  const events: ExtractedEventItem[] = (parsed.events || []).map((ev: any) => {
    const scheduleCheck = sanitizeSchedule(ev.date, ev.startTime, ev.endTime);
    const existingAmbiguities = Array.isArray(ev.ambiguities) ? ev.ambiguities : [];
    const combinedAmbiguities = [...existingAmbiguities, ...scheduleCheck.ambiguities];

    let confidence = 0;
    if (typeof ev.confidence === 'number' && !isNaN(ev.confidence) && ev.confidence >= 0 && ev.confidence <= 1) {
      confidence = Math.round(ev.confidence * 100) / 100;
    } else {
      combinedAmbiguities.push('AI confidence score পাওয়া যায়নি।');
    }

    const rawTitle = typeof ev.title === 'string' ? ev.title.trim() : '';
    const hasMeaningfulTitle = rawTitle.length > 0 && !/^[\s-_.,]*$/.test(rawTitle);
    if (!hasMeaningfulTitle) {
      combinedAmbiguities.push('ইভেন্টের শিরোনাম নির্ধারণ প্রয়োজন।');
    }

    const rawVenue = typeof ev.venue === 'string' ? ev.venue.trim() : '';
    const venue = rawVenue.length > 0 ? rawVenue : null;

    const rawCategory = typeof ev.category === 'string' ? ev.category.trim() : '';
    // If category is not provided or unknown, default to 'অন্যান্য' (never default to 'সভা' unless source indicated)
    const category = rawCategory.length > 0 ? rawCategory : 'অন্যান্য';

    return {
      title: hasMeaningfulTitle ? rawTitle : 'শিরোনাম নির্ধারণ প্রয়োজন',
      date: scheduleCheck.date,
      startTime: scheduleCheck.startTime,
      endTime: scheduleCheck.endTime,
      venue,
      description: ev.description || rawText,
      category,
      priority: ['normal', 'important', 'urgent'].includes(ev.priority) ? ev.priority : 'normal',
      confidence,
      ambiguities: combinedAmbiguities,
    };
  });

  return {
    isEventRelated: Boolean(parsed.isEventRelated),
    events,
    rawText,
    processedAt: new Date().toISOString(),
  };
}
