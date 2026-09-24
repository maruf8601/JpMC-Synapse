/**
 * JpMC Synapse — Client-Side Chat Service
 * Handles user directory search, 1-on-1 messaging, attachments,
 * shareable links, history clearing, and admin oversight APIs.
 */

import { apiFetch } from '../config/api';
import { getAuthHeader } from './authService';
import { chatSocket } from './chatSocketClient';

export interface ChatUser {
  uid: string;
  displayName: string;
  email?: string;
  role: 'admin' | 'user';
  department?: string;
  designation?: string;
  photoURL?: string | null;
  lastSeenAt?: string | null;
}

export interface ChatAttachmentMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  downloadUrl: string;
  storageKey?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file';
  attachment?: ChatAttachmentMeta | null;
  createdAt: string;
  expiresAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  deletedByUser?: boolean;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  clientMsgId?: string | null;
  // Local UI status
  sending?: boolean;
  failed?: boolean;
}

export const DANGEROUS_EXTENSIONS_SET = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.ps1',
  '.vbs',
  '.jar',
  '.apk',
  '.sh',
  '.bin',
  '.pif',
  '.gadget',
  '.hta',
  '.cpl',
  '.msc',
  '.wsf',
  '.reg',
  '.dll',
  '.so',
  '.dylib',
  '.deb',
  '.rpm',
  '.appimage',
]);

export function isDangerousExtension(filename: string): boolean {
  const parts = (filename || '').toLowerCase().split('.');
  if (parts.length < 2) return false;
  const ext = '.' + parts[parts.length - 1];
  return DANGEROUS_EXTENSIONS_SET.has(ext);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function classifyFileCategory(
  filename: string,
  mimeType: string
): 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file' {
  const lowerMime = (mimeType || '').toLowerCase();
  const lowerName = (filename || '').toLowerCase();

  if (lowerMime.startsWith('image/')) return 'image';
  if (lowerMime.startsWith('video/')) return 'video';
  if (lowerMime.includes('audio/webm') || lowerMime.includes('opus') || lowerName.startsWith('voice_')) {
    return 'voice';
  }
  if (lowerMime.startsWith('audio/')) return 'audio';
  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) return 'pdf';
  if (
    lowerName.endsWith('.zip') ||
    lowerName.endsWith('.rar') ||
    lowerName.endsWith('.7z') ||
    lowerName.endsWith('.tar') ||
    lowerName.endsWith('.gz')
  ) {
    return 'archive';
  }
  if (
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.ppt') ||
    lowerName.endsWith('.pptx') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv') ||
    lowerMime.includes('document') ||
    lowerMime.includes('office')
  ) {
    return 'document';
  }
  return 'file';
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantProfiles: Record<string, ChatUser>;
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
    type: string;
    hasAttachment?: boolean;
  } | null;
  lastMessageAt: string;
  participantStates: Record<
    string,
    {
      clearedAt?: string | null;
      unreadCount: number;
      lastReadAt?: string | null;
    }
  >;
  createdAt: string;
  updatedAt: string;
}

export interface AdminChatOversightItem {
  conversation: Conversation;
  totalMessagesIn72h: number;
  userDeletedMessagesCount: number;
  activeAttachmentCount: number;
}

/**
 * Searches users by name, department, or designation.
 */
export async function searchSynapseUsers(searchTerm: string): Promise<ChatUser[]> {
  try {
    const authHeaders = await getAuthHeader();
    const query = encodeURIComponent(searchTerm.trim());
    const res = await apiFetch(`/api/chat/users/search?q=${query}`, {
      headers: authHeaders,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.users || [];
  } catch (err) {
    console.warn('[chatClientService] Search failed:', err);
    return [];
  }
}

/**
 * Retrieves single user profile by ID.
 */
export async function getSynapseUserProfile(userId: string): Promise<ChatUser | null> {
  try {
    const authHeaders = await getAuthHeader();
    const res = await apiFetch(`/api/chat/users/${encodeURIComponent(userId)}`, {
      headers: authHeaders,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || null;
  } catch (err) {
    console.warn('[chatClientService] Get profile failed:', err);
    return null;
  }
}

/**
 * Retrieves the current user's active conversations.
 */
export async function getUserConversations(): Promise<Conversation[]> {
  try {
    const authHeaders = await getAuthHeader();
    const res = await apiFetch('/api/chat/conversations', {
      headers: authHeaders,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.conversations || [];
  } catch (err) {
    console.warn('[chatClientService] Get conversations failed:', err);
    return [];
  }
}

/**
 * Gets or initializes a conversation with target user.
 */
export async function getOrCreateConversation(targetUserId: string): Promise<Conversation> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/chat/conversations', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetUserId }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to start conversation');
  }

  const data = await res.json();
  return data.conversation;
}

/**
 * Retrieves messages for a conversation (subject to 72h TTL and user clearing/deletion rules).
 */
export async function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  try {
    const authHeaders = await getAuthHeader();
    const res = await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
      headers: authHeaders,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages || [];
  } catch (err) {
    console.warn('[chatClientService] Get messages failed:', err);
    return [];
  }
}

/**
 * Sends a message in a conversation.
 */
export async function sendChatMessage(params: {
  conversationId: string;
  content: string;
  type?: ChatMessage['type'];
  attachment?: ChatAttachmentMeta | null;
  clientMsgId?: string;
}): Promise<ChatMessage> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/chat/conversations/${encodeURIComponent(params.conversationId)}/messages`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to send message');
  }

  const data = await res.json();
  return data.message;
}

/**
 * Soft-deletes an individual message for the normal user.
 * Disappears immediately from user view, retained for admin oversight until original 72h expiry.
 */
export async function deleteIndividualMessage(conversationId: string, messageId: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'DELETE',
      headers: authHeaders,
    }
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to delete message');
  }
}

/**
 * Clears conversation history for the requesting user (per-user boundary).
 */
export async function clearConversationHistory(conversationId: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/clear`, {
    method: 'POST',
    headers: authHeaders,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to clear conversation');
  }
}

/**
 * Marks conversation as read.
 */
export async function markConversationAsRead(conversationId: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeader();
    await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
      headers: authHeaders,
    });
  } catch {}
}

