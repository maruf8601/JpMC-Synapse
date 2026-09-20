/**
 * JpMC Synapse — Cloudflare Worker Telegram Service
 * Handles Telegram Bot webhook verification, ingestion, file downloads, and AI event extraction.
 * Organization: Jamalpur Medical College (JpMC)
 */

import { Env } from '../types';
import { firestoreGetDoc, firestoreSetDoc, firestoreQuery } from '../firebase/workerFirebase';
import { extractEventsInWorker } from './workerGemini';

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; last_name?: string; username?: string };
    chat: { id: number | string; title?: string; type: string };
    date: number;
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    forward_from?: { first_name?: string; username?: string };
    forward_from_chat?: { title?: string };
  };
  channel_post?: any;
}

/**
 * Validates the Telegram Webhook secret token
 */
export function verifyTelegramWebhookSecret(requestSecret: string | null, envSecret?: string): boolean {
  if (!envSecret) return true; // Permissive if secret not configured
  if (!requestSecret) return false;
  return requestSecret.trim() === envSecret.trim();
}

/**
 * Downloads a file from Telegram by file_id
 */
async function downloadTelegramFile(
  botToken: string,
  fileId: string
): Promise<{ base64: string; mimeType: string; fileName: string } | null> {
  try {
    const getFileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!getFileRes.ok) return null;

    const fileMeta = (await getFileRes.json()) as { ok: boolean; result?: { file_path: string } };
    if (!fileMeta.ok || !fileMeta.result?.file_path) return null;

    const filePath = fileMeta.result.file_path;
    const downloadRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!downloadRes.ok) return null;

    const buffer = await downloadRes.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    const fileName = filePath.split('/').pop() || 'document';
    let mimeType = 'application/octet-stream';
    if (fileName.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (fileName.endsWith('.png')) mimeType = 'image/png';
    else if (fileName.endsWith('.webp')) mimeType = 'image/webp';

    return { base64, mimeType, fileName };
  } catch (err) {
    console.error('[WorkerTelegram] Failed to download file from Telegram:', err);
    return null;
  }
}

/**
 * Ingests a Telegram message update into Firestore and extracts events
 */
