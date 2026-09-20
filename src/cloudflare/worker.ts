/**
 * JpMC Synapse — Cloudflare Worker Primary Entry Point
 * Production-ready serverless backend & static application server for Cloudflare Workers.
 * Preserves full compatibility with React + Vite frontend, Android Capacitor app, and Telegram Webhooks.
 */

import { Env, WorkerAuthUser, ExecutionContext, ScheduledEvent, INITIAL_ADMIN_EMAILS } from './types';
import {
  firestoreGetDoc,
  firestoreSetDoc,
  firestoreDeleteDoc,
  firestoreQuery,
  verifyFirebaseIdToken,
  createCustomToken,
  sendFcmMessage,
} from './firebase/workerFirebase';
import { extractEventsInWorker } from './services/workerGemini';
import {
  processTelegramWebhookUpdate,
  setupTelegramWebhookInWorker,
  getTelegramStatusInWorker,
  verifyTelegramWebhookSecret,
} from './services/workerTelegram';
import {
  runWorkerSchedulerTick,
  runWorkerMorningBriefing,
  getDhakaTimeParts,
} from './services/workerReminders';
import { broadcastAnnouncementPush } from './services/workerAnnouncements';

// Helper: JSON Response Builder
function jsonResponse(data: any, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  });
}

// Helper: CORS Headers
function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token, X-Scheduler-Secret, X-Device-Id',
  };
}

// SHA-256 string hash helper using Web Crypto
async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Cryptographically secure random hex string
function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extracts and verifies authentication from request headers
 */
async function authenticateRequest(
  request: Request,
  env: Env
): Promise<{ authenticated: boolean; user?: WorkerAuthUser; error?: string }> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'NO_BEARER_TOKEN' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) return { authenticated: false, error: 'EMPTY_TOKEN' };

  // 1. Check if token is a normal user session token (64 hex characters)
  if (token.length >= 32 && !token.includes('.')) {
    const tokenHash = await sha256Hex(token);
    const sessions = await firestoreQuery(env, 'userSessions', {
      filters: [
        { field: 'tokenHash', op: 'EQUAL', value: tokenHash },
        { field: 'active', op: 'EQUAL', value: true },
      ],
      limit: 1,
    });

    if (sessions && sessions.length > 0) {
      const sess = sessions[0];
      return {
        authenticated: true,
        user: {
          uid: sess.userId,
          displayName: sess.displayName,
          role: 'user',
          active: true,
          authMethod: 'institutional_code',
        },
      };
    }
  }

  // 2. Otherwise verify as standard Firebase ID Token (JWT)
  const result = await verifyFirebaseIdToken(token, env);
  if (result.valid && result.user) {
    return { authenticated: true, user: result.user };
  }

  return { authenticated: false, error: result.error || 'INVALID_TOKEN' };
}

/**
 * Checks if request is from an authorized Administrator
 */
async function checkAdminAuth(
  request: Request,
  env: Env,
  bodyJson?: any
): Promise<boolean> {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('adminSecret');
  const headerSecret = request.headers.get('X-Admin-Secret') || request.headers.get('X-Scheduler-Secret');
  const bodySecret = bodyJson?.adminAuthCode || bodyJson?.adminSecret;

  const validAdminSecret = env.ADMIN_SECRET || env.SCHEDULER_SECRET;
  if (validAdminSecret) {
    if (querySecret === validAdminSecret || headerSecret === validAdminSecret || bodySecret === validAdminSecret) {
      return true;
    }
  }

  const auth = await authenticateRequest(request, env);
  if (auth.authenticated && auth.user?.role === 'admin' && auth.user.active) {
    return true;
  }

  return false;
}

