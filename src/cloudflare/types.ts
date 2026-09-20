/**
 * JpMC Synapse — Cloudflare Worker Environment & Type Definitions
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

export interface Env {
  // Cloudflare Workers Static Assets binding
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };

  // Staff Account & Authentication
  STAFF_ACCESS_CODE?: string;

  // AI & Automation
  GEMINI_API_KEY?: string;

  // Telegram Bot Integration
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Firebase / Google Cloud
  FIREBASE_SERVICE_ACCOUNT_KEY?: string;
  FIREBASE_PROJECT_ID?: string;

  // Schedulers & Administration
  SCHEDULER_SECRET?: string;
  ADMIN_SECRET?: string;

  // Application Public Base URL
  PUBLIC_APP_URL?: string;
  APP_URL?: string;
}

export interface WorkerAuthUser {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string | null;
  role: 'admin' | 'user';
  active: boolean;
  authMethod?: 'google' | 'institutional_code' | 'normal-user';
}

export interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id?: string;
  private_key: string;
  client_email: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
}

export interface ExecutionContext {
  waitUntil: (promise: Promise<any>) => void;
  passThroughOnException?: () => void;
}

export interface ScheduledEvent {
  cron: string;
  type: string;
  scheduledTime: number;
}

export const INITIAL_ADMIN_EMAILS: Record<string, { label: string; role: 'admin' }> = {
  'marufjb@gmail.com': { label: 'Maruf', role: 'admin' },
  'nasir230171@gmail.com': { label: 'Principal', role: 'admin' },
};
