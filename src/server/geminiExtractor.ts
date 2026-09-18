/**
 * JpMC Synapse — Server-Side Gemini Event Extractor
 * Uses @google/genai SDK with model 'gemini-3.8-flash'
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { GoogleGenAI, Type } from '@google/genai';
import { sanitizeSchedule } from '../utils/dateTimeValidator';

export interface ExtractedEventItem {
  title: string;
  eventType?: string | null;
  date: string | null;      // YYYY-MM-DD or null
  startTime: string | null; // HH:mm (24-hour) or null
  endTime: string | null;   // HH:mm (24-hour) or null
  venue: string | null;     // Venue name or null
  organizer?: string | null;
  committee?: string | null;
  participants?: string | null;
  agenda?: string | null;
  instructions?: string | null;
  sourceFileName?: string | null;
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
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

function isHighDemandOrRateLimitError(err: any): boolean {
  if (!err) return false;
  const status = err?.status || err?.code || err?.error?.code || err?.error?.status;
  if (status === 503 || status === 429 || status === 'UNAVAILABLE' || status === 'RESOURCE_EXHAUSTED') {
    return true;
  }
  const str = (err?.message || '') + ' ' + (typeof err === 'object' ? JSON.stringify(err) : String(err));
  return /503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED/i.test(str);
}

/**
 * Smart heuristic regex parser for notices when AI models are temporarily at peak capacity
 */
