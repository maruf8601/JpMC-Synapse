/**
 * JpMC Synapse — Full-Stack Server Entry Point
 * Express API + Vite Middleware
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { extractEventsWithGemini } from './src/server/geminiExtractor';
import {
  processTelegramWebhookUpdate,
  setupTelegramWebhookUrl,
} from './src/server/telegramService';
import {
  adminDb,
  adminAuth,
  setAuthorizedUser,
  isUserAuthorized,
  registerDeviceInFirestore,
  getActiveDevices,
  getTelegramMessagesFromFirestore,
  getEventsFromFirestore,
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

const PORT = 3000;

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

  return `http://localhost:${PORT}`;
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
 * Authentication Middleware for Administrative / Mutation Endpoints
 * Supports:
 *  - Firebase ID Token (Bearer <token>)
 *  - Admin Secret (matching ADMIN_SECRET or SCHEDULER_SECRET)
 */
async function validateAdminOrUserAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const adminSecret = process.env.ADMIN_SECRET || process.env.SCHEDULER_SECRET;

  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (adminSecret && token === adminSecret) {
    return next();
  }

  if (token) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      (req as any).user = decoded;
      return next();
    } catch {
      // invalid token
    }
  }

  // Development bypass if no secret is configured
  if (process.env.NODE_ENV !== 'production' && !adminSecret) {
    return next();
  }

  return res.status(401).json({
    error: 'Unauthorized: Valid Firebase ID Token or Admin Secret required.',
  });
}

async function startServer() {
  const app = express();

  // JSON and URL-encoded body parsers (supports up to 25MB for document/photo base64 uploads)
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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
      botTokenSet: isBotConfigured,
      webhookUrl: `${publicUrl}/api/telegram/webhook`,
      totalMessagesReceived: messages.length,
      lastReceived: messages.length > 0 ? messages[0].timestamp : null,
      secretTokenConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    });
  });

  // Set Telegram Webhook programmatically
  app.post('/api/telegram/setup-webhook', validateAdminOrUserAuth, async (req, res) => {
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

  // Recent Synced Events (from Firestore / in-memory cache)
  app.get('/api/events', async (req, res) => {
    try {
      const events = await getEventsFromFirestore(150);
      res.json({ events });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to query events' });
    }
  });

  // Register Device Push Token
  app.post('/api/notifications/register-device', async (req, res) => {
    try {
      const { deviceId, fcmToken, platform, userId, userAgent } = req.body;
      if (!deviceId || !fcmToken) {
        return res.status(400).json({ error: 'deviceId and fcmToken are required.' });
      }

      await registerDeviceInFirestore({
        deviceId,
        fcmToken,
        platform: platform || 'web',
        userId,
        userAgent: userAgent || req.headers['user-agent'],
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      res.json({ success: true, deviceId });
    } catch (err: any) {
      console.error('[API /api/notifications/register-device] Error:', err);
      res.status(500).json({ error: err?.message || 'Failed to register device' });
    }
  });

  // Test Push Notification Endpoint
  app.post('/api/notifications/test-push', validateAdminOrUserAuth, async (req, res) => {
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
        const sent = await sendFcmPushNotification({
          device: dev,
          title: '🔔 JpMC Synapse — টেস্ট বিজ্ঞপ্তি',
          body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সফলভাবে কাজ করছে।',
          deliveryId: `test_${dev.deviceId}_${Date.now()}`,
          type: 'test_push',
          url: '/?tab=home',
        });
        return res.json({ success: sent });
      }

      const sent = await sendFcmPushNotification({
        device: { deviceId: targetDeviceId, fcmToken: targetToken },
        title: '🔔 JpMC Synapse — টেস্ট বিজ্ঞপ্তি',
        body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সফলভাবে কাজ করছে।',
        deliveryId: `test_${targetDeviceId}_${Date.now()}`,
        type: 'test_push',
        url: '/?tab=home',
      });

      return res.json({ success: sent });
    } catch (err: any) {
      console.error('[API /api/notifications/test-push] Error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to send test push' });
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
   * User Authorization Registration
   * Called on Google Auth sign-in to ensure user has active status in Firestore authorizedUsers
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
      await setAuthorizedUser(decoded.uid, {
        active: true,
        email: decoded.email,
        displayName: decoded.name || decoded.email,
        role: 'staff',
      });

      res.json({ success: true, uid: decoded.uid, active: true });
    } catch (err: any) {
      console.error('[API /api/auth/ensure-authorized] Error:', err);
      res.status(401).json({ error: err?.message || 'Failed to authorize user' });
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

  // Save Reminder & Briefing Preferences
  app.post('/api/settings/reminder-preferences', validateAdminOrUserAuth, async (req, res) => {
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
        model: 'gemini-3.8-flash',
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
      calendar: {
        service: 'Google Calendar API v3',
        authMode: 'Client-side OAuth 2.0',
        scope: 'https://www.googleapis.com/auth/calendar.events',
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
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api/') || req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start Server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[JpMC Synapse Server] Running on http://0.0.0.0:${PORT}`);

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
