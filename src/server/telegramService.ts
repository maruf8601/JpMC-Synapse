/**
 * JpMC Synapse — Telegram Bot Webhook & Ingestion Service
 * Handles idempotency via Cloud Firestore, Telegram Bot API secure file download,
 * and multimodal Gemini extraction dispatch.
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { extractEventsWithGemini, ExtractedEventItem } from './geminiExtractor';
import {
  adminDb,
  isTelegramMessageProcessedInFirestore,
  saveTelegramMessageToFirestore,
  getTelegramMessagesFromFirestore,
} from './firebaseAdmin';

export interface TelegramWebhookResult {
  ok: boolean;
  status: 'processed' | 'already_processed' | 'ignored' | 'error';
  chatId?: string;
  messageId?: number;
  eventsCount: number;
  events?: ExtractedEventItem[];
  reviewRequiredCount: number;
  error?: string;
}

export interface IngestedTelegramRecord {
  id: number;
  messageId: number;
  chatId: string;
  senderName: string;
  senderRole?: string;
  timestamp: string;
  rawText: string;
  hasDocument: boolean;
  documentType?: 'pdf' | 'image' | 'text';
  documentName?: string;
  status: 'Schedule Created' | 'Needs Review' | 'Not a Schedule' | 'Duplicate' | 'Processing Failed';
  extractedEventIds: string[];
  confidence: number;
  processedAt: string;
}

/**
 * Downloads a file securely from Telegram Bot API using the server-side bot token
 */
