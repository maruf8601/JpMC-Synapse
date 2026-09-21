/**
 * JpMC Synapse — Domain Models & Entities
 * Package: com.jpmc.synapse
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

export type Priority = 'normal' | 'important' | 'urgent';

export type EventSource = 'Telegram' | 'Google Calendar' | 'Manual' | 'AI Extracted';

export type ReviewStatus = 'auto_approved' | 'needs_review' | 'rejected';

export type SyncStatus = 'synced' | 'pending' | 'failed' | 'local_only';

export type ReminderType = 'notification' | 'alarm' | 'morning_briefing';

export type Category = 
  | 'সভা'              // Meeting
  | 'একাডেমিক'         // Academic
  | 'পরীক্ষা'           // Examination
  | 'সেমিনার'          // Seminar
  | 'ওয়ার্কশপ'          // Workshop
  | 'প্রশিক্ষণ'         // Training
  | 'প্রশাসনিক'        // Administrative
  | 'জাতীয় দিবস'       // National Day
  | 'ক্রয়/টেন্ডার'       // Procurement/Tender
  | 'ছাত্র বিষয়ক'       // Student Affairs
  | 'ব্যক্তিগত'         // Personal
  | 'অন্যান্য';         // Other

export interface ReminderEntity {
  id: string;
  eventId: string;
  reminderType: ReminderType;
  minutesBefore: number; // e.g. 120 (2h), 30 (30m), 1440 (1d)
  scheduledAt: string;   // ISO timestamp
  enabled: boolean;
}

export interface EventEntity {
  id: string;
  title: string;
  description: string;
  eventDate: string | null;      // YYYY-MM-DD (Asia/Dhaka) or null if incomplete
  startTime: string | null;      // HH:mm (24-hour format) or null if incomplete
  endTime: string | null; // HH:mm or null
  venue?: string | null;
  category: Category;
  priority: Priority;
  source: EventSource;
  sourceId?: string;
  telegramMessageId?: number;
  telegramChatId?: string;
  googleCalendarEventId?: string;
  calendarId?: string;
  lastCalendarSyncAt?: string;
  isGCalSynced?: boolean;
  originalText?: string;
  originalDocumentUrl?: string;
  confidence?: number | null;    // 0.0 to 1.0 or null
  reviewStatus: ReviewStatus;
  syncStatus: SyncStatus;
  participants?: string;
  sender?: string;
  committee?: string;
  notes?: string;
  isAllDay?: boolean;
  isCompleted?: boolean;
  ambiguities?: string[];
  reminders?: ReminderEntity[];
  createdBy?: string;
  visibility?: string;
  createdAt: string;
  updatedAt: string;
}

export type TelegramMessageStatus =
  | 'Received'
  | 'Processing'
  | 'Processed'
  | 'Schedule Created'
  | 'Review Required'
  | 'Needs Review'
  | 'Not a Schedule'
  | 'Duplicate'
  | 'Download Failed'
  | 'Gemini Processing Failed'
  | 'Processing Failed'
  | 'Unsupported Document';

export interface TelegramMessageEntity {
  id: number;
  messageId?: number;
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
  mimeType?: string;
  fileSize?: number;
  telegramFileId?: string;
  caption?: string;
  processingStatus?: 'received' | 'processing' | 'processed' | 'download_failed' | 'gemini_failed' | 'unsupported';
  extractionStatus?: 'schedule_candidate' | 'needs_review' | 'not_a_schedule' | 'failed' | 'pending';
  status: TelegramMessageStatus;
  extractedEventIds: string[];
  confidence: number;
  receivedAt?: string;
  processedAt?: string;
}

export type NavigationTab = 'home' | 'calendar' | 'inbox' | 'admin' | 'settings' | 'history' | 'add';

export type Language = 'bn' | 'en';

export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export type AnnouncementDisplayMode = 'show_once' | 'show_every_open' | 'require_acknowledgement';

export type AnnouncementTargetAudience = 'everyone' | 'admins_only' | 'users_only';

export type AnnouncementStatus = 'draft' | 'published' | 'expired';

export interface AnnouncementEntity {
  id: string;
  title: string;
  message: string;
  priority: AnnouncementPriority;
  displayMode: AnnouncementDisplayMode;
  targetAudience: AnnouncementTargetAudience;
  active: boolean;
  status: AnnouncementStatus;
  startAt: string; // ISO string
  expiresAt: string; // ISO string
  sendPush: boolean;
  pushSentAt?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Optional legacy date fields support
  startDate?: string;
  endDate?: string;
  publishAt?: string;
  // Optional statistics for admin views
  stats?: {
    viewedCount: number;
    acknowledgedCount: number;
  };
}

export interface AnnouncementReceipt {
  announcementId: string;
  uid: string;
  displayName?: string;
  email?: string | null;
  seenAt?: string | null;
  viewedAt?: string | null;
  acknowledgedAt?: string | null;
  status?: 'viewed' | 'acknowledged';
}

export interface AnnouncementReceiptDetail {
  uid: string;
  displayName: string;
  email: string | null;
  role?: string;
  viewedAt: string | null;
  acknowledgedAt: string | null;
  status: 'acknowledged' | 'viewed';
}

export interface AnnouncementReceiptsSummary {
  announcementId: string;
  totalAuthorizedUsers: number | null;
  viewedCount: number;
  acknowledgedCount: number;
  unseenCount?: number | null;
  receipts: AnnouncementReceiptDetail[];
}
