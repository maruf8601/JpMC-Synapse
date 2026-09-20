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
export const CLOUDFLARE_PRODUCTION_BACKEND_URL = 'https://jpmc-synapse.workers.dev';

// Default backend target can be toggled via VITE_API_TARGET ('cloudflare' | 'render') or VITE_API_URL.
// Defaults to Cloudflare Workers for modern deployments.
export const DEFAULT_PRODUCTION_BACKEND_URL =
  ((import.meta as any).env?.VITE_API_TARGET === 'render')
    ? RENDER_PRODUCTION_BACKEND_URL
    : CLOUDFLARE_PRODUCTION_BACKEND_URL;

export function getApiBaseUrl(): string {
  // 1. Native Capacitor runtime (Android / iOS APK)
  if (Capacitor.isNativePlatform()) {
    const customUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_PUBLIC_APP_URL;
    if (customUrl && !customUrl.includes('localhost') && !customUrl.includes('127.0.0.1')) {
      return customUrl.replace(/\/$/, '');
    }
    return DEFAULT_PRODUCTION_BACKEND_URL;
  }

  // 2. Browser web deployment (Cloudflare Workers, local dev, or preview):
  // When running in the browser, always use same-origin relative '/api' endpoint
  // to ensure requests execute directly on the current deployment (Cloudflare Worker)
  // and NEVER accidentally route to an outdated Render backend.
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // If deployed on Cloudflare (*.workers.dev, *.pages.dev) or custom web domain, strictly use same-origin
    if (hostname.includes('workers.dev') || hostname.includes('pages.dev') || !hostname.includes('localhost')) {
      return '';
    }
    // Only allow explicit VITE_API_URL during local desktop development when explicitly configured
    const explicitUrl = (import.meta as any).env?.VITE_API_URL;
    if (explicitUrl) {
      return explicitUrl.replace(/\/$/, '');
    }
    return '';
  }

  // 3. Fallback for SSR or non-browser environments
  const explicitUrl = (import.meta as any).env?.VITE_API_URL;
  if (explicitUrl) {
    return explicitUrl.replace(/\/$/, '');
  }

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

/**
 * Centralized fetch helper that prefixes relative `/api` paths with the appropriate
 * backend base URL when running in native Android / Capacitor environments.
 */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const targetUrl = input.startsWith('/api') ? apiUrl(input) : input;
  return fetch(targetUrl, init);
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
        webhookUrl: data.webhookUrl || `${DEFAULT_PRODUCTION_BACKEND_URL}/api/telegram/webhook`,
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
    webhookUrl: `${DEFAULT_PRODUCTION_BACKEND_URL}/api/telegram/webhook`,
    status: 'pending_configuration',
    processedCount: 0,
    totalMessagesReceived: 0,
    lastReceived: null,
  };
}