async function downloadTelegramFile(
  botToken: string,
  fileId: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
    const fileRes = await fetch(getFileUrl);
    if (!fileRes.ok) return null;
    const fileJson = await fileRes.json();
    if (!fileJson.ok || !fileJson.result?.file_path) return null;

    // Check file size (cap at 20MB to avoid out-of-memory)
    if (fileJson.result.file_size && fileJson.result.file_size > 20 * 1024 * 1024) {
      console.warn('[Telegram] File exceeds 20MB limit:', fileJson.result.file_size);
      return null;
    }

    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileJson.result.file_path}`;
    const blobRes = await fetch(downloadUrl);
    if (!blobRes.ok) return null;

    const arrayBuffer = await blobRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = blobRes.headers.get('content-type') || 'application/octet-stream';

    return { base64, mimeType };
  } catch (err) {
    console.warn('[Telegram] Could not download file from Telegram:', err);
    return null;
  }
}

/**
 * Process an incoming Telegram webhook update payload
 */
export async function processTelegramWebhookUpdate(
  update: any,
  secretHeader?: string
): Promise<TelegramWebhookResult> {
  // 1. Webhook Secret Token Verification (if passed)
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && secretHeader !== undefined && secretHeader !== expectedSecret) {
    console.warn('[Telegram Webhook] Secret token mismatch or missing.');
    return {
      ok: false,
      status: 'error',
      eventsCount: 0,
      reviewRequiredCount: 0,
      error: 'Unauthorized: Secret token mismatch',
    };
  }

  // 2. Extract message or channel_post
  const message = update.message || update.channel_post || update.edited_message;
  if (!message) {
    return { ok: true, status: 'ignored', eventsCount: 0, reviewRequiredCount: 0 };
  }

  const chatId = String(message.chat?.id || '');
  const messageId = Number(message.message_id || 0);

  // 3. PERSISTENT IDEMPOTENCY CHECK IN FIRESTORE
  const alreadyProcessed = await isTelegramMessageProcessedInFirestore(chatId, messageId);
  if (alreadyProcessed) {
    console.log(`[Telegram] Duplicate message skipped (${chatId}_${messageId})`);
    return {
      ok: true,
      status: 'already_processed',
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0,
    };
  }

  const rawText = message.text || message.caption || '';
  const senderName =
    message.from?.first_name
      ? `${message.from.first_name} ${message.from.last_name || ''}`.trim()
      : message.chat?.title || 'JpMC Official Notice';
  const senderRole = message.from?.username ? `@${message.from.username}` : 'Notice Broadcaster';

  let hasDocument = false;
  let documentType: 'pdf' | 'image' | 'text' | undefined = undefined;
  let documentName: string | undefined = undefined;
  let documentBase64: string | undefined = undefined;
  let documentMimeType: string | undefined = undefined;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Check for photos
  if (Array.isArray(message.photo) && message.photo.length > 0 && botToken) {
    hasDocument = true;
    documentType = 'image';
    documentName = 'telegram_photo.jpg';
    const highestRes = message.photo[message.photo.length - 1];
    const file = await downloadTelegramFile(botToken, highestRes.file_id);
    if (file) {
      documentBase64 = file.base64;
      documentMimeType = file.mimeType || 'image/jpeg';
    }
  }

  // Check for documents (PDF, etc.)
  if (message.document && botToken) {
    hasDocument = true;
    documentName = message.document.file_name || 'telegram_document.pdf';
    documentMimeType = message.document.mime_type || 'application/pdf';
    documentType = documentMimeType.includes('pdf') ? 'pdf' : documentMimeType.includes('image') ? 'image' : 'text';

    const file = await downloadTelegramFile(botToken, message.document.file_id);
    if (file) {
      documentBase64 = file.base64;
      documentMimeType = file.mimeType;
    }
  }

  // If message has neither text nor document
  if (!rawText.trim() && !documentBase64) {
    return {
      ok: true,
      status: 'ignored',
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0,
    };
  }

  try {
    // 4. Dispatch to Gemini Extractor
    const extraction = await extractEventsWithGemini({
      rawText,
      documentBase64,
      documentMimeType,
      telegramTimestamp: message.date ? new Date(message.date * 1000).toISOString() : undefined,
    });

    const events = extraction.events;
    const createdEventIds: string[] = [];

    // 5. Strict Validation & Persistence of Extracted Events into Firestore
    for (const ev of events) {
      const hasValidDate = Boolean(ev.date);
      const hasValidStartTime = Boolean(ev.startTime);
      const isMissingMandatory = !hasValidDate || !hasValidStartTime;
      const isLowConfidence = typeof ev.confidence !== 'number' || ev.confidence < 0.90;
      const hasAmbiguities = ev.ambiguities && ev.ambiguities.length > 0;

      const reviewStatus = isMissingMandatory || isLowConfidence || hasAmbiguities
        ? 'needs_review'
        : 'auto_approved';

      const eventId = `evt-tg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      createdEventIds.push(eventId);

      // Time-specific reminders must remain disabled until valid date + startTime exist
      const reminders = (!isMissingMandatory && reviewStatus === 'auto_approved')
        ? [
            {
              id: `rem-${Date.now()}-120`,
              eventId,
              reminderType: 'notification' as const,
              minutesBefore: 120,
              scheduledAt: '',
              enabled: true,
            },
            {
              id: `rem-${Date.now()}-30`,
              eventId,
              reminderType: 'notification' as const,
              minutesBefore: 30,
              scheduledAt: '',
              enabled: true,
            },
          ]
        : [];

      const eventEntity = {
        id: eventId,
        title: ev.title || 'শিরোনাম নির্ধারণ প্রয়োজন',
        description: ev.description,
        eventDate: ev.date || null,
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        venue: ev.venue || null,
        category: ev.category || 'অন্যান্য',
        priority: ev.priority || 'normal',
        source: 'Telegram',
        audience: 'official',
        telegramMessageId: messageId,
        telegramChatId: chatId,
        sender: senderName,
        originalText: rawText,
        confidence: typeof ev.confidence === 'number' ? ev.confidence : 0,
        reviewStatus,
        syncStatus: 'pending',
        ambiguities: ev.ambiguities || [],
        reminders,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await adminDb.collection('events').doc(eventId).set(eventEntity);
      } catch (err) {
        console.error('[Telegram] Failed to save extracted event in Firestore:', err);
      }
    }

    const reviewRequiredCount = events.filter(
      (e) => !e.date || !e.startTime || typeof e.confidence !== 'number' || e.confidence < 0.90 || (e.ambiguities && e.ambiguities.length > 0)
    ).length;

    let statusLabel: IngestedTelegramRecord['status'] = 'Not a Schedule';
    if (!extraction.isEventRelated || events.length === 0) {
      statusLabel = 'Not a Schedule';
    } else if (reviewRequiredCount > 0) {
      statusLabel = 'Needs Review';
    } else {
      statusLabel = 'Schedule Created';
    }

    // 6. Save Telegram Message record to Firestore (Idempotency Anchor)
    const record: IngestedTelegramRecord = {
      id: Date.now(),
      messageId,
      chatId,
      senderName,
      senderRole,
      timestamp: new Date().toLocaleTimeString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
      }),
      rawText: rawText || (documentName ? `[সংযুক্ত ফাইল: ${documentName}]` : ''),
      hasDocument,
      documentType,
      documentName,
      status: statusLabel,
      extractedEventIds: createdEventIds,
      confidence: events.length > 0 && typeof events[0].confidence === 'number' ? events[0].confidence : 0,
      processedAt: new Date().toISOString(),
    };

    await saveTelegramMessageToFirestore(record);

    return {
      ok: true,
      status: 'processed',
      chatId,
      messageId,
      eventsCount: events.length,
      events,
      reviewRequiredCount,
    };
  } catch (err: any) {
    console.error('[Telegram] Extraction or storage error:', err);

    // Record failure in Firestore so message is logged
    const failedRecord: IngestedTelegramRecord = {
      id: Date.now(),
      messageId,
      chatId,
      senderName,
      senderRole,
      timestamp: new Date().toLocaleTimeString('bn-BD', { timeZone: 'Asia/Dhaka' }),
      rawText: rawText || '',
      hasDocument,
      documentType,
      documentName,
      status: 'Processing Failed',
      extractedEventIds: [],
      confidence: 0,
      processedAt: new Date().toISOString(),
    };
    await saveTelegramMessageToFirestore(failedRecord);

    return {
      ok: false,
      status: 'error',
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0,
      error: err?.message || 'Processing failed',
    };
  }
}

/**
 * Configure Telegram Bot Webhook programmatically via Telegram API
 */
export async function setupTelegramWebhookUrl(
  appUrl: string,
  secretToken?: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured.' };
  }

  const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const secret = secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;

  try {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
    const payload: Record<string, any> = {
      url: webhookUrl,
      drop_pending_updates: false,
      allowed_updates: ['message', 'channel_post', 'edited_message'],
    };

    if (secret) {
      payload.secret_token = secret;
    }

    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    return { success: data.ok, result: data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to call Telegram API' };
  }
}

export async function getIngestedTelegramMessages(): Promise<IngestedTelegramRecord[]> {
  return await getTelegramMessagesFromFirestore(50);
}
