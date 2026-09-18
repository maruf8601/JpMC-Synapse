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
    aiClient = new import_genai.GoogleGenAI({ apiKey });
  }
  return aiClient;
}
async function extractEventsWithGemini(params) {
  const {
    rawText = "",
    documentBase64,
    documentMimeType = "application/pdf",
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

Your mission is to read official medical college notices, Telegram channel broadcasts, administrative circulars, clinical announcements, and meeting notices in Bengali, English, or mixed Bengali-English.

CRITICAL ARCHITECTURAL RULES:
1. ABSOLUTELY NO SILENT DEFAULTS:
   - If time is not explicitly stated in the text, 'startTime' MUST be null.
   - If venue/location is not stated in the text, 'venue' MUST be null.
   - If date cannot be determined with high certainty, 'date' MUST be null.
   - NEVER fabricate or guess dates, times, or venues.
   - For every missing or uncertain piece of information, add a clear explanatory entry in the 'ambiguities' array (in Bengali or English), e.g., "\u0995\u09B0\u09CD\u09AE\u09B8\u09C2\u099A\u09BF\u09B0 \u09B8\u09AE\u09DF \u0989\u09B2\u09CD\u09B2\u09C7\u0996 \u09A8\u09C7\u0987 (Start time not specified)", "\u09A8\u09BF\u09B0\u09CD\u09A6\u09BF\u09B7\u09CD\u099F \u09AD\u09C7\u09A8\u09CD\u09AF\u09C1 \u09AC\u09BE \u0995\u0995\u09CD\u09B7 \u09A8\u09AE\u09CD\u09AC\u09B0 \u0985\u09A8\u09C1\u09AA\u09B8\u09CD\u09A5\u09BF\u09A4 (Venue not specified)".

2. MULTIPLE EVENTS HANDLING:
   - A single circular or message may contain ZERO, ONE, or MULTIPLE distinct meetings or schedules.
   - If multiple events are scheduled (e.g. Phase 2 viva on Sunday, Phase 3 viva on Tuesday), extract each as an independent item in the 'events' array.
   - If the message is purely conversational or unrelated to schedules, set isEventRelated = false and events = [].

3. MEDICAL COLLEGE VOCABULARY & ENTITIES:
   - Recognize terms: \u09AC\u09BF\u09AD\u09BE\u0997\u09C0\u09AF\u09BC \u09AA\u09CD\u09B0\u09A7\u09BE\u09A8 (HOD), \u09AB\u09C7\u099C (Phase 1, 2, 3, 4), \u099F\u09BE\u09B0\u09CD\u09AE (Term), \u0986\u0987\u099F\u09C7\u09AE (Item), \u0995\u09BE\u09B0\u09CD\u09A1 (Card), \u09AD\u09BE\u0987\u09AD\u09BE (Viva), \u0985\u09B8\u09AA\u09BF (OSCE), \u0993\u099F\u09BF \u0995\u09AE\u09AA\u09CD\u09B2\u09C7\u0995\u09CD\u09B8 (OT Complex), \u09B8\u09BF\u098F\u09AE\u0987 (CME), \u0987\u09A8\u09CD\u099F\u09BE\u09B0\u09CD\u09A8 \u09A1\u09BE\u0995\u09CD\u09A4\u09BE\u09B0 (Intern Doctor), \u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995 \u0995\u09BE\u0989\u09A8\u09CD\u09B8\u09BF\u09B2 (Academic Council), \u09B8\u0982\u0995\u09CD\u09B0\u09BE\u09AE\u0995 \u09AC\u09CD\u09AF\u09BE\u09A7\u09BF/\u09B8\u0982\u0995\u09CD\u09B0\u09AE\u09A3 \u09AA\u09CD\u09B0\u09A4\u09BF\u09B0\u09CB\u09A7 (Infection Control), \u0985\u09A7\u09CD\u09AF\u0995\u09CD\u09B7\u09C7\u09B0 \u0995\u09BE\u09B0\u09CD\u09AF\u09BE\u09B2\u09DF (Principal Office), \u09B8\u09AE\u09CD\u09AE\u09C7\u09B2\u09A8 \u0995\u0995\u09CD\u09B7 (Conference Room), \u09B2\u09C7\u0995\u099A\u09BE\u09B0 \u0997\u09CD\u09AF\u09BE\u09B2\u09BE\u09B0\u09BF \u09E7/\u09E8/\u09E9 (Lecture Gallery 1/2/3), \u099F\u09BF\u099A\u09BE\u09B0\u09CD\u09B8 \u09B2\u09BE\u0989\u099E\u09CD\u099C (Teachers Lounge).

4. CATEGORIES:
   - Must be one of: '\u09B8\u09AD\u09BE', '\u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995', '\u09AA\u09B0\u09C0\u0995\u09CD\u09B7\u09BE', '\u09B8\u09C7\u09AE\u09BF\u09A8\u09BE\u09B0', '\u0993\u09DF\u09BE\u09B0\u09CD\u0995\u09B6\u09AA', '\u09AA\u09CD\u09B0\u09B6\u09BF\u0995\u09CD\u09B7\u09A3', '\u09AA\u09CD\u09B0\u09B6\u09BE\u09B8\u09A8\u09BF\u0995', '\u099C\u09BE\u09A4\u09C0\u09DF \u09A6\u09BF\u09AC\u09B8', '\u0995\u09CD\u09B0\u09DF/\u099F\u09C7\u09A8\u09CD\u09A1\u09BE\u09B0', '\u099B\u09BE\u09A4\u09CD\u09B0 \u09AC\u09BF\u09B7\u09DF\u0995', '\u09AC\u09CD\u09AF\u0995\u09CD\u09A4\u09BF\u0997\u09A4', '\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF'.

5. PRIORITY:
   - 'urgent' if marked \u099C\u09B0\u09C1\u09B0\u09BF, \u099C\u09B0\u09C1\u09B0\u09C0, urgent, emergency, \u0985\u09AC\u09BF\u09B2\u09AE\u09CD\u09AC\u09C7.
   - 'important' if marked \u09AC\u09BF\u09B6\u09C7\u09B7, \u0997\u09C1\u09B0\u09C1\u09A4\u09CD\u09AC\u09AA\u09C2\u09B0\u09CD\u09A3, important.
   - 'normal' otherwise.

6. DATE FORMAT:
   - 'date' must be 'YYYY-MM-DD' if known, or null.
   - 'startTime' and 'endTime' must be 24-hour 'HH:mm' if known, or null. Convert Bengali numerals (\u09E6-\u09EF) to standard numbers.`;
  const contents = [];
  if (documentBase64) {
    contents.push({
      inlineData: {
        data: documentBase64,
        mimeType: documentMimeType
      }
    });
  }
  let promptText = `Please parse the following notice text and extract all events.
`;
  if (telegramTimestamp) {
    promptText += `Notice Timestamp: ${telegramTimestamp}
`;
  }
  if (rawText) {
    promptText += `Notice Content:
"""
${rawText}
"""
`;
  } else if (!documentBase64) {
    promptText += `No notice content provided.
`;
  }
  contents.push({ text: promptText });
  let response = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              isEventRelated: {
                type: import_genai.Type.BOOLEAN,
                description: "True if notice announces one or more meetings, exams, or events"
              },
              events: {
                type: import_genai.Type.ARRAY,
                items: {
                  type: import_genai.Type.OBJECT,
                  properties: {
                    title: {
                      type: import_genai.Type.STRING,
                      description: "Concise official title of the event"
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
                    description: {
                      type: import_genai.Type.STRING,
                      description: "Full description and context of the meeting"
                    },
                    category: {
                      type: import_genai.Type.STRING,
                      description: "Category name (e.g. \u09B8\u09AD\u09BE, \u098F\u0995\u09BE\u09A1\u09C7\u09AE\u09BF\u0995, \u09AA\u09B0\u09C0\u0995\u09CD\u09B7\u09BE, \u09B8\u09C7\u09AE\u09BF\u09A8\u09BE\u09B0)"
                    },
                    priority: {
                      type: import_genai.Type.STRING,
                      enum: ["normal", "important", "urgent"]
                    },
                    confidence: {
                      type: import_genai.Type.NUMBER,
                      description: "Confidence score from 0.0 to 1.0"
                    },
                    ambiguities: {
                      type: import_genai.Type.ARRAY,
                      items: { type: import_genai.Type.STRING },
                      description: "List of ambiguities or missing fields that need review"
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
      console.warn(`[Gemini Extractor] Attempt ${attempt} failed: ${err?.message}`);
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1e3));
      }
    }
  }
  if (!response) {
    throw lastError || new Error("Gemini extraction failed after 3 attempts.");
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
      date: scheduleCheck.date,
      startTime: scheduleCheck.startTime,
      endTime: scheduleCheck.endTime,
      venue,
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
async function setAuthorizedUser(uid, data) {
  const docData = removeUndefinedFields({
    active: data.active,
    email: data.email || null,
    role: data.role || "staff",
    displayName: data.displayName || null,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await adminDb.collection("authorizedUsers").doc(uid).set(docData, { merge: true });
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
async function isTelegramMessageProcessedInFirestore(chatId, messageId) {
  const docId = `${chatId}_${messageId}`;
  if (inMemoryProcessedIds.has(docId)) {
    return true;
  }
  try {
    const docSnap = await adminDb.collection("telegramMessages").doc(docId).get();
    if (docSnap.exists) {
      inMemoryProcessedIds.add(docId);
      return true;
    }
    return false;
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.warn("[FirebaseAdmin] Telegram message idempotency check warning:", err?.message || err);
    }
    return inMemoryProcessedIds.has(docId);
  }
}
async function saveTelegramMessageToFirestore(record) {
  const docId = `${record.chatId}_${record.messageId}`;
  inMemoryProcessedIds.add(docId);
  const safeDocType = record.hasDocument ? record.documentType || "text" : "text";
  const safeDocName = record.hasDocument ? record.documentName || null : null;
  const rawNormalized = {
    id: record.id,
    messageId: record.messageId,
    chatId: String(record.chatId),
    senderName: record.senderName || "JpMC Official Notice",
    senderRole: record.senderRole || "Notice Broadcaster",
    timestamp: record.timestamp,
    rawText: record.rawText || "",
    hasDocument: Boolean(record.hasDocument),
    documentType: safeDocType,
    documentName: safeDocName,
    status: record.status,
    extractedEventIds: Array.isArray(record.extractedEventIds) ? record.extractedEventIds : [],
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
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
    console.log(`[FirebaseAdmin] Successfully saved Telegram message ${docId} to Firestore (docType: ${safeRecord.documentType}).`);
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.error("[FirebaseAdmin] Failed to save Telegram message to Firestore:", err?.message || err);
    }
  }
}
async function saveExtractedEventToFirestore(event) {
  const eventId = event.id;
  const rawNormalized = {
    id: eventId,
    title: event.title || "\u09B6\u09BF\u09B0\u09CB\u09A8\u09BE\u09AE \u09A8\u09BF\u09B0\u09CD\u09A7\u09BE\u09B0\u09A3 \u09AA\u09CD\u09B0\u09DF\u09CB\u099C\u09A8",
    description: event.description || "",
    eventDate: event.eventDate || null,
    startTime: event.startTime || null,
    endTime: event.endTime || null,
    venue: event.venue || null,
    category: event.category || "\u0985\u09A8\u09CD\u09AF\u09BE\u09A8\u09CD\u09AF",
    priority: event.priority || "normal",
    source: event.source || "Telegram",
    audience: event.audience || "official",
    telegramMessageId: event.telegramMessageId ?? null,
    telegramChatId: event.telegramChatId ? String(event.telegramChatId) : null,
    sender: event.sender || null,
    originalText: event.originalText || "",
    confidence: typeof event.confidence === "number" ? event.confidence : 0,
    reviewStatus: event.reviewStatus,
    syncStatus: event.syncStatus || "pending",
    ambiguities: Array.isArray(event.ambiguities) ? event.ambiguities : [],
    reminders: Array.isArray(event.reminders) ? event.reminders : [],
    createdAt: event.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: event.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  const safeEvent = removeUndefinedFields(rawNormalized);
  const existingIdx = inMemoryEvents.findIndex((e) => e.id === eventId);
  if (existingIdx >= 0) {
    inMemoryEvents[existingIdx] = safeEvent;
  } else {
    inMemoryEvents.unshift(safeEvent);
    if (inMemoryEvents.length > 200) {
      inMemoryEvents.length = 200;
    }
  }
  try {
    await adminDb.collection("events").doc(eventId).set(safeEvent, { merge: true });
    console.log(
      `[FirebaseAdmin] Successfully saved extracted event ${eventId} to Firestore (title: "${safeEvent.title.slice(0, 30)}", status: ${safeEvent.reviewStatus}).`
    );
  } catch (err) {
    if (!err?.message?.includes("PERMISSION_DENIED")) {
      console.error("[FirebaseAdmin] Failed to save extracted event to Firestore:", err?.message || err);
    }
  }
}
async function getEventsFromFirestore(limitCount = 100) {
  try {
    const snapshot = await adminDb.collection("events").orderBy("createdAt", "desc").limit(limitCount).get();
    const events = [];
    snapshot.forEach((doc) => events.push(doc.data()));
    if (events.length > 0) {
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

// src/server/telegramService.ts
async function downloadTelegramFile(botToken, fileId) {
  try {
    const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    if (!fileRes.ok) return null;
    const fileJson = await fileRes.json();
    if (!fileJson.ok || !fileJson.result?.file_path) return null;
    if (fileJson.result.file_size && fileJson.result.file_size > 20 * 1024 * 1024) {
      console.warn("[Telegram] File exceeds 20MB limit:", fileJson.result.file_size);
      return null;
    }
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`;
    const blobRes = await fetch(downloadUrl);
    if (!blobRes.ok) return null;
    const arrayBuffer = await blobRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mimeType = blobRes.headers.get("content-type") || "application/octet-stream";
    return { base64, mimeType };
  } catch (err) {
    console.warn("[Telegram] Could not download file from Telegram:", err);
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
  const alreadyProcessed = await isTelegramMessageProcessedInFirestore(chatId, messageId);
  if (alreadyProcessed) {
    console.log(`[Telegram] Duplicate message skipped (${chatId}_${messageId})`);
    return {
      ok: true,
      status: "already_processed",
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0
    };
  }
  const rawText = message.text || message.caption || "";
  const senderName = message.from?.first_name ? `${message.from.first_name} ${message.from.last_name || ""}`.trim() : message.chat?.title || "JpMC Official Notice";
  const senderRole = message.from?.username ? `@${message.from.username}` : "Notice Broadcaster";
  let hasDocument = false;
  let documentType = null;
  let documentName = null;
  let documentBase64 = void 0;
  let documentMimeType = void 0;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (Array.isArray(message.photo) && message.photo.length > 0 && botToken) {
    hasDocument = true;
    documentType = "image";
    documentName = "telegram_photo.jpg";
    const highestRes = message.photo[message.photo.length - 1];
    const file = await downloadTelegramFile(botToken, highestRes.file_id);
    if (file) {
      documentBase64 = file.base64;
      documentMimeType = file.mimeType || "image/jpeg";
    }
  }
  if (message.document && botToken) {
    hasDocument = true;
    documentName = message.document.file_name || "telegram_document.pdf";
    documentMimeType = message.document.mime_type || "application/pdf";
    documentType = documentMimeType.includes("pdf") ? "pdf" : documentMimeType.includes("image") ? "image" : "text";
    const file = await downloadTelegramFile(botToken, message.document.file_id);
    if (file) {
      documentBase64 = file.base64;
      documentMimeType = file.mimeType;
    }
  }
  if (!hasDocument) {
    documentType = "text";
    documentName = null;
  }
  if (!rawText.trim() && !documentBase64) {
    return {
      ok: true,
      status: "ignored",
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0
    };
  }
  console.log(
    `[Telegram Webhook] Ingesting message (chat: ${chatId}, messageId: ${messageId}, hasDoc: ${hasDocument}, docType: ${documentType})`
  );
  try {
    const extraction = await extractEventsWithGemini({
      rawText,
      documentBase64,
      documentMimeType,
      telegramTimestamp: message.date ? new Date(message.date * 1e3).toISOString() : void 0
    });
    const events = extraction.events;
    const createdEventIds = [];
    console.log(
      `[Telegram Webhook] Gemini extraction completed: ${events.length} event(s) parsed (isEventRelated: ${extraction.isEventRelated})`
    );
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
        description: ev.description || "",
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
        sender: senderName,
        originalText: rawText,
        confidence: typeof ev.confidence === "number" ? ev.confidence : 0,
        reviewStatus,
        syncStatus: "pending",
        ambiguities: Array.isArray(ev.ambiguities) ? ev.ambiguities : [],
        reminders,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await saveExtractedEventToFirestore(eventEntity);
    }
    const reviewRequiredCount = events.filter(
      (e) => !e.date || !e.startTime || typeof e.confidence !== "number" || e.confidence < 0.9 || e.ambiguities && e.ambiguities.length > 0
    ).length;
    let statusLabel = "Not a Schedule";
    if (!extraction.isEventRelated || events.length === 0) {
      statusLabel = "Not a Schedule";
    } else if (reviewRequiredCount > 0) {
      statusLabel = "Needs Review";
    } else {
      statusLabel = "Schedule Created";
    }
    const record = {
      id: Date.now(),
      messageId,
      chatId,
      senderName,
      senderRole: senderRole || "Notice Broadcaster",
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString("bn-BD", {
        timeZone: "Asia/Dhaka",
        hour: "2-digit",
        minute: "2-digit"
      }),
      rawText: rawText || (documentName ? `[\u09B8\u0982\u09AF\u09C1\u0995\u09CD\u09A4 \u09AB\u09BE\u0987\u09B2: ${documentName}]` : ""),
      hasDocument,
      documentType: hasDocument ? documentType || "text" : "text",
      documentName: hasDocument ? documentName || null : null,
      status: statusLabel,
      extractedEventIds: createdEventIds,
      confidence: events.length > 0 && typeof events[0].confidence === "number" ? events[0].confidence : 0,
      processedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveTelegramMessageToFirestore(record);
    console.log(
      `[Telegram Webhook] Completed processing message ${chatId}_${messageId} (status: ${statusLabel}, events: ${createdEventIds.length})`
    );
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
    console.error("[Telegram Webhook] Extraction or storage error:", err?.message || err);
    const failedRecord = {
      id: Date.now(),
      messageId,
      chatId,
      senderName,
      senderRole: senderRole || "Notice Broadcaster",
      timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString("bn-BD", { timeZone: "Asia/Dhaka" }),
      rawText: rawText || "",
      hasDocument,
      documentType: hasDocument ? documentType || "text" : "text",
      documentName: hasDocument ? documentName || null : null,
      status: "Processing Failed",
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
      error: err?.message || "Processing failed"
    };
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
async function validateAdminOrUserAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const adminSecret = process.env.ADMIN_SECRET || process.env.SCHEDULER_SECRET;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }
  if (adminSecret && token === adminSecret) {
    return next();
  }
  if (token) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      req.user = decoded;
      return next();
    } catch {
    }
  }
  if (process.env.NODE_ENV !== "production" && !adminSecret) {
    return next();
  }
  return res.status(401).json({
    error: "Unauthorized: Valid Firebase ID Token or Admin Secret required."
  });
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
  app.post("/api/telegram/setup-webhook", validateAdminOrUserAuth, async (req, res) => {
    const appUrl = req.body?.appUrl || getPublicAppUrl(req);
    const secret = req.body?.secret || process.env.TELEGRAM_WEBHOOK_SECRET;
    const result = await setupTelegramWebhookUrl(appUrl, secret);
    res.json(result);
  });
  app.get("/api/telegram/messages", async (req, res) => {
    const messages = await getTelegramMessagesFromFirestore(50);
    res.json({ messages });
  });
  app.get("/api/events", async (req, res) => {
    try {
      const events = await getEventsFromFirestore(150);
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: err?.message || "Failed to query events" });
    }
  });
  app.post("/api/notifications/register-device", async (req, res) => {
    try {
      const { deviceId, fcmToken, platform, userId, userAgent } = req.body;
      if (!deviceId || !fcmToken) {
        return res.status(400).json({ error: "deviceId and fcmToken are required." });
      }
      await registerDeviceInFirestore({
        deviceId,
        fcmToken,
        platform: platform || "web",
        userId,
        userAgent: userAgent || req.headers["user-agent"],
        notificationsEnabled: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      res.json({ success: true, deviceId });
    } catch (err) {
      console.error("[API /api/notifications/register-device] Error:", err);
      res.status(500).json({ error: err?.message || "Failed to register device" });
    }
  });
  app.post("/api/notifications/test-push", validateAdminOrUserAuth, async (req, res) => {
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
        const sent2 = await sendFcmPushNotification({
          device: dev,
          title: "\u{1F514} JpMC Synapse \u2014 \u099F\u09C7\u09B8\u09CD\u099F \u09AC\u09BF\u099C\u09CD\u099E\u09AA\u09CD\u09A4\u09BF",
          body: "\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C \u09B6\u09BF\u09A1\u09BF\u0989\u09B2 \u09B8\u09BF\u09B8\u09CD\u099F\u09C7\u09AE\u09C7\u09B0 \u09AA\u09C1\u09B6 \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u0995\u09BE\u099C \u0995\u09B0\u099B\u09C7\u0964",
          deliveryId: `test_${dev.deviceId}_${Date.now()}`,
          type: "test_push",
          url: "/?tab=home"
        });
        return res.json({ success: sent2 });
      }
      const sent = await sendFcmPushNotification({
        device: { deviceId: targetDeviceId, fcmToken: targetToken },
        title: "\u{1F514} JpMC Synapse \u2014 \u099F\u09C7\u09B8\u09CD\u099F \u09AC\u09BF\u099C\u09CD\u099E\u09AA\u09CD\u09A4\u09BF",
        body: "\u099C\u09BE\u09AE\u09BE\u09B2\u09AA\u09C1\u09B0 \u09AE\u09C7\u09A1\u09BF\u0995\u09C7\u09B2 \u0995\u09B2\u09C7\u099C \u09B6\u09BF\u09A1\u09BF\u0989\u09B2 \u09B8\u09BF\u09B8\u09CD\u099F\u09C7\u09AE\u09C7\u09B0 \u09AA\u09C1\u09B6 \u09A8\u09CB\u099F\u09BF\u09AB\u09BF\u0995\u09C7\u09B6\u09A8 \u09B8\u09AB\u09B2\u09AD\u09BE\u09AC\u09C7 \u0995\u09BE\u099C \u0995\u09B0\u099B\u09C7\u0964",
        deliveryId: `test_${targetDeviceId}_${Date.now()}`,
        type: "test_push",
        url: "/?tab=home"
      });
      return res.json({ success: sent });
    } catch (err) {
      console.error("[API /api/notifications/test-push] Error:", err);
      res.status(500).json({ success: false, error: err?.message || "Failed to send test push" });
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
      await setAuthorizedUser(decoded.uid, {
        active: true,
        email: decoded.email,
        displayName: decoded.name || decoded.email,
        role: "staff"
      });
      res.json({ success: true, uid: decoded.uid, active: true });
    } catch (err) {
      console.error("[API /api/auth/ensure-authorized] Error:", err);
      res.status(401).json({ error: err?.message || "Failed to authorize user" });
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
  app.post("/api/settings/reminder-preferences", validateAdminOrUserAuth, async (req, res) => {
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
        model: "gemini-3.8-flash",
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
      server: { middlewareMode: true },
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
