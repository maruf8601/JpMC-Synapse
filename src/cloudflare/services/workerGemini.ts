/**
 * JpMC Synapse — Cloudflare Worker Gemini Extractor
 * Uses @google/genai SDK with model 'gemini-2.5-flash'
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import { GoogleGenAI, Type } from '@google/genai';
import { Env } from '../types';

export interface ExtractedEventItem {
  title: string;
  eventType?: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  organizer?: string | null;
  committee?: string | null;
  participants?: string | null;
  agenda?: string | null;
  instructions?: string | null;
  sourceFileName?: string | null;
  description: string;
  category: string;
  priority: 'normal' | 'important' | 'urgent';
  confidence: number;
  ambiguities: string[];
}

export interface GeminiExtractionResult {
  isEventRelated: boolean;
  events: ExtractedEventItem[];
  rawText?: string;
  processedAt: string;
}

/**
 * Heuristic fallback parser when AI API key is missing or model is temporarily unavailable
 */
function extractWithHeuristics(params: {
  rawText?: string;
  sourceFileName?: string;
  referenceDateStr: string;
}): GeminiExtractionResult {
  const { rawText = '', sourceFileName, referenceDateStr } = params;
  const text = rawText.trim();
  const lower = text.toLowerCase();

  const bnToEnDigits = (s: string) =>
    s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));

  const normalizedText = bnToEnDigits(text);

  const isCandidate =
    /সভা|মিটিং|মিটিঙে|ইন্ডাকশন|শপথ|কাউন্সিল|সেমিনার|কর্মশালা|ওয়ার্কশপ|পরীক্ষা|রুটিন|টার্ম|কার্ড|আইটেম|অডিটোরিয়াম|কনফারেন্স|জরুরি নোটিশ|স্মারক/i.test(text) ||
    /meeting|induction|council|seminar|workshop|exam|schedule|routine|notice|order|circular/i.test(lower);

  const events: ExtractedEventItem[] = [];

  if (isCandidate || text.length > 10) {
    let extractedDate: string | null = null;
    const dateMatch =
      normalizedText.match(/\b(202[4-9])-([01]?\d)-([0-3]?\d)\b/) ||
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

    let extractedStartTime: string | null = null;
    const timeMatch =
      normalizedText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm|AM|PM)?\b/) ||
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

    let extractedVenue: string | null = null;
    if (text.includes('কনফারেন্স রুম') || lower.includes('conference room')) {
      extractedVenue = 'কনফারেন্স রুম, জেপিএমসি';
    } else if (text.includes('অধ্যক্ষ') && text.includes('সভাকক্ষ')) {
      extractedVenue = 'অধ্যক্ষ মহোদয়ের সভাকক্ষ, জেপিএমসি';
    } else if (text.includes('অডিটোরিয়াম') || lower.includes('auditorium')) {
      extractedVenue = 'অডিটোরিয়াম, জামালপুর মেডিকেল কলেজ';
    } else if (text.includes('একাডেমিক ভবন')) {
      extractedVenue = 'একাডেমিক ভবন, জেপিএমসি';
    }

    const firstLine = text.split('\n').filter((l) => l.trim().length > 0)[0] || '';
    const title =
      firstLine.length > 5 && firstLine.length < 80
        ? firstLine.replace(/^[#*-]\s*/, '').trim()
        : (sourceFileName ? `${sourceFileName} — নোটিশ শিডিউল` : 'জেপিএমসি অফিশিয়াল নোটিশ শিডিউল');

    const ambiguities: string[] = [];
    if (!extractedDate) ambiguities.push('তারিখ স্পষ্টভাবে উল্লেখিত নেই');
    if (!extractedStartTime) ambiguities.push('শুরুর সময় উল্লেখ নেই');
    if (!extractedVenue) ambiguities.push('নির্দিষ্ট ভেন্যু উল্লেখ নেই');

    events.push({
      title,
      eventType: 'official_notice',
      date: extractedDate,
      startTime: extractedStartTime,
      endTime: null,
      venue: extractedVenue,
      organizer: 'জামালপুর মেডিকেল কলেজ (জেপিএমসি)',
      description: text || (sourceFileName ? `সংযুক্ত ফাইল: ${sourceFileName}` : 'অফিশিয়াল নোটিশ'),
      category: 'সভা',
      priority: text.includes('জরুরি') || lower.includes('urgent') ? 'urgent' : 'important',
      confidence: 0.7,
      ambiguities,
    });
  }

  return {
    isEventRelated: events.length > 0,
    events,
    rawText: text,
    processedAt: new Date().toISOString(),
  };
}

