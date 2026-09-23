import { Capacitor } from '@capacitor/core';

/**
 * Centralized API configuration for JpMC Synapse.
 *
 * In native Capacitor (Android APK), relative /api requests resolve against
 * the local WebView origin (e.g. capacitor://localhost or https://localhost) and fail.
 * They must target the production Render backend: https://jpmc-synapse.onrender.com.
 *
 * In browser development mode, requests use relative /api paths to leverage the
 * local Vite/Express dev server.
 */

export const RENDER_PRODUCTION_BACKEND_URL = 'https://jpmc-synapse.onrender.com';

export function getApiBaseUrl(): string {
  // 1. Native Capacitor runtime (Android / iOS APK)
  if (Capacitor.isNativePlatform()) {
    const customUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_PUBLIC_APP_URL;
    if (customUrl && !customUrl.includes('localhost') && !customUrl.includes('127.0.0.1')) {
      return customUrl.replace(/\/$/, '');
    }
    return RENDER_PRODUCTION_BACKEND_URL;
  }

  // 2. Explicit environment override for web (if provided)
  const explicitUrl = (import.meta as any).env?.VITE_API_URL;
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }

  // 3. Browser development or same-origin web deployment
  return '';
}

/**
 * Returns the absolute or relative API URL for the given path.
 *
 * Example:
 * apiUrl('/api/telegram/status')
 * -> In Android APK: 'https://jpmc-synapse.onrender.com/api/telegram/status'
 * -> In Browser Dev: '/api/telegram/status'
 */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export interface ApiFetchOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Centralized fetch helper that prefixes relative `/api` paths with the appropriate
 * backend base URL when running in native Android / Capacitor environments.
 * Includes configurable timeout (default 12s) to prevent hung requests during Render cold starts.
 */
export async function apiFetch(input: string, init?: ApiFetchOptions): Promise<Response> {
  const targetUrl = input.startsWith('/api') ? apiUrl(input) : input;
  const timeoutMs = init?.timeoutMs ?? 12000;

  // If caller explicitly provided an AbortSignal, use native fetch with that signal
  if (init?.signal) {
    return fetch(targetUrl, init);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`[apiFetch] Request timed out after ${timeoutMs}ms: ${targetUrl}`));
  }, timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Centralized safe helper to retrieve live Telegram Bot ingestion status.
 * Never returns secrets (tokens, webhook secrets, Firebase keys).
 */
export interface SafeTelegramStatus {
  configured: boolean;
  webhookUrl: string;
  status: 'active' | 'pending_configuration' | 'error';
  processedCount: number;
  totalMessagesReceived?: number;
  lastReceived?: string | null;
}

export async function fetchTelegramStatus(): Promise<SafeTelegramStatus> {
  try {
    const res = await apiFetch('/api/telegram/status');
    if (res.ok) {
      const data = await res.json();
      return {
        configured: Boolean(data.configured),
        webhookUrl: data.webhookUrl || `${RENDER_PRODUCTION_BACKEND_URL}/api/telegram/webhook`,
        status: data.configured ? 'active' : 'pending_configuration',
        processedCount: typeof data.processedCount === 'number' ? data.processedCount : (data.totalMessagesReceived || 0),
        totalMessagesReceived: typeof data.totalMessagesReceived === 'number' ? data.totalMessagesReceived : (data.processedCount || 0),
        lastReceived: data.lastReceived || null,
      };
    }
  } catch (err) {
    console.warn('[api] Failed to fetch Telegram status:', err);
  }

  return {
    configured: false,
    webhookUrl: `${RENDER_PRODUCTION_BACKEND_URL}/api/telegram/webhook`,
    status: 'pending_configuration',
    processedCount: 0,
    totalMessagesReceived: 0,
    lastReceived: null,
  };
}
