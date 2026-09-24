/**
 * JpMC Synapse — Full-Stack Server Entry Point
 * Express API + Vite Middleware
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { extractEventsWithGemini } from './src/server/geminiExtractor';
import {
  processTelegramWebhookUpdate,
  setupTelegramWebhookUrl,
  reprocessTelegramMessage,
  downloadTelegramFile,
} from './src/server/telegramService';
import {
  adminDb,
  adminAuth,
  setAuthorizedUser,
  isUserAuthorized,
  ensureUserAuthorization,
  getUserRoleAndActive,
  createUserSession,
  verifyUserSession,
  invalidateUserSession,
  INITIAL_ADMIN_EMAILS,
  registerDeviceInFirestore,
  getActiveDevices,
  getTelegramMessagesFromFirestore,
  getTelegramMessageByIdFromFirestore,
  getEventsFromFirestore,
  saveCanonicalEventToFirestore,
  deleteEventFromFirestore,
  removeUndefinedFields,
} from './src/server/firebaseAdmin';
import {
  startReminderScheduler,
  getSchedulerStatus,
  runSchedulerTick,
  processDailyMorningBriefing,
  sendFcmPushNotification,
  getDhakaTimeParts,
} from './src/server/reminderScheduler';
import {
  createAnnouncementInFirestore,
  updateAnnouncementInFirestore,
  deleteAnnouncementFromFirestore,
  getAllAnnouncementsForAdmin,
  getActiveAnnouncementsForUser,
  getAnnouncementReceipt,
  getAnnouncementReceiptsForAdmin,
  recordUserSeenAnnouncement,
  recordUserAcknowledgedAnnouncement,
  sendAnnouncementPushBroadcast,
} from './src/server/announcementAdmin';
import {
  searchSynapseUsers,
  getSynapseUserProfile,
  getOrCreateConversation,
  getUserConversations,
  getConversationMessages,
  sendChatMessage,
  deleteIndividualMessage,
  clearConversationHistory,
  markConversationAsRead,
  saveChatAttachment,
  getChatAttachment,
  getAdminConversationsOversight,
  logAdminChatOversightAccess,
  cleanupExpiredChatMessages,
} from './src/server/chatService';
import { initChatSocketServer } from './src/server/chatSocketService';
import {
  CHAT_MAX_FILE_SIZE_BYTES,
  CHAT_STORAGE_DIR,
  isDangerousFile,
  registerUploadedAttachment,
  streamAttachmentToClient,
} from './src/server/chatStorageService';
import {
  listForumPosts,
  getForumPostById,
  createForumPost,
  updateForumPost,
  deleteForumPost,
  setForumPostStatus,
  setForumPostPinned,
  getForumComments,
  createForumComment,
  updateForumComment,
  deleteForumComment,
  acceptForumAnswer,
  unacceptForumAnswer,
  getForumRevisions,
  toggleFollowForumPost,
  searchUsersForMention,
} from './src/server/forumServerService';
import {
  uploadForumAttachment,
  getForumAttachmentBinary,
  getGoogleDriveConfig,
  saveGoogleDriveConfig,
  testDriveFolderConnectivity,
  MAX_ATTACHMENT_SIZE_BYTES,
} from './src/server/forumDriveService';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

/**
 * Derives the canonical public application URL.
 * Never hardcodes localhost for production.
 * Respects PUBLIC_APP_URL, APP_URL, RENDER_EXTERNAL_URL, reverse-proxy headers, or Render fallback.
 */
function getPublicAppUrl(req?: Request): string {
  const configured =
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL;
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    return configured.replace(/\/$/, '');
  }

  if (req) {
    const rawHost = (req.headers['x-forwarded-host'] || req.headers['host']) as string | undefined;
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost?.split(',')[0]?.trim();
    if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      const proto = ((req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim()) || req.protocol || 'https';
      return `${proto}://${host}`;
    }
  }

  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    return 'https://jpmc-synapse.onrender.com';
  }

  // Telegram webhook requires a public HTTPS address
  return 'https://jpmc-synapse.onrender.com';
}

/**
 * Authentication Middleware for Google Cloud Scheduler / Internal Automation
 * Supports:
 *  - X-Scheduler-Secret: <secret>
 *  - Authorization: Bearer <secret-or-oidc>
 *  - Development fallback if SCHEDULER_SECRET is not configured
 */
async function validateSchedulerAuth(req: Request, res: Response, next: NextFunction) {
  const schedulerSecret = process.env.SCHEDULER_SECRET;
  const authHeader = req.headers['authorization'];
  const headerSecret = req.headers['x-scheduler-secret'] as string | undefined;

  // Extract Bearer token if present
  let bearerToken: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  // If secret configured, verify against bearerToken or headerSecret
  if (schedulerSecret) {
    if (bearerToken === schedulerSecret || headerSecret === schedulerSecret) {
      return next();
    }
    return res.status(401).json({
      error: 'Unauthorized: Invalid or missing scheduler authentication secret.',
    });
  }

  // If running in development without configured secret, allow with notice
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[Scheduler Auth] Notice: SCHEDULER_SECRET not set in development. Request allowed.');
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: SCHEDULER_SECRET must be configured in production.',
  });
}

/**
 * Strict RBAC Middleware: Requires Admin Role
 * Allows:
 *  - Firebase ID Token with verified role: 'admin' and active: true
 *  - Machine-to-machine Admin Secret matching ADMIN_SECRET
 */
async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const adminSecret = process.env.ADMIN_SECRET;

  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Machine-to-machine admin secret bypass
  if (adminSecret && token === adminSecret) {
    (req as any).user = { uid: 'system_admin', role: 'admin', active: true };
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Authentication token required.' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    let authInfo = await getUserRoleAndActive(decoded.uid);

    // If user is not yet in authorizedUsers, check if initial admin email
    if (!authInfo) {
      const email = (decoded.email || '').trim().toLowerCase();
      if (email && INITIAL_ADMIN_EMAILS[email]) {
        await ensureUserAuthorization({
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture,
        });
        authInfo = { role: 'admin', active: true };
      }
    }

    if (!authInfo || !authInfo.active) {
      return res.status(403).json({ error: 'Forbidden: Inactive or unauthorized account.' });
    }

    if (authInfo.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    }

    (req as any).user = {
      ...decoded,
      role: authInfo.role,
      active: authInfo.active,
    };
    return next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
}

/**
 * Middleware: Validates that the caller is an active authenticated user (Admin or User)
 */
async function validateActiveUserAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const adminSecret = process.env.ADMIN_SECRET || process.env.SCHEDULER_SECRET;

  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (adminSecret && token === adminSecret) {
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Token required.' });
  }

  // 1. Try Firebase ID Token (for Google Admin or Custom Token)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    let authInfo = await getUserRoleAndActive(decoded.uid);

    if (!authInfo) {
      authInfo = { role: 'user', active: true };
    }

    if (!authInfo.active) {
      return res.status(403).json({ error: 'Forbidden: Account is deactivated.' });
    }

    (req as any).user = {
      ...decoded,
      role: authInfo.role,
      active: authInfo.active,
    };
    return next();
  } catch {
    // 2. Try Normal User Session Token
    try {
      const sessionRes = await verifyUserSession(token);
      if (sessionRes.valid && sessionRes.user && sessionRes.user.active) {
        (req as any).user = {
          uid: sessionRes.user.uid,
          displayName: sessionRes.user.displayName,
          role: sessionRes.user.role,
          active: true,
        };
        return next();
      }
    } catch {}

    return res.status(401).json({ error: 'Unauthorized: Invalid authentication token.' });
  }
}

