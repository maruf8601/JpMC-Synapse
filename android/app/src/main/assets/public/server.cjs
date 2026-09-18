var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");

// src/server/geminiExtractor.ts
var import_genai = require("@google/genai");

// src/utils/dateTimeValidator.ts
function isValid24HourTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return false;
  const trimmed = timeStr.trim();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  return Boolean(match);
}
function isValidIsoDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
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
function sanitizeSchedule(rawDate, rawStartTime, rawEndTime) {
  const ambiguities = [];
  let date = null;
  let startTime = null;
  let endTime = null;
  let hasInvalidSchedule = false;
  if (rawDate) {
    if (isValidIsoDate(rawDate)) {
      date = rawDate.trim();
    } else {
      ambiguities.push(`\u0985\u09AC\u09C8\u09A7 \u09A4\u09BE\u09B0\u09BF\u0996 (${rawDate}) \u09AA\u09BE\u0993\u09DF\u09BE \u0997\u09C7\u099B\u09C7\u0964 YYYY-MM-DD \u09AB\u09B0\u09AE\u09CD\u09AF\u09BE\u099F\u09C7 \u09B8\u09A0\u09BF\u0995 \u09AC\u09BE\u09B8\u09CD\u09A4\u09AC \u0995\u09CD\u09AF\u09BE\u09B2\u09C7\u09A8\u09CD\u09A1\u09BE\u09B0 \u09A4\u09BE\u09B0\u09BF\u0996 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8\u0964`);
      hasInvalidSchedule = true;
    }
  } else {
    ambiguities.push("\u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF\u09B0 \u09A4\u09BE\u09B0\u09BF\u0996 \u0989\u09B2\u09CD\u09B2\u09C7\u0996 \u09A8\u09C7\u0987 (Event date is missing)");
  }
  if (rawStartTime) {
    if (isValid24HourTime(rawStartTime)) {
      startTime = rawStartTime.trim();
    } else {
      ambiguities.push(`\u0985\u09AC\u09C8\u09A7 \u09B6\u09C1\u09B0\u09C1\u09B0 \u09B8\u09AE\u09DF (${rawStartTime}) \u09AA\u09BE\u0993\u09DF\u09BE \u0997\u09C7\u099B\u09C7\u0964 00:00 \u09A5\u09C7\u0995\u09C7 23:59 \u098F\u09B0 \u09AE\u09A7\u09CD\u09AF\u09C7 \u09B8\u09A0\u09BF\u0995 \u09B8\u09AE\u09DF \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8\u0964`);
      hasInvalidSchedule = true;
    }
  } else {
    ambiguities.push("\u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF \u09B6\u09C1\u09B0\u09C1\u09B0 \u09B8\u09AE\u09DF \u0989\u09B2\u09CD\u09B2\u09C7\u0996 \u09A8\u09C7\u0987 (Start time is missing)");
  }
  if (rawEndTime) {
    if (isValid24HourTime(rawEndTime)) {
      endTime = rawEndTime.trim();
    } else {
      ambiguities.push(`\u0985\u09AC\u09C8\u09A7 \u09B8\u09AE\u09BE\u09AA\u09CD\u09A4\u09BF\u09B0 \u09B8\u09AE\u09DF (${rawEndTime}) \u09AA\u09BE\u0993\u09DF\u09BE \u0997\u09C7\u099B\u09C7\u0964`);
      hasInvalidSchedule = true;
    }
  }
  return {
    date,
    startTime,
    endTime,
    ambiguities,
    hasInvalidSchedule
  };
}

// src/server/geminiExtractor.ts
var aiClient = null;
function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is missing.");
    }
    aiClient = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}