export default {
  /**
   * Primary HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Handle CORS Preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(),
      });
    }

    // 2. Route API requests
    // /api/* routes must NEVER fall back to index.html.
    // Unknown API routes return JSON 404 inside handleApiRoute().
    if (pathname.startsWith('/api/')) {
      try {
        return await handleApiRoute(request, env, ctx, pathname, method, url);
      } catch (err: any) {
        console.error(`[Worker API Error] ${method} ${pathname}:`, err);
        return jsonResponse(
          {
            error: 'Internal Server Error',
            message: err?.message || 'An unexpected error occurred',
          },
          500,
          getCorsHeaders()
        );
      }
    }

    // 3. Firebase Authentication Reverse Proxy (/__/auth/*)
    // When Firebase Auth uses an authorized custom or worker domain,
    // it executes OAuth callbacks, iframe checks, and scripts at /__/auth/*
    // (e.g. /__/auth/handler, /__/auth/iframe, /__/auth/experiments.js).
    // These must be proxied to the official Firebase project host.
    if (pathname.startsWith('/__/auth/')) {
      const firebaseProjectId = env.FIREBASE_PROJECT_ID || 'sapient-pen-336609';
      const firebaseAuthHost = `${firebaseProjectId}.firebaseapp.com`;
      const targetUrl = new URL(pathname + url.search, `https://${firebaseAuthHost}`);

      const proxyHeaders = new Headers(request.headers);
      proxyHeaders.set('Host', firebaseAuthHost);

      const hasBody = !['GET', 'HEAD'].includes(method);
      const proxyReq = new Request(targetUrl.toString(), {
        method: request.method,
        headers: proxyHeaders,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
      });

      try {
        return await fetch(proxyReq);
      } catch (proxyErr) {
        console.error('[Worker Firebase Auth Proxy Error]:', proxyErr);
        return new Response('Firebase Auth Proxy Error', { status: 502 });
      }
    }

    // 4. Static Assets & SPA Routing for Non-API Routes
    if (env.ASSETS) {
      // Step A: Attempt to serve matching static asset directly from dist/
      try {
        const assetRes = await env.ASSETS.fetch(request);
        if (assetRes.status !== 404) {
          return assetRes;
        }
      } catch (assetErr) {
        console.warn('[Worker ASSETS fetch warning]:', assetErr);
      }

      // Step B: Check if this was a request for a concrete missing file (e.g. .js, .css, .png, etc.)
      // Missing static files should return 404 rather than corrupting browser asset pipelines with HTML
      const isStaticFile = /\.[a-zA-Z0-9]{1,8}(\?.*)?$/.test(pathname);
      if (isStaticFile && !pathname.endsWith('.html')) {
        return new Response('Not Found', { status: 404 });
      }

      // Step C: SPA Fallback for all non-API GET / HEAD navigation routes
      // (e.g. /, /settings, /calendar, /login, /inbox, /admin, /history, /privacy, /terms, etc.)
      if (method === 'GET' || method === 'HEAD') {
        const indexUrl = new URL('/index.html', request.url);
        try {
          const indexRes = await env.ASSETS.fetch(
            new Request(indexUrl.toString(), {
              method,
              headers: request.headers,
            })
          );
          if (indexRes.status === 200 || indexRes.status === 304) {
            return indexRes;
          }
          // If conditional headers failed, fetch clean GET
          return await env.ASSETS.fetch(new Request(indexUrl.toString(), { method: 'GET' }));
        } catch (indexErr) {
          console.error('[Worker SPA fallback error]:', indexErr);
        }
      }
    }

    return new Response('Not Found', { status: 404 });
  },

  /**
   * Cloudflare Cron Trigger Handler
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          console.log(`[Worker Cron] Executing scheduled trigger: ${event.cron}`);
          const tickRes = await runWorkerSchedulerTick(env);
          console.log(`[Worker Cron] Completed tick: ${tickRes.notificationsSent} reminders sent.`);
        } catch (err) {
          console.error('[Worker Cron Error]:', err);
        }
      })()
    );
  },
};

/**
 * Handles all /api/* routes
 */
async function handleApiRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string,
  method: string,
  url: URL
): Promise<Response> {
  const corsHeaders = getCorsHeaders();

  // -------------------------------------------------------------
  // HEALTH & INTEGRATIONS
  // -------------------------------------------------------------
  if (pathname === '/api/health' && method === 'GET') {
    return jsonResponse(
      {
        status: 'ok',
        runtime: 'cloudflare-workers',
        environment: 'production',
        timestamp: new Date().toISOString(),
        service: 'jpmc-synapse',
        features: {
          gemini: Boolean(env.GEMINI_API_KEY),
          telegram: Boolean(env.TELEGRAM_BOT_TOKEN),
          firebase: Boolean(env.FIREBASE_SERVICE_ACCOUNT_KEY || env.FIREBASE_PROJECT_ID),
          staffAuth: Boolean(env.STAFF_ACCESS_CODE),
        },
      },
      200,
      corsHeaders
    );
  }

  // Safe runtime diagnostic endpoint (NEVER returns secret values)
  if (pathname === '/api/debug/runtime' && method === 'GET') {
    return jsonResponse(
      {
        runtime: 'cloudflare',
        staffAccessCodeConfigured: Boolean(env.STAFF_ACCESS_CODE),
        geminiConfigured: Boolean(env.GEMINI_API_KEY),
        telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
        firebaseServiceAccountConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_KEY),
        schedulerConfigured: Boolean(env.SCHEDULER_SECRET),
      },
      200,
      corsHeaders
    );
  }

  if (pathname === '/api/integrations/status' && method === 'GET') {
    return jsonResponse(
      {
        timestamp: new Date().toISOString(),
        runtime: 'cloudflare-workers',
        integrations: {
          gemini: { configured: Boolean(env.GEMINI_API_KEY), model: 'gemini-2.5-flash' },
          telegram: { configured: Boolean(env.TELEGRAM_BOT_TOKEN) },
          firebase: {
            configured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_KEY),
            projectId: env.FIREBASE_PROJECT_ID || 'sapient-pen-336609',
          },
          staffAuth: { configured: Boolean(env.STAFF_ACCESS_CODE) },
        },
      },
      200,
      corsHeaders
    );
  }

  // -------------------------------------------------------------
  // AI EVENT EXTRACTION
  // -------------------------------------------------------------
  if (pathname === '/api/extract-events' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as any;
    const { rawText, documentBase64, documentMimeType, sourceFileName } = body;

    const result = await extractEventsInWorker(env, {
      rawText: rawText || '',
      documentBase64,
      documentMimeType,
      sourceFileName,
    });

    return jsonResponse(result, 200, corsHeaders);
  }

  // -------------------------------------------------------------
  // TELEGRAM WEBHOOK & BOT
  // -------------------------------------------------------------
  const isTelegramWebhook =
    pathname === '/api/telegram/webhook' ||
    pathname.startsWith('/api/telegram/webhook/') ||
    pathname === '/api/telegram-webhook';

  if (isTelegramWebhook && method === 'GET') {
    return jsonResponse(
      { ok: true, message: 'JpMC Synapse Telegram Webhook is active (Cloudflare Worker)' },
      200,
      corsHeaders
    );
  }

  if (isTelegramWebhook && method === 'POST') {
    const reqSecret = request.headers.get('x-telegram-bot-api-secret-token');
    const isSecretValid = verifyTelegramWebhookSecret(reqSecret, env.TELEGRAM_WEBHOOK_SECRET);

    if (!isSecretValid) {
      console.warn('[WorkerTelegram] Rejected update due to invalid secret token');
      return jsonResponse({ ok: false, error: 'UNAUTHORIZED_SECRET_TOKEN' }, 403, corsHeaders);
    }

    const update = (await request.json().catch(() => ({}))) as any;

    // Acknowledge Telegram immediately with 200 OK, run ingestion in background isolate
    ctx.waitUntil(processTelegramWebhookUpdate(update, env));

    return jsonResponse({ ok: true }, 200, corsHeaders);
  }

  if (pathname === '/api/telegram/status' && method === 'GET') {
    const status = await getTelegramStatusInWorker(env);
    return jsonResponse(status, 200, corsHeaders);
  }

  if (pathname === '/api/telegram/setup-webhook' && method === 'POST') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const body = (await request.json().catch(() => ({}))) as any;
    const webhookUrl = body.webhookUrl || `${url.origin}/api/telegram/webhook`;
    const res = await setupTelegramWebhookInWorker(env, webhookUrl);
    return jsonResponse(res, 200, corsHeaders);
  }

  if (pathname === '/api/telegram/messages' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const messages = await firestoreQuery(env, 'telegramMessages', {
      orderByField: 'id',
      orderDirection: 'DESCENDING',
      limit,
    });
    return jsonResponse({ messages: messages || [] }, 200, corsHeaders);
  }

  // -------------------------------------------------------------
  // CANONICAL EVENTS
  // -------------------------------------------------------------
  if (pathname === '/api/events' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '150', 10);
    const events = await firestoreQuery(env, 'events', {
      orderByField: 'createdAt',
      orderDirection: 'DESCENDING',
      limit,
    });

    return jsonResponse({ events: events || [] }, 200, corsHeaders);
  }

  if (pathname === '/api/events' && method === 'POST') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const event = (await request.json().catch(() => ({}))) as any;
    const eventId = event.id || `evt-${Date.now()}-${randomHex(4)}`;
    const nowIso = new Date().toISOString();

    const canonicalEvent = {
      ...event,
      id: eventId,
      title: (event.title || 'শিরোনামহীন কর্মসূচি').trim(),
      createdAt: event.createdAt || nowIso,
      updatedAt: nowIso,
      reviewStatus: event.reviewStatus || 'auto_approved',
      syncStatus: 'synced',
    };

    await firestoreSetDoc(env, 'events', eventId, canonicalEvent, true);
    return jsonResponse({ success: true, event: canonicalEvent }, 201, corsHeaders);
  }

  if (pathname.startsWith('/api/events/') && method === 'PUT') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const eventId = pathname.replace('/api/events/', '').trim();
    const updateData = (await request.json().catch(() => ({}))) as any;
    updateData.updatedAt = new Date().toISOString();

    const saved = await firestoreSetDoc(env, 'events', eventId, updateData, true);
    return jsonResponse({ success: true, event: saved }, 200, corsHeaders);
  }

  if (pathname.startsWith('/api/events/') && method === 'DELETE') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const eventId = pathname.replace('/api/events/', '').trim();
    await firestoreDeleteDoc(env, 'events', eventId);
    return jsonResponse({ success: true, deletedId: eventId }, 200, corsHeaders);
  }

  // -------------------------------------------------------------
  // NOTIFICATIONS & PUSH DEVICES
  // -------------------------------------------------------------
  if (pathname === '/api/notifications/register-device' && method === 'POST') {
    const device = (await request.json().catch(() => ({}))) as any;
    if (!device.deviceId || !device.fcmToken) {
      return jsonResponse({ error: 'deviceId and fcmToken are required' }, 400, corsHeaders);
    }

    const nowIso = new Date().toISOString();
    const deviceRecord = {
      deviceId: device.deviceId,
      userId: device.userId || null,
      fcmToken: device.fcmToken,
      platform: device.platform || 'web',
      userAgent: request.headers.get('user-agent') || 'unknown',
      notificationsEnabled: Boolean(device.notificationsEnabled),
      updatedAt: nowIso,
      lastSeenAt: nowIso,
      createdAt: nowIso,
    };

    await firestoreSetDoc(env, 'devices', device.deviceId, deviceRecord, true);
    return jsonResponse({ success: true, device: deviceRecord }, 200, corsHeaders);
  }

  if (pathname === '/api/notifications/test-push' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as any;
    const { deviceId, fcmToken, title, body: msgBody } = body;

    let targetToken = fcmToken;
    if (!targetToken && deviceId) {
      const dev = await firestoreGetDoc(env, 'devices', deviceId);
      targetToken = dev?.fcmToken;
    }

    if (!targetToken) {
      return jsonResponse({ error: 'No target FCM token found' }, 400, corsHeaders);
    }

    const res = await sendFcmMessage(env, {
      token: targetToken,
      notification: {
        title: title || '🔔 জেপিএমসি সাইন্যাপস টেস্ট নোটিফিকেশন',
        body: msgBody || 'পুশ নোটিফিকেশন সিস্টেম সফলভাবে সংযুক্ত রয়েছে।',
      },
      data: { type: 'test_push', timestamp: new Date().toISOString() },
    });

    return jsonResponse(res, res.success ? 200 : 500, corsHeaders);
  }

  // -------------------------------------------------------------
  // ANNOUNCEMENTS
  // -------------------------------------------------------------
  if (pathname === '/api/admin/announcements' && method === 'GET') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const announcements = await firestoreQuery(env, 'announcements', {
      orderByField: 'createdAt',
      orderDirection: 'DESCENDING',
      limit: 100,
    });

    return jsonResponse({ announcements: announcements || [] }, 200, corsHeaders);
  }

  if (pathname === '/api/admin/announcements' && method === 'POST') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const body = (await request.json().catch(() => ({}))) as any;
    const id = `ann-${Date.now()}-${randomHex(3)}`;
    const nowIso = new Date().toISOString();

    const announcement = {
      ...body,
      id,
      title: (body.title || '').trim(),
      content: body.content || '',
      published: Boolean(body.published),
      priority: body.priority || 'normal',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await firestoreSetDoc(env, 'announcements', id, announcement, true);
    return jsonResponse({ success: true, announcement }, 201, corsHeaders);
  }

  if (pathname.startsWith('/api/admin/announcements/') && pathname.endsWith('/send-push') && method === 'POST') {
    const isAdmin = await checkAdminAuth(request, env);
    if (!isAdmin) return jsonResponse({ error: 'UNAUTHORIZED' }, 403, corsHeaders);

    const id = pathname.replace('/api/admin/announcements/', '').replace('/send-push', '').trim();
    const res = await broadcastAnnouncementPush(env, id);
    return jsonResponse(res, 200, corsHeaders);
  }

  if (pathname === '/api/announcements/active' && method === 'GET') {
    const announcements = await firestoreQuery(env, 'announcements', {
      filters: [{ field: 'published', op: 'EQUAL', value: true }],
      limit: 50,
    });
    return jsonResponse({ announcements: announcements || [] }, 200, corsHeaders);
  }

  // -------------------------------------------------------------
  // STAFF & USER AUTHENTICATION
  // -------------------------------------------------------------
  if (pathname === '/api/auth/user-login' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as any;
    const clientDeviceId = body?.clientDeviceId;

    // Support canonical property (accessCode) with fallback to synonyms (staffAccessCode, access_code, code)
    const submittedCode = String(
      body?.accessCode ??
      body?.staffAccessCode ??
      body?.access_code ??
      body?.code ??
      ''
    ).trim();

    // Read ONLY env.STAFF_ACCESS_CODE from Cloudflare Worker environment
    const configuredCode = String(env.STAFF_ACCESS_CODE ?? '').trim();

    // Safe diagnostics - NEVER report actual codes
    const safeDiagnostics = {
      configuredExists: Boolean(configuredCode),
      submittedLength: submittedCode.length,
      configuredLength: configuredCode.length,
    };

    console.log('[Worker Staff Auth] Login diagnostics:', safeDiagnostics);

    // 1. Missing server configuration error: env.STAFF_ACCESS_CODE not configured
    if (!configuredCode) {
      console.error('[Worker Staff Auth] STAFF_ACCESS_CODE secret is not configured in Cloudflare environment');
      return jsonResponse(
        {
          success: false,
          error: 'ACCESS_CODE_NOT_CONFIGURED',
          message: 'Server configuration error: STAFF_ACCESS_CODE is not configured in Cloudflare Worker secrets',
          diagnostics: safeDiagnostics,
        },
        500,
        corsHeaders
      );
    }

    // 2. Missing submitted access code validation error
    if (!submittedCode) {
      return jsonResponse(
        {
          success: false,
          error: 'ACCESS_CODE_REQUIRED',
          message: 'Validation error: access code is required',
          diagnostics: safeDiagnostics,
        },
        400,
        corsHeaders
      );
    }

    // Name validation
    const trimmedName = String(body?.name ?? body?.fullName ?? '').trim();
    if (!trimmedName) {
      return jsonResponse(
        {
          success: false,
          error: 'NAME_REQUIRED',
          message: 'Validation error: full name is required',
          diagnostics: safeDiagnostics,
        },
        400,
        corsHeaders
      );
    }

    // 3. Incorrect submitted access code (exact case-sensitive comparison with normalized whitespace)
    if (submittedCode !== configuredCode) {
      return jsonResponse(
        {
          success: false,
          error: 'INVALID_ACCESS_CODE',
          message: 'Invalid institutional access code',
          diagnostics: safeDiagnostics,
        },
        401,
        corsHeaders
      );
    }

    // Generate deterministic User ID
    const normalizedName = trimmedName.toLowerCase().replace(/\s+/g, '_');
    const userHash = (await sha256Hex(normalizedName)).slice(0, 14);
    const userId = `usr_${userHash}`;

    // Generate cryptographically secure session token
    const sessionToken = randomHex(32);
    const tokenHash = await sha256Hex(sessionToken);
    const sessionId = `sess_${Date.now()}_${randomHex(6)}`;
    const nowIso = new Date().toISOString();

    // Store session in Firestore
    const sessionDoc = {
      sessionId,
      tokenHash,
      userId,
      displayName: trimmedName,
      role: 'user',
      createdAt: nowIso,
      lastLoginAt: nowIso,
      active: true,
      clientDeviceId: clientDeviceId || null,
    };
    await firestoreSetDoc(env, 'userSessions', sessionId, sessionDoc, true);

    // Store/Update user profile
    await firestoreSetDoc(
      env,
      'authorizedUsers',
      userId,
      {
        uid: userId,
        displayName: trimmedName,
        role: 'user',
        active: true,
        authMethod: 'institutional_code',
        updatedAt: nowIso,
      },
      true
    );

    // Mint custom Firebase token if Service Account is available
    const customToken = await createCustomToken(userId, { role: 'user' }, env);

    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    return jsonResponse(
      {
        success: true,
        session: {
          token: sessionToken,
          sessionId,
          expiresAt,
        },
        user: {
          uid: userId,
          email: '',
          displayName: trimmedName,
          role: 'user',
          active: true,
        },
        customToken,
        diagnostics: safeDiagnostics,
      },
      200,
      corsHeaders
    );
  }

  if (pathname === '/api/auth/verify-session' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as any;
    const sessionToken = body.sessionToken || body.token;
    if (!sessionToken) {
      return jsonResponse({ valid: false, error: 'Missing session token' }, 400, corsHeaders);
    }

    const tokenHash = await sha256Hex(String(sessionToken).trim());
    const sessions = await firestoreQuery(env, 'userSessions', {
      filters: [
        { field: 'tokenHash', op: 'EQUAL', value: tokenHash },
        { field: 'active', op: 'EQUAL', value: true },
      ],
      limit: 1,
    });

    if (!sessions || sessions.length === 0) {
      return jsonResponse({ valid: false, error: 'Session expired or not found' }, 401, corsHeaders);
    }

    const sess = sessions[0];
    const userDoc = await firestoreGetDoc(env, 'authorizedUsers', sess.userId);
    if (userDoc && userDoc.active === false) {
      return jsonResponse({ valid: false, error: 'Account inactive' }, 403, corsHeaders);
    }

    const customToken = await createCustomToken(sess.userId, { role: 'user' }, env);

    return jsonResponse(
      {
        valid: true,
        user: {
          uid: sess.userId,
          displayName: sess.displayName,
          role: 'user',
          active: true,
        },
        customToken,
      },
      200,
      corsHeaders
    );
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    const body = (await request.json().catch(() => ({}))) as any;
    const sessionToken = body.sessionToken || body.token;
    if (sessionToken) {
      const tokenHash = await sha256Hex(String(sessionToken).trim());
      const sessions = await firestoreQuery(env, 'userSessions', {
        filters: [{ field: 'tokenHash', op: 'EQUAL', value: tokenHash }],
        limit: 5,
      });
      for (const s of sessions) {
        await firestoreSetDoc(env, 'userSessions', s.sessionId, { active: false }, true);
      }
    }
    return jsonResponse({ success: true }, 200, corsHeaders);
  }

  if (pathname === '/api/auth/ensure-authorized' && method === 'POST') {
    const auth = await authenticateRequest(request, env);
    if (!auth.authenticated || !auth.user) {
      return jsonResponse({ error: 'UNAUTHORIZED' }, 401, corsHeaders);
    }

    const nowIso = new Date().toISOString();
    await firestoreSetDoc(
      env,
      'authorizedUsers',
      auth.user.uid,
      {
        uid: auth.user.uid,
        email: auth.user.email || '',
        displayName: auth.user.displayName || '',
        role: auth.user.role || 'user',
        active: true,
        updatedAt: nowIso,
      },
      true
    );

    return jsonResponse({ success: true, user: auth.user }, 200, corsHeaders);
  }

  if (pathname === '/api/auth/profile' && method === 'GET') {
    const auth = await authenticateRequest(request, env);
    if (!auth.authenticated || !auth.user) {
      return jsonResponse({ error: 'UNAUTHORIZED' }, 401, corsHeaders);
    }

    return jsonResponse({ user: auth.user }, 200, corsHeaders);
  }

  // Admin Google Sign-In & Verification Endpoint
  if (pathname === '/api/auth/admin-verify' && method === 'POST') {
    try {
      const authHeader = request.headers.get('authorization') || '';
      let token = '';
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      }
      if (!token) {
        return jsonResponse({ authorized: false, error: 'Missing authorization token' }, 401, corsHeaders);
      }

      const verification = await verifyFirebaseIdToken(token, env);
      if (!verification.valid || !verification.user) {
        return jsonResponse(
          {
            authorized: false,
            error: 'গুগল প্রমাণীকরণ যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
          },
          401,
          corsHeaders
        );
      }

      const email = (verification.user.email || '').trim().toLowerCase();
      const uid = verification.user.uid;

      let authDoc = await firestoreGetDoc(env, 'authorizedUsers', uid);
      const isInitialAdmin = email && Boolean(INITIAL_ADMIN_EMAILS[email]);

      if (!authDoc && isInitialAdmin) {
        const nowIso = new Date().toISOString();
        authDoc = {
          uid,
          email: verification.user.email,
          displayName: verification.user.displayName || INITIAL_ADMIN_EMAILS[email]?.label || email.split('@')[0],
          photoURL: verification.user.photoURL || null,
          role: 'admin',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        await firestoreSetDoc(env, 'authorizedUsers', uid, authDoc, true);
      }

      const isAdmin =
        (authDoc?.role === 'admin' || (isInitialAdmin && authDoc?.active !== false)) &&
        authDoc?.active !== false;

      if (!isAdmin) {
        console.warn(`[Worker Auth] Unauthorized Google Admin sign-in rejected: ${email} (${uid})`);
        return jsonResponse(
          {
            authorized: false,
            error:
              'এই গুগল অ্যাকাউন্টটি অ্যাডমিনিস্ট্রেটর হিসেবে অনুমোদিত নয়। সাধারণ ব্যবহারকারী হিসেবে আপনার নাম ও অ্যাক্সেস কোড দিয়ে প্রবেশ করুন।',
          },
          403,
          corsHeaders
        );
      }

      return jsonResponse(
        {
          authorized: true,
          user: {
            uid,
            email: verification.user.email,
            displayName: authDoc?.displayName || verification.user.displayName || email.split('@')[0],
            photoURL: verification.user.photoURL || authDoc?.photoURL || null,
            role: 'admin',
            active: true,
          },
        },
        200,
        corsHeaders
      );
    } catch (err: any) {
      console.error('[Worker Auth] admin-verify error:', err);
      return jsonResponse(
        {
          authorized: false,
          error: 'গুগল প্রমাণীকরণ যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
        },
        401,
        corsHeaders
      );
    }
  }

  // -------------------------------------------------------------
  // SCHEDULER & CRON HTTP TRIGGER ENDPOINTS
  // -------------------------------------------------------------
  const isSchedulerEndpoint =
    pathname === '/api/internal/run-reminder-scheduler' ||
    pathname === '/api/reminders/trigger-check' ||
    pathname === '/api/internal/run-morning-briefing';

  if (isSchedulerEndpoint && method === 'POST') {
    const secret =
      request.headers.get('x-scheduler-secret') ||
      url.searchParams.get('secret') ||
      (await request.json().catch(() => ({})))?.secret;

    const validSecret = env.SCHEDULER_SECRET || env.ADMIN_SECRET;
    if (validSecret && secret !== validSecret) {
      return jsonResponse({ error: 'UNAUTHORIZED_SCHEDULER_SECRET' }, 401, corsHeaders);
    }

    if (pathname.includes('morning-briefing')) {
      const res = await runWorkerMorningBriefing(env, true);
      return jsonResponse(res, 200, corsHeaders);
    }

    const tick = await runWorkerSchedulerTick(env);
    return jsonResponse(tick, 200, corsHeaders);
  }

  // Default: Unknown API Route returns 404 JSON
  return jsonResponse(
    {
      error: 'Not Found',
      message: `Endpoint ${method} ${pathname} does not exist on Cloudflare Worker`,
    },
    404,
    corsHeaders
  );
}