export async function processTelegramWebhookUpdate(
  update: TelegramUpdate,
  env: Env
): Promise<{ success: boolean; message?: string }> {
  const msg = update.message || update.channel_post;
  if (!msg) {
    return { success: true, message: 'Non-message update ignored' };
  }

  const messageId = msg.message_id;
  const chatId = String(msg.chat.id);
  const docId = `${chatId}_${messageId}`;

  // Idempotency check: verify if message is already stored in Firestore
  const existingMsg = await firestoreGetDoc(env, 'telegramMessages', docId);
  if (existingMsg) {
    return { success: true, message: `Message ${docId} already processed` };
  }

  const rawText = msg.text || msg.caption || '';
  const senderName = msg.from
    ? `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || msg.from.username || 'Telegram User'
    : msg.chat.title || 'Official Channel';

  const originalSenderName = msg.forward_from
    ? `${msg.forward_from.first_name || ''}`.trim() || msg.forward_from.username
    : msg.forward_from_chat?.title || null;

  let hasDocument = false;
  let documentType: 'pdf' | 'image' | 'text' = 'text';
  let documentName: string | null = null;
  let mimeType: string | null = null;
  let telegramFileId: string | null = null;
  let documentBase64: string | undefined = undefined;

  const botToken = env.TELEGRAM_BOT_TOKEN;

  // Handle attached document
  if (msg.document && botToken) {
    hasDocument = true;
    telegramFileId = msg.document.file_id;
    documentName = msg.document.file_name || 'document.pdf';
    mimeType = msg.document.mime_type || (documentName.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    documentType = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('image') ? 'image' : 'text';

    const downloaded = await downloadTelegramFile(botToken, telegramFileId);
    if (downloaded) {
      documentBase64 = downloaded.base64;
      mimeType = downloaded.mimeType;
    }
  } else if (msg.photo && msg.photo.length > 0 && botToken) {
    // Photos come in array of resolutions, take largest
    const largestPhoto = msg.photo[msg.photo.length - 1];
    hasDocument = true;
    telegramFileId = largestPhoto.file_id;
    documentName = `photo_${messageId}.jpg`;
    documentType = 'image';
    mimeType = 'image/jpeg';

    const downloaded = await downloadTelegramFile(botToken, telegramFileId);
    if (downloaded) {
      documentBase64 = downloaded.base64;
      mimeType = downloaded.mimeType;
    }
  }

  // Extract events with Gemini (or heuristics)
  const extraction = await extractEventsInWorker(env, {
    rawText,
    documentBase64,
    documentMimeType: mimeType || undefined,
    sourceFileName: documentName || undefined,
    telegramTimestamp: new Date(msg.date * 1000).toISOString(),
  });

  const extractedEventIds: string[] = [];
  const nowIso = new Date().toISOString();

  // Save extracted events to Firestore
  if (extraction.isEventRelated && extraction.events.length > 0) {
    for (let i = 0; i < extraction.events.length; i++) {
      const ev = extraction.events[i];
      const eventId = `evt-tg-${chatId}-${messageId}-${i + 1}`;
      extractedEventIds.push(eventId);

      const eventDoc = {
        id: eventId,
        title: ev.title,
        description: ev.description || rawText,
        eventDate: ev.date || null,
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        venue: ev.venue || null,
        category: ev.category || 'সভা',
        priority: ev.priority || 'normal',
        source: 'Telegram',
        audience: 'official',
        telegramMessageId: messageId,
        telegramChatId: chatId,
        sender: senderName,
        originalText: rawText,
        confidence: ev.confidence || 0.8,
        reviewStatus: 'auto_approved',
        syncStatus: 'synced',
        ambiguities: ev.ambiguities || [],
        reminders: [
          { minutesBefore: 120, enabled: true },
          { minutesBefore: 30, enabled: true },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: 'telegram_bot',
        visibility: 'institutional',
      };

      await firestoreSetDoc(env, 'events', eventId, eventDoc, true);
    }
  }

  // Save telegram message record to Firestore
  const messageDoc = {
    id: messageId,
    messageId,
    chatId,
    senderName,
    senderRole: 'Telegram',
    originalSenderName,
    timestamp: new Date(msg.date * 1000).toISOString(),
    rawText,
    hasDocument,
    documentType,
    documentName,
    mimeType,
    telegramFileId,
    caption: msg.caption || null,
    status: extraction.isEventRelated && extractedEventIds.length > 0 ? 'extracted' : 'no_event',
    extractedEventIds,
    confidence: extraction.events[0]?.confidence || 0.7,
    receivedAt: nowIso,
    processedAt: nowIso,
  };

  await firestoreSetDoc(env, 'telegramMessages', docId, messageDoc, true);

  return { success: true, message: `Processed update for message ${docId}` };
}

/**
 * Configure Telegram Bot Webhook
 */
export async function setupTelegramWebhookInWorker(
  env: Env,
  webhookUrl: string
): Promise<{ success: boolean; description?: string }> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { success: false, description: 'TELEGRAM_BOT_TOKEN not configured in environment' };
  }

  const secret = env.TELEGRAM_WEBHOOK_SECRET || '';
  const url = new URL(`https://api.telegram.org/bot${botToken}/setWebhook`);
  url.searchParams.set('url', webhookUrl);
  if (secret) {
    url.searchParams.set('secret_token', secret);
  }
  url.searchParams.set('drop_pending_updates', 'false');

  const res = await fetch(url.toString(), { method: 'POST' });
  const data = (await res.json()) as { ok: boolean; description?: string };
  return { success: data.ok, description: data.description };
}

/**
 * Get Telegram Bot Webhook Info & Bot Profile
 */
export async function getTelegramStatusInWorker(env: Env): Promise<{
  configured: boolean;
  botInfo?: any;
  webhookInfo?: any;
  error?: string;
}> {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { configured: false, error: 'TELEGRAM_BOT_TOKEN missing' };
  }

  try {
    const [meRes, whRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`),
      fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`),
    ]);

    const meData = (await meRes.json()) as any;
    const whData = (await whRes.json()) as any;

    return {
      configured: true,
      botInfo: meData?.result,
      webhookInfo: whData?.result,
    };
  } catch (err: any) {
    return { configured: false, error: err?.message || 'Network error' };
  }
}