/**
 * Uploads a file using multipart streaming up to 100 MB.
 * Supports upload progress tracking and cancellation.
 */
export function uploadChatAttachmentStream(
  conversationId: string,
  file: File,
  onProgress?: (percent: number, loaded: number, total: number) => void
): { promise: Promise<ChatAttachmentMeta>; abort: () => void } {
  // Validate maximum 100 MB limit
  const MAX_FILE_SIZE = 100 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return {
      promise: Promise.reject(
        new Error('File is too large. Maximum allowed file size is 100 MB. (ফাইলের আকার সর্বোচ্চ ১০০ মেগাবাইট)')
      ),
      abort: () => {},
    };
  }

  // Validate dangerous file extension
  if (isDangerousExtension(file.name)) {
    return {
      promise: Promise.reject(
        new Error(
          'Security restriction: Executable and script files cannot be transmitted. (নিরাপত্তাজনিত কারণে এই ফাইলটি পাঠানো নিষেধ)'
        )
      ),
      abort: () => {},
    };
  }

  let xhr: XMLHttpRequest | null = new XMLHttpRequest();

  const promise = new Promise<ChatAttachmentMeta>(async (resolve, reject) => {
    try {
      const authHeaders = await getAuthHeader();
      const formData = new FormData();
      formData.append('conversationId', conversationId);
      formData.append('file', file, file.name);

      xhr!.open('POST', '/api/chat/attachments/stream-upload');

      // Set authorization headers
      Object.entries(authHeaders).forEach(([key, val]) => {
        xhr!.setRequestHeader(key, val);
      });

      // Track upload progress
      if (xhr!.upload && onProgress) {
        xhr!.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const percent = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            onProgress(percent, evt.loaded, evt.total);
          }
        };
      }

      xhr!.onload = () => {
        if (xhr!.status >= 200 && xhr!.status < 300) {
          try {
            const data = JSON.parse(xhr!.responseText);
            if (data.success && data.attachment) {
              resolve(data.attachment);
            } else {
              reject(new Error(data.error || 'Upload failed'));
            }
          } catch (e) {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const errRes = JSON.parse(xhr!.responseText);
            reject(new Error(errRes.error || `Upload failed with HTTP ${xhr!.status}`));
          } catch {
            reject(new Error(`Upload failed with HTTP ${xhr!.status}`));
          }
        }
      };

      xhr!.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr!.onabort = () => {
        reject(new Error('Upload cancelled'));
      };

      xhr!.send(formData);
    } catch (err) {
      reject(err);
    }
  });

  return {
    promise,
    abort: () => {
      if (xhr) {
        xhr.abort();
        xhr = null;
      }
    },
  };
}

/**
 * Fallback upload method for backward compatibility.
 */
export async function uploadChatAttachment(
  conversationId: string,
  file: File
): Promise<ChatAttachmentMeta> {
  const { promise } = uploadChatAttachmentStream(conversationId, file);
  return promise;
}

/**
 * Downloads or views an attachment.
 */
export async function fetchChatAttachment(
  attachmentId: string
): Promise<{ filename: string; mimeType: string; base64Data: string } | null> {
  try {
    const authHeaders = await getAuthHeader();
    const res = await apiFetch(`/api/chat/attachments/${encodeURIComponent(attachmentId)}`, {
      headers: authHeaders,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.file || null;
  } catch (err) {
    console.warn('[chatClientService] fetchAttachment failed:', err);
    return null;
  }
}

/**
 * Admin Chat Oversight: Loads all conversations with retention and deletion statistics.
 */
export async function fetchAdminChatOversight(): Promise<AdminChatOversightItem[]> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/admin/chat/oversight', {
    headers: authHeaders,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to load chat oversight');
  }

  const data = await res.json();
  return data.oversight || [];
}

/**
 * Admin Chat Oversight: Loads conversation messages including user-deleted messages within 72h.
 */
export async function fetchAdminOversightMessages(conversationId: string): Promise<ChatMessage[]> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/admin/chat/oversight/${encodeURIComponent(conversationId)}/messages`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to load oversight messages');
  }

  const data = await res.json();
  return data.messages || [];
}

/**
 * Generates and copies a shareable chat/profile link to clipboard.
 */
export async function copyShareableChatLink(userId: string): Promise<boolean> {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // Shareable link format compatible with Web, PWA, and deep-linking
    const shareUrl = `${origin}/?tab=chat&u=${encodeURIComponent(userId)}`;

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
