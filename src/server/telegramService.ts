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
  saveExtractedEventToFirestore,
  getTelegramMessagesFromFirestore,
  getTelegramMessageByIdFromFirestore,
  removeUndefinedFields,
} from './firebaseAdmin';
import { TelegramMessageStatus } from '../domain/models';

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
  originalSenderName?: string;
  originalSenderRole?: string;
  timestamp: string;
  rawText: string;
  hasDocument: boolean;
  documentType?: 'pdf' | 'image' | 'text' | null;
  documentName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  telegramFileId?: string | null;
  caption?: string | null;
  processingStatus?: 'received' | 'processing' | 'processed' | 'download_failed' | 'gemini_failed' | 'unsupported';
  extractionStatus?: 'schedule_candidate' | 'needs_review' | 'not_a_schedule' | 'failed' | 'pending';
  status: TelegramMessageStatus;
  extractedEventIds: string[];
  confidence: number;
  receivedAt?: string;
  processedAt: string;
}

/**
 * Downloads a file securely from Telegram Bot API using the server-side bot token.
 * Validates HTTP response, non-empty buffer, and checks PDF magic bytes.
 */
export async function downloadTelegramFile(
  botToken: string,
  fileId: string,
  hintFileName?: string
): Promise<{ buffer: Buffer; base64: string; mimeType: string; fileSize: number } | null> {
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

    // Check file size (cap at 25MB to prevent memory exhaustion)
    if (fileJson.result.file_size && fileJson.result.file_size > 25 * 1024 * 1024) {
      console.warn('[Telegram PDF] File exceeds 25MB limit:', fileJson.result.file_size);
      return null;
    }

    // Authenticated Telegram file download - DO NOT LOG URL CONTAINING BOT TOKEN
    const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    const blobRes = await fetch(downloadUrl);
    if (!blobRes.ok) {
      console.warn(`[Telegram PDF] File download HTTP ${blobRes.status}`);
      return null;
    }

    const arrayBuffer = await blobRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      console.warn('[Telegram PDF] Downloaded file buffer is empty (0 bytes)');
      return null;
    }

    console.log(`[Telegram PDF] Download successful: bytes=${buffer.length}`);

    // Inspect magic bytes and file extensions for precise MIME type detection
    let mimeType = 'application/octet-stream';
    const isPdfMagic = buffer.subarray(0, 5).toString('ascii').startsWith('%PDF-');
    const isJpegMagic = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPngMagic =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    const isWebpMagic =
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';

    const checkPath = (hintFileName || filePath).toLowerCase();

    if (isPdfMagic || checkPath.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (isJpegMagic || checkPath.endsWith('.jpg') || checkPath.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (isPngMagic || checkPath.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (isWebpMagic || checkPath.endsWith('.webp')) {
      mimeType = 'image/webp';
    } else if (fileJson.result.mime_type) {
      mimeType = fileJson.result.mime_type;
    } else {
      mimeType = blobRes.headers.get('content-type') || 'application/octet-stream';
    }

    console.log(`[Telegram File] MIME type detected: ${mimeType} (PDF: ${isPdfMagic}, JPEG: ${isJpegMagic}, PNG: ${isPngMagic}, WEBP: ${isWebpMagic})`);

    const base64 = buffer.toString('base64');
    return { buffer, base64, mimeType, fileSize: buffer.length };
  } catch (err: any) {
    console.warn('[Telegram File] Exception during file download:', err?.message || err);
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
  const existingRecord = await getTelegramMessageByIdFromFirestore(chatId, messageId);
  if (existingRecord) {
    // If the message was already successfully classified, skip duplicate webhook delivery
    if (
      existingRecord.status === 'Schedule Created' ||
      existingRecord.status === 'Needs Review' ||
      existingRecord.status === 'Not a Schedule'
    ) {
      console.log(`[Telegram] Duplicate webhook skipped (${chatId}_${messageId}, status: ${existingRecord.status})`);
      return {
        ok: true,
        status: 'already_processed',
        chatId,
        messageId,
        eventsCount: (existingRecord.extractedEventIds || []).length,
        reviewRequiredCount: 0,
      };
    }
  }

  const rawCaption = message.caption || '';
  const rawText = message.text || rawCaption || '';

  // Canonical source identity: Always 'TelegramBot' with secondary label 'Telegram'
  const senderName = 'TelegramBot';
  const senderRole = 'Telegram';

  // Audit metadata for real Telegram user
  const originalSenderName = message.from?.first_name
    ? `${message.from.first_name} ${message.from.last_name || ''}`.trim()
    : message.chat?.title || 'Unknown Telegram Sender';
  const originalSenderRole = message.from?.username ? `@${message.from.username}` : 'Channel Broadcaster';

  let hasDocument = false;
  let documentType: 'pdf' | 'image' | 'text' = 'text';
  let documentName: string | null = null;
  let documentBase64: string | undefined = undefined;
  let documentMimeType: string = 'application/pdf';
  let telegramFileId: string | null = null;
  let fileSize: number | null = null;

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // Check for photos (Telegram compressed images)
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    hasDocument = true;
    documentType = 'image';
    // Sort to select the highest resolution PhotoSize
    const sortedPhotos = [...message.photo].sort((a: any, b: any) => {
      const areaA = (a.width || 0) * (a.height || 0) || (a.file_size || 0);
      const areaB = (b.width || 0) * (b.height || 0) || (b.file_size || 0);
      return areaB - areaA;
    });
    const highestRes = sortedPhotos[0];
    telegramFileId = highestRes.file_id;
    fileSize = highestRes.file_size || null;
    documentName = `telegram_photo_${message.message_id || Date.now()}.jpg`;
    documentMimeType = 'image/jpeg';
    console.log(`[Telegram Photo] Received photo: id=${telegramFileId}, size=${fileSize}, dims=${highestRes.width}x${highestRes.height}`);
  }

  // Check for documents (PDF, full-res image files, circulars)
  if (message.document) {
    hasDocument = true;
    documentName = message.document.file_name || 'telegram_document';
    telegramFileId = message.document.file_id;
    fileSize = message.document.file_size || null;

    const mime = (message.document.mime_type || '').toLowerCase();
    const docNameLower = documentName.toLowerCase();
    const isPdf = docNameLower.endsWith('.pdf') || mime.includes('pdf');
    const isImage = mime.startsWith('image/') || docNameLower.match(/\.(jpe?g|png|webp|bmp|gif)$/i);

    if (isPdf) {
      documentType = 'pdf';
      documentMimeType = 'application/pdf';
    } else if (isImage) {
      documentType = 'image';
      documentMimeType = mime.startsWith('image/')
        ? mime
        : docNameLower.endsWith('.png')
        ? 'image/png'
        : docNameLower.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    } else {
      documentType = 'text';
      documentMimeType = mime || 'application/octet-stream';
    }

    console.log(`[Telegram Document] Received: name=${documentName}, mime=${mime}, detectedType=${documentType}, size=${fileSize}`);
  }

  // If message has neither text nor document
  if (!rawText.trim() && !hasDocument) {
    return {
      ok: true,
      status: 'ignored',
      chatId,
      messageId,
      eventsCount: 0,
      reviewRequiredCount: 0,
    };
  }

  const timestampStr = new Date(message.date ? message.date * 1000 : Date.now()).toLocaleTimeString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
  });

  // 4. Initial Ingestion State: Immediately record as 'Processing'
  const initialRecord: IngestedTelegramRecord = {
    id: Date.now(),
    messageId,
    chatId,
    senderName,
    senderRole,
    originalSenderName,
    originalSenderRole,
    timestamp: timestampStr,
    rawText: rawText || (documentName ? `[সংযুক্ত ফাইল: ${documentName}]` : ''),
    hasDocument,
    documentType,
    documentName,
    mimeType: documentMimeType,
    fileSize,
    telegramFileId,
    caption: rawCaption || null,
    processingStatus: 'processing',
    extractionStatus: 'pending',
    status: 'Processing',
    extractedEventIds: [],
    confidence: 0,
    receivedAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
  };

  await saveTelegramMessageToFirestore(initialRecord);

  // 5. Download document bytes if file exists
  if (hasDocument && telegramFileId && botToken) {
    const download = await downloadTelegramFile(botToken, telegramFileId, documentName || undefined);
    if (!download) {
      console.error(`[Telegram PDF] Download failed: filename=${documentName}`);
      const downloadFailedRecord: IngestedTelegramRecord = {
        ...initialRecord,
        status: 'Download Failed',
        processingStatus: 'download_failed',
        extractionStatus: 'failed',
        processedAt: new Date().toISOString(),
      };
      await saveTelegramMessageToFirestore(downloadFailedRecord);
      return {
        ok: false,
        status: 'error',
        chatId,
        messageId,
        eventsCount: 0,
        reviewRequiredCount: 0,
        error: 'Failed to download Telegram document binary',
      };
    }

    documentBase64 = download.base64;
    documentMimeType = download.mimeType;
  }

  // 6. Invoke Multimodal Gemini Extractor
  try {
    if (hasDocument && documentType === 'pdf') {
      console.log(`[Telegram PDF] Gemini document processing started: filename=${documentName}`);
    }

    const extraction = await extractEventsWithGemini({
      rawText,
      documentBase64,
      documentMimeType,
      sourceFileName: documentName || undefined,
      telegramTimestamp: message.date ? new Date(message.date * 1000).toISOString() : undefined,
    });

    const events = extraction.events;
    const createdEventIds: string[] = [];

    if (hasDocument && documentType === 'pdf') {
      console.log(`[Telegram PDF] Gemini extraction completed: ${events.length} event(s) parsed`);
      console.log(`[Telegram PDF] Schedule candidate=${events.length > 0}`);
    }

    // 7. Save each extracted event to Firestore
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
        description: ev.description || rawText,
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
        sender: 'TelegramBot',
        originalText: rawText || (documentName ? `[ফাইল: ${documentName}]` : ''),
        confidence: typeof ev.confidence === 'number' ? ev.confidence : 0.85,
        reviewStatus,
        syncStatus: 'pending',
        ambiguities: Array.isArray(ev.ambiguities) ? ev.ambiguities : [],
        reminders,
        organizer: ev.organizer || null,
        committee: ev.committee || null,
        participants: ev.participants || null,
        notes: ev.instructions || ev.agenda || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveExtractedEventToFirestore(eventEntity);
    }

    const reviewRequiredCount = events.filter(
      (e) => !e.date || !e.startTime || typeof e.confidence !== 'number' || e.confidence < 0.90 || (e.ambiguities && e.ambiguities.length > 0)
    ).length;

    let statusLabel: TelegramMessageStatus = 'Not a Schedule';
    let extractionStatus: IngestedTelegramRecord['extractionStatus'] = 'not_a_schedule';
    let finalConfidence = 0.95;

    if (!extraction.isEventRelated || events.length === 0) {
      statusLabel = 'Not a Schedule';
      extractionStatus = 'not_a_schedule';
      finalConfidence = 0.95;
    } else if (reviewRequiredCount > 0) {
      statusLabel = 'Needs Review';
      extractionStatus = 'needs_review';
      finalConfidence = events[0].confidence;
    } else {
      statusLabel = 'Schedule Created';
      extractionStatus = 'schedule_candidate';
      finalConfidence = events[0].confidence;
    }

    // 8. Update Firestore record with completed extraction
    const completedRecord: IngestedTelegramRecord = {
      ...initialRecord,
      status: statusLabel,
      processingStatus: 'processed',
      extractionStatus,
      extractedEventIds: createdEventIds,
      confidence: finalConfidence,
      processedAt: new Date().toISOString(),
    };

    await saveTelegramMessageToFirestore(completedRecord);

    if (hasDocument && documentType === 'pdf') {
      console.log(`[Telegram PDF] Firestore updated for ${chatId}_${messageId}`);
    }

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
    console.error(`[Telegram PDF] Gemini document processing failed:`, err?.message || err);

    const failedRecord: IngestedTelegramRecord = {
      ...initialRecord,
      status: 'Gemini Processing Failed',
      processingStatus: 'gemini_failed',
      extractionStatus: 'failed',
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
      error: err?.message || 'Gemini processing failed',
    };
  }
}