export async function extractEventsInWorker(
  env: Env,
  params: {
    rawText?: string;
    documentBase64?: string;
    documentMimeType?: string;
    sourceFileName?: string;
    telegramTimestamp?: string;
    timezone?: string;
  }
): Promise<GeminiExtractionResult> {
  const {
    rawText = '',
    documentBase64,
    documentMimeType = 'application/pdf',
    sourceFileName,
    timezone = 'Asia/Dhaka (UTC+6)',
  } = params;

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' });
  const currentDayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Dhaka' });

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[WorkerGemini] GEMINI_API_KEY not configured, falling back to heuristics.');
    return extractWithHeuristics({ rawText, sourceFileName, referenceDateStr: todayStr });
  }

  const systemInstruction = `You are the executive scheduling intelligence engine for Jamalpur Medical College (JpMC), located in Jamalpur, Bangladesh.
Current reference date in Bangladesh (Asia/Dhaka): ${todayStr} (${currentDayOfWeek}).
Default Timezone: ${timezone}.

Your mission is to read official medical college notices, Telegram channel broadcasts, administrative circulars, clinical announcements, committee office orders, and meeting notices in Bengali, English, or mixed Bengali-English.

CRITICAL RULES:
1. When documents/images are attached, perform full visual OCR. Inspect memo numbers, header lines, and date stamps.
2. Synthesize captions and attachments jointly.
3. NEVER fabricate dates, times, or venues. If missing, set to null and record in ambiguities.
4. Extract all discrete events in the 'events' array.
5. Strict output schema adherence.`;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'jpmc-synapse-worker' },
      },
    });

    const parts: any[] = [];
    if (documentBase64) {
      parts.push({
        inlineData: {
          data: documentBase64,
          mimeType: documentMimeType,
        },
      });
    }

    let textPrompt = `Reference Current Date: ${todayStr} (${currentDayOfWeek})\n`;
    if (sourceFileName) textPrompt += `Source File: ${sourceFileName}\n`;
    if (rawText.trim()) textPrompt += `Content/Caption:\n${rawText.trim()}\n`;
    textPrompt += `\nPlease parse and extract all institutional events for Jamalpur Medical College. Return valid JSON adhering to the schema.`;

    parts.push({ text: textPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: parts,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isEventRelated: { type: Type.BOOLEAN },
            events: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  eventType: { type: Type.STRING, nullable: true },
                  date: { type: Type.STRING, nullable: true },
                  startTime: { type: Type.STRING, nullable: true },
                  endTime: { type: Type.STRING, nullable: true },
                  venue: { type: Type.STRING, nullable: true },
                  organizer: { type: Type.STRING, nullable: true },
                  committee: { type: Type.STRING, nullable: true },
                  participants: { type: Type.STRING, nullable: true },
                  agenda: { type: Type.STRING, nullable: true },
                  instructions: { type: Type.STRING, nullable: true },
                  description: { type: Type.STRING },
                  category: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ['normal', 'important', 'urgent'] },
                  confidence: { type: Type.NUMBER },
                  ambiguities: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['title', 'description', 'category', 'priority', 'confidence', 'ambiguities'],
              },
            },
          },
          required: ['isEventRelated', 'events'],
        },
      },
    });

    const outputText = response.text?.trim() || '{}';
    const parsed = JSON.parse(outputText);

    return {
      isEventRelated: Boolean(parsed.isEventRelated),
      events: Array.isArray(parsed.events) ? parsed.events : [],
      rawText,
      processedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.warn('[WorkerGemini] Gemini extraction failed, falling back to heuristics:', err?.message || err);
    return extractWithHeuristics({ rawText, sourceFileName, referenceDateStr: todayStr });
  }
}