function isHighDemandOrRateLimitError(err) {
  if (!err) return false;
  const status = err?.status || err?.code || err?.error?.code || err?.error?.status;
  if (status === 503 || status === 429 || status === "UNAVAILABLE" || status === "RESOURCE_EXHAUSTED") {
    return true;
  }
  const str = (err?.message || "") + " " + (typeof err === "object" ? JSON.stringify(err) : String(err));
  return /503|UNAVAILABLE|high demand|overloaded|429|RESOURCE_EXHAUSTED/i.test(str);
}
function extractEventsWithHeuristics(params) {
  const { rawText = "", sourceFileName, referenceDateStr } = params;
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const bnToEnDigits = (s) => s.replace(/[০-৯]/g, (d) => String("\u09E6\u09E7\u09E8\u09E9\u09EA\u09EB\u09EC\u09ED\u09EE\u09EF".indexOf(d)));
  const normalizedText = bnToEnDigits(text);
  const isCandidate = /সভা|মিটিং|মিটিঙে|ইন্ডাকশন|শপথ|কাউন্সিল|সেমিনার|কর্মশালা|ওয়ার্কশপ|পরীক্ষা|রুটিন|টার্ম|কার্ড|আইটেম|অডিটোরিয়াম|কনফারেন্স|জরুরি নোটিশ|স্মারক/i.test(text) || /meeting|induction|council|seminar|workshop|exam|schedule|routine|notice|order|circular/i.test(lower);
  const events = [];
  if (isCandidate || text.length > 10) {
    let extractedDate = null;
    const dateMatch = normalizedText.match(/\b(202[4-9])-([01]?\d)-([0-3]?\d)\b/) || normalizedText.match(/\b([0-3]?\d)[\/\-\.]([01]?\d)[\/\-\.](202[4-9])\b/);
    if (dateMatch) {
      if (dateMatch[3] && dateMatch[3].length === 4) {
        const dd = dateMatch[1].padStart(2, "0");
        const mm = dateMatch[2].padStart(2, "0");
        const yyyy = dateMatch[3];
        extractedDate = `${yyyy}-${mm}-${dd}`;
      } else {
        const yyyy = dateMatch[1];
        const mm = dateMatch[2].padStart(2, "0");
        const dd = dateMatch[3].padStart(2, "0");
        extractedDate = `${yyyy}-${mm}-${dd}`;
      }
    } else if (text.includes("\u0986\u099C") || lower.includes("today")) {
      extractedDate = referenceDateStr;
    } else if (text.includes("\u0986\u0997\u09BE\u09AE\u09C0\u0995\u09BE\u09B2") || lower.includes("tomorrow")) {
      const tm = /* @__PURE__ */ new Date();
      tm.setDate(tm.getDate() + 1);
      extractedDate = tm.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
    }
    let extractedStartTime = null;
    const timeMatch = normalizedText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm|AM|PM)?\b/) || normalizedText.match(/(?:সকাল|বেলা|দুপুর|বিকাল|সন্ধ্যা|রাত)\s*([01]?\d)(?::([0-5]\d))?\s*টা/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? timeMatch[2].padStart(2, "0") : "00";
      const meridiem = (timeMatch[3] || "").toUpperCase();
      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;
      if (/দুপুর|বিকাল|সন্ধ্যা|রাত/.test(text) && hours < 12 && hours >= 1) hours += 12;
      extractedStartTime = `${String(hours).padStart(2, "0")}:${minutes}`;
    }
    let extractedVenue = null;
    if (text.includes("\u0995\u09A8\u09AB\u09BE\u09B0\u09C7\u09A8\u09CD\u09B8 \u09B0\u09C1\u09AE") || lower.includes("conference room")) {
      extractedVenue = "\u0995\u09A8\u09AB\u09BE\u09B0\u09C7\u09A8\u09CD\u09B8 \u09B0\u09C1\u09AE, \u099C\u09C7\u09AA\u09BF\u098F\u09AE\u09B8\u09BF";
    } else if (text.includes("\u0985\u09A7\u09CD\u09AF\u0995\u09CD\u09B7") && text.includes("\u0995\u0995\u09CD\u09B7")) {
      extractedVenue = "\u0985\u09A7\u09CD\u09AF\u0995\u09CD\u09B7 \u09AE\u09B9\u09CB\u09A6\u09DF\u09C7\u09B0 \u09B8\u09AD\u09BE\u0995\u0995\u09CD\u09B7, \u099C\u09C7\u09AA\u09BF\u098F\u09AE\u09B8\u09BF";
    } else if (text.includes("\u0985\u09A1\u09BF\u099F\u09CB\u09B0\u09BF\u09DF\u09BE\u09AE") || lower.includes("auditorium")) {
      extractedVenue = "\u0985\u09A1\u09BF\u099F\u09CB\u09B0\u09BF\u09DF\u09BE\u09AE, \u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C";
    } else if (text.includes("\u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995 \u09AD\u09AC\u09A8")) {
      extractedVenue = "\u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995 \u09AD\u09AC\u09A8, \u099C\u09C7\u09AA\u09BF\u098F\u09AE\u09B8\u09BF";
    } else if (text.includes("\u09B8\u09AD\u09BE\u0995\u0995\u09CD\u09B7")) {
      extractedVenue = "\u09B8\u09AD\u09BE\u0995\u0995\u09CD\u09B7, \u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C";
    }
    let category = "\u09B8\u09AD\u09BE";
    let eventType = "committee_meeting";
    if (/ইন্ডাকশন|বরণ|ওরিয়েন্টেশন/i.test(text)) {
      category = "\u0987\u09A8\u09CD\u09A1\u09BE\u0995\u09B6\u09A8";
      eventType = "induction_program";
    } else if (/পরীক্ষা|টার্ম|কার্ড|আইটেম|ভিসা/i.test(text)) {
      category = "\u09AA\u09B0\u09C0\u0995\u09CD\u09B7\u09BE";
      eventType = "examination";
    } else if (/সেমিনার|কর্মশালা|ওয়ার্কশপ/i.test(text)) {
      category = "\u09B8\u09C7\u09AE\u09BF\u09A8\u09BE\u09B0";
      eventType = "workshop";
    } else if (/কাউন্সিল|একাডেমিক/i.test(text)) {
      category = "\u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995";
      eventType = "council";
    }
    const firstLine = text.split("\n").filter((l) => l.trim().length > 0)[0] || "";
    const title = firstLine.length > 5 && firstLine.length < 80 ? firstLine.replace(/^[#*-]\s*/, "").trim() : sourceFileName ? `${sourceFileName} \u2014 \u09A8\u09CB\u099F\u09BF\u09B6 \u09B6\u09BF\u09A1\u09BF\u0989\u09B2` : "\u099C\u09C7\u09AA\u09BF\u098F\u09AE\u09B8\u09BF \u0985\u09AB\u09BF\u09B6\u09BF\u09DF\u09BE\u09B2 \u09A8\u09CB\u099F\u09BF\u09B6 \u09B6\u09BF\u09A1\u09BF\u0989\u09B2";
    const scheduleCheck = sanitizeSchedule(extractedDate, extractedStartTime, null);
    events.push({
      title,
      eventType,
      date: scheduleCheck.date,
      startTime: scheduleCheck.startTime,
      endTime: scheduleCheck.endTime,
      venue: extractedVenue,
      organizer: "\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C (\u099C\u09C7\u09AA\u09BF\u098F\u09AE\u09B8\u09BF)",
      committee: null,
      participants: null,
      agenda: null,
      instructions: null,
      sourceFileName: sourceFileName || null,
      description: text || (sourceFileName ? `\u09B8\u0982\u09AF\u09C1\u0995\u09CD\u09A4 \u09AB\u09BE\u0987\u09B2: ${sourceFileName}` : "\u0985\u09AB\u09BF\u09B6\u09BF\u09DF\u09BE\u09B2 \u09A8\u09CB\u099F\u09BF\u09B6"),
      category,
      priority: text.includes("\u099C\u09B0\u09C1\u09B0\u09BF") || lower.includes("urgent") ? "urgent" : "important",
      confidence: 0.65,
      ambiguities: [
        '\u0997\u09C1\u0997\u09B2 \u099C\u09C7\u09AE\u09BF\u09A8\u09BF \u098F\u0986\u0987 \u09B8\u09BE\u09AE\u09DF\u09BF\u0995\u09AD\u09BE\u09AC\u09C7 \u0985\u09A7\u09BF\u0995 \u099A\u09BE\u09B9\u09BF\u09A6\u09BE\u09B8\u09AE\u09CD\u09AA\u09A8\u09CD\u09A8 (503 High Demand)\u0964 \u09B8\u09CD\u09AE\u09BE\u09B0\u09CD\u099F \u09B9\u09BF\u0989\u09B0\u09BF\u09B8\u09CD\u099F\u09BF\u0995 \u09AA\u09BE\u09B0\u09CD\u09B8\u09BE\u09B0 \u09A6\u09CD\u09AC\u09BE\u09B0\u09BE \u0996\u09B8\u09DC\u09BE \u09A4\u09C8\u09B0\u09BF \u09B9\u09DF\u09C7\u099B\u09C7\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u09A4\u09A5\u09CD\u09AF \u09AF\u09BE\u099A\u09BE\u0987 \u0995\u09B0\u09C1\u09A8 \u0985\u09A5\u09AC\u09BE \u09AA\u09B0\u09C7 "AI Reprocess" \u09AC\u09CB\u09A4\u09BE\u09AE \u099A\u09BE\u09AA\u09C1\u09A8\u0964',
        ...scheduleCheck.ambiguities
      ]
    });
  }
  return {
    isEventRelated: events.length > 0,
    events,
    rawText: text,
    processedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function extractEventsWithGemini(params) {
  const {
    rawText = "",
    documentBase64,
    documentMimeType = "application/pdf",
    sourceFileName,
    telegramTimestamp,
    timezone = "Asia/Dhaka (UTC+6)"
  } = params;
  const now = /* @__PURE__ */ new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const currentDayOfWeek = now.toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Dhaka" });
  const ai = getAIClient();
  const systemInstruction = `You are the executive scheduling intelligence engine for Jamalpur Medical College (JpMC), located in Jamalpur, Bangladesh.
Current reference date in Bangladesh (Asia/Dhaka): ${todayStr} (${currentDayOfWeek}).
Default Timezone: ${timezone}.

Your mission is to read official medical college notices, Telegram channel broadcasts, administrative circulars, clinical announcements, committee office orders, and meeting notices in Bengali, English, or mixed Bengali-English.

CRITICAL ARCHITECTURAL RULES:
1. MULTIMODAL & SCANNED DOCUMENT UNDERSTANDING:
   - When a document (PDF or Image - JPEG, PNG, WEBP) is attached, carefully inspect the full binary page/image visual content.
   - This includes scanned Bengali text, English text, photos of printed circulars taken with mobile cameras, printed office memo headers, memo numbers (\u09B8\u09CD\u09AE\u09BE\u09B0\u0995 \u09A8\u0982), signatures, official seals (\u09B8\u09C0\u09B2\u09AE\u09CB\u09B9\u09B0), date lines, class routines, department schedules, and committee member rosters.
   - Do NOT rely only on digital text streams; use your visual/multimodal OCR intelligence for photographic notices, rotated documents, and low-light mobile phone photos.

2. COMBINE CAPTIONS AND ATTACHMENTS JOINTLY:
   - Very often on Telegram, an administrator posts an image or PDF of a schedule accompanied by a short caption (e.g., "\u0986\u0997\u09BE\u09AE\u09C0\u0995\u09BE\u09B2 \u09A5\u09C7\u0995\u09C7 \u09A8\u09A4\u09C1\u09A8 \u09B6\u09BF\u09A1\u09BF\u0989\u09B2 \u0995\u09BE\u09B0\u09CD\u09AF\u0995\u09B0 \u09B9\u09AC\u09C7" or "\u099C\u09B0\u09C1\u09B0\u09BF \u09AE\u09BF\u099F\u09BF\u0982 \u09A8\u09CB\u099F\u09BF\u09B6").
   - You MUST cross-reference and synthesize information from BOTH the visual attachment and the caption text.
   - For example, relative dates in the caption (such as "\u0986\u0997\u09BE\u09AE\u09C0\u0995\u09BE\u09B2", "\u09AA\u09B0\u09B6\u09C1", "\u0986\u0997\u09BE\u09AE\u09C0 \u09B0\u09AC\u09BF\u09AC\u09BE\u09B0") must be resolved using the reference date: ${todayStr}.

3. BROAD MEDICAL COLLEGE SCHEDULE QUALIFICATION:
   - A document does NOT need to literally contain the word "meeting" or "\u09B8\u09AD\u09BE" to qualify as a schedule candidate.
   - Any official program, committee order, intern doctor induction ceremony, oath taking program, orientation, workshop, examination (Term, Card, Item, Viva, OSCE), scientific session, training, academic council, clinical round, or administrative activity that involves an event date/time or scheduled program MUST be classified as an event candidate (isEventRelated = true).

3. ABSOLUTELY NO FABRICATED DEFAULTS:
   - If time is not stated in the text/document, 'startTime' MUST be null.
   - If venue/location is not stated in the document, 'venue' MUST be null.
   - If date cannot be determined with high certainty, 'date' MUST be null.
   - NEVER fabricate or guess dates, times, or venues.
   - For every missing or uncertain piece of information, add a clear explanatory entry in the 'ambiguities' array (in Bengali or English), e.g., "\u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF\u09B0 \u09B8\u09AE\u09DF \u0989\u09B2\u09CD\u09B2\u09C7\u0996 \u09A8\u09C7\u0987 (Start time not specified)", "\u09A8\u09BF\u09B0\u09CD\u09A6\u09BF\u09B7\u09CD\u099F \u09AD\u09C7\u09A8\u09CD\u09AF\u09C1 \u09AC\u09BE \u0995\u0995\u09CD\u09B7 \u09A8\u09AE\u09CD\u09AC\u09B0 \u0985\u09A8\u09C1\u09AA\u09B8\u09CD\u09A5\u09BF\u09A4 (Venue not specified)".

4. MULTIPLE EVENTS HANDLING:
   - A single circular or office order may announce ZERO, ONE, or MULTIPLE distinct events (e.g. Committee meeting on 20th, Induction ceremony on 25th).
   - If multiple events are scheduled, extract each as an independent item in the 'events' array.
   - If the document is purely general correspondence or policy with zero scheduled activities or deadlines, set isEventRelated = false and events = [].

5. MEDICAL COLLEGE VOCABULARY & ENTITIES:
   - Recognize terms: \u0987\u09A8\u09CD\u099F\u09BE\u09B0\u09CD\u09A8 \u09A1\u09BE\u0995\u09CD\u09A4\u09BE\u09B0 \u0987\u09A8\u09CD\u09A1\u09BE\u0995\u09B6\u09A8 \u0995\u09AE\u09BF\u099F\u09BF (Intern Doctor Induction Committee), \u09AC\u09BF\u09AD\u09BE\u0997\u09C0\u09AF\u09BC \u09AA\u09CD\u09B0\u09A7\u09BE\u09A8 (HOD), \u09AB\u09C7\u099C (Phase 1, 2, 3, 4), \u099F\u09BE\u09B0\u09CD\u09AE (Term), \u0986\u0987\u099F\u09C7\u09AE (Item), \u0995\u09BE\u09B0\u09CD\u09A1 (Card), \u09AD\u09BE\u0987\u09AD\u09BE (Viva), \u0985\u09B8\u09AA\u09BF (OSCE), \u0993\u099F\u09BF \u0995\u09AE\u09AA\u09CD\u09B2\u09C7\u0995\u09CD\u09B8 (OT Complex), \u09B8\u09BF\u098F\u09AE\u0987 (CME), \u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995 \u0995\u09BE\u0989\u09A8\u09CD\u09B8\u09BF\u09B2 (Academic Council), \u0985\u09A7\u09CD\u09AF\u0995\u09CD\u09B7\u09C7\u09B0 \u0995\u09BE\u09B0\u09CD\u09AF\u09BE\u09B2\u09DF (Principal Office), \u09B8\u09AE\u09CD\u09AE\u09C7\u09B2\u09A8 \u0995\u0995\u09CD\u09B7 (Conference Room), \u09B2\u09C7\u0995\u099A\u09BE\u09B0 \u0997\u09CD\u09AF\u09BE\u09B2\u09BE\u09B0\u09BF \u09E7/\u09E8/\u09E9 (Lecture Gallery 1/2/3), \u099F\u09BF\u099A\u09BE\u09B0\u09CD\u09B8 \u09B2\u09BE\u0989\u099E\u09CD\u099C (Teachers Lounge).

6. CATEGORIES:
   - Must be one of: '\u09B8\u09AD\u09BE', '\u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995', '\u09AA\u09B0\u09C0\u0995\u09CD\u09B7\u09BE', '\u09B8\u09C7\u09AE\u09BF\u09A8\u09BE\u09B0', '\u0993\u09DF\u09BE\u09B0\u09CD\u0995\u09B6\u09AA', '\u09AA\u09CD\u09B0\u09B6\u09BF\u0995\u09CD\u09B7\u09A3', '\u09AA\u09CD\u09B0\u09B6\u09BE\u09B8\u09A8\u09BF\u0995', '\u099C\u09BE\u09A4\u09C0\u09DF \u09A6\u09BF\u09AC\u09B8', '\u0995\u09CD\u09B0\u09DF/\u099F\u09C7\u09A8\u09CD\u09A1\u09BE\u09B0', '\u099B\u09BE\u09A4\u09CD\u09B0 \u09AC\u09BF\u09B7\u09DF\u0995', '\u09AC\u09CD\u09AF\u0995\u09CD\u09A4\u09BF\u0997\u09A4', '\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF'.

7. PRIORITY:
   - 'urgent' if marked \u099C\u09B0\u09C1\u09B0\u09BF, \u099C\u09B0\u09C1\u09B0\u09C0, urgent, emergency, \u0985\u09AC\u09BF\u09B2\u09AE\u09CD\u09AC\u09C7.
   - 'important' if marked \u09AC\u09BF\u09B6\u09C7\u09B7, \u0997\u09C1\u09B0\u09C1\u09A4\u09CD\u09AC\u09AA\u09C2\u09B0\u09CD\u09A3, important.
   - 'normal' otherwise.

8. DATE & TIME FORMAT:
   - 'date' must be 'YYYY-MM-DD' if known, or null.
   - 'startTime' and 'endTime' must be 24-hour 'HH:mm' if known, or null. Convert Bengali numerals (\u09E6-\u09EF) to standard numbers.`;
  const contents = [];
  if (documentBase64) {
    contents.push({
      inlineData: {
        data: documentBase64,
        mimeType: documentMimeType || "application/pdf"
      }
    });
  }
  let promptText = `Please parse the attached notice/document and extract all official schedules, programs, and meetings.
`;
  if (sourceFileName) {
    promptText += `Source Document Filename: ${sourceFileName}
`;
  }
  if (telegramTimestamp) {
    promptText += `Notice Timestamp: ${telegramTimestamp}
`;
  }
  if (rawText && !rawText.startsWith("[\u09B8\u0982\u09AF\u09C1\u0995\u09CD\u09A4 \u09AB\u09BE\u0987\u09B2:")) {
    promptText += `Accompanying Text/Caption:
"""
${rawText}
"""
`;
  } else if (!documentBase64) {
    promptText += `Notice Content:
"""
${rawText}
"""
`;
  }
  contents.push({ text: promptText });
  const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite"];
  let response = null;
  let lastError = null;
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
            responseMimeType: "application/json",
            responseSchema: {
              type: import_genai.Type.OBJECT,
              properties: {
                isEventRelated: {
                  type: import_genai.Type.BOOLEAN,
                  description: "True if notice announces one or more meetings, programs, exams, induction ceremonies, or events"
                },
                events: {
                  type: import_genai.Type.ARRAY,
                  items: {
                    type: import_genai.Type.OBJECT,
                    properties: {
                      title: {
                        type: import_genai.Type.STRING,
                        description: "Concise official title of the program or event"
                      },
                      eventType: {
                        type: import_genai.Type.STRING,
                        description: "Type of event: e.g. committee_meeting, induction_program, workshop, examination, orientation, council, scientific_session, training"
                      },
                      date: {
                        type: import_genai.Type.STRING,
                        description: "YYYY-MM-DD format, or null if missing"
                      },
                      startTime: {
                        type: import_genai.Type.STRING,
                        description: "HH:mm 24-hour format, or null if missing"
                      },
                      endTime: {
                        type: import_genai.Type.STRING,
                        description: "HH:mm 24-hour format, or null if missing"
                      },
                      venue: {
                        type: import_genai.Type.STRING,
                        description: "Exact venue or room name, or null if missing"
                      },
                      organizer: {
                        type: import_genai.Type.STRING,
                        description: "Organizing department or authority (e.g. \u0985\u09A7\u09CD\u09AF\u0995\u09CD\u09B7\u09C7\u09B0 \u0995\u09BE\u09B0\u09CD\u09AF\u09BE\u09B2\u09DF, \u0987\u09A8\u09CD\u099F\u09BE\u09B0\u09CD\u09A8 \u09A1\u09BE\u0995\u09CD\u09A4\u09BE\u09B0 \u0987\u09A8\u09CD\u09A1\u09BE\u0995\u09B6\u09A8 \u0995\u09AE\u09BF\u099F\u09BF)"
                      },
                      committee: {
                        type: import_genai.Type.STRING,
                        description: "Committee name if mentioned in the notice"
                      },
                      participants: {
                        type: import_genai.Type.STRING,
                        description: "Expected participants or committee members"
                      },
                      agenda: {
                        type: import_genai.Type.STRING,
                        description: "Agenda or purpose of the event"
                      },
                      instructions: {
                        type: import_genai.Type.STRING,
                        description: "Specific directions, requirements, or preparations"
                      },
                      description: {
                        type: import_genai.Type.STRING,
                        description: "Full description and context of the meeting or program"
                      },
                      category: {
                        type: import_genai.Type.STRING,
                        description: "Category name (e.g. \u09B8\u09AD\u09BE, \u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995, \u09AA\u09B0\u09C0\u0995\u09CD\u09B7\u09BE, \u09B8\u09C7\u09AE\u09BF\u09A8\u09BE\u09B0, \u0993\u09DF\u09BE\u09B0\u09CD\u0995\u09B6\u09AA, \u09AA\u09CD\u09B0\u09B6\u09BE\u09B8\u09A8\u09BF\u0995)"
                      },
                      priority: {
                        type: import_genai.Type.STRING,
                        enum: ["normal", "important", "urgent"]
                      },
                      confidence: {
                        type: import_genai.Type.NUMBER,
                        description: "Confidence score from 0.0 to 1.0 based on clarity and certainty of the document"
                      },
                      ambiguities: {
                        type: import_genai.Type.ARRAY,
                        items: { type: import_genai.Type.STRING },
                        description: "List of ambiguities or missing fields that need staff review"
                      }
                    },
                    required: [
                      "title",
                      "description",
                      "category",
                      "priority",
                      "confidence",
                      "ambiguities"
                    ]
                  }
                }
              },
              required: ["isEventRelated", "events"]
            }
          }
        });
        break;
      } catch (err) {
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
  if (!response) {
    console.info("[Gemini Extractor] Models currently experiencing high demand. Activating smart offline fallback parser...");
    return extractEventsWithHeuristics({
      rawText,
      sourceFileName,
      telegramTimestamp,
      referenceDateStr: todayStr
    });
  }
  const responseText = response.text || "{}";
  const parsed = JSON.parse(responseText);
  const events = (parsed.events || []).map((ev) => {
    const scheduleCheck = sanitizeSchedule(ev.date, ev.startTime, ev.endTime);
    const existingAmbiguities = Array.isArray(ev.ambiguities) ? ev.ambiguities : [];
    const combinedAmbiguities = [...existingAmbiguities, ...scheduleCheck.ambiguities];
    let confidence = 0;
    if (typeof ev.confidence === "number" && !isNaN(ev.confidence) && ev.confidence >= 0 && ev.confidence <= 1) {
      confidence = Math.round(ev.confidence * 100) / 100;
    } else {
      combinedAmbiguities.push("AI confidence score \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF\u0964");
    }
    const rawTitle = typeof ev.title === "string" ? ev.title.trim() : "";
    const hasMeaningfulTitle = rawTitle.length > 0 && !/^[\s-_.,]*$/.test(rawTitle);
    if (!hasMeaningfulTitle) {
      combinedAmbiguities.push("\u0987\u09AD\u09C7\u09A8\u09CD\u099F\u09C7\u09B0 \u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8\u0964");
    }
    const rawVenue = typeof ev.venue === "string" ? ev.venue.trim() : "";
    const venue = rawVenue.length > 0 ? rawVenue : null;
    const rawCategory = typeof ev.category === "string" ? ev.category.trim() : "";
    const category = rawCategory.length > 0 ? rawCategory : "\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF";
    return {
      title: hasMeaningfulTitle ? rawTitle : "\u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8",
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
      priority: ["normal", "important", "urgent"].includes(ev.priority) ? ev.priority : "normal",
      confidence,
      ambiguities: combinedAmbiguities
    };
  });
  return {
    isEventRelated: Boolean(parsed.isEventRelated),
    events,
    rawText,
    processedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/server/firebaseAdmin.ts
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_messaging = require("firebase-admin/messaging");
var import_auth = require("firebase-admin/auth");

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "sapient-pen-336609",
  appId: "1:103277329126:web:64cb4ba0cfd47a134bd927",
  apiKey: "AIzaSyBaaFz7VAL2WBx0Sp47trHf_4RkEGkvFa0",
  authDomain: "sapient-pen-336609.firebaseapp.com",
  storageBucket: "sapient-pen-336609.firebasestorage.app",
  messagingSenderId: "103277329126",
  measurementId: "",
  oAuthClientId: "103277329126-fppb2csm3a2nk3mngvk3ulantfjrqkd4.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// src/server/firebaseAdmin.ts
var PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebase_applet_config_default.projectId || "sapient-pen-336609";
if (!(0, import_app.getApps)().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const creds = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        (0, import_app.initializeApp)({
          credential: (0, import_app.cert)(creds),
          projectId: creds.project_id || PROJECT_ID
        });
        console.log("[FirebaseAdmin] Initialized with FIREBASE_SERVICE_ACCOUNT_KEY.");
      } catch (err) {
        console.warn("[FirebaseAdmin] Failed parsing service account key, falling back to projectId:", err);
        (0, import_app.initializeApp)({ projectId: PROJECT_ID });
      }
    } else {
      (0, import_app.initializeApp)({
        projectId: PROJECT_ID
      });
      console.log(`[FirebaseAdmin] Initialized with Project ID: ${PROJECT_ID}`);
    }
  } catch (err) {
    console.warn("[FirebaseAdmin] Initialization warning:", err);
  }
}
var adminApp = (0, import_app.getApp)();
var adminDb = (0, import_firestore.getFirestore)();
var adminMessaging = (0, import_messaging.getMessaging)();
var adminAuth = (0, import_auth.getAuth)(adminApp);
function removeUndefinedFields(value) {
  if (value === null || value === void 0 || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item !== void 0).map((item) => removeUndefinedFields(item));
  }
  const cleaned = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === void 0) {
      continue;
    }
    cleaned[k] = removeUndefinedFields(v);
  }
  return cleaned;
}
var INITIAL_ADMIN_EMAILS = {
  "marufjb@gmail.com": { label: "Maruf", role: "admin" },
  "nasir230171@gmail.com": { label: "Principal", role: "admin" }
};
async function ensureUserAuthorization(tokenDecoded) {
  const uid = tokenDecoded.uid;
  const rawEmail = tokenDecoded.email || "";
  const normalizedEmail = rawEmail.trim().toLowerCase();
  const userDocRef = adminDb.collection("authorizedUsers").doc(uid);
  const existingSnap = await userDocRef.get();
  const existingData = existingSnap.exists ? existingSnap.data() : null;
  let role = "user";
  let defaultDisplayName = tokenDecoded.name || (normalizedEmail ? normalizedEmail.split("@")[0] : "User");
  if (normalizedEmail && INITIAL_ADMIN_EMAILS[normalizedEmail]) {
    role = "admin";
    defaultDisplayName = tokenDecoded.name || INITIAL_ADMIN_EMAILS[normalizedEmail].label;
  } else if (existingData && existingData.role === "admin") {
    role = "admin";
  }
  const finalDisplayName = existingData?.displayName || defaultDisplayName;
  const active = existingData?.active !== void 0 ? existingData.active : true;
  const photoURL = tokenDecoded.picture || existingData?.photoURL || null;
  const dataToSave = removeUndefinedFields({
    uid,
    email: normalizedEmail,
    displayName: finalDisplayName,
    photoURL,
    role,
    active,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...existingSnap.exists ? {} : { createdAt: (/* @__PURE__ */ new Date()).toISOString() }
  });
  await userDocRef.set(dataToSave, { merge: true });
  return {
    uid,
    email: normalizedEmail,
    displayName: finalDisplayName,
    photoURL,
    role,
    active
  };
}
async function getUserRoleAndActive(uid) {
  const userDocRef = adminDb.collection("authorizedUsers").doc(uid);
  const snap = await userDocRef.get();
  if (!snap.exists) return null;
  const data = snap.data();
  return {
    role: data?.role === "admin" ? "admin" : "user",
    active: data?.active === true,
    displayName: data?.displayName,
    email: data?.email
  };
}
async function registerDeviceInFirestore(device) {
  try {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const docData = removeUndefinedFields({
      ...device,
      userId: device.userId || null,
      userAgent: device.userAgent || null,
      updatedAt: nowIso,
      lastSeenAt: nowIso
    });
    await adminDb.collection("devices").doc(device.deviceId).set(docData, { merge: true });
    if (device.userId) {
      await adminDb.collection("users").doc(device.userId).collection("devices").doc(device.deviceId).set(docData, { merge: true });
    }
  } catch (err) {
    console.error("[FirebaseAdmin] Failed to register device:", err);
    throw err;
  }
}
async function getActiveDevices() {
  try {
    const snapshot = await adminDb.collection("devices").where("notificationsEnabled", "==", true).get();
    const devices = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.fcmToken) {
        devices.push(data);
      }
    });
    return devices;
  } catch (err) {
    console.warn("[FirebaseAdmin] Could not query active devices from Firestore:", err);
    return [];
  }
}
async function hasNotificationBeenDelivered(deliveryId) {
  try {
    const docSnap = await adminDb.collection("notificationDeliveries").doc(deliveryId).get();
    return docSnap.exists;
  } catch (err) {
    console.warn("[FirebaseAdmin] Delivery idempotency check failed:", err);
    return false;
  }
}
async function logNotificationDelivery(log) {
  try {
    const safeLog = removeUndefinedFields({
      ...log,
      eventId: log.eventId || null,
      userId: log.userId || null,
      error: log.error || null
    });
    await adminDb.collection("notificationDeliveries").doc(log.deliveryId).set(safeLog);
  } catch (err) {
    console.error("[FirebaseAdmin] Failed to log delivery:", err);
  }
}
var inMemoryTelegramMessages = [];
var inMemoryProcessedIds = /* @__PURE__ */ new Set();
var inMemoryEvents = [];
async function saveTelegramMessageToFirestore(record) {
  const docId = `${record.chatId}_${record.messageId}`;
  inMemoryProcessedIds.add(docId);
  const safeDocType = record.hasDocument ? record.documentType || "text" : "text";
  const safeDocName = record.hasDocument ? record.documentName || null : null;
  const rawNormalized = {
    id: record.id,
    messageId: record.messageId,
    chatId: String(record.chatId),
    senderName: record.senderName || "TelegramBot",
    senderRole: record.senderRole || "Telegram",
    originalSenderName: record.originalSenderName || null,
    originalSenderRole: record.originalSenderRole || null,
    timestamp: record.timestamp,
    rawText: record.rawText || "",
    hasDocument: Boolean(record.hasDocument),
    documentType: safeDocType,
    documentName: safeDocName,
    mimeType: record.mimeType || (safeDocType === "pdf" ? "application/pdf" : null),
    fileSize: typeof record.fileSize === "number" ? record.fileSize : null,
    telegramFileId: record.telegramFileId || null,
    caption: record.caption || null,
    processingStatus: record.processingStatus || "processed",
    extractionStatus: record.extractionStatus || null,
    status: record.status,
    extractedEventIds: Array.isArray(record.extractedEventIds) ? record.extractedEventIds : [],
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
    receivedAt: record.receivedAt || (/* @__PURE__ */ new Date()).toISOString(),
    processedAt: record.processedAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const safeRecord = removeUndefinedFields(rawNormalized);
  const existingIdx = inMemoryTelegramMessages.findIndex((m) => `${m.chatId}_${m.messageId}` === docId);
  if (existingIdx >= 0) {
    inMemoryTelegramMessages[existingIdx] = safeRecord;
  } else {
    inMemoryTelegramMessages.unshift(safeRecord);
    if (inMemoryTelegramMessages.length > 100) {
      inMemoryTelegramMessages.length = 100;
    }
  }
  try {
    await adminDb.collection("telegramMessages").doc(docId).set(safeRecord, { merge: true });
    console.log(`[FirebaseAdmin] Successfully saved Telegram message ${docId} to Firestore (status: ${safeRecord.status}, docType: ${safeRecord.documentType}).`);
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.error("[FirebaseAdmin] Failed to save Telegram message to Firestore:", err?.message || err);
    }
  }
}
async function saveExtractedEventToFirestore(event) {
  return saveCanonicalEventToFirestore(event);
}
async function saveCanonicalEventToFirestore(event) {
  const eventId = event.id || `evt-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const rawNormalized = {
    id: eventId,
    title: (event.title || "\u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8").trim(),
    description: event.description || "",
    eventDate: event.eventDate || null,
    startTime: event.startTime || null,
    endTime: event.endTime || null,
    venue: event.venue || null,
    category: event.category || "\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF",
    priority: event.priority || "normal",
    source: event.source || "Manual",
    audience: event.audience || "official",
    telegramMessageId: event.telegramMessageId ?? null,
    telegramChatId: event.telegramChatId ? String(event.telegramChatId) : null,
    googleCalendarEventId: event.googleCalendarEventId || null,
    calendarId: event.calendarId || null,
    lastCalendarSyncAt: event.lastCalendarSyncAt || null,
    isGCalSynced: Boolean(event.isGCalSynced),
    sender: event.sender || null,
    committee: event.committee || null,
    participants: event.participants || null,
    originalText: event.originalText || "",
    confidence: typeof event.confidence === "number" ? event.confidence : null,
    reviewStatus: event.reviewStatus || "auto_approved",
    syncStatus: event.syncStatus || "synced",
    isAllDay: Boolean(event.isAllDay),
    isCompleted: Boolean(event.isCompleted),
    ambiguities: Array.isArray(event.ambiguities) ? event.ambiguities : [],
    reminders: Array.isArray(event.reminders) ? event.reminders : [],
    createdAt: event.createdAt || nowIso,
    updatedAt: nowIso,
    createdBy: event.createdBy || "staff",
    visibility: event.visibility || "institutional"
  };
  const safeEvent = removeUndefinedFields(rawNormalized);
  const existingIdx = inMemoryEvents.findIndex((e) => e.id === eventId);
  if (existingIdx >= 0) {
    inMemoryEvents[existingIdx] = safeEvent;
  } else {
    inMemoryEvents.unshift(safeEvent);
    if (inMemoryEvents.length > 300) {
      inMemoryEvents.length = 300;
    }
  }
  try {
    await adminDb.collection("events").doc(eventId).set(safeEvent, { merge: true });
    console.log(
      `[FirebaseAdmin] Successfully persisted canonical event ${eventId} to Firestore (source: ${safeEvent.source}, date: ${safeEvent.eventDate}, time: ${safeEvent.startTime}, title: "${safeEvent.title.slice(0, 30)}").`
    );
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.error("[FirebaseAdmin] Failed to persist canonical event to Firestore:", err?.message || err);
    }
  }
  return safeEvent;
}
async function deleteEventFromFirestore(eventId) {
  const existingIdx = inMemoryEvents.findIndex((e) => e.id === eventId);
  if (existingIdx >= 0) {
    inMemoryEvents.splice(existingIdx, 1);
  }
  try {
    await adminDb.collection("events").doc(eventId).delete();
    console.log(`[FirebaseAdmin] Deleted event ${eventId} from Firestore.`);
    return true;
  } catch (err) {
    console.error(`[FirebaseAdmin] Failed to delete event ${eventId} from Firestore:`, err?.message || err);
    return false;
  }
}
async function getEventsFromFirestore(limitCount = 150) {
  try {
    let snapshot;
    try {
      snapshot = await adminDb.collection("events").orderBy("createdAt", "desc").limit(limitCount).get();
    } catch {
      snapshot = await adminDb.collection("events").limit(limitCount).get();
    }
    const events = [];
    snapshot.forEach((doc) => events.push(doc.data()));
    if (events.length > 0) {
      events.sort((a, b) => {
        const timeA = a.createdAt || `${a.eventDate || "9999-99-99"} ${a.startTime || "00:00"}`;
        const timeB = b.createdAt || `${b.eventDate || "9999-99-99"} ${b.startTime || "00:00"}`;
        return timeB.localeCompare(timeA);
      });
      return events;
    }
    return inMemoryEvents.slice(0, limitCount);
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.warn("[FirebaseAdmin] Failed to query events from Firestore:", err?.message || err);
    }
    return inMemoryEvents.slice(0, limitCount);
  }
}
async function getTelegramMessagesFromFirestore(limitCount = 50) {
  try {
    const snapshot = await adminDb.collection("telegramMessages").orderBy("id", "desc").limit(limitCount).get();
    const messages = [];
    snapshot.forEach((doc) => messages.push(doc.data()));
    if (messages.length > 0) {
      return messages;
    }
    return inMemoryTelegramMessages.slice(0, limitCount);
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.warn("[FirebaseAdmin] Failed to query Telegram messages from Firestore:", err?.message || err);
    }
    return inMemoryTelegramMessages.slice(0, limitCount);
  }
}
async function getTelegramMessageByIdFromFirestore(chatId, messageId) {
  const docId = `${chatId}_${messageId}`;
  try {
    const doc = await adminDb.collection("telegramMessages").doc(docId).get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (err) {
    console.warn("[FirebaseAdmin] Failed to query single Telegram message:", err?.message || err);
  }
  const memMatch = inMemoryTelegramMessages.find((m) => `${m.chatId}_${m.messageId}` === docId);
  return memMatch || null;
}

// src/server/telegramService.ts
async function downloadTelegramFile(botToken, fileId, hintFileName) {
  try {
    const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    if (!fileRes.ok) {
      console.warn(`[Telegram PDF] getFile HTTP ${fileRes.status} for file_id: ${fileId}`);
      return null;
    }
    const fileJson = await fileRes.json();
    if (!fileJson.ok || !fileJson.result?.file_path) {
      console.warn(`[Telegram PDF] getFile returned not ok for file_id: ${fileId}`, fileJson);
      return null;
    }
    const filePath = fileJson.result.file_path;
    console.log(`[Telegram PDF] getFile successful (path: ${filePath})`);
    if (fileJson.result.file_size && fileJson.result.file_size > 25 * 1024 * 1024) {
      console.warn("[Telegram PDF] File exceeds 25MB limit:", fileJson.result.file_size);
      return null;
    }
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const blobRes = await fetch(downloadUrl);
    if (!blobRes.ok) {
      console.warn(`[Telegram PDF] File download HTTP ${blobRes.status}`);
      return null;
    }
    const arrayBuffer = await blobRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      console.warn("[Telegram PDF] Downloaded file buffer is empty (0 bytes)");
      return null;
    }
    console.log(`[Telegram PDF] Download successful: bytes=${buffer.length}`);
    let mimeType = "application/octet-stream";
    const isPdfMagic = buffer.subarray(0, 5).toString("ascii").startsWith("%PDF-");
    const isJpegMagic = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    const isPngMagic = buffer.length >= 8 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71;
    const isWebpMagic = buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    const checkPath = (hintFileName || filePath).toLowerCase();
    if (isPdfMagic || checkPath.endsWith(".pdf")) {
      mimeType = "application/pdf";
    } else if (isJpegMagic || checkPath.endsWith(".jpg") || checkPath.endsWith(".jpeg")) {
      mimeType = "image/jpeg";
    } else if (isPngMagic || checkPath.endsWith(".png")) {
      mimeType = "image/png";
    } else if (isWebpMagic || checkPath.endsWith(".webp")) {
      mimeType = "image/webp";
    } else if (fileJson.result.mime_type) {
      mimeType = fileJson.result.mime_type;
    } else {
      mimeType = blobRes.headers.get("content-type") || "application/octet-stream";
    }
    console.log(`[Telegram File] MIME type detected: ${mimeType} (PDF: ${isPdfMagic}, JPEG: ${isJpegMagic}, PNG: ${isPngMagic}, WEBP: ${isWebpMagic})`);
    const base64 = buffer.toString("base64");
    return { buffer, base64, mimeType, fileSize: buffer.length };
  } catch (err) {
    console.warn("[Telegram File] Exception during file download:", err?.message || err);
    return null;
  }
}
async function processTelegramWebhookUpdate(update, secretHeader) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && secretHeader !== void 0 && secretHeader !== expectedSecret) {
    console.warn("[Telegram Webhook] Secret token mismatch or missing.");
    return {
      ok: false,
      status: "error",
      eventsCount: 0,
      reviewRequiredCount: 0,
      error: "Unauthorized: Secret token mismatch"
    };
  }
  const message = update.message || update.channel_post || update.edited_message;
  if (!message) {
    return { ok: true, status: "ignored", eventsCount: 0, reviewRequiredCount: 0 };
  }
  const chatId = String(message.chat?.id || "");
  const messageId = Number(message.message_id || 0);
  const existingRecord = await getTelegramMessageByIdFromFirestore(chatId, messageId);
  if (existingRecord) {
    if (existingRecord.status === "Schedule Created" || existingRecord.status === "Needs Review" || existingRecord.status === "Not a Schedule") {
      console.log(`[Telegram] Duplicate webhook skipped (${chatId}_${messageId}, status: ${existingRecord.status})`);
      return {
        ok: true,
        status: "already_processed",
        chatId,
        messageId,
        eventsCount: (existingRecord.extractedEventIds || []).length,
        reviewRequiredCount: 0
      };
    }
  }
  const rawCaption = message.caption || "";
  const rawText = message.text || rawCaption || "";
  const senderName = "TelegramBot";
  const senderRole = "Telegram";
  const originalSenderName = message.from?.first_name ? `${message.from.first_name} ${message.from.last_name || ""}`.trim() : message.chat?.title || "Unknown Telegram Sender";
  const originalSenderRole = message.from?.username ? `@${message.from.username}` : "Channel Broadcaster";
  let hasDocument = false;
  let documentType = "text";
  let documentName = null;
  let documentBase64 = void 0;
  let documentMimeType = "application/pdf";
  let telegramFileId = null;
  let fileSize = null;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    hasDocument = true;
    documentType = "image";
    const sortedPhotos = [...message.photo].sort((a, b) => {
      const areaA = (a.width || 0) * (a.height || 0) || (a.file_size || 0);
      const areaB = (b.width || 0) * (b.height || 0) || (b.file_size || 0);
      return areaB - areaA;
    });
    const highestRes = sortedPhotos[0];
    telegramFileId = highestRes.file_id;
    fileSize = highestRes.file_size || null;
    documentName = `telegram_photo_${message.message_id || Date.now()}.jpg`;
    documentMimeType = "image/jpeg";
    console.log(`[Telegram Photo] Received photo: id=${telegramFileId}, size=${fileSize}, dims=${highestRes.width}x${highestRes.height}`);
  }
  if (message.document) {
    hasDocument = true;
    documentName = message.document.file_name || "telegram_document";
    telegramFileId = message.document.file_id;
    fileSize = message.document.file_size || null;
    const mime = (message.document.mime_type || "").toLowerCase();
    const docNameLower = documentName.toLowerCase();
    const isPdf = docNameLower.endsWith(".pdf") || mime.includes("pdf");
    const isImage = mime.startsWith("image/") || docNameLower.match(/\.(jpe?g|png|webp|bmp|gif)$/i);
    if (isPdf) {
      documentType = "pdf";
      documentMimeType = "application/pdf";
    } else if (isImage) {
      documentType = "image";
      documentMimeType = mime.startsWith("image/") ? mime : docNameLower.endsWith(".png") ? "image/png" : docNameLower.endsWith(".webp") ? "image/webp" : "image/jpeg";
    } else {
      documentType = "text";
      documentMimeType = mime || "application/octet-stream";
    }
    console.log(`[Telegram Document] Received: name=${documentName}, mime=${mime}, detectedType=${documentType}, size=${fileSize}`);
  }
  if (!rawText.trim() && !hasDocument) {
    return {
      ok: true,
      status: "ignored",
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0
    };
  }
  const timestampStr = new Date(message.date ? message.date * 1e3 : Date.now()).toLocaleTimeString("bn-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit"
  });
  const initialRecord = {
    id: Date.now(),
    messageId,
    chatId,
    senderName,
    senderRole,
    originalSenderName,
    originalSenderRole,
    timestamp: timestampStr,
    rawText: rawText || (documentName ? `[\u09B8\u0982\u09AF\u09C1\u0995\u09CD\u09A4 \u09AB\u09BE\u0987\u09B2: ${documentName}]` : ""),
    hasDocument,
    documentType,
    documentName,
    mimeType: documentMimeType,
    fileSize,
    telegramFileId,
    caption: rawCaption || null,
    processingStatus: "processing",
    extractionStatus: "pending",
    status: "Processing",
    extractedEventIds: [],
    confidence: 0,
    receivedAt: (/* @__PURE__ */ new Date()).toISOString(),
    processedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await saveTelegramMessageToFirestore(initialRecord);
  if (hasDocument && telegramFileId && botToken) {
    const download = await downloadTelegramFile(botToken, telegramFileId, documentName || void 0);
    if (!download) {
      console.error(`[Telegram PDF] Download failed: filename=${documentName}`);
      const downloadFailedRecord = {
        ...initialRecord,
        status: "Download Failed",
        processingStatus: "download_failed",
        extractionStatus: "failed",
        processedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await saveTelegramMessageToFirestore(downloadFailedRecord);
      return {
        ok: false,
        status: "error",
        chatId,
        messageId,
        eventsCount: 0,
        reviewRequiredCount: 0,
        error: "Failed to download Telegram document binary"
      };
    }
    documentBase64 = download.base64;
    documentMimeType = download.mimeType;
  }
  try {
    if (hasDocument && documentType === "pdf") {
      console.log(`[Telegram PDF] Gemini document processing started: filename=${documentName}`);
    }
    const extraction = await extractEventsWithGemini({
      rawText,
      documentBase64,
      documentMimeType,
      sourceFileName: documentName || void 0,
      telegramTimestamp: message.date ? new Date(message.date * 1e3).toISOString() : void 0
    });
    const events = extraction.events;
    const createdEventIds = [];
    if (hasDocument && documentType === "pdf") {
      console.log(`[Telegram PDF] Gemini extraction completed: ${events.length} event(s) parsed`);
      console.log(`[Telegram PDF] Schedule candidate=${events.length > 0}`);
    }
    for (const ev of events) {
      const hasValidDate = Boolean(ev.date);
      const hasValidStartTime = Boolean(ev.startTime);
      const isMissingMandatory = !hasValidDate || !hasValidStartTime;
      const isLowConfidence = typeof ev.confidence !== "number" || ev.confidence < 0.9;
      const hasAmbiguities = ev.ambiguities && ev.ambiguities.length > 0;
      const reviewStatus = isMissingMandatory || isLowConfidence || hasAmbiguities ? "needs_review" : "auto_approved";
      const eventId = `evt-tg-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
      createdEventIds.push(eventId);
      const reminders = !isMissingMandatory && reviewStatus === "auto_approved" ? [
        {
          id: `rem-${Date.now()}-120`,
          eventId,
          reminderType: "notification",
          minutesBefore: 120,
          scheduledAt: "",
          enabled: true
        },
        {
          id: `rem-${Date.now()}-30`,
          eventId,
          reminderType: "notification",
          minutesBefore: 30,
          scheduledAt: "",
          enabled: true
        }
      ] : [];
      const eventEntity = {
        id: eventId,
        title: ev.title || "\u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8",
        description: ev.description || rawText,
        eventDate: ev.date || null,
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        venue: ev.venue || null,
        category: ev.category || "\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF",
        priority: ev.priority || "normal",
        source: "Telegram",
        audience: "official",
        telegramMessageId: messageId,
        telegramChatId: chatId,
        sender: "TelegramBot",
        originalText: rawText || (documentName ? `[\u09AB\u09BE\u0987\u09B2: ${documentName}]` : ""),
        confidence: typeof ev.confidence === "number" ? ev.confidence : 0.85,
        reviewStatus,
        syncStatus: "pending",
        ambiguities: Array.isArray(ev.ambiguities) ? ev.ambiguities : [],
        reminders,
        organizer: ev.organizer || null,
        committee: ev.committee || null,
        participants: ev.participants || null,
        notes: ev.instructions || ev.agenda || null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await saveExtractedEventToFirestore(eventEntity);
    }
    const reviewRequiredCount = events.filter(
      (e) => !e.date || !e.startTime || typeof e.confidence !== "number" || e.confidence < 0.9 || e.ambiguities && e.ambiguities.length > 0
    ).length;
    let statusLabel = "Not a Schedule";
    let extractionStatus = "not_a_schedule";
    let finalConfidence = 0.95;
    if (!extraction.isEventRelated || events.length === 0) {
      statusLabel = "Not a Schedule";
      extractionStatus = "not_a_schedule";
      finalConfidence = 0.95;
    } else if (reviewRequiredCount > 0) {
      statusLabel = "Needs Review";
      extractionStatus = "needs_review";
      finalConfidence = events[0].confidence;
    } else {
      statusLabel = "Schedule Created";
      extractionStatus = "schedule_candidate";
      finalConfidence = events[0].confidence;
    }
    const completedRecord = {
      ...initialRecord,
      status: statusLabel,
      processingStatus: "processed",
      extractionStatus,
      extractedEventIds: createdEventIds,
      confidence: finalConfidence,
      processedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveTelegramMessageToFirestore(completedRecord);
    if (hasDocument && documentType === "pdf") {
      console.log(`[Telegram PDF] Firestore updated for ${chatId}_${messageId}`);
    }
    return {
      ok: true,
      status: "processed",
      chatId,
      messageId,
      eventsCount: events.length,
      events,
      reviewRequiredCount
    };
  } catch (err) {
    console.error(`[Telegram PDF] Gemini document processing failed:`, err?.message || err);
    const failedRecord = {
      ...initialRecord,
      status: "Gemini Processing Failed",
      processingStatus: "gemini_failed",
      extractionStatus: "failed",
      extractedEventIds: [],
      confidence: 0,
      processedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveTelegramMessageToFirestore(failedRecord);
    return {
      ok: false,
      status: "error",
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0,
      error: err?.message || "Gemini processing failed"
    };
  }
}
async function reprocessTelegramMessage(params) {
  const { chatId, messageId } = params;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const msg = await getTelegramMessageByIdFromFirestore(chatId, messageId);
  if (!msg) {
    throw new Error(`Telegram message ${chatId}_${messageId} not found`);
  }
  const fileId = params.telegramFileId || msg.telegramFileId;
  const isDocument = Boolean(msg.hasDocument || fileId);
  const fileName = msg.documentName || (msg.documentType === "image" ? "telegram_photo.jpg" : "telegram_document.pdf");
  console.log(`[Telegram Reprocess] Starting reprocess for ${chatId}_${messageId} (isDoc: ${isDocument}, type: ${msg.documentType}, fileId: ${fileId})`);
  let documentBase64 = void 0;
  let documentMimeType = msg.mimeType || (msg.documentType === "image" ? "image/jpeg" : "application/pdf");
  if (isDocument && fileId && botToken) {
    console.log(`[Telegram Reprocess] Downloading file for reprocessing: fileId=${fileId}, hint=${fileName}`);
    const download = await downloadTelegramFile(botToken, fileId, fileName);
    if (!download) {
      console.error(`[Telegram Reprocess] Reprocess download failed for fileId=${fileId}`);
      await saveTelegramMessageToFirestore({
        ...msg,
        status: "Download Failed",
        processingStatus: "download_failed",
        confidence: 0,
        processedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      return { ok: false, message: msg, events: [], error: "Could not download original document/photo from Telegram" };
    }
    documentBase64 = download.base64;
    documentMimeType = download.mimeType;
  }
  await saveTelegramMessageToFirestore({
    ...msg,
    status: "Processing",
    processingStatus: "processing",
    processedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  try {
    if (documentBase64) {
      console.log(`[Telegram PDF] Gemini document processing started (Reprocess): filename=${fileName}`);
    }
    const extraction = await extractEventsWithGemini({
      rawText: msg.caption || msg.rawText || "",
      documentBase64,
      documentMimeType,
      sourceFileName: fileName
    });
    const events = extraction.events;
    const createdEventIds = [];
    const savedEventEntities = [];
    for (const ev of events) {
      const hasValidDate = Boolean(ev.date);
      const hasValidStartTime = Boolean(ev.startTime);
      const isMissingMandatory = !hasValidDate || !hasValidStartTime;
      const isLowConfidence = typeof ev.confidence !== "number" || ev.confidence < 0.9;
      const hasAmbiguities = ev.ambiguities && ev.ambiguities.length > 0;
      const reviewStatus = isMissingMandatory || isLowConfidence || hasAmbiguities ? "needs_review" : "auto_approved";
      const eventId = `evt-tg-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
      createdEventIds.push(eventId);
      const eventEntity = {
        id: eventId,
        title: ev.title || "\u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8",
        description: ev.description || msg.rawText,
        eventDate: ev.date || null,
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        venue: ev.venue || null,
        category: ev.category || "\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF",
        priority: ev.priority || "normal",
        source: "Telegram",
        audience: "official",
        telegramMessageId: messageId,
        telegramChatId: chatId,
        sender: "TelegramBot",
        originalText: msg.rawText,
        confidence: typeof ev.confidence === "number" ? ev.confidence : 0.85,
        reviewStatus,
        syncStatus: "pending",
        ambiguities: Array.isArray(ev.ambiguities) ? ev.ambiguities : [],
        reminders: [],
        organizer: ev.organizer || null,
        committee: ev.committee || null,
        participants: ev.participants || null,
        notes: ev.instructions || ev.agenda || null,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await saveExtractedEventToFirestore(eventEntity);
      savedEventEntities.push(eventEntity);
    }
    const reviewRequiredCount = events.filter(
      (e) => !e.date || !e.startTime || typeof e.confidence !== "number" || e.confidence < 0.9 || e.ambiguities && e.ambiguities.length > 0
    ).length;
    let statusLabel = "Not a Schedule";
    let extractionStatus = "not_a_schedule";
    let finalConfidence = 0.95;
    if (!extraction.isEventRelated || events.length === 0) {
      statusLabel = "Not a Schedule";
      extractionStatus = "not_a_schedule";
      finalConfidence = 0.95;
    } else if (reviewRequiredCount > 0) {
      statusLabel = "Needs Review";
      extractionStatus = "needs_review";
      finalConfidence = events[0].confidence;
    } else {
      statusLabel = "Schedule Created";
      extractionStatus = "schedule_candidate";
      finalConfidence = events[0].confidence;
    }
    const updatedRecord = {
      ...msg,
      senderName: "TelegramBot",
      senderRole: "Telegram",
      status: statusLabel,
      processingStatus: "processed",
      extractionStatus,
      extractedEventIds: createdEventIds,
      confidence: finalConfidence,
      processedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveTelegramMessageToFirestore(updatedRecord);
    console.log(`[Telegram PDF] Reprocess complete for ${chatId}_${messageId} (status: ${statusLabel}, events: ${createdEventIds.length})`);
    return {
      ok: true,
      message: updatedRecord,
      events: savedEventEntities
    };
  } catch (err) {
    console.error(`[Telegram Reprocess] Error:`, err?.message || err);
    const failedRecord = {
      ...msg,
      status: "Gemini Processing Failed",
      processingStatus: "gemini_failed",
      extractionStatus: "failed",
      confidence: 0,
      processedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveTelegramMessageToFirestore(failedRecord);
    return { ok: false, message: failedRecord, events: [], error: err?.message || "Reprocessing failed" };
  }
}
async function setupTelegramWebhookUrl(appUrl, secretToken) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { success: false, error: "TELEGRAM_BOT_TOKEN is not configured." };
  }
  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  const secret = secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;
  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const payload = {
      url: webhookUrl,
      drop_pending_updates: false,
      allowed_updates: ["message", "channel_post", "edited_message"]
    };
    if (secret) {
      payload.secret_token = secret;
    }
    const res = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return { success: data.ok, result: data };
  } catch (err) {
    return { success: false, error: err?.message || "Failed to call Telegram API" };
  }
}

// src/server/reminderScheduler.ts
var schedulerStatus = {
  isRunning: false,
  lastTickAt: null,
  lastBriefingDateSent: null,
  totalNotificationsSent: 0,
  totalErrors: 0
};
var schedulerInterval = null;
var isTickProcessing = false;
function getSchedulerStatus() {
  return { ...schedulerStatus };
}
function getDhakaTimeParts() {
  const now = /* @__PURE__ */ new Date();
  const dhakaDateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
  const dhakaTimeStr = now.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return { now, dhakaDateStr, dhakaTimeStr };
}
function getEventTimestampMs(eventDate, startTime) {
  try {
    const isoString = `${eventDate}T${startTime}:00+06:00`;
    const ms = new Date(isoString).getTime();
    return isNaN(ms) ? null : ms;
  } catch {
    return null;
  }
}
async function sendFcmPushNotification(params) {
  const { device, title, body, deliveryId, type, eventId, eventDate, startTime, venue, url } = params;
  const alreadyDelivered = await hasNotificationBeenDelivered(deliveryId);
  if (alreadyDelivered) {
    return false;
  }
  const payloadData = {
    deliveryId,
    reminderType: type,
    eventId: eventId || "",
    eventDate: eventDate || "",
    startTime: startTime || "",
    venue: venue || "",
    title,
    body,
    url: url || "/",
    click_action: url || "/"
  };
  try {
    const message = {
      token: device.fcmToken,
      notification: {
        title,
        body
      },
      data: payloadData,
      webpush: {
        headers: {
          Urgency: "high"
        },
        notification: {
          title,
          body,
          icon: "/pwa-192x192.png",
          badge: "/icon.svg",
          tag: deliveryId,
          requireInteraction: true,
          data: payloadData
        },
        fcmOptions: {
          link: url || "/"
        }
      }
    };
    await adminMessaging.send(message);
    await logNotificationDelivery({
      deliveryId,
      eventId,
      deviceId: device.deviceId,
      userId: device.userId,
      fcmToken: device.fcmToken,
      type,
      title,
      body,
      status: "sent",
      deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    schedulerStatus.totalNotificationsSent++;
    console.log(`[FCM] Notification sent successfully: "${title}" -> ${device.deviceId.slice(0, 8)}...`);
    return true;
  } catch (err) {
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
      status: "failed",
      error: err?.message || "Unknown FCM error",
      deliveredAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return false;
  }
}
async function processUpcomingEventReminders(devices) {
  if (devices.length === 0) return;
  const { now, dhakaDateStr } = getDhakaTimeParts();
  const nowMs = now.getTime();
  let defaultReminder2h = true;
  let defaultReminder30m = true;
  try {
    const prefDoc = await adminDb.collection("settings").doc("reminder_preferences").get();
    if (prefDoc.exists) {
      const prefData = prefDoc.data();
      if (typeof prefData?.defaultReminder2h === "boolean") defaultReminder2h = prefData.defaultReminder2h;
      if (typeof prefData?.defaultReminder30m === "boolean") defaultReminder30m = prefData.defaultReminder30m;
    }
  } catch (err) {
  }
  try {
    const eventsSnapshot = await adminDb.collection("events").where("reviewStatus", "==", "auto_approved").where("eventDate", ">=", dhakaDateStr).get();
    if (eventsSnapshot.empty) return;
    for (const docSnap of eventsSnapshot.docs) {
      const event = docSnap.data();
      if (!event.startTime || event.isCompleted) continue;
      const eventTimeMs = getEventTimestampMs(event.eventDate, event.startTime);
      if (!eventTimeMs) continue;
      const diffMinutes = Math.round((eventTimeMs - nowMs) / (60 * 1e3));
      const baseOffsets = [];
      if (defaultReminder2h) baseOffsets.push(120);
      if (defaultReminder30m) baseOffsets.push(30);
      const customOffsets = Array.isArray(event.reminders) ? event.reminders.filter((r) => r.enabled).map((r) => Number(r.minutesBefore)) : [];
      const targetOffsets = Array.from(/* @__PURE__ */ new Set([...baseOffsets, ...customOffsets]));
      const targetDevices = devices.filter((device) => {
        if (event.ownerUserId) {
          return device.userId === event.ownerUserId;
        }
        if (event.audience === "personal") {
          return Boolean(event.ownerUserId && device.userId === event.ownerUserId);
        }
        return true;
      });
      if (targetDevices.length === 0) continue;
      for (const offset of targetOffsets) {
        const lowerBound = offset - 3;
        const upperBound = offset + 3;
        if (diffMinutes >= lowerBound && diffMinutes <= upperBound) {
          const offsetLabel = offset === 120 ? "\u09E8 \u0998\u09A3\u09CD\u099F\u09BE" : offset === 30 ? "\u09E9\u09E6 \u09AE\u09BF\u09A8\u09BF\u099F" : offset >= 60 ? `${Math.round(offset / 60)} \u0998\u09A3\u09CD\u099F\u09BE` : `${offset} \u09AE\u09BF\u09A8\u09BF\u099F`;
          const title = `\u23F0 ${offsetLabel} \u09AA\u09B0 \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF: ${event.title}`;
          const venueText = event.venue && event.venue.trim() ? ` | \u09AD\u09C7\u09A8\u09CD\u09AF\u09C1: ${event.venue.trim()}` : "";
          const body = `\u09B8\u09AE\u09DF: ${event.startTime}${venueText}
\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C`;
          for (const device of targetDevices) {
            const deliveryId = `${event.id}_${device.deviceId}_${offset}`;
            const type = offset === 120 ? "reminder_120m" : offset === 30 ? "reminder_30m" : "reminder_custom";
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
              url: `/?eventId=${event.id}`
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Scheduler] Error checking event reminders:", err);
  }
}
async function processDailyMorningBriefing(devices, forceRun = false) {
  if (devices.length === 0) return;
  const { dhakaDateStr, dhakaTimeStr } = getDhakaTimeParts();
  let targetBriefingTime = "07:30";
  let isBriefingEnabled = true;
  let notifyWhenNoEventsToday = false;
  try {
    const settingDoc = await adminDb.collection("settings").doc("reminder_preferences").get();
    if (settingDoc.exists) {
      const data = settingDoc.data();
      if (data?.dailyBriefingTime) targetBriefingTime = data.dailyBriefingTime;
      if (typeof data?.dailyBriefingEnabled === "boolean") isBriefingEnabled = data.dailyBriefingEnabled;
      if (typeof data?.notifyWhenNoEventsToday === "boolean") notifyWhenNoEventsToday = data.notifyWhenNoEventsToday;
    }
  } catch (err) {
  }
  if (!isBriefingEnabled && !forceRun) return;
  if (!forceRun) {
    const isTimeForBriefing = dhakaTimeStr >= targetBriefingTime && dhakaTimeStr <= addMinutesToTimeStr(targetBriefingTime, 5);
    if (!isTimeForBriefing) return;
  }
  try {
    const todayEventsSnapshot = await adminDb.collection("events").where("reviewStatus", "==", "auto_approved").where("eventDate", "==", dhakaDateStr).get();
    const allTodayEvents = [];
    todayEventsSnapshot.forEach((doc) => allTodayEvents.push(doc.data()));
    allTodayEvents.sort((a, b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
    for (const device of devices) {
      const userTodayEvents = allTodayEvents.filter((ev) => {
        if (ev.ownerUserId) {
          return device.userId === ev.ownerUserId;
        }
        if (ev.audience === "personal") {
          return Boolean(ev.ownerUserId && device.userId === ev.ownerUserId);
        }
        return true;
      });
      const eventCount = userTodayEvents.length;
      if (eventCount === 0 && !notifyWhenNoEventsToday) {
        continue;
      }
      const deliveryId = `briefing_${device.deviceId}_${dhakaDateStr}`;
      const title = `\u{1F305} JpMC Synapse \u2014 \u0986\u099C\u0995\u09C7\u09B0 \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF (${dhakaDateStr})`;
      let body = `\u09B6\u09C1\u09AD \u09B8\u0995\u09BE\u09B2\u0964 \u0986\u099C \u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C\u09C7 \u09AE\u09CB\u099F ${eventCount}\u099F\u09BF \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09BF\u09A4 \u09B0\u09DF\u09C7\u099B\u09C7\u0964`;
      if (eventCount === 0) {
        body = `\u09B6\u09C1\u09AD \u09B8\u0995\u09BE\u09B2\u0964 \u0986\u099C \u0995\u09CB\u09A8\u09CB \u0986\u09A8\u09C1\u09B7\u09CD\u09A0\u09BE\u09A8\u09BF\u0995 \u09B8\u09AD\u09BE \u09AC\u09BE \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09BF\u09A4 \u09A8\u09C7\u0987\u0964`;
      } else {
        const firstEvent = userTodayEvents[0];
        const secondEvent = userTodayEvents.length > 1 ? userTodayEvents[1] : null;
        const lines = [`\u0986\u099C \u0986\u09AA\u09A8\u09BE\u09B0 ${eventCount}\u099F\u09BF \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF \u09B0\u09DF\u09C7\u099B\u09C7:`];
        lines.push(`\u2022 ${firstEvent.startTime} \u2014 ${firstEvent.title}`);
        if (secondEvent) {
          lines.push(`\u2022 ${secondEvent.startTime} \u2014 ${secondEvent.title}`);
        }
        if (eventCount > 2) {
          lines.push(`\u098F\u09AC\u0982 \u0986\u09B0\u0993 ${eventCount - 2}\u099F\u09BF \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF \u09B0\u09DF\u09C7\u099B\u09C7\u0964`);
        }
        body = lines.join("\n");
      }
      await sendFcmPushNotification({
        device,
        title,
        body,
        deliveryId,
        type: "morning_briefing",
        eventDate: dhakaDateStr,
        url: "/?tab=home"
      });
    }
    schedulerStatus.lastBriefingDateSent = dhakaDateStr;
  } catch (err) {
    console.error("[Scheduler] Error in morning briefing dispatch:", err);
  }
}
function addMinutesToTimeStr(timeStr, minutesToAdd) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutesToAdd;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}
async function runSchedulerTick() {
  if (isTickProcessing) return;
  isTickProcessing = true;
  try {
    const devices = await getActiveDevices();
    schedulerStatus.lastTickAt = (/* @__PURE__ */ new Date()).toISOString();
    if (devices.length > 0) {
      await processUpcomingEventReminders(devices);
      await processDailyMorningBriefing(devices);
    }
  } catch (err) {
    console.error("[Scheduler] Tick error:", err);
  } finally {
    isTickProcessing = false;
  }
}
function startReminderScheduler(intervalMs = 60 * 1e3) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  schedulerStatus.isRunning = true;
  console.log(`[Scheduler] Reminder & Morning Briefing Scheduler started (Interval: ${intervalMs / 1e3}s, Timezone: Asia/Dhaka)`);
  runSchedulerTick().catch((err) => console.warn("[Scheduler] Initial tick warning:", err));
  schedulerInterval = setInterval(() => {
    runSchedulerTick().catch((err) => console.warn("[Scheduler] Tick interval warning:", err));
  }, intervalMs);
}

// src/server/announcementAdmin.ts
var import_firestore2 = require("firebase-admin/firestore");
function toTimestamp(val) {
  if (!val) return import_firestore2.Timestamp.now();
  if (val instanceof import_firestore2.Timestamp) return val;
  if (typeof val?.toDate === "function") return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? import_firestore2.Timestamp.now() : import_firestore2.Timestamp.fromDate(d);
}
function serializeAnnouncement(doc) {
  const data = doc.data() || {};
  const startAt = data.startAt?.toDate ? data.startAt.toDate().toISOString() : data.startAt || (/* @__PURE__ */ new Date()).toISOString();
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : data.expiresAt || new Date(Date.now() + 7 * 864e5).toISOString();
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || (/* @__PURE__ */ new Date()).toISOString();
  const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || (/* @__PURE__ */ new Date()).toISOString();
  const pushSentAt = data.pushSentAt?.toDate ? data.pushSentAt.toDate().toISOString() : data.pushSentAt || null;
  return {
    id: doc.id,
    title: data.title || "",
    message: data.message || "",
    priority: data.priority || "normal",
    displayMode: data.displayMode || "show_once",
    targetAudience: data.targetAudience || "everyone",
    active: data.active !== false,
    status: data.status || "draft",
    startAt,
    expiresAt,
    sendPush: Boolean(data.sendPush),
    pushSentAt,
    createdBy: data.createdBy || "",
    createdAt,
    updatedAt
  };
}
async function createAnnouncementInFirestore(data, adminUid) {
  const docRef = adminDb.collection("announcements").doc();
  const nowTs = import_firestore2.FieldValue.serverTimestamp();
  const startTimestamp = toTimestamp(data.startAt);
  const expiresTimestamp = toTimestamp(data.expiresAt || new Date(Date.now() + 7 * 864e5));
  const docData = removeUndefinedFields({
    title: data.title.trim(),
    message: data.message.trim(),
    priority: data.priority || "normal",
    displayMode: data.displayMode || "show_once",
    targetAudience: data.targetAudience || "everyone",
    active: data.active !== false,
    status: data.status || "draft",
    startAt: startTimestamp,
    expiresAt: expiresTimestamp,
    sendPush: Boolean(data.sendPush),
    pushSentAt: null,
    createdBy: adminUid,
    createdAt: nowTs,
    updatedAt: nowTs
  });
  await docRef.set(docData);
  const createdSnap = await docRef.get();
  return serializeAnnouncement(createdSnap);
}
async function updateAnnouncementInFirestore(id, data) {
  const docRef = adminDb.collection("announcements").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const updatePayload = {
    updatedAt: import_firestore2.FieldValue.serverTimestamp()
  };
  if (data.title !== void 0) updatePayload.title = data.title.trim();
  if (data.message !== void 0) updatePayload.message = data.message.trim();
  if (data.priority !== void 0) updatePayload.priority = data.priority;
  if (data.displayMode !== void 0) updatePayload.displayMode = data.displayMode;
  if (data.targetAudience !== void 0) updatePayload.targetAudience = data.targetAudience;
  if (data.active !== void 0) updatePayload.active = data.active;
  if (data.status !== void 0) updatePayload.status = data.status;
  if (data.startAt !== void 0) updatePayload.startAt = toTimestamp(data.startAt);
  if (data.expiresAt !== void 0) updatePayload.expiresAt = toTimestamp(data.expiresAt);
  if (data.sendPush !== void 0) updatePayload.sendPush = Boolean(data.sendPush);
  await docRef.update(removeUndefinedFields(updatePayload));
  const updatedSnap = await docRef.get();
  return serializeAnnouncement(updatedSnap);
}
async function deleteAnnouncementFromFirestore(id) {
  try {
    await adminDb.collection("announcements").doc(id).delete();
    return true;
  } catch (err) {
    console.error("[Announcements] Failed to delete announcement:", err);
    return false;
  }
}
async function getAllAnnouncementsForAdmin() {
  try {
    let snapshot;
    try {
      snapshot = await adminDb.collection("announcements").orderBy("createdAt", "desc").get();
    } catch {
      snapshot = await adminDb.collection("announcements").get();
    }
    const list = [];
    snapshot.forEach((doc) => {
      list.push(serializeAnnouncement(doc));
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (err) {
    console.warn("[Announcements] Error querying announcements for admin:", err);
    return [];
  }
}
async function getActiveAnnouncementsForUser(userUid, userRole) {
  try {
    const snapshot = await adminDb.collection("announcements").where("active", "==", true).where("status", "==", "published").get();
    const now = Date.now();
    const candidateList = [];
    for (const doc of snapshot.docs) {
      const ann = serializeAnnouncement(doc);
      const startMs = new Date(ann.startAt).getTime();
      const expiresMs = new Date(ann.expiresAt).getTime();
      if (now < startMs || now >= expiresMs) {
        continue;
      }
      if (ann.targetAudience === "admins_only" && userRole !== "admin") {
        continue;
      }
      if (ann.targetAudience === "users_only" && userRole !== "user") {
        continue;
      }
      candidateList.push(ann);
    }
    const priorityWeight = {
      urgent: 1,
      important: 2,
      normal: 3
    };
    candidateList.sort((a, b) => {
      const wA = priorityWeight[a.priority] || 3;
      const wB = priorityWeight[b.priority] || 3;
      if (wA !== wB) return wA - wB;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });
    return candidateList;
  } catch (err) {
    console.warn("[Announcements] Error querying active announcements for user:", err);
    return [];
  }
}
async function getAnnouncementReceipt(announcementId, uid) {
  const docId = `${announcementId}_${uid}`;
  const snap = await adminDb.collection("announcementReceipts").doc(docId).get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    announcementId,
    uid,
    seenAt: data.seenAt?.toDate ? data.seenAt.toDate().toISOString() : data.seenAt,
    acknowledgedAt: data.acknowledgedAt?.toDate ? data.acknowledgedAt.toDate().toISOString() : data.acknowledgedAt
  };
}
async function recordUserSeenAnnouncement(announcementId, uid) {
  const docId = `${announcementId}_${uid}`;
  await adminDb.collection("announcementReceipts").doc(docId).set(
    {
      announcementId,
      uid,
      seenAt: import_firestore2.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}
async function recordUserAcknowledgedAnnouncement(announcementId, uid) {
  const docId = `${announcementId}_${uid}`;
  await adminDb.collection("announcementReceipts").doc(docId).set(
    {
      announcementId,
      uid,
      seenAt: import_firestore2.FieldValue.serverTimestamp(),
      acknowledgedAt: import_firestore2.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}
async function sendAnnouncementPushBroadcast(announcementId, force = false) {
  const docRef = adminDb.collection("announcements").doc(announcementId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { success: false, deviceCount: 0, message: "Announcement not found." };
  }
  const announcement = serializeAnnouncement(snap);
  if (!force && announcement.pushSentAt) {
    return {
      success: false,
      deviceCount: 0,
      message: "Push notification has already been broadcast for this announcement."
    };
  }
  const allDevices = await getActiveDevices();
  let targetDevices = allDevices;
  if (announcement.targetAudience === "admins_only" || announcement.targetAudience === "users_only") {
    const adminUids = /* @__PURE__ */ new Set();
    try {
      const authUsersSnap = await adminDb.collection("authorizedUsers").where("role", "==", "admin").get();
      authUsersSnap.forEach((d) => adminUids.add(d.id));
    } catch (err) {
      console.warn("[Announcements] Failed to fetch admin UIDs for push targeting:", err);
    }
    if (announcement.targetAudience === "admins_only") {
      targetDevices = allDevices.filter((d) => d.userId && adminUids.has(d.userId));
    } else if (announcement.targetAudience === "users_only") {
      targetDevices = allDevices.filter((d) => !d.userId || !adminUids.has(d.userId));
    }
  }
  let sentCount = 0;
  for (const device of targetDevices) {
    const deliveryId = `announcement_${announcement.id}_${device.deviceId}`;
    const truncatedBody = announcement.message.length > 140 ? announcement.message.slice(0, 137) + "..." : announcement.message;
    const sent = await sendFcmPushNotification({
      device,
      title: announcement.title || "\u099C\u09B0\u09C1\u09B0\u09BF \u09AC\u09BF\u099C\u09CD\u099E\u09AA\u09CD\u09A4\u09BF",
      body: truncatedBody,
      deliveryId,
      type: "announcement",
      url: `/?announcementId=${announcement.id}`
    });
    if (sent) sentCount++;
  }
  await docRef.update({
    pushSentAt: import_firestore2.FieldValue.serverTimestamp(),
    updatedAt: import_firestore2.FieldValue.serverTimestamp()
  });
  return { success: true, deviceCount: sentCount };
}

// server.ts
var PORT = 3e3;
function getPublicAppUrl(req) {
  const configured = process.env.PUBLIC_APP_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured.replace(/\/$/, "");
  }
  if (req) {
    const rawHost = req.headers["x-forwarded-host"] || req.headers["host"];
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost?.split(",")[0]?.trim();
    if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
      const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol || "https";
      return `${proto}://${host}`;
    }
  }
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    return "https://jpmc-synapse.onrender.com";
  }
  return "https://jpmc-synapse.onrender.com";
}
async function validateSchedulerAuth(req, res, next) {
  const schedulerSecret = process.env.SCHEDULER_SECRET;
  const authHeader = req.headers["authorization"];
  const headerSecret = req.headers["x-scheduler-secret"];
  let bearerToken;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    bearerToken = authHeader.substring(7).trim();
  }
  if (schedulerSecret) {
    if (bearerToken === schedulerSecret || headerSecret === schedulerSecret) {
      return next();
    }
    return res.status(401).json({
      error: "Unauthorized: Invalid or missing scheduler authentication secret."
    });
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn("[Scheduler Auth] Notice: SCHEDULER_SECRET not set in development. Request allowed.");
    return next();
  }
  return res.status(401).json({
    error: "Unauthorized: SCHEDULER_SECRET must be configured in production."
  });
}
async function requireAdminAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const adminSecret = process.env.ADMIN_SECRET;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }
  if (adminSecret && token === adminSecret) {
    req.user = { uid: "system_admin", role: "admin", active: true };
    return next();
  }
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Authentication token required." });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    let authInfo = await getUserRoleAndActive(decoded.uid);
    if (!authInfo) {
      const email = (decoded.email || "").trim().toLowerCase();
      if (email && INITIAL_ADMIN_EMAILS[email]) {
        await ensureUserAuthorization({
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture
        });
        authInfo = { role: "admin", active: true };
      }
    }
    if (!authInfo || !authInfo.active) {
      return res.status(403).json({ error: "Forbidden: Inactive or unauthorized account." });
    }
    if (authInfo.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Administrator privileges required." });
    }
    req.user = {
      ...decoded,
      role: authInfo.role,
      active: authInfo.active
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }
}
async function validateActiveUserAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const adminSecret = process.env.ADMIN_SECRET || process.env.SCHEDULER_SECRET;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }
  if (adminSecret && token === adminSecret) {
    return next();
  }
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token required." });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    let authInfo = await getUserRoleAndActive(decoded.uid);
    if (!authInfo) {
      await ensureUserAuthorization({
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture
      });
      authInfo = { role: "user", active: true };
    }
    if (!authInfo.active) {
      return res.status(403).json({ error: "Forbidden: Account is deactivated." });
    }
    req.user = {
      ...decoded,
      role: authInfo.role,
      active: authInfo.active
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }
}
async function startServer() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json({ limit: "25mb" }));
  app.use(import_express.default.urlencoded({ extended: true, limit: "25mb" }));
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Telegram-Bot-Api-Secret-Token, X-Scheduler-Secret"
    );
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
  app.get("/api/health", (req, res) => {
    const { dhakaDateStr, dhakaTimeStr } = getDhakaTimeParts();
    res.json({
      status: "ok",
      service: "JpMC Synapse Server",
      timezone: "Asia/Dhaka (UTC+6)",
      currentDhakaDate: dhakaDateStr,
      currentDhakaTime: dhakaTimeStr,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      telegramBotConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      schedulerRunning: getSchedulerStatus().isRunning,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/extract-events", async (req, res) => {
    try {
      const {
        rawText,
        documentBase64,
        documentMimeType,
        telegramTimestamp,
        timezone
      } = req.body;
      if (!rawText && !documentBase64) {
        return res.status(400).json({
          error: "Either rawText or documentBase64 must be provided."
        });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: "GEMINI_API_KEY is not configured in server environment."
        });
      }
      const result = await extractEventsWithGemini({
        rawText,
        documentBase64,
        documentMimeType,
        telegramTimestamp,
        timezone
      });
      return res.json(result);
    } catch (error) {
      console.error("[API /api/extract-events] Error:", error);
      return res.status(500).json({
        error: error?.message || "Failed to extract events with Gemini."
      });
    }
  });
  const telegramWebhookPaths = ["/api/telegram/webhook", "/api/telegram/webhook/"];
  app.get(telegramWebhookPaths, (req, res) => {
    return res.status(200).json({
      ok: true,
      service: "JpMC Synapse Telegram Webhook Endpoint",
      status: "active",
      method: "POST expected for Telegram updates",
      secretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
    });
  });
  app.post(telegramWebhookPaths, (req, res) => {
    const updateId = req.body?.update_id;
    const msg = req.body?.message || req.body?.channel_post || req.body?.edited_message;
    const chatId = msg?.chat?.id;
    const messageId = msg?.message_id;
    console.log(
      `[Telegram Webhook] Received update ${updateId ?? "unknown"} (chat: ${chatId ?? "N/A"}, messageId: ${messageId ?? "N/A"})`
    );
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const secretHeader = req.headers["x-telegram-bot-api-secret-token"] || req.get("x-telegram-bot-api-secret-token");
    if (expectedSecret) {
      if (!secretHeader || secretHeader !== expectedSecret) {
        console.warn("[Telegram Webhook] Authentication rejected: Invalid or missing secret token.");
        return res.status(403).json({
          ok: false,
          error: "Forbidden: Invalid secret token"
        });
      }
    }
    res.status(200).json({ ok: true });
    processTelegramWebhookUpdate(req.body).catch((err) => {
      console.error("[Telegram Webhook] Processing error:", err?.message || err);
    });
  });
  app.get("/api/telegram/status", async (req, res) => {
    const isBotConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    const publicUrl = getPublicAppUrl(req);
    const messages = await getTelegramMessagesFromFirestore(20);
    res.json({
      configured: isBotConfigured,
      webhookUrl: `${publicUrl}/api/telegram/webhook`,
      status: isBotConfigured ? "active" : "pending_configuration",
      processedCount: messages.length,
      totalMessagesReceived: messages.length,
      botTokenSet: isBotConfigured,
      lastReceived: messages.length > 0 ? messages[0].timestamp : null,
      secretTokenConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET)
    });
  });
  app.post("/api/telegram/setup-webhook", requireAdminAuth, async (req, res) => {
    const appUrl = req.body?.appUrl || getPublicAppUrl(req);
    const secret = req.body?.secret || process.env.TELEGRAM_WEBHOOK_SECRET;
    const result = await setupTelegramWebhookUrl(appUrl, secret);
    res.json(result);
  });
  app.get("/api/telegram/messages", async (req, res) => {
    const messages = await getTelegramMessagesFromFirestore(50);
    res.json({ messages });
  });
  app.post("/api/telegram/reprocess", requireAdminAuth, async (req, res) => {
    try {
      const { chatId, messageId, telegramFileId } = req.body || {};
      if (!chatId || messageId === void 0) {
        return res.status(400).json({ error: "chatId and messageId are required" });
      }
      const result = await reprocessTelegramMessage({
        chatId: String(chatId),
        messageId: Number(messageId),
        telegramFileId: telegramFileId ? String(telegramFileId) : void 0
      });
      return res.json(result);
    } catch (err) {
      console.error("[API /api/telegram/reprocess] Error:", err);
      return res.status(500).json({ error: err?.message || "Failed to reprocess message" });
    }
  });
  app.get("/api/telegram/file-preview/:chatId/:messageId", async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(503).json({ error: "Telegram bot not configured" });
      }
      const msg = await getTelegramMessageByIdFromFirestore(chatId, Number(messageId));
      if (!msg || !msg.telegramFileId) {
        return res.status(404).json({ error: "File not found for this message" });
      }
      const fileData = await downloadTelegramFile(botToken, msg.telegramFileId, msg.documentName || void 0);
      if (!fileData) {
        return res.status(404).json({ error: "Failed to download file from Telegram" });
      }
      res.setHeader("Content-Type", fileData.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", fileData.buffer.length);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(fileData.buffer);
    } catch (err) {
      console.error("[API /api/telegram/file-preview] Error:", err);
      return res.status(500).json({ error: "Failed to serve preview" });
    }
  });
  app.get("/api/events", async (req, res) => {
    try {
      const events = await getEventsFromFirestore(150);
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Failed to query events" });
    }
  });
  app.post("/api/events", requireAdminAuth, async (req, res) => {
    try {
      const eventPayload = req.body?.event || req.body;
      if (!eventPayload || !eventPayload.title) {
        return res.status(400).json({ error: "Valid event payload with title is required" });
      }
      const reqUser = req.user;
      const userIdentifier = reqUser?.email || reqUser?.uid || "admin";
      const mergedPayload = {
        ...eventPayload,
        createdBy: eventPayload.createdBy || userIdentifier
      };
      console.log(`[API /api/events] Persisting canonical event: "${mergedPayload.title}" (source: ${mergedPayload.source || "Manual"}, by: ${userIdentifier})`);
      const savedEvent = await saveCanonicalEventToFirestore(mergedPayload);
      res.json({ success: true, event: savedEvent });
    } catch (err) {
      console.error("[API /api/events] Error persisting event:", err);
      res.status(500).json({ error: err?.message || "Failed to save event to Firestore" });
    }
  });
  app.put("/api/events/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body?.event || req.body;
      if (!updates) {
        return res.status(400).json({ error: "Update payload is required" });
      }
      const merged = { ...updates, id };
      const savedEvent = await saveCanonicalEventToFirestore(merged);
      res.json({ success: true, event: savedEvent });
    } catch (err) {
      console.error(`[API /api/events/${req.params.id}] Error updating event:`, err);
      res.status(500).json({ error: err?.message || "Failed to update event in Firestore" });
    }
  });
  app.delete("/api/events/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await deleteEventFromFirestore(id);
      res.json({ success, id });
    } catch (err) {
      console.error(`[API /api/events/${req.params.id}] Error deleting event:`, err);
      res.status(500).json({ error: err?.message || "Failed to delete event from Firestore" });
    }
  });
  app.post("/api/notifications/register-device", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"];
      let verifiedUid = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        try {
          const decoded = await adminAuth.verifyIdToken(token);
          verifiedUid = decoded.uid;
        } catch {
        }
      }
      const { deviceId, fcmToken, platform, userId, userAgent } = req.body;
      if (!deviceId || !fcmToken) {
        return res.status(400).json({ error: "deviceId and fcmToken are required." });
      }
      const finalUserId = verifiedUid || userId || "guest_user";
      const resolvedPlatform = platform === "pwa" ? "pwa" : "web";
      await registerDeviceInFirestore({
        deviceId,
        fcmToken,
        platform: resolvedPlatform,
        userId: finalUserId,
        userAgent: userAgent || req.headers["user-agent"],
        notificationsEnabled: true,
        active: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      console.log(`[Push] Device registered: ${deviceId.slice(0, 12)}... (platform: ${resolvedPlatform}, user: ${finalUserId})`);
      res.json({ success: true, deviceId, platform: resolvedPlatform });
    } catch (err) {
      console.error("[API /api/notifications/register-device] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to register device" });
    }
  });
  app.post("/api/notifications/test-push", async (req, res) => {
    try {
      const { deviceId, fcmToken } = req.body;
      const targetToken = fcmToken;
      const targetDeviceId = deviceId || `test-${Date.now()}`;
      if (!targetToken) {
        const devices = await getActiveDevices();
        if (devices.length === 0) {
          return res.status(400).json({
            success: false,
            error: "\u0995\u09CB\u09A8\u09CB \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u09A1\u09BF\u09AD\u09BE\u0987\u09B8 \u09AC\u09BE FCM \u099F\u09CB\u0995\u09C7\u09A8 \u09AA\u09BE\u0993\u09DF\u09BE \u09AF\u09BE\u09DF\u09A8\u09BF\u0964 \u0985\u09A8\u09C1\u0997\u09CD\u09B0\u09B9 \u0995\u09B0\u09C7 \u0986\u0997\u09C7 \u09AC\u09BF\u099C\u09CD\u099E\u09AA\u09CD\u09A4\u09BF \u09B8\u0995\u09CD\u09B0\u09BF\u09DF \u0995\u09B0\u09C1\u09A8\u0964"
          });
        }
        const dev = devices[0];
        if (dev.fcmToken && !dev.fcmToken.startsWith("web_push_")) {
          await sendFcmPushNotification({
            device: dev,
            title: "\u{1F514} JpMC Synapse \u2014 \u099F\u09C7\u09B8\u09CD\u099F \u09AC\u09BF\u099C\u09CD\u099E\u09AA\u09CD\u09A4\u09BF",
            body: "\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C \u09B6\u09BF\u09A1\u09BF\u0989\u09B2 \u09B8\u09BF\u09B8\u09CD\u099F\u09C7\u09AE\u09C7\u09B0 \u09AA\u09C1\u09B6 \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u0995\u09BE\u099C \u0995\u09B0\u099B\u09C7\u0964",
            deliveryId: `test_${dev.deviceId}_${Date.now()}`,
            type: "test_push",
            url: "/?tab=home"
          });
        }
        return res.json({
          success: true,
          message: "\u099F\u09C7\u09B8\u09CD\u099F \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u09AA\u09BE\u09A0\u09BE\u09A8\u09CB \u09B9\u09DF\u09C7\u099B\u09C7\u0964"
        });
      }
      if (targetToken.startsWith("web_push_")) {
        return res.json({
          success: true,
          message: "\u0993\u09DF\u09C7\u09AC \u09AA\u09C1\u09B6 \u099F\u09C7\u09B8\u09CD\u099F \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u09AA\u09CD\u09B0\u09B8\u09C7\u09B8 \u09B9\u09DF\u09C7\u099B\u09C7\u0964",
          mode: "web_push"
        });
      }
      const sent = await sendFcmPushNotification({
        device: { deviceId: targetDeviceId, fcmToken: targetToken },
        title: "\u{1F514} JpMC Synapse \u2014 \u099F\u09C7\u09B8\u09CD\u099F \u09AC\u09BF\u099C\u09CD\u099E\u09AA\u09CD\u09A4\u09BF",
        body: "\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C \u09B6\u09BF\u09A1\u09BF\u0989\u09B2 \u09B8\u09BF\u09B8\u09CD\u099F\u09C7\u09AE\u09C7\u09B0 \u09AA\u09C1\u09B6 \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u0995\u09BE\u099C \u0995\u09B0\u099B\u09C7\u0964",
        deliveryId: `test_${targetDeviceId}_${Date.now()}`,
        type: "test_push",
        url: "/?tab=home"
      });
      return res.json({
        success: true,
        message: sent ? "FCM \u099F\u09C7\u09B8\u09CD\u099F \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u09AA\u09BE\u09A0\u09BE\u09A8\u09CB \u09B9\u09DF\u09C7\u099B\u09C7\u0964" : "\u099F\u09C7\u09B8\u09CD\u099F \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09A1\u09BF\u09AD\u09BE\u0987\u09B8\u09C7 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u09AA\u09BE\u09A0\u09BE\u09A8\u09CB \u09B9\u09DF\u09C7\u099B\u09C7\u0964"
      });
    } catch (err) {
      console.error("[API /api/notifications/test-push] Error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to send test push" });
    }
  });
  app.post("/api/notifications/test-broadcast", requireAdminAuth, async (req, res) => {
    try {
      const devices = await getActiveDevices();
      let sentCount = 0;
      for (const dev of devices) {
        if (dev.fcmToken && !dev.fcmToken.startsWith("web_push_")) {
          await sendFcmPushNotification({
            device: dev,
            title: "\u{1F514} JpMC Synapse \u2014 \u09AA\u09CD\u09B0\u09BE\u09A4\u09BF\u09B7\u09CD\u09A0\u09BE\u09A8\u09BF\u0995 \u099F\u09C7\u09B8\u09CD\u099F \u09AC\u09CD\u09B0\u09A1\u0995\u09BE\u09B8\u09CD\u099F",
            body: "\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C \u09B6\u09BF\u09A1\u09BF\u0989\u09B2 \u09B8\u09BF\u09B8\u09CD\u099F\u09C7\u09AE\u09C7\u09B0 \u09AA\u09C1\u09B6 \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u0995\u09BE\u099C \u0995\u09B0\u099B\u09C7\u0964",
            deliveryId: `broadcast_${dev.deviceId}_${Date.now()}`,
            type: "test_push",
            url: "/?tab=home"
          });
          sentCount++;
        }
      }
      res.json({
        success: true,
        deviceCount: devices.length,
        dispatchedCount: sentCount,
        message: `Broadcast completed for ${devices.length} registered device(s).`
      });
    } catch (err) {
      console.error("[API /api/notifications/test-broadcast] Error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to broadcast test push" });
    }
  });
  app.get("/api/admin/announcements", requireAdminAuth, async (req, res) => {
    try {
      const list = await getAllAnnouncementsForAdmin();
      res.json({ success: true, announcements: list });
    } catch (err) {
      console.error("[API /api/admin/announcements] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to list announcements" });
    }
  });
  app.post("/api/admin/announcements", requireAdminAuth, async (req, res) => {
    try {
      const { title, message, priority, displayMode, targetAudience, active, status, startAt, expiresAt, sendPush } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: "Title and message are required." });
      }
      const adminUid = req.user?.uid || "admin";
      const created = await createAnnouncementInFirestore(
        {
          title,
          message,
          priority,
          displayMode,
          targetAudience,
          active: active !== false,
          status: status || "draft",
          startAt,
          expiresAt,
          sendPush: Boolean(sendPush)
        },
        adminUid
      );
      let pushResult = null;
      if (created.status === "published" && created.active && created.sendPush) {
        pushResult = await sendAnnouncementPushBroadcast(created.id);
      }
      res.json({ success: true, announcement: created, pushResult });
    } catch (err) {
      console.error("[API POST /api/admin/announcements] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to create announcement" });
    }
  });
  app.put("/api/admin/announcements/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateAnnouncementInFirestore(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.json({ success: true, announcement: updated });
    } catch (err) {
      console.error(`[API PUT /api/admin/announcements/${req.params.id}] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to update announcement" });
    }
  });
  app.delete("/api/admin/announcements/:id", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await deleteAnnouncementFromFirestore(id);
      res.json({ success, id });
    } catch (err) {
      console.error(`[API DELETE /api/admin/announcements/${req.params.id}] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to delete announcement" });
    }
  });
  app.post("/api/admin/announcements/:id/publish", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateAnnouncementInFirestore(id, {
        status: "published",
        active: true
      });
      if (!updated) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      let pushResult = null;
      if (updated.sendPush && !updated.pushSentAt) {
        pushResult = await sendAnnouncementPushBroadcast(id);
      }
      res.json({ success: true, announcement: updated, pushResult });
    } catch (err) {
      console.error(`[API /api/admin/announcements/${req.params.id}/publish] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to publish announcement" });
    }
  });
  app.post("/api/admin/announcements/:id/unpublish", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateAnnouncementInFirestore(id, {
        status: "draft",
        active: false
      });
      if (!updated) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.json({ success: true, announcement: updated });
    } catch (err) {
      console.error(`[API /api/admin/announcements/${req.params.id}/unpublish] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to unpublish announcement" });
    }
  });
  app.post("/api/admin/announcements/:id/send-push", requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const force = req.body?.force === true;
      const result = await sendAnnouncementPushBroadcast(id, force);
      res.json(result);
    } catch (err) {
      console.error(`[API /api/admin/announcements/${req.params.id}/send-push] Error:`, err);
      res.status(500).json({ success: false, error: err?.message || "Failed to send announcement push" });
    }
  });
  app.get("/api/announcements/active", validateActiveUserAuth, async (req, res) => {
    try {
      const user = req.user;
      const announcements = await getActiveAnnouncementsForUser(user.uid, user.role);
      res.json({ success: true, announcements });
    } catch (err) {
      console.error("[API /api/announcements/active] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to load active announcements" });
    }
  });
  app.post("/api/announcements/:id/seen", validateActiveUserAuth, async (req, res) => {
    try {
      const user = req.user;
      const { id } = req.params;
      await recordUserSeenAnnouncement(id, user.uid);
      res.json({ success: true, announcementId: id, uid: user.uid });
    } catch (err) {
      console.error(`[API /api/announcements/${req.params.id}/seen] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to record seen state" });
    }
  });
  app.post("/api/announcements/:id/acknowledge", validateActiveUserAuth, async (req, res) => {
    try {
      const user = req.user;
      const { id } = req.params;
      await recordUserAcknowledgedAnnouncement(id, user.uid);
      res.json({ success: true, announcementId: id, uid: user.uid });
    } catch (err) {
      console.error(`[API /api/announcements/${req.params.id}/acknowledge] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to record acknowledgement" });
    }
  });
  app.get("/api/announcements/:id/receipt", validateActiveUserAuth, async (req, res) => {
    try {
      const user = req.user;
      const { id } = req.params;
      const receipt = await getAnnouncementReceipt(id, user.uid);
      res.json({ success: true, receipt });
    } catch (err) {
      console.error(`[API /api/announcements/${req.params.id}/receipt] Error:`, err);
      res.status(500).json({ error: err?.message || "Failed to get receipt" });
    }
  });
  app.get("/api/notifications/status", async (req, res) => {
    const devices = await getActiveDevices();
    const scheduler = getSchedulerStatus();
    res.json({
      scheduler,
      registeredDevicesCount: devices.length,
      timezone: "Asia/Dhaka (UTC+6)"
    });
  });
  app.post("/api/reminders/trigger-check", validateSchedulerAuth, async (req, res) => {
    await runSchedulerTick();
    res.json({ success: true, scheduler: getSchedulerStatus() });
  });
  app.post("/api/internal/run-reminder-scheduler", validateSchedulerAuth, async (req, res) => {
    try {
      await runSchedulerTick();
      const status = getSchedulerStatus();
      res.json({
        ok: true,
        executedAt: (/* @__PURE__ */ new Date()).toISOString(),
        schedulerStatus: status
      });
    } catch (err) {
      console.error("[API /api/internal/run-reminder-scheduler] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || "Scheduler execution failed" });
    }
  });
  app.post("/api/internal/run-morning-briefing", validateSchedulerAuth, async (req, res) => {
    try {
      const devices = await getActiveDevices();
      await processDailyMorningBriefing(devices, true);
      res.json({
        ok: true,
        executedAt: (/* @__PURE__ */ new Date()).toISOString(),
        devicesTargeted: devices.length
      });
    } catch (err) {
      console.error("[API /api/internal/run-morning-briefing] Error:", err);
      res.status(500).json({ ok: false, error: err?.message || "Morning briefing execution failed" });
    }
  });
  app.post("/api/auth/ensure-authorized", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"];
      let token = "";
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return res.status(401).json({ error: "Missing authorization token" });
      }
      const decoded = await adminAuth.verifyIdToken(token);
      const profile = await ensureUserAuthorization({
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture
      });
      console.log(`[Auth] User authorized: ${profile.email} (${profile.displayName}) -> role: ${profile.role}`);
      res.json({ success: true, profile });
    } catch (err) {
      console.error("[API /api/auth/ensure-authorized] Error:", err);
      res.status(401).json({ error: err?.message || "Failed to authorize user" });
    }
  });
  app.get("/api/auth/profile", async (req, res) => {
    try {
      const authHeader = req.headers["authorization"];
      let token = "";
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return res.status(401).json({ error: "Missing authorization token" });
      }
      const decoded = await adminAuth.verifyIdToken(token);
      let authInfo = await getUserRoleAndActive(decoded.uid);
      if (!authInfo) {
        const profile = await ensureUserAuthorization({
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture
        });
        return res.json({ profile });
      }
      res.json({
        profile: {
          uid: decoded.uid,
          email: decoded.email || authInfo.email || "",
          displayName: authInfo.displayName || decoded.name || "User",
          photoURL: decoded.picture || null,
          role: authInfo.role,
          active: authInfo.active
        }
      });
    } catch (err) {
      res.status(401).json({ error: err?.message || "Unauthorized" });
    }
  });
  app.get("/api/reminders/briefing", async (req, res) => {
    const { dhakaDateStr, dhakaTimeStr } = getDhakaTimeParts();
    let todayEvents = [];
    try {
      const snap = await adminDb.collection("events").where("reviewStatus", "==", "auto_approved").where("eventDate", "==", dhakaDateStr).get();
      snap.forEach((doc) => todayEvents.push(doc.data()));
      todayEvents.sort((a, b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
    } catch (err) {
      console.warn("[API /api/reminders/briefing] Firestore fetch warning:", err);
    }
    res.json({
      date: dhakaDateStr,
      time: dhakaTimeStr,
      briefingScheduledTime: "07:30",
      timezone: "Asia/Dhaka (UTC+6)",
      todayEventsCount: todayEvents.length,
      todayEvents: todayEvents.slice(0, 5),
      messageBn: `\u09B6\u09C1\u09AD \u09B8\u0995\u09BE\u09B2\u0964 \u0986\u099C ${dhakaDateStr} \u09A4\u09BE\u09B0\u09BF\u0996\u09C7 \u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C\u09C7\u09B0 \u09AE\u09CB\u099F ${todayEvents.length}\u099F\u09BF \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09BF\u09A4 \u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF \u09B0\u09DF\u09C7\u099B\u09C7\u0964`,
      messageEn: `Good morning. There are ${todayEvents.length} scheduled events for Jamalpur Medical College on ${dhakaDateStr}.`
    });
  });
  app.post("/api/settings/reminder-preferences", requireAdminAuth, async (req, res) => {
    try {
      const { dailyBriefingTime, dailyBriefingEnabled, defaultReminder2h, defaultReminder30m, notifyWhenNoEventsToday } = req.body;
      const dataToSave = removeUndefinedFields({
        dailyBriefingTime: dailyBriefingTime || "07:30",
        dailyBriefingEnabled: dailyBriefingEnabled !== false,
        defaultReminder2h: defaultReminder2h !== false,
        defaultReminder30m: defaultReminder30m !== false,
        notifyWhenNoEventsToday: Boolean(notifyWhenNoEventsToday),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      await adminDb.collection("settings").doc("reminder_preferences").set(dataToSave, { merge: true });
      res.json({ success: true, settings: dataToSave });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Failed to save preferences" });
    }
  });
  app.get("/api/integrations/status", async (req, res) => {
    const isBotConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    const isGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);
    const publicUrl = getPublicAppUrl(req);
    const devices = await getActiveDevices();
    const scheduler = getSchedulerStatus();
    const telegramMessages = await getTelegramMessagesFromFirestore(5);
    res.json({
      telegram: {
        configured: isBotConfigured,
        webhookUrl: `${publicUrl}/api/telegram/webhook`,
        recentCount: telegramMessages.length,
        lastMessageAt: telegramMessages.length > 0 ? telegramMessages[0].timestamp : null
      },
      gemini: {
        configured: isGeminiConfigured,
        model: "gemini-3.8-flash (Auto-failover: gemini-3.1-flash-lite)",
        status: isGeminiConfigured ? "ready" : "missing_api_key"
      },
      firestore: {
        connected: true,
        projectId: process.env.FIREBASE_PROJECT_ID || "sapient-pen-336609"
      },
      pushNotifications: {
        fcmReady: true,
        registeredDevices: devices.length,
        schedulerRunning: scheduler.isRunning,
        lastSchedulerTick: scheduler.lastTickAt
      },
      calendar: {
        service: "Google Calendar API v3",
        authMode: "Client-side OAuth 2.0",
        scope: "https://www.googleapis.com/auth/calendar.events"
      }
    });
  });
  app.all("/api/*", (req, res) => {
    res.status(404).json({
      error: "Not Found",
      message: `API route ${req.method} ${req.originalUrl} does not exist.`
    });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : void 0
      },
      appType: "spa"
    });
    app.use((req, res, next) => {
      if (req.originalUrl.startsWith("/api/") || req.path.startsWith("/api/")) {
        return next();
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      if (req.originalUrl.startsWith("/api/") || req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API endpoint not found" });
      }
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[JpMC Synapse Server] Running on http://0.0.0.0:${PORT}`);
    if (process.env.ENABLE_LOCAL_SCHEDULER === "true") {
      console.log("[Scheduler] ENABLE_LOCAL_SCHEDULER=true: Starting in-process reminder scheduler interval.");
      startReminderScheduler(60 * 1e3);
    } else {
      console.log("[Scheduler] Production Mode: In-process setInterval scheduler disabled. Cloud Scheduler triggers enabled at /api/internal/run-reminder-scheduler");
    }
  });
}
startServer().catch((err) => {
  console.error("[JpMC Synapse Server] Startup failed:", err);
  process.exit(1);
});
//# sourceMappingURL=server.cjs.map