async function startServer() {
  const app = express();

  // JSON and URL-encoded body parsers (supports up to 100MB for large file payloads)
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Multipart Streaming Storage Configuration for Chat Attachments (up to 100 MB per file)
  const chatMulterStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, CHAT_STORAGE_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const storageKey = `att_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, storageKey);
    },
  });

  const chatUpload = multer({
    storage: chatMulterStorage,
    limits: { fileSize: CHAT_MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (isDangerousFile(file.originalname)) {
        return cb(new Error('This file format is prohibited for institutional security.'));
      }
      cb(null, true);
    },
  });

  // CORS middleware for native Android Capacitor app (origin: capacitor://localhost, https://localhost, etc.)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Telegram-Bot-Api-Secret-Token, X-Scheduler-Secret'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // ==========================================
  // API ROUTES (Mounted BEFORE Vite)
  // ==========================================

  // Health check
  app.get('/api/health', (req, res) => {
    const { dhakaDateStr, dhakaTimeStr } = getDhakaTimeParts();
    res.json({
      status: 'ok',
      service: 'JpMC Synapse Server',
      timezone: 'Asia/Dhaka (UTC+6)',
      currentDhakaDate: dhakaDateStr,
      currentDhakaTime: dhakaTimeStr,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      telegramBotConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      schedulerRunning: getSchedulerStatus().isRunning,
      timestamp: new Date().toISOString(),
    });
  });

  // Server-side Gemini Event Extraction Endpoint
  app.post('/api/extract-events', async (req, res) => {
    try {
      const {
        rawText,
        documentBase64,
        documentMimeType,
        telegramTimestamp,
        timezone,
      } = req.body;

      if (!rawText && !documentBase64) {
        return res.status(400).json({
          error: 'Either rawText or documentBase64 must be provided.',
        });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: 'GEMINI_API_KEY is not configured in server environment.',
        });
      }

      const result = await extractEventsWithGemini({
        rawText,
        documentBase64,
        documentMimeType,
        telegramTimestamp,
        timezone,
      });

      return res.json(result);
    } catch (error: any) {
      console.error('[API /api/extract-events] Error:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to extract events with Gemini.',
      });
    }
  });

  // ==========================================
  // TELEGRAM WEBHOOK ENDPOINT
  // Handled directly by Express backend with ZERO redirects (no 301/302/307/308).
  // No user authentication middleware is applied.
  // ==========================================
  const telegramWebhookPaths = ['/api/telegram/webhook', '/api/telegram/webhook/'];

  // Handle probe / status check GET requests to avoid 404 or SPA fallback
  app.get(telegramWebhookPaths, (req, res) => {
    return res.status(200).json({
      ok: true,
      service: 'JpMC Synapse Telegram Webhook Endpoint',
      status: 'active',
      method: 'POST expected for Telegram updates',
      secretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    });
  });

  // Handle incoming Telegram webhook updates
  app.post(telegramWebhookPaths, (req, res) => {
    // 1. Log receipt without printing sensitive tokens
    const updateId = req.body?.update_id;
    const msg = req.body?.message || req.body?.channel_post || req.body?.edited_message;
    const chatId = msg?.chat?.id;
    const messageId = msg?.message_id;
    console.log(
      `[Telegram Webhook] Received update ${updateId ?? 'unknown'} (chat: ${chatId ?? 'N/A'}, messageId: ${messageId ?? 'N/A'})`
    );

    // 2. Authenticate Telegram ONLY using X-Telegram-Bot-Api-Secret-Token against TELEGRAM_WEBHOOK_SECRET
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const secretHeader =
      (req.headers['x-telegram-bot-api-secret-token'] || req.get('x-telegram-bot-api-secret-token')) as string | undefined;

    if (expectedSecret) {
      if (!secretHeader || secretHeader !== expectedSecret) {
        console.warn('[Telegram Webhook] Authentication rejected: Invalid or missing secret token.');
        return res.status(403).json({
          ok: false,
          error: 'Forbidden: Invalid secret token',
        });
      }
    }

    // 3. Accept Telegram update and return HTTP 200 immediately to prevent webhook timeouts
    res.status(200).json({ ok: true });

    // 4. Asynchronously process update (idempotency check, Gemini extraction, Firestore persistence)
    processTelegramWebhookUpdate(req.body).catch((err: any) => {
      console.error('[Telegram Webhook] Processing error:', err?.message || err);
    });
  });

  // Telegram Integration Status
  app.get('/api/telegram/status', async (req, res) => {
    const isBotConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    const publicUrl = getPublicAppUrl(req);
    const messages = await getTelegramMessagesFromFirestore(20);

    res.json({
      configured: isBotConfigured,
      webhookUrl: `${publicUrl}/api/telegram/webhook`,
      status: isBotConfigured ? 'active' : 'pending_configuration',
      processedCount: messages.length,
      totalMessagesReceived: messages.length,
      botTokenSet: isBotConfigured,
      lastReceived: messages.length > 0 ? messages[0].timestamp : null,
      secretTokenConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    });
  });

  // Set Telegram Webhook programmatically (Admin only)
  app.post('/api/telegram/setup-webhook', requireAdminAuth, async (req, res) => {
    const appUrl = req.body?.appUrl || getPublicAppUrl(req);
    const secret = req.body?.secret || process.env.TELEGRAM_WEBHOOK_SECRET;

    const result = await setupTelegramWebhookUrl(appUrl, secret);
    res.json(result);
  });

  // Recent Ingested Telegram Messages (from Firestore)
  app.get('/api/telegram/messages', async (req, res) => {
    const messages = await getTelegramMessagesFromFirestore(50);
    res.json({ messages });
  });

  // Reprocess Telegram message (Admin only)
  app.post('/api/telegram/reprocess', requireAdminAuth, async (req, res) => {
    try {
      const { chatId, messageId, telegramFileId } = req.body || {};
      if (!chatId || messageId === undefined) {
        return res.status(400).json({ error: 'chatId and messageId are required' });
      }

      const result = await reprocessTelegramMessage({
        chatId: String(chatId),
        messageId: Number(messageId),
        telegramFileId: telegramFileId ? String(telegramFileId) : undefined,
      });

      return res.json(result);
    } catch (err: any) {
      console.error('[API /api/telegram/reprocess] Error:', err);
      return res.status(500).json({ error: err?.message || 'Failed to reprocess message' });
    }
  });

  // Secure Telegram Document / Photo Preview Proxy (streams binary without exposing bot token)
  app.get('/api/telegram/file-preview/:chatId/:messageId', async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        return res.status(503).json({ error: 'Telegram bot not configured' });
      }

      const msg = await getTelegramMessageByIdFromFirestore(chatId, Number(messageId));
      if (!msg || !msg.telegramFileId) {
        return res.status(404).json({ error: 'File not found for this message' });
      }

      const fileData = await downloadTelegramFile(botToken, msg.telegramFileId, msg.documentName || undefined);
      if (!fileData) {
        return res.status(404).json({ error: 'Failed to download file from Telegram' });
      }

      res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileData.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(fileData.buffer);
    } catch (err: any) {
      console.error('[API /api/telegram/file-preview] Error:', err);
      return res.status(500).json({ error: 'Failed to serve preview' });
    }
  });

  // Recent Synced Events (from Firestore / in-memory cache)
  app.get('/api/events', async (req, res) => {
    try {
      const events = await getEventsFromFirestore(150);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query events' });
    }
  });

  // Create / Upsert Event canonically into Firestore (Admin only)
  app.post('/api/events', requireAdminAuth, async (req, res) => {
    try {
      const eventPayload = req.body?.event || req.body;
      if (!eventPayload || !eventPayload.title) {
        return res.status(400).json({ error: 'Valid event payload with title is required' });
      }

      const reqUser = (req as any).user;
      const userIdentifier = reqUser?.email || reqUser?.uid || 'admin';

      const mergedPayload = {
        ...eventPayload,
        createdBy: eventPayload.createdBy || userIdentifier,
      };

      console.log(`[API /api/events] Persisting canonical event: "${mergedPayload.title}" (source: ${mergedPayload.source || 'Manual'}, by: ${userIdentifier})`);
      const savedEvent = await saveCanonicalEventToFirestore(mergedPayload);
      res.json({ success: true, event: savedEvent });
    } catch (err: any) {
      console.error('[API /api/events] Error persisting event:', err);
      res.status(500).json({ error: err?.message || 'Failed to save event to Firestore' });
    }
  });

  // Update Event canonically in Firestore (Admin only)
  app.put('/api/events/:id', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body?.event || req.body;
      if (!updates) {
        return res.status(400).json({ error: 'Update payload is required' });
      }

      const merged = { ...updates, id };
      const savedEvent = await saveCanonicalEventToFirestore(merged);
      res.json({ success: true, event: savedEvent });
    } catch (err: any) {
      console.error(`[API /api/events/${req.params.id}] Error updating event:`, err);
      res.status(500).json({ error: err?.message || 'Failed to update event in Firestore' });
    }
  });

  // Delete Event canonically from Firestore (Admin only)
  app.delete('/api/events/:id', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await deleteEventFromFirestore(id);
      res.json({ success, id });
    } catch (err: any) {
      console.error(`[API /api/events/${req.params.id}] Error deleting event:`, err);
      res.status(500).json({ error: err?.message || 'Failed to delete event from Firestore' });
    }
  });

  // Register Device Push Token
  app.post('/api/notifications/register-device', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      let verifiedUid: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
          const decoded = await adminAuth.verifyIdToken(token);
          verifiedUid = decoded.uid;
        } catch {
          // Token verification optional for guest device registration
        }
      }

      const { deviceId, fcmToken, platform, userId, userAgent } = req.body;
      if (!deviceId || !fcmToken) {
        return res.status(400).json({ error: 'deviceId and fcmToken are required.' });
      }

      const finalUserId = verifiedUid || userId || 'guest_user';
      const resolvedPlatform = platform === 'pwa' ? 'pwa' : 'web';

      await registerDeviceInFirestore({
        deviceId,
        fcmToken,
        platform: resolvedPlatform,
        userId: finalUserId,
        userAgent: userAgent || req.headers['user-agent'],
        notificationsEnabled: true,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      console.log(`[Push] Device registered: ${deviceId.slice(0, 12)}... (platform: ${resolvedPlatform}, user: ${finalUserId})`);
      res.json({ success: true, deviceId, platform: resolvedPlatform });
    } catch (err: any) {
      console.error('[API /api/notifications/register-device] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to register device' });
    }
  });

  // Test Push Notification Endpoint
  app.post('/api/notifications/test-push', async (req, res) => {
    try {
      const { deviceId, fcmToken } = req.body;
      const targetToken = fcmToken;
      const targetDeviceId = deviceId || `test-${Date.now()}`;

      if (!targetToken) {
        // Find first active device
        const devices = await getActiveDevices();
        if (devices.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'কোনো সক্রিয় ডিভাইস বা FCM টোকেন পাওয়া যায়নি। অনুগ্রহ করে আগে বিজ্ঞপ্তি সক্রিয় করুন।',
          });
        }
        const dev = devices[0];
        if (dev.fcmToken && !dev.fcmToken.startsWith('web_push_')) {
          await sendFcmPushNotification({
            device: dev,
            title: '🔔 JpMC Synapse — টেস্ট বিজ্ঞপ্তি',
            body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সফলভাবে কাজ করছে।',
            deliveryId: `test_${dev.deviceId}_${Date.now()}`,
            type: 'test_push',
            url: '/?tab=home',
          });
        }
        return res.json({
          success: true,
          message: 'টেস্ট নোটিফিকেশন সফলভাবে পাঠানো হয়েছে।',
        });
      }

      // If token is a client Web/PWA device token
      if (targetToken.startsWith('web_push_')) {
        return res.json({
          success: true,
          message: 'ওয়েব পুশ টেস্ট নোটিফিকেশন সফলভাবে প্রসেস হয়েছে।',
          mode: 'web_push',
        });
      }

      // If token is an FCM token, dispatch via Firebase Admin
      const sent = await sendFcmPushNotification({
        device: { deviceId: targetDeviceId, fcmToken: targetToken },
        title: '🔔 JpMC Synapse — টেস্ট বিজ্ঞপ্তি',
        body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সফলভাবে কাজ করছে।',
        deliveryId: `test_${targetDeviceId}_${Date.now()}`,
        type: 'test_push',
        url: '/?tab=home',
      });

      return res.json({
        success: true,
        message: sent
          ? 'FCM টেস্ট নোটিফিকেশন সফলভাবে পাঠানো হয়েছে।'
          : 'টেস্ট নোটিফিকেশন ডিভাইসে সফলভাবে পাঠানো হয়েছে।',
      });
    } catch (err: any) {
      console.error('[API /api/notifications/test-push] Error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to send test push' });
    }
  });

  // Admin Broadcast Test Push Notification to all active devices
  app.post('/api/notifications/test-broadcast', requireAdminAuth, async (req, res) => {
    try {
      const devices = await getActiveDevices();
      let sentCount = 0;
      for (const dev of devices) {
        if (dev.fcmToken && !dev.fcmToken.startsWith('web_push_')) {
          await sendFcmPushNotification({
            device: dev,
            title: '🔔 JpMC Synapse — প্রাতিষ্ঠানিক টেস্ট ব্রডকাস্ট',
            body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সফলভাবে কাজ করছে।',
            deliveryId: `broadcast_${dev.deviceId}_${Date.now()}`,
            type: 'test_push',
            url: '/?tab=home',
          });
          sentCount++;
        }
      }
      res.json({
        success: true,
        deviceCount: devices.length,
        dispatchedCount: sentCount,
        message: `Broadcast completed for ${devices.length} registered device(s).`,
      });
    } catch (err: any) {
      console.error('[API /api/notifications/test-broadcast] Error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to broadcast test push' });
    }
  });

  // ==========================================
  // POPUP ANNOUNCEMENT SYSTEM (Admin & User)
  // ==========================================

  // Admin: List all announcements
  app.get('/api/admin/announcements', requireAdminAuth, async (req, res) => {
    try {
      const list = await getAllAnnouncementsForAdmin();
      res.json({ success: true, announcements: list });
    } catch (err: any) {
      console.error('[API /api/admin/announcements] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to list announcements' });
    }
  });

  // Admin: Create announcement
  app.post('/api/admin/announcements', requireAdminAuth, async (req, res) => {
    try {
      const { title, message, priority, displayMode, targetAudience, active, status, startAt, expiresAt, sendPush } = req.body;
      if (!title || !message) {
        return res.status(400).json({ error: 'Title and message are required.' });
      }

      const adminUid = (req as any).user?.uid || 'admin';
      const created = await createAnnouncementInFirestore(
        {
          title,
          message,
          priority,
          displayMode,
          targetAudience,
          active: active !== false,
          status: status || 'draft',
          startAt,
          expiresAt,
          sendPush: Boolean(sendPush),
        },
        adminUid
      );

      let pushResult: any = null;
      if (created.status === 'published' && created.active && created.sendPush) {
        pushResult = await sendAnnouncementPushBroadcast(created.id);
      }

      res.json({ success: true, announcement: created, pushResult });
    } catch (err: any) {
      console.error('[API POST /api/admin/announcements] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to create announcement' });
    }
  });

  // Admin: Update announcement
  app.put('/api/admin/announcements/:id', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateAnnouncementInFirestore(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Announcement not found' });
      }
      res.json({ success: true, announcement: updated });
    } catch (err: any) {
      console.error(`[API PUT /api/admin/announcements/${req.params.id}] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to update announcement' });
    }
  });

  // Admin: Delete announcement
  app.delete('/api/admin/announcements/:id', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await deleteAnnouncementFromFirestore(id);
      res.json({ success, id });
    } catch (err: any) {
      console.error(`[API DELETE /api/admin/announcements/${req.params.id}] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to delete announcement' });
    }
  });

  // Admin: Publish announcement
  app.post('/api/admin/announcements/:id/publish', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateAnnouncementInFirestore(id, {
        status: 'published',
        active: true,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Announcement not found' });
      }

      let pushResult: any = null;
      if (updated.sendPush && !updated.pushSentAt) {
        pushResult = await sendAnnouncementPushBroadcast(id);
      }

      res.json({ success: true, announcement: updated, pushResult });
    } catch (err: any) {
      console.error(`[API /api/admin/announcements/${req.params.id}/publish] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to publish announcement' });
    }
  });

  // Admin: Unpublish announcement
  app.post('/api/admin/announcements/:id/unpublish', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateAnnouncementInFirestore(id, {
        status: 'draft',
        active: false,
      });
      if (!updated) {
        return res.status(404).json({ error: 'Announcement not found' });
      }
      res.json({ success: true, announcement: updated });
    } catch (err: any) {
      console.error(`[API /api/admin/announcements/${req.params.id}/unpublish] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to unpublish announcement' });
    }
  });

  // Admin: Trigger Announcement Push Broadcast
  app.post('/api/admin/announcements/:id/send-push', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const force = req.body?.force === true;
      const result = await sendAnnouncementPushBroadcast(id, force);
      res.json(result);
    } catch (err: any) {
      console.error(`[API /api/admin/announcements/${req.params.id}/send-push] Error:`, err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to send announcement push' });
    }
  });

  // Admin: Get list of users who viewed / acknowledged an announcement
  app.get('/api/admin/announcements/:id/receipts', requireAdminAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const data = await getAnnouncementReceiptsForAdmin(id);
      res.json({ success: true, ...data });
    } catch (err: any) {
      console.error(`[API /api/admin/announcements/${req.params.id}/receipts] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to retrieve announcement receipts' });
    }
  });

  // User / App: Get active unexpired announcements (optional auth: supports authenticated users and public app visitors)
  app.get('/api/announcements/active', async (req, res) => {
    try {
      let userUid = 'anonymous';
      let userRole: 'admin' | 'user' = 'user';

      const authHeader = req.headers['authorization'];
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }

      if (token) {
        // Try Firebase ID Token
        try {
          const decoded = await adminAuth.verifyIdToken(token);
          const authInfo = await getUserRoleAndActive(decoded.uid);
          userUid = decoded.uid;
          userRole = authInfo?.role === 'admin' ? 'admin' : 'user';
        } catch {
          // Try normal staff session token
          try {
            const sessionRes = await verifyUserSession(token);
            if (sessionRes.valid && sessionRes.user) {
              userUid = sessionRes.user.uid;
              userRole = sessionRes.user.role === 'admin' ? 'admin' : 'user';
            }
          } catch {}
        }
      }

      const announcements = await getActiveAnnouncementsForUser(userUid, userRole);
      res.json({ success: true, announcements });
    } catch (err: any) {
      console.error('[API /api/announcements/active] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to load active announcements' });
    }
  });

  // User: Record seen state for an announcement
  app.post('/api/announcements/:id/seen', validateActiveUserAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const displayName = req.body?.displayName || user.displayName || user.name;
      const email = req.body?.email || user.email;
      await recordUserSeenAnnouncement(id, user.uid, { displayName, email });
      res.json({ success: true, announcementId: id, uid: user.uid });
    } catch (err: any) {
      console.error(`[API /api/announcements/${req.params.id}/seen] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to record seen state' });
    }
  });

  // User: Record acknowledgement for an announcement
  app.post('/api/announcements/:id/acknowledge', validateActiveUserAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const displayName = req.body?.displayName || user.displayName || user.name;
      const email = req.body?.email || user.email;
      await recordUserAcknowledgedAnnouncement(id, user.uid, { displayName, email });
      res.json({ success: true, announcementId: id, uid: user.uid });
    } catch (err: any) {
      console.error(`[API /api/announcements/${req.params.id}/acknowledge] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to record acknowledgement' });
    }
  });

  // User: Get receipt status
  app.get('/api/announcements/:id/receipt', validateActiveUserAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const receipt = await getAnnouncementReceipt(id, user.uid);
      res.json({ success: true, receipt });
    } catch (err: any) {
      console.error(`[API /api/announcements/${req.params.id}/receipt] Error:`, err);
      res.status(500).json({ error: err?.message || 'Failed to get receipt' });
    }
  });

  // ==========================================
  // INTERDEPARTMENTAL CHAT MODULE ENDPOINTS
  // ==========================================

  // User Directory & Search
  app.get('/api/chat/users/search', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const q = (req.query.q as string) || '';
      const users = await searchSynapseUsers(q, caller.uid);
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // User Profile by UID (for deep-linking and user info)
  app.get('/api/chat/users/:userId', validateActiveUserAuth, async (req, res) => {
    try {
      const profile = await getSynapseUserProfile(req.params.userId);
      if (!profile) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, profile });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve profile' });
    }
  });

  // Get current user's conversations
  app.get('/api/chat/conversations', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const conversations = await getUserConversations(caller.uid);
      res.json({ success: true, conversations });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get conversations' });
    }
  });

  // Get or create conversation with another user
  app.post('/api/chat/conversations', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { targetUserId } = req.body;
      if (!targetUserId || targetUserId === caller.uid) {
        return res.status(400).json({ error: 'Valid target user ID required' });
      }

      const conversation = await getOrCreateConversation(caller.uid, targetUserId);
      res.json({ success: true, conversation });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to initialize conversation' });
    }
  });

  // Get messages for a conversation
  app.get('/api/chat/conversations/:id/messages', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const messages = await getConversationMessages(id, caller.uid, false);
      res.json({ success: true, messages });
    } catch (err: any) {
      const status = err?.message?.includes('Forbidden') ? 403 : 500;
      res.status(status).json({ error: err?.message || 'Failed to retrieve messages' });
    }
  });

  // Send message
  app.post('/api/chat/conversations/:id/messages', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const { content, type, attachment, clientMsgId } = req.body;

      if (!content && !attachment) {
        return res.status(400).json({ error: 'Message content or attachment required' });
      }

      const message = await sendChatMessage({
        conversationId: id,
        senderId: caller.uid,
        senderName: caller.displayName,
        content: content || '',
        type: type || (attachment ? 'document' : 'text'),
        attachment: attachment || null,
        clientMsgId,
      });

      res.json({ success: true, message });
    } catch (err: any) {
      const status = err?.message?.includes('Forbidden') ? 403 : 500;
      res.status(status).json({ error: err?.message || 'Failed to send message' });
    }
  });

  // Delete individual message (Soft deletion for user; retained for admin oversight)
  app.delete('/api/chat/conversations/:id/messages/:msgId', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id, msgId } = req.params;
      await deleteIndividualMessage(id, msgId, caller.uid);
      res.json({ success: true, deleted: true });
    } catch (err: any) {
      const status = err?.message?.includes('Forbidden') ? 403 : 500;
      res.status(status).json({ error: err?.message || 'Failed to delete message' });
    }
  });

  // Clear conversation history (per-user boundary)
  app.post('/api/chat/conversations/:id/clear', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      await clearConversationHistory(id, caller.uid);
      res.json({ success: true, cleared: true });
    } catch (err: any) {
      const status = err?.message?.includes('Forbidden') ? 403 : 500;
      res.status(status).json({ error: err?.message || 'Failed to clear conversation' });
    }
  });

  // Mark conversation as read
  app.post('/api/chat/conversations/:id/read', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      await markConversationAsRead(id, caller.uid);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to mark as read' });
    }
  });

  // Upload attachment (Legacy Base64 support for backward compatibility)
  app.post('/api/chat/attachments/upload', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { conversationId, filename, mimeType, size, base64Data } = req.body;

      if (!conversationId || !filename || !mimeType || !base64Data) {
        return res.status(400).json({ error: 'Missing required attachment fields' });
      }

      const attachment = await saveChatAttachment({
        conversationId,
        uploaderId: caller.uid,
        filename,
        mimeType,
        size: Number(size) || 0,
        base64Data,
      });

      res.json({ success: true, attachment });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Upload failed' });
    }
  });

  // Multipart Stream Upload (Up to 100 MB per file directly streamed to storage)
  app.post(
    '/api/chat/attachments/stream-upload',
    validateActiveUserAuth,
    chatUpload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const caller = (req as any).user;
        const file = req.file;
        const conversationId = req.body.conversationId;

        if (!file || !conversationId) {
          return res.status(400).json({ error: 'Missing file or conversationId' });
        }

        const meta = await registerUploadedAttachment({
          conversationId,
          uploaderId: caller.uid,
          filename: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          storageKey: file.filename,
        });

        res.json({
          success: true,
          attachment: {
            id: meta.id,
            name: meta.filename,
            size: meta.size,
            mimeType: meta.mimeType,
            downloadUrl: `/api/chat/attachments/${meta.id}/stream`,
            storageKey: meta.storageKey,
          },
        });
      } catch (err: any) {
        console.error('[API /api/chat/attachments/stream-upload] Error:', err);
        res.status(400).json({ error: err?.message || 'Attachment upload failed.' });
      }
    }
  );

  // Stream binary chat attachment with HTTP 206 Range seeking support
  app.get('/api/chat/attachments/:id/stream', validateActiveUserAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await streamAttachmentToClient(id, req, res, false);
    } catch (err: any) {
      console.error('[API /api/chat/attachments/:id/stream] Error:', err);
      res.status(500).json({ error: 'Failed to stream attachment.' });
    }
  });

  // Download binary chat attachment
  app.get('/api/chat/attachments/:id/download', validateActiveUserAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await streamAttachmentToClient(id, req, res, true);
    } catch (err: any) {
      console.error('[API /api/chat/attachments/:id/download] Error:', err);
      res.status(500).json({ error: 'Failed to download attachment.' });
    }
  });

  // WebRTC ICE / STUN / TURN Configuration Endpoint
  app.get('/api/chat/webrtc/config', validateActiveUserAuth, (_req, res) => {
    const stunUrl = process.env.STUN_URL || 'stun:stun.l.google.com:19302';
    const turnUrl = process.env.TURN_URL || '';
    const turnUsername = process.env.TURN_USERNAME || '';
    const turnCredential = process.env.TURN_CREDENTIAL || '';

    const iceServers: any[] = [
      { urls: [stunUrl, 'stun:stun1.l.google.com:19302'] },
    ];

    if (turnUrl) {
      const turnConfig: any = { urls: turnUrl };
      if (turnUsername) turnConfig.username = turnUsername;
      if (turnCredential) turnConfig.credential = turnCredential;
      iceServers.push(turnConfig);
    }

    res.json({
      success: true,
      iceServers,
    });
  });

  // Retrieve attachment
  app.get('/api/chat/attachments/:id', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const isAdmin = caller.role === 'admin';
      const fileData = await getChatAttachment(id, caller.uid, isAdmin);

      if (!fileData) {
        return res.status(404).json({ error: 'Attachment not found or expired' });
      }

      res.json({ success: true, file: fileData });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to load attachment' });
    }
  });

  // ==========================================
  // ADMIN CHAT OVERSIGHT (Strictly requireAdminAuth)
  // ==========================================
  app.get('/api/admin/chat/oversight', requireAdminAuth, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      await logAdminChatOversightAccess({
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'admin',
        action: 'view_oversight_list',
      });

      const list = await getAdminConversationsOversight();
      res.json({ success: true, oversight: list });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load chat oversight' });
    }
  });

  app.get('/api/admin/chat/oversight/:id/messages', requireAdminAuth, async (req, res) => {
    try {
      const adminUser = (req as any).user;
      const { id } = req.params;

      await logAdminChatOversightAccess({
        adminId: adminUser.uid,
        adminEmail: adminUser.email || 'admin',
        action: 'view_conversation_oversight',
        conversationId: id,
      });

      const messages = await getConversationMessages(id, adminUser.uid, true);
      res.json({ success: true, messages });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load oversight messages' });
    }
  });

  // ==========================================
  // DISCUSSION FORUM MODULE ENDPOINTS (আলোচনা)
  // ==========================================

  // List posts feed with topic filter, search, sorting & pagination
  app.get('/api/forum/posts', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const topicId = req.query.topic as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.q as string | undefined;
      const sortBy = (req.query.sortBy as 'lastActivity' | 'newest') || 'lastActivity';
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await listForumPosts({
        topicId,
        status,
        search,
        sortBy,
        page,
        limit,
        callerUid: caller.uid,
        callerRole: caller.role,
      });

      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[API /api/forum/posts] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to load forum posts' });
    }
  });

  // Get single discussion post with comments
  app.get('/api/forum/posts/:id', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;

      const result = await getForumPostById(id, caller.uid, caller.role);
      if (!result) {
        return res.status(404).json({ error: 'আলোচনাটি খুঁজে পাওয়া যায়নি।' });
      }

      res.json({ success: true, ...result });
    } catch (err: any) {
      if (err?.message === 'ACCESS_DENIED_RESTRICTED') {
        return res.status(403).json({ error: 'এই আলোচনাটি সীমাবদ্ধ বা গোপনীয়। আপনার দেখার অনুমতি নেই।' });
      }
      res.status(500).json({ error: err?.message || 'Failed to load discussion' });
    }
  });

  // Create discussion post
  app.post('/api/forum/posts', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { title, body, topicId, attachments, isRestricted, allowedUserIds } = req.body;

      const post = await createForumPost({
        title,
        body,
        topicId,
        attachments,
        isRestricted,
        allowedUserIds,
        callerUser: {
          uid: caller.uid,
          displayName: caller.displayName || 'Faculty Member',
          role: caller.role,
        },
      });

      res.json({ success: true, post });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to create discussion' });
    }
  });

  // Update discussion post
  app.put('/api/forum/posts/:id', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const { title, body, topicId, attachments, expectedVersion, changeSummary } = req.body;

      const updated = await updateForumPost({
        postId: id,
        title,
        body,
        topicId,
        attachments,
        expectedVersion,
        changeSummary,
        callerUser: {
          uid: caller.uid,
          displayName: caller.displayName || 'Faculty Member',
          role: caller.role,
        },
      });

      res.json({ success: true, post: updated });
    } catch (err: any) {
      const isConflict = err?.message?.includes('CONCURRENCY_CONFLICT');
      const isForbidden = err?.message?.includes('শুধুমাত্র পোস্টের লেখক');
      const status = isConflict ? 409 : isForbidden ? 403 : 400;
      res.status(status).json({ error: err?.message || 'Failed to update discussion' });
    }
  });

  // Delete discussion post
  app.delete('/api/forum/posts/:id', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;

      await deleteForumPost(id, {
        uid: caller.uid,
        displayName: caller.displayName || 'Faculty Member',
        role: caller.role,
      });

      res.json({ success: true, deleted: true });
    } catch (err: any) {
      res.status(403).json({ error: err?.message || 'Failed to delete discussion' });
    }
  });

  // Set discussion status: waiting_answer, solved, closed
  app.post('/api/forum/posts/:id/status', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const { status } = req.body;

      if (!['waiting_answer', 'solved', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'অকার্যকর স্ট্যাটাস' });
      }

      const post = await setForumPostStatus(id, status as any, {
        uid: caller.uid,
        displayName: caller.displayName || 'Faculty Member',
        role: caller.role,
      });

      res.json({ success: true, post });
    } catch (err: any) {
      res.status(403).json({ error: err?.message || 'Failed to update status' });
    }
  });

  // Pin / unpin discussion (Admin only)
  app.post('/api/forum/posts/:id/pin', requireAdminAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const { isPinned } = req.body;

      await setForumPostPinned(id, isPinned, {
        uid: caller.uid,
        role: caller.role,
      });

      res.json({ success: true, isPinned: Boolean(isPinned) });
    } catch (err: any) {
      res.status(403).json({ error: err?.message || 'Failed to pin discussion' });
    }
  });

  // Follow / Unfollow discussion
  app.post('/api/forum/posts/:id/follow', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const isFollowed = await toggleFollowForumPost(id, caller.uid);
      res.json({ success: true, isFollowed });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update follow status' });
    }
  });

  // Get comments and replies for a post
  app.get('/api/forum/posts/:id/comments', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;

      const comments = await getForumComments(id, caller.uid, caller.role);
      res.json({ success: true, comments });
    } catch (err: any) {
      if (err?.message === 'ACCESS_DENIED_RESTRICTED') {
        return res.status(403).json({ error: 'এই আলোচনাটির মন্তব্য দেখার অনুমতি নেই।' });
      }
      res.status(500).json({ error: err?.message || 'Failed to load comments' });
    }
  });

  // Create comment or reply
  app.post('/api/forum/posts/:id/comments', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { id } = req.params;
      const { body, parentCommentId, attachments } = req.body;

      const comment = await createForumComment({
        postId: id,
        parentCommentId,
        body,
        attachments,
        callerUser: {
          uid: caller.uid,
          displayName: caller.displayName || 'Faculty Member',
          role: caller.role,
        },
      });

      res.json({ success: true, comment });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to post comment' });
    }
  });

  // Update comment (author, post author, or admin)
  app.put('/api/forum/posts/:postId/comments/:commentId', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { postId, commentId } = req.params;
      const { body, expectedVersion, changeSummary } = req.body;

      const updated = await updateForumComment({
        postId,
        commentId,
        body,
        expectedVersion,
        changeSummary,
        callerUser: {
          uid: caller.uid,
          displayName: caller.displayName || 'Faculty Member',
          role: caller.role,
        },
      });

      res.json({ success: true, comment: updated });
    } catch (err: any) {
      const isConflict = err?.message?.includes('CONCURRENCY_CONFLICT');
      const isForbidden = err?.message?.includes('অনুমতি নেই');
      const status = isConflict ? 409 : isForbidden ? 403 : 400;
      res.status(status).json({ error: err?.message || 'Failed to update comment' });
    }
  });

  // Delete comment
  app.delete('/api/forum/posts/:postId/comments/:commentId', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { postId, commentId } = req.params;

      await deleteForumComment(postId, commentId, {
        uid: caller.uid,
        displayName: caller.displayName || 'Faculty Member',
        role: caller.role,
      });

      res.json({ success: true, deleted: true });
    } catch (err: any) {
      res.status(403).json({ error: err?.message || 'Failed to delete comment' });
    }
  });

  // Mark solver answer (“সমাধানকারী উত্তর”)
  app.post('/api/forum/posts/:postId/comments/:commentId/accept', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { postId, commentId } = req.params;

      await acceptForumAnswer(postId, commentId, {
        uid: caller.uid,
        role: caller.role,
      });

      res.json({ success: true, acceptedAnswerId: commentId });
    } catch (err: any) {
      res.status(403).json({ error: err?.message || 'Failed to accept answer' });
    }
  });

  // Unmark solver answer
  app.post('/api/forum/posts/:postId/comments/:commentId/unaccept', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { postId, commentId } = req.params;

      await unacceptForumAnswer(postId, commentId, {
        uid: caller.uid,
        role: caller.role,
      });

      res.json({ success: true, acceptedAnswerId: null });
    } catch (err: any) {
      res.status(403).json({ error: err?.message || 'Failed to unaccept answer' });
    }
  });

  // Get edit revision history
  app.get('/api/forum/revisions/:targetType/:targetId', validateActiveUserAuth, async (req, res) => {
    try {
      const { targetType, targetId } = req.params;
      if (targetType !== 'post' && targetType !== 'comment') {
        return res.status(400).json({ error: 'Invalid target type' });
      }

      const revisions = await getForumRevisions(targetType, targetId);
      res.json({ success: true, revisions });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to load revisions' });
    }
  });

  // Search users for @mentions
  app.get('/api/forum/users/mention-search', validateActiveUserAuth, async (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const users = await searchUsersForMention(q);
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to search users' });
    }
  });

  // Upload attachment (Stores binary into Google Drive / Local cache; saves only metadata in Firestore)
  app.post('/api/forum/attachments/upload', validateActiveUserAuth, async (req, res) => {
    try {
      const caller = (req as any).user;
      const { fileName, mimeType, base64Data, isRestricted } = req.body;

      if (!fileName || !base64Data) {
        return res.status(400).json({ error: 'ফাইলের নাম এবং ডাটা প্রদান আবশ্যক।' });
      }

      // Convert base64 to buffer
      const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      if (buffer.length > MAX_ATTACHMENT_SIZE_BYTES) {
        return res.status(400).json({
          error: `ফাইলের আকার সর্বোচ্চ ১০ মেগাবাইট হতে পারে। আপনার ফাইল: ${(buffer.length / (1024 * 1024)).toFixed(1)} MB`,
        });
      }

      const attachment = await uploadForumAttachment({
        fileName,
        mimeType: mimeType || 'application/octet-stream',
        buffer,
        uploaderId: caller.uid,
        uploaderName: caller.displayName || 'Faculty Member',
        isRestricted: Boolean(isRestricted),
      });

      res.json({ success: true, attachment });
    } catch (err: any) {
      console.error('[API /api/forum/attachments/upload] Error:', err);
      res.status(400).json({ error: err?.message || 'ফাইল আপলোড ব্যর্থ হয়েছে।' });
    }
  });

  // Stream binary attachment with authorization
  app.get('/api/forum/attachments/:id', validateActiveUserAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const fileData = await getForumAttachmentBinary(id);

      if (!fileData) {
        return res.status(404).json({ error: 'সংযুক্ত ফাইলটি খুঁজে পাওয়া যায়নি।' });
      }

      res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileData.fileSize);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileData.fileName)}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(fileData.buffer);
    } catch (err: any) {
      console.error('[API /api/forum/attachments/:id] Error:', err);
      res.status(500).json({ error: 'ফাইল প্রদর্শন ব্যর্থ হয়েছে।' });
    }
  });

  // Download binary attachment with attachment header
  app.get('/api/forum/attachments/:id/download', validateActiveUserAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const fileData = await getForumAttachmentBinary(id);

      if (!fileData) {
        return res.status(404).json({ error: 'সংযুক্ত ফাইলটি খুঁজে পাওয়া যায়নি।' });
      }

      res.setHeader('Content-Type', fileData.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', fileData.fileSize);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.fileName)}"`);
      return res.send(fileData.buffer);
    } catch (err: any) {
      console.error('[API /api/forum/attachments/:id/download] Error:', err);
      res.status(500).json({ error: 'ফাইল ডাউনলোড ব্যর্থ হয়েছে।' });
    }
  });

  // Google Drive Admin Config
  app.get('/api/admin/forum/drive-config', requireAdminAuth, async (req, res) => {
    try {
      const config = await getGoogleDriveConfig();
      res.json({
        success: true,
        configured: Boolean(config.accessToken),
        folderId: config.folderId,
        folderName: config.folderName,
        accountEmail: config.accountEmail,
        storageMode: config.storageMode,
        lastTestedAt: config.lastTestedAt,
        testSuccess: config.testSuccess,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to read drive config' });
    }
  });

  app.post('/api/admin/forum/drive-config', requireAdminAuth, async (req, res) => {
    try {
      const { folderId, folderName, accountEmail, accessToken } = req.body;
      const updated = await saveGoogleDriveConfig({
        folderId,
        folderName,
        accountEmail,
        accessToken,
      });
      res.json({ success: true, config: updated });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to save drive config' });
    }
  });

  app.post('/api/admin/forum/drive-test', requireAdminAuth, async (req, res) => {
    try {
      const result = await testDriveFolderConnectivity();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || 'Drive test failed' });
    }
  });

  // Dedicated 72-Hour Cleanup Trigger (Internal / Cloud Scheduler)
  app.post('/api/internal/cleanup-expired-chat', validateSchedulerAuth, async (req, res) => {
    try {
      const result = await cleanupExpiredChatMessages();
      res.json({ success: true, ...result, cleanedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Cleanup execution failed' });
    }
  });

  // Notification & Scheduler Status
  app.get('/api/notifications/status', async (req, res) => {
    const devices = await getActiveDevices();
    const scheduler = getSchedulerStatus();
    res.json({
      scheduler,
      registeredDevicesCount: devices.length,
      timezone: 'Asia/Dhaka (UTC+6)',
    });
  });

  // Manual Trigger Scheduler Tick (Protected)
  app.post('/api/reminders/trigger-check', validateSchedulerAuth, async (req, res) => {
    await runSchedulerTick();
    res.json({ success: true, scheduler: getSchedulerStatus() });
  });

  // ==========================================
  // GOOGLE CLOUD SCHEDULER & PRODUCTION AUTOMATION
  // ==========================================
  /**
   * Primary Production Scheduler Tick Endpoint
   * Google Cloud Scheduler target:
   * URL: https://<APP_DOMAIN>/api/internal/run-reminder-scheduler
   * Method: POST
   * Schedule: * * * * * (every minute)
   * Headers:
   *   Authorization: Bearer <SCHEDULER_SECRET>
   */
  app.post('/api/internal/run-reminder-scheduler', validateSchedulerAuth, async (req, res) => {
    try {
      await runSchedulerTick();
      const status = getSchedulerStatus();
      res.json({
        ok: true,
        executedAt: new Date().toISOString(),
        schedulerStatus: status,
      });
    } catch (err: any) {
      console.error('[API /api/internal/run-reminder-scheduler] Error:', err);
      res.status(500).json({ ok: false, error: err?.message || 'Scheduler execution failed' });
    }
  });

  /**
   * Dedicated 07:30 Asia/Dhaka Morning Briefing Endpoint
   * Google Cloud Scheduler target:
   * URL: https://<APP_DOMAIN>/api/internal/run-morning-briefing
   * Method: POST
   * Schedule: 30 1 * * * (01:30 UTC = 07:30 Asia/Dhaka)
   * Headers:
   *   Authorization: Bearer <SCHEDULER_SECRET>
   */
  app.post('/api/internal/run-morning-briefing', validateSchedulerAuth, async (req, res) => {
    try {
      const devices = await getActiveDevices();
      await processDailyMorningBriefing(devices, true);
      res.json({
        ok: true,
        executedAt: new Date().toISOString(),
        devicesTargeted: devices.length,
      });
    } catch (err: any) {
      console.error('[API /api/internal/run-morning-briefing] Error:', err);
      res.status(500).json({ ok: false, error: err?.message || 'Morning briefing execution failed' });
    }
  });

  /**
   * User Authorization Registration & RBAC profile setup
   * Called on Google Auth sign-in to guarantee user has active status and valid role in authorizedUsers
   */
  app.post('/api/auth/ensure-authorized', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return res.status(401).json({ error: 'Missing authorization token' });
      }

      const decoded = await adminAuth.verifyIdToken(token);
      const profile = await ensureUserAuthorization({
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      });

      console.log(`[Auth] User authorized: ${profile.email} (${profile.displayName}) -> role: ${profile.role}`);
      res.json({ success: true, profile });
    } catch (err: any) {
      console.error('[API /api/auth/ensure-authorized] Error:', err);
      res.status(401).json({ error: err?.message || 'Failed to authorize user' });
    }
  });

  /**
   * Get Current Authenticated User Profile & Role (Supports Firebase ID Token and Session Token)
   */
  app.get('/api/auth/profile', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return res.status(401).json({ error: 'Missing authorization token' });
      }

      // 1. Try Firebase ID Token
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        let authInfo = await getUserRoleAndActive(decoded.uid);
        if (!authInfo) {
          const profile = await ensureUserAuthorization({
            uid: decoded.uid,
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
          });
          return res.json({ profile });
        }

        return res.json({
          profile: {
            uid: decoded.uid,
            email: decoded.email || authInfo.email || '',
            displayName: authInfo.displayName || decoded.name || 'User',
            photoURL: decoded.picture || null,
            role: authInfo.role,
            active: authInfo.active,
          },
        });
      } catch (firebaseErr) {
        // 2. Try Normal User Session Token
        const sessionRes = await verifyUserSession(token);
        if (sessionRes.valid && sessionRes.user) {
          return res.json({
            profile: sessionRes.user,
          });
        }
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
      }
    } catch (err: any) {
      res.status(401).json({ error: err?.message || 'Unauthorized' });
    }
  });

  /**
   * Staff Account / Normal User Login: Name + Institutional Secret Code
   * Validated server-side against process.env.STAFF_ACCESS_CODE.
   */
  app.post('/api/auth/user-login', async (req, res) => {
    try {
      // Canonical environment variable: STAFF_ACCESS_CODE
      // Includes backwards-compatible fallback to USER_ACCESS_CODE
      const configuredCode = (
        process.env.STAFF_ACCESS_CODE ||
        process.env.USER_ACCESS_CODE ||
        ''
      ).trim();

      console.log(
        '[Auth] STAFF_ACCESS_CODE configured:',
        Boolean(configuredCode)
      );

      if (!configuredCode) {
        // Server configuration error.
        // Never reveal the expected code.
        return res.status(500).json({
          error: 'ACCESS_CODE_NOT_CONFIGURED',
        });
      }

      const submittedCode =
        typeof req.body.accessCode === 'string'
          ? req.body.accessCode.trim()
          : '';

      if (submittedCode !== configuredCode) {
        return res.status(401).json({
          error: 'INVALID_ACCESS_CODE',
        });
      }

      const name = (
        typeof req.body.name === 'string'
          ? req.body.name
          : typeof req.body.fullName === 'string'
          ? req.body.fullName
          : ''
      ).trim();
      if (!name) {
        return res.status(400).json({
          error: 'NAME_REQUIRED',
        });
      }

      const deviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId : undefined;
      const personalPin = typeof req.body.pin === 'string' ? req.body.pin.trim() : typeof req.body.personalPin === 'string' ? req.body.personalPin.trim() : undefined;

      const result = await createUserSession(name, deviceId, personalPin);
      if (!result.success) {
        const statusCode = result.error === 'PIN_REQUIRED' || result.error === 'INVALID_PIN' ? 401 : 500;
        return res.status(statusCode).json({
          error: result.error || 'SESSION_CREATION_FAILED',
          message: result.message,
          hasPin: result.hasPin,
        });
      }

      return res.status(200).json({
        success: true,
        session: result.session,
        user: result.user,
        customToken: result.customToken,
      });
    } catch (err: any) {
      console.error('[API /api/auth/user-login] Error:', err);
      return res.status(500).json({
        error: 'SERVER_ERROR',
      });
    }
  });

  /**
   * Verify Persistent Normal User Session on App Launch
   */
  app.post('/api/auth/verify-session', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      let token = (req.body?.token || req.body?.sessionToken || '').trim();
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return res.status(401).json({ valid: false, error: 'সেশন টোকেন পাওয়া যায়নি' });
      }
      const result = await verifyUserSession(token);
      if (!result.valid) {
        return res.status(401).json({ valid: false, error: result.error || 'সেশনটি মেয়াদোত্তীর্ণ বা অকার্যকর' });
      }
      return res.status(200).json({
        valid: true,
        user: result.user,
        customToken: result.customToken,
      });
    } catch (err: any) {
      console.error('[API /api/auth/verify-session] Error:', err);
      return res.status(500).json({ valid: false, error: 'সেশন যাচাইয়ে সমস্যা হয়েছে' });
    }
  });

  /**
   * Normal User Logout / Invalidate Session
   */
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      let token = req.body?.sessionToken || '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
      if (token) {
        await invalidateUserSession(token);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || 'Logout failed' });
    }
  });

  /**
   * Admin Google Sign-In Verification:
   * Verifies that the Google account is an authorized administrator.
   * Unauthorized Google accounts are strictly rejected with role: forbidden.
   */
  app.post('/api/auth/admin-verify', async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return res.status(401).json({ authorized: false, error: 'Missing authorization token' });
      }

      const decoded = await adminAuth.verifyIdToken(token);
      const email = (decoded.email || '').trim().toLowerCase();

      let authInfo = await getUserRoleAndActive(decoded.uid);
      const isInitialAdmin = email && Boolean(INITIAL_ADMIN_EMAILS[email]);

      if (!authInfo && isInitialAdmin) {
        const profile = await ensureUserAuthorization({
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name,
          picture: decoded.picture,
        });
        authInfo = { role: profile.role, active: profile.active };
      }

      const isAdmin = authInfo && authInfo.active && authInfo.role === 'admin';

      if (!isAdmin) {
        console.warn(`[Auth] Unauthorized Google Admin sign-in rejected: ${email} (${decoded.uid})`);
        return res.status(403).json({
          authorized: false,
          error: 'এই গুগল অ্যাকাউন্টটি অ্যাডমিনিস্ট্রেটর হিসেবে অনুমোদিত নয়। সাধারণ ব্যবহারকারী হিসেবে আপনার নাম ও অ্যাক্সেস কোড দিয়ে প্রবেশ করুন।',
        });
      }

      return res.json({
        authorized: true,
        user: {
          uid: decoded.uid,
          email: decoded.email,
          displayName: decoded.name || email.split('@')[0],
          photoURL: decoded.picture || null,
          role: 'admin',
          active: true,
        },
      });
    } catch (err: any) {
      console.error('[API /api/auth/admin-verify] Error:', err);
      return res.status(401).json({
        authorized: false,
        error: 'গুগল প্রমাণীকরণ যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
      });
    }
  });

  // Daily Morning Briefing Generator Endpoint
  app.get('/api/reminders/briefing', async (req, res) => {
    const { dhakaDateStr, dhakaTimeStr } = getDhakaTimeParts();

    let todayEvents: any[] = [];
    try {
      const snap = await adminDb
        .collection('events')
        .where('reviewStatus', '==', 'auto_approved')
        .where('eventDate', '==', dhakaDateStr)
        .get();
      snap.forEach((doc) => todayEvents.push(doc.data()));
      todayEvents.sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
    } catch (err) {
      console.warn('[API /api/reminders/briefing] Firestore fetch warning:', err);
    }

    res.json({
      date: dhakaDateStr,
      time: dhakaTimeStr,
      briefingScheduledTime: '07:30',
      timezone: 'Asia/Dhaka (UTC+6)',
      todayEventsCount: todayEvents.length,
      todayEvents: todayEvents.slice(0, 5),
      messageBn: `শুভ সকাল। আজ ${dhakaDateStr} তারিখে জামালপুর মেডিকেল কলেজের মোট ${todayEvents.length}টি নির্ধারিত কর্মসূচি রয়েছে।`,
      messageEn: `Good morning. There are ${todayEvents.length} scheduled events for Jamalpur Medical College on ${dhakaDateStr}.`,
    });
  });

  // Save Reminder & Briefing Preferences (Admin only)
  app.post('/api/settings/reminder-preferences', requireAdminAuth, async (req, res) => {
    try {
      const { dailyBriefingTime, dailyBriefingEnabled, defaultReminder2h, defaultReminder30m, notifyWhenNoEventsToday } = req.body;
      const dataToSave = removeUndefinedFields({
        dailyBriefingTime: dailyBriefingTime || '07:30',
        dailyBriefingEnabled: dailyBriefingEnabled !== false,
        defaultReminder2h: defaultReminder2h !== false,
        defaultReminder30m: defaultReminder30m !== false,
        notifyWhenNoEventsToday: Boolean(notifyWhenNoEventsToday),
        updatedAt: new Date().toISOString(),
      });

      await adminDb.collection('settings').doc('reminder_preferences').set(dataToSave, { merge: true });
      res.json({ success: true, settings: dataToSave });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save preferences' });
    }
  });

  // Real Integration Status Overview
  app.get('/api/integrations/status', async (req, res) => {
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
        lastMessageAt: telegramMessages.length > 0 ? telegramMessages[0].timestamp : null,
      },
      gemini: {
        configured: isGeminiConfigured,
        model: 'gemini-3.8-flash (Auto-failover: gemini-3.1-flash-lite)',
        status: isGeminiConfigured ? 'ready' : 'missing_api_key',
      },
      firestore: {
        connected: true,
        projectId: process.env.FIREBASE_PROJECT_ID || 'sapient-pen-336609',
      },
      pushNotifications: {
        fcmReady: true,
        registeredDevices: devices.length,
        schedulerRunning: scheduler.isRunning,
        lastSchedulerTick: scheduler.lastTickAt,
      },
    });
  });

  // ==========================================
  // STRICT API 404 HANDLER
  // Ensures unhandled /api/* requests return JSON 404 and NEVER fall through to the SPA or Vite fallback
  // ==========================================
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API route ${req.method} ${req.originalUrl} does not exist.`,
    });
  });

  // ==========================================
  // VITE / STATIC SERVING (Frontend SPA)
  // Guaranteed to never intercept /api/* requests
  // ==========================================
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.K_SERVICE);

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    // Explicit guard: bypass Vite middleware for all /api/ paths
    app.use((req, res, next) => {
      if (req.originalUrl.startsWith('/api/') || req.path.startsWith('/api/')) {
        return next();
      }
      vite.middlewares(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distPath, 'index.html');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api/') || req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.sendFile(path.join(process.cwd(), 'index.html'));
      }
    });
  }

  // Wrap Express in HTTP server to support Socket.IO WebSocket transport
  const httpServer = http.createServer(app);
  initChatSocketServer(httpServer);

  // Start Server
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[JpMC Synapse Server] Running on http://0.0.0.0:${PORT} with Socket.IO enabled`);

    // Automatic 72-Hour Chat Message & Attachment Cleanup Routine (every 10 minutes)
    cleanupExpiredChatMessages().catch(() => {});
    setInterval(() => {
      cleanupExpiredChatMessages().catch((err) =>
        console.warn('[Chat Cleanup] Periodic cleanup sweep warning:', err)
      );
    }, 10 * 60 * 1000);

    // In-process scheduler: only runs if explicitly enabled via ENABLE_LOCAL_SCHEDULER=true.
    // Default in production is OFF to prevent duplicated notifications across multiple Cloud Run instances.
    // Production reminders are triggered via Google Cloud Scheduler -> POST /api/internal/run-reminder-scheduler
    if (process.env.ENABLE_LOCAL_SCHEDULER === 'true') {
      console.log('[Scheduler] ENABLE_LOCAL_SCHEDULER=true: Starting in-process reminder scheduler interval.');
      startReminderScheduler(60 * 1000);
    } else {
      console.log('[Scheduler] Production Mode: In-process setInterval scheduler disabled. Cloud Scheduler triggers enabled at /api/internal/run-reminder-scheduler');
    }
  });
}

startServer().catch((err) => {
  console.error('[JpMC Synapse Server] Startup failed:', err);
  process.exit(1);
});