/**
 * Reprocess a Telegram message using Gemini with the original PDF or text
 */
export async function reprocessTelegramMessage(params: {
  chatId: string;
  messageId: number;
  telegramFileId?: string;
}): Promise<{ ok: boolean; message: any; events: any[]; error?: string }> {
  const { chatId, messageId } = params;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // 1. Fetch message from Firestore or in-memory
  const msg = await getTelegramMessageByIdFromFirestore(chatId, messageId);
  if (!msg) {
    throw new Error(`Telegram message ${chatId}_${messageId} not found`);
  }

  const fileId = params.telegramFileId || msg.telegramFileId;
  const isDocument = Boolean(msg.hasDocument || fileId);
  const fileName = msg.documentName || (msg.documentType === 'image' ? 'telegram_photo.jpg' : 'telegram_document.pdf');

  console.log(`[Telegram Reprocess] Starting reprocess for ${chatId}_${messageId} (isDoc: ${isDocument}, type: ${msg.documentType}, fileId: ${fileId})`);

  let documentBase64: string | undefined = undefined;
  let documentMimeType = msg.mimeType || (msg.documentType === 'image' ? 'image/jpeg' : 'application/pdf');

  if (isDocument && fileId && botToken) {
    console.log(`[Telegram Reprocess] Downloading file for reprocessing: fileId=${fileId}, hint=${fileName}`);
    const download = await downloadTelegramFile(botToken, fileId, fileName);
    if (!download) {
      console.error(`[Telegram Reprocess] Reprocess download failed for fileId=${fileId}`);
      await saveTelegramMessageToFirestore({
        ...msg,
        status: 'Download Failed',
        processingStatus: 'download_failed',
        confidence: 0,
        processedAt: new Date().toISOString(),
      });
      return { ok: false, message: msg, events: [], error: 'Could not download original document/photo from Telegram' };
    }
    documentBase64 = download.base64;
    documentMimeType = download.mimeType;
  }

  // Set status to Processing during execution
  await saveTelegramMessageToFirestore({
    ...msg,
    status: 'Processing',
    processingStatus: 'processing',
    processedAt: new Date().toISOString(),
  });

  try {
    if (documentBase64) {
      console.log(`[Telegram PDF] Gemini document processing started (Reprocess): filename=${fileName}`);
    }

    const extraction = await extractEventsWithGemini({
      rawText: msg.caption || msg.rawText || '',
      documentBase64,
      documentMimeType,
      sourceFileName: fileName,
    });

    const events = extraction.events;
    const createdEventIds: string[] = [];
    const savedEventEntities: any[] = [];

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

      const eventEntity = {
        id: eventId,
        title: ev.title || 'শিরোনাম নির্ধারণ প্রয়োজন',
        description: ev.description || msg.rawText,
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
        sender: 'TelegramBot',
        originalText: msg.rawText,
        confidence: typeof ev.confidence === 'number' ? ev.confidence : 0.85,
        reviewStatus,
        syncStatus: 'pending',
        ambiguities: Array.isArray(ev.ambiguities) ? ev.ambiguities : [],
        reminders: [],
        organizer: ev.organizer || null,
        committee: ev.committee || null,
        participants: ev.participants || null,
        notes: ev.instructions || ev.agenda || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveExtractedEventToFirestore(eventEntity);
      savedEventEntities.push(eventEntity);
    }

    const reviewRequiredCount = events.filter(
      (e) => !e.date || !e.startTime || typeof e.confidence !== 'number' || e.confidence < 0.90 || (e.ambiguities && e.ambiguities.length > 0)
    ).length;

    let statusLabel: TelegramMessageStatus = 'Not a Schedule';
    let extractionStatus: IngestedTelegramRecord['extractionStatus'] = 'not_a_schedule';
    let finalConfidence = 0.95;

    if (!extraction.isEventRelated || events.length === 0) {
      statusLabel = 'Not a Schedule';
      extractionStatus = 'not_a_schedule';
      finalConfidence = 0.95;
    } else if (reviewRequiredCount > 0) {
      statusLabel = 'Needs Review';
      extractionStatus = 'needs_review';
      finalConfidence = events[0].confidence;
    } else {
      statusLabel = 'Schedule Created';
      extractionStatus = 'schedule_candidate';
      finalConfidence = events[0].confidence;
    }

    const updatedRecord: IngestedTelegramRecord = {
      ...msg,
      senderName: 'TelegramBot',
      senderRole: 'Telegram',
      status: statusLabel,
      processingStatus: 'processed',
      extractionStatus,
      extractedEventIds: createdEventIds,
      confidence: finalConfidence,
      processedAt: new Date().toISOString(),
    };

    await saveTelegramMessageToFirestore(updatedRecord);
    console.log(`[Telegram PDF] Reprocess complete for ${chatId}_${messageId} (status: ${statusLabel}, events: ${createdEventIds.length})`);

    return {
      ok: true,
      message: updatedRecord,
      events: savedEventEntities,
    };
  } catch (err: any) {
    console.error(`[Telegram Reprocess] Error:`, err?.message || err);
    const failedRecord = {
      ...msg,
      status: 'Gemini Processing Failed' as TelegramMessageStatus,
      processingStatus: 'gemini_failed' as const,
      extractionStatus: 'failed' as const,
      confidence: 0,
      processedAt: new Date().toISOString(),
    };
    await saveTelegramMessageToFirestore(failedRecord);
    return { ok: false, message: failedRecord, events: [], error: err?.message || 'Reprocessing failed' };
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