function extractEventsWithHeuristics(params: {
  rawText?: string;
  sourceFileName?: string;
  telegramTimestamp?: string;
  referenceDateStr: string;
}): GeminiExtractionResult {
  const { rawText = '', sourceFileName, referenceDateStr } = params;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // Convert Bengali numerals to Western digits
  const bnToEnDigits = (s: string) =>
    s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));

  const normalizedText = bnToEnDigits(text);

  // Check if text looks like an official schedule or notice
  const isCandidate =
    /সভা|মিটিং|মিটিঙে|ইন্ডাকশন|শপথ|কাউন্সিল|সেমিনার|কর্মশালা|ওয়ার্কশপ|পরীক্ষা|রুটিন|টার্ম|কার্ড|আইটেম|অডিটোরিয়াম|কনফারেন্স|জরুরি নোটিশ|স্মারক/i.test(text) ||
    /meeting|induction|council|seminar|workshop|exam|schedule|routine|notice|order|circular/i.test(lower);

  const events: ExtractedEventItem[] = [];

  if (isCandidate || text.length > 10) {
    // 1. Detect Date
    let extractedDate: string | null = null;
    const dateMatch = normalizedText.match(/\b(202[4-9])-([01]?\d)-([0-3]?\d)\b/) ||
      normalizedText.match(/\b([0-3]?\d)[\/\-\.]([01]?\d)[\/\-\.](202[4-9])\b/);

    if (dateMatch) {
      if (dateMatch[3] && dateMatch[3].length === 4) {
        const dd = dateMatch[1].padStart(2, '0');
        const mm = dateMatch[2].padStart(2, '0');
        const yyyy = dateMatch[3];
        extractedDate = `${yyyy}-${mm}-${dd}`;
      } else {
        const yyyy = dateMatch[1];
        const mm = dateMatch[2].padStart(2, '0');
        const dd = dateMatch[3].padStart(2, '0');
        extractedDate = `${yyyy}-${mm}-${dd}`;
      }
    } else if (text.includes('আজ') || lower.includes('today')) {
      extractedDate = referenceDateStr;
    } else if (text.includes('আগামীকাল') || lower.includes('tomorrow')) {
      const tm = new Date();
      tm.setDate(tm.getDate() + 1);
      extractedDate = tm.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
    }

    // 2. Detect Time
    let extractedStartTime: string | null = null;
    const timeMatch = normalizedText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm|AM|PM)?\b/) ||
      normalizedText.match(/(?:সকাল|বেলা|দুপুর|বিকাল|সন্ধ্যা|রাত)\s*([01]?\d)(?::([0-5]\d))?\s*টা/);

    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? timeMatch[2].padStart(2, '0') : '00';
      const meridiem = (timeMatch[3] || '').toUpperCase();

      if (meridiem === 'PM' && hours < 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      if (/দুপুর|বিকাল|সন্ধ্যা|রাত/.test(text) && hours < 12 && hours >= 1) hours += 12;

      extractedStartTime = `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    // 3. Detect Venue
    let extractedVenue: string | null = null;
    if (text.includes('কনফারেন্স রুম') || lower.includes('conference room')) {
      extractedVenue = 'কনফারেন্স রুম, জেপিএমসি';
    } else if (text.includes('অধ্যক্ষ') && text.includes('কক্ষ')) {
      extractedVenue = 'অধ্যক্ষ মহোদয়ের সভাকক্ষ, জেপিএমসি';
    } else if (text.includes('অডিটোরিয়াম') || lower.includes('auditorium')) {
      extractedVenue = 'অডিটোরিয়াম, জামালপুর মেডিকেল কলেজ';
    } else if (text.includes('একাডেমিক ভবন')) {
      extractedVenue = 'একাডেমিক ভবন, জেপিএমসি';
    } else if (text.includes('সভাকক্ষ')) {
      extractedVenue = 'সভাকক্ষ, জামালপুর মেডিকেল কলেজ';
    }

    // 4. Title & Category
    let category = 'সভা';
    let eventType = 'committee_meeting';
    if (/ইন্ডাকশন|বরণ|ওরিয়েন্টেশন/i.test(text)) {
      category = 'ইন্ডাকশন';
      eventType = 'induction_program';
    } else if (/পরীক্ষা|টার্ম|কার্ড|আইটেম|ভিসা/i.test(text)) {
      category = 'পরীক্ষা';
      eventType = 'examination';
    } else if (/সেমিনার|কর্মশালা|ওয়ার্কশপ/i.test(text)) {
      category = 'সেমিনার';
      eventType = 'workshop';
    } else if (/কাউন্সিল|একাডেমিক/i.test(text)) {
      category = 'একাডেমিক';
      eventType = 'council';
    }

    const firstLine = text.split('\n').filter((l) => l.trim().length > 0)[0] || '';
    const title = firstLine.length > 5 && firstLine.length < 80
      ? firstLine.replace(/^[#*-]\s*/, '').trim()
      : (sourceFileName ? `${sourceFileName} — নোটিশ শিডিউল` : 'জেপিএমসি অফিশিয়াল নোটিশ শিডিউল');

    const scheduleCheck = sanitizeSchedule(extractedDate, extractedStartTime, null);

    events.push({
      title,
      eventType,
      date: scheduleCheck.date,
      startTime: scheduleCheck.startTime,
      endTime: scheduleCheck.endTime,
      venue: extractedVenue,
      organizer: 'জামালপুর মেডিকেল কলেজ (জেপিএমসি)',
      committee: null,
      participants: null,
      agenda: null,
      instructions: null,
      sourceFileName: sourceFileName || null,
      description: text || (sourceFileName ? `সংযুক্ত ফাইল: ${sourceFileName}` : 'অফিশিয়াল নোটিশ'),
      category,
      priority: text.includes('জরুরি') || lower.includes('urgent') ? 'urgent' : 'important',
      confidence: 0.65,
      ambiguities: [
        'গুগল জেমিনি এআই সাময়িকভাবে অধিক চাহিদাসম্পন্ন (503 High Demand)। স্মার্ট হিউরিস্টিক পার্সার দ্বারা খসড়া তৈরি হয়েছে। অনুগ্রহ করে তথ্য যাচাই করুন অথবা পরে "AI Reprocess" বোতাম চাপুন।',
        ...scheduleCheck.ambiguities,
      ],
    });
  }

  return {
    isEventRelated: events.length > 0,
    events,
    rawText: text,
    processedAt: new Date().toISOString(),
  };
}

export async function extractEventsWithGemini(params: {
  rawText?: string;
  documentBase64?: string;
  documentMimeType?: string;
  sourceFileName?: string;
  telegramTimestamp?: string;
  timezone?: string;
}): Promise<GeminiExtractionResult> {
  const {
    rawText = '',
    documentBase64,
    documentMimeType = 'application/pdf',
    sourceFileName,
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

Your mission is to read official medical college notices, Telegram channel broadcasts, administrative circulars, clinical announcements, committee office orders, and meeting notices in Bengali, English, or mixed Bengali-English.

CRITICAL ARCHITECTURAL RULES:
1. MULTIMODAL & SCANNED DOCUMENT UNDERSTANDING:
   - When a document (PDF or Image - JPEG, PNG, WEBP) is attached, carefully inspect the full binary page/image visual content.
   - This includes scanned Bengali text, English text, photos of printed circulars taken with mobile cameras, printed office memo headers, memo numbers (স্মারক নং), signatures, official seals (সীলমোহর), date lines, class routines, department schedules, and committee member rosters.
   - Do NOT rely only on digital text streams; use your visual/multimodal OCR intelligence for photographic notices, rotated documents, and low-light mobile phone photos.

2. COMBINE CAPTIONS AND ATTACHMENTS JOINTLY:
   - Very often on Telegram, an administrator posts an image or PDF of a schedule accompanied by a short caption (e.g., "আগামীকাল থেকে নতুন শিডিউল কার্যকর হবে" or "জরুরি মিটিং নোটিশ").
   - You MUST cross-reference and synthesize information from BOTH the visual attachment and the caption text.
   - For example, relative dates in the caption (such as "আগামীকাল", "পরশু", "আগামী রবিবার") must be resolved using the reference date: ${todayStr}.

3. BROAD MEDICAL COLLEGE SCHEDULE QUALIFICATION:
   - A document does NOT need to literally contain the word "meeting" or "সভা" to qualify as a schedule candidate.
   - Any official program, committee order, intern doctor induction ceremony, oath taking program, orientation, workshop, examination (Term, Card, Item, Viva, OSCE), scientific session, training, academic council, clinical round, or administrative activity that involves an event date/time or scheduled program MUST be classified as an event candidate (isEventRelated = true).

3. ABSOLUTELY NO FABRICATED DEFAULTS:
   - If time is not stated in the text/document, 'startTime' MUST be null.
   - If venue/location is not stated in the document, 'venue' MUST be null.
   - If date cannot be determined with high certainty, 'date' MUST be null.
   - NEVER fabricate or guess dates, times, or venues.
   - For every missing or uncertain piece of information, add a clear explanatory entry in the 'ambiguities' array (in Bengali or English), e.g., "কর্মসূচির সময় উল্লেখ নেই (Start time not specified)", "নির্দিষ্ট ভেন্যু বা কক্ষ নম্বর অনুপস্থিত (Venue not specified)".

4. MULTIPLE EVENTS HANDLING:
   - A single circular or office order may announce ZERO, ONE, or MULTIPLE distinct events (e.g. Committee meeting on 20th, Induction ceremony on 25th).
   - If multiple events are scheduled, extract each as an independent item in the 'events' array.
   - If the document is purely general correspondence or policy with zero scheduled activities or deadlines, set isEventRelated = false and events = [].

5. MEDICAL COLLEGE VOCABULARY & ENTITIES:
   - Recognize terms: ইন্টার্ন ডাক্তার ইন্ডাকশন কমিটি (Intern Doctor Induction Committee), বিভাগীয় প্রধান (HOD), ফেজ (Phase 1, 2, 3, 4), টার্ম (Term), আইটেম (Item), কার্ড (Card), ভাইভা (Viva), অসপি (OSCE), ওটি কমপ্লেক্স (OT Complex), সিএমই (CME), একাডেমিক কাউন্সিল (Academic Council), অধ্যক্ষের কার্যালয় (Principal Office), সম্মেলন কক্ষ (Conference Room), লেকচার গ্যালারি ১/২/৩ (Lecture Gallery 1/2/3), টিচার্স লাউঞ্জ (Teachers Lounge).

6. CATEGORIES:
   - Must be one of: 'সভা', 'একাডেমিক', 'পরীক্ষা', 'সেমিনার', 'ওয়ার্কশপ', 'প্রশিক্ষণ', 'প্রশাসনিক', 'জাতীয় দিবস', 'ক্রয়/টেন্ডার', 'ছাত্র বিষয়ক', 'ব্যক্তিগত', 'অন্যান্য'.

7. PRIORITY:
   - 'urgent' if marked জরুরি, জরুরী, urgent, emergency, অবিলম্বে.
   - 'important' if marked বিশেষ, গুরুত্বপূর্ণ, important.
   - 'normal' otherwise.

8. DATE & TIME FORMAT:
   - 'date' must be 'YYYY-MM-DD' if known, or null.
   - 'startTime' and 'endTime' must be 24-hour 'HH:mm' if known, or null. Convert Bengali numerals (০-৯) to standard numbers.`;

  const contents: any[] = [];

  // Add document if attached (image or PDF)
  if (documentBase64) {
    contents.push({
      inlineData: {
        data: documentBase64,
        mimeType: documentMimeType || 'application/pdf',
      },
    });
  }

  // Add text prompt
  let promptText = `Please parse the attached notice/document and extract all official schedules, programs, and meetings.\n`;
  if (sourceFileName) {
    promptText += `Source Document Filename: ${sourceFileName}\n`;
  }
  if (telegramTimestamp) {
    promptText += `Notice Timestamp: ${telegramTimestamp}\n`;
  }
  if (rawText && !rawText.startsWith('[সংযুক্ত ফাইল:')) {
    promptText += `Accompanying Text/Caption:\n"""\n${rawText}\n"""\n`;
  } else if (!documentBase64) {
    promptText += `Notice Content:\n"""\n${rawText}\n"""\n`;
  }

  contents.push({ text: promptText });

  const modelsToTry = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let response: any = null;
  let lastError: any = null;

  for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
    const modelName = modelsToTry[mIdx];
    const isPrimary = mIdx === 0;
    const maxAttempts = isPrimary ? 1 : 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Gemini Extractor] Invoking model ${modelName} (attempt ${attempt}/${maxAttempts}, hasDoc: ${Boolean(documentBase64)}, mimeType: ${documentMimeType})`);
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isEventRelated: {
                  type: Type.BOOLEAN,
                  description: 'True if notice announces one or more meetings, programs, exams, induction ceremonies, or events',
                },
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: {
                        type: Type.STRING,
                        description: 'Concise official title of the program or event',
                      },
                      eventType: {
                        type: Type.STRING,
                        description: 'Type of event: e.g. committee_meeting, induction_program, workshop, examination, orientation, council, scientific_session, training',
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
                      organizer: {
                        type: Type.STRING,
                        description: 'Organizing department or authority (e.g. অধ্যক্ষের কার্যালয়, ইন্টার্ন ডাক্তার ইন্ডাকশন কমিটি)',
                      },
                      committee: {
                        type: Type.STRING,
                        description: 'Committee name if mentioned in the notice',
                      },
                      participants: {
                        type: Type.STRING,
                        description: 'Expected participants or committee members',
                      },
                      agenda: {
                        type: Type.STRING,
                        description: 'Agenda or purpose of the event',
                      },
                      instructions: {
                        type: Type.STRING,
                        description: 'Specific directions, requirements, or preparations',
                      },
                      description: {
                        type: Type.STRING,
                        description: 'Full description and context of the meeting or program',
                      },
                      category: {
                        type: Type.STRING,
                        description: 'Category name (e.g. সভা, একাডেমিক, পরীক্ষা, সেমিনার, ওয়ার্কশপ, প্রশাসনিক)',
                      },
                      priority: {
                        type: Type.STRING,
                        enum: ['normal', 'important', 'urgent'],
                      },
                      confidence: {
                        type: Type.NUMBER,
                        description: 'Confidence score from 0.0 to 1.0 based on clarity and certainty of the document',
                      },
                      ambiguities: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: 'List of ambiguities or missing fields that need staff review',
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
        const is503OrRateLimit = isHighDemandOrRateLimitError(err);

        if (isPrimary && is503OrRateLimit) {
          console.info(`[Gemini Extractor] Primary model ${modelName} currently at peak capacity (503/UNAVAILABLE). Smoothly failing over to lightweight model 'gemini-3.1-flash-lite'...`);
          break;
        }

        if (attempt < maxAttempts) {
          const delayMs = 1200 + Math.floor(Math.random() * 800);
          console.info(`[Gemini Extractor] Model ${modelName} attempt ${attempt} transient issue; retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          console.info(`[Gemini Extractor] Model ${modelName} attempt limit reached.`);
        }
      }
    }
    if (response) break;
  }

  // If all models encountered peak demand (503) or offline conditions, activate resilient heuristic parser
  if (!response) {
    console.info('[Gemini Extractor] Models currently experiencing high demand. Activating smart offline fallback parser...');
    return extractEventsWithHeuristics({
      rawText,
      sourceFileName,
      telegramTimestamp,
      referenceDateStr: todayStr,
    });
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
      eventType: ev.eventType || null,
      date: scheduleCheck.date,
      startTime: scheduleCheck.startTime,
      endTime: scheduleCheck.endTime,
      venue,
      organizer: ev.organizer || null,
      committee: ev.committee || null,
      participants: ev.participants || null,
      agenda: ev.agenda || null,
      instructions: ev.instructions || null,
      sourceFileName: sourceFileName || ev.sourceFileName || null,
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
