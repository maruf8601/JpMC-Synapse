/**
 * JpMC Synapse — Automatic Daily Google Drive Backup Service
 * Automatically checks and archives previous/past events to Google Drive on a daily schedule
 */

import { eventRepository } from '../data/eventRepository';
import { saveEventHistoryToDrive } from './googleDriveService';
import { hasCachedGoogleAuth, getAccessToken } from './googleAuth';

export interface AutoBackupLog {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: string;
  status: 'success' | 'failed' | 'skipped_no_events' | 'staged_offline';
  eventsCount: number;
  fileName?: string;
  fileId?: string;
  error?: string;
}

const BACKUP_ENABLED_KEY = 'jpmc_auto_backup_enabled';
const LAST_BACKUP_DATE_KEY = 'jpmc_last_auto_backup_date';
const BACKUP_LOGS_KEY = 'jpmc_auto_backup_logs';

type BackupListener = () => void;
const listeners: Set<BackupListener> = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeToAutoBackup(fn: BackupListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isAutoBackupEnabled(): boolean {
  return localStorage.getItem(BACKUP_ENABLED_KEY) !== 'false';
}

export function setAutoBackupEnabled(enabled: boolean): void {
  localStorage.setItem(BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
  notify();
}

export function getLastAutoBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_DATE_KEY);
}

export function getAutoBackupLogs(): AutoBackupLog[] {
  try {
    const raw = localStorage.getItem(BACKUP_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function appendBackupLog(log: AutoBackupLog) {
  const logs = getAutoBackupLogs();
  logs.unshift(log);
  // Keep last 30 daily logs
  if (logs.length > 30) logs.length = 30;
  localStorage.setItem(BACKUP_LOGS_KEY, JSON.stringify(logs));
  notify();
}

/**
 * Checks if a daily backup is needed today, and executes it automatically.
 */
export async function checkAndRunDailyAutoBackup(): Promise<{
  executed: boolean;
  status: 'already_done' | 'success' | 'staged_offline' | 'disabled' | 'no_events' | 'error';
  message: string;
  fileName?: string;
}> {
  if (!isAutoBackupEnabled()) {
    return { executed: false, status: 'disabled', message: 'Daily auto-backup is disabled.' };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const lastBackupDate = getLastAutoBackupDate();

  if (lastBackupDate === todayStr) {
    return {
      executed: false,
      status: 'already_done',
      message: `Today's backup already completed on ${todayStr}.`,
    };
  }

  // Get previous/past events
  const pastEvents = eventRepository.getPastEvents();
  const allEvents = eventRepository.getAllHistoryRecords();
  const eventsToBackup = pastEvents.length > 0 ? pastEvents : allEvents;

  if (eventsToBackup.length === 0) {
    return {
      executed: false,
      status: 'no_events',
      message: 'No previous events to archive.',
    };
  }

  // Check if Google Drive is authorized
  const hasToken = hasCachedGoogleAuth();
  const token = await getAccessToken();

  if (!hasToken || !token) {
    // Stage offline backup locally so data is never lost
    try {
      localStorage.setItem(
        'jpmc_staged_auto_backup',
        JSON.stringify({
          date: todayStr,
          timestamp: new Date().toISOString(),
          count: eventsToBackup.length,
          events: eventsToBackup,
        })
      );
      appendBackupLog({
        id: `staged-${Date.now()}`,
        date: todayStr,
        timestamp: new Date().toISOString(),
        status: 'staged_offline',
        eventsCount: eventsToBackup.length,
      });
    } catch {
      // ignore
    }

    return {
      executed: false,
      status: 'staged_offline',
      message: 'Google Drive authorization needed. Staged locally for auto cloud upload upon sign-in.',
    };
  }

  try {
    const backupTitle = `JpMC_Daily_AutoBackup_${todayStr}`;
    const result = await saveEventHistoryToDrive(eventsToBackup, backupTitle);

    localStorage.setItem(LAST_BACKUP_DATE_KEY, todayStr);
    localStorage.removeItem('jpmc_staged_auto_backup');

    appendBackupLog({
      id: `bkp-${Date.now()}`,
      date: todayStr,
      timestamp: new Date().toISOString(),
      status: 'success',
      eventsCount: eventsToBackup.length,
      fileName: result.fileName,
      fileId: result.fileId,
    });

    return {
      executed: true,
      status: 'success',
      message: `Auto backup completed successfully for ${eventsToBackup.length} events.`,
      fileName: result.fileName,
    };
  } catch (err: any) {
    appendBackupLog({
      id: `err-${Date.now()}`,
      date: todayStr,
      timestamp: new Date().toISOString(),
      status: 'failed',
      eventsCount: eventsToBackup.length,
      error: err?.message || 'Upload error',
    });

    return {
      executed: false,
      status: 'error',
      message: `Auto-backup failed: ${err?.message}`,
    };
  }
}
