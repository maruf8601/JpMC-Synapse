/**
 * JpMC Synapse — Interdepartmental Chat Service
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 *
 * Core Features:
 *  - One-to-one secure messaging between authorized JpMC staff
 *  - Strict 72-hour TTL retention policy (expiresAt = createdAt + 72h)
 *  - User soft-deletion (hidden from user immediately, retained for admin oversight)
 *  - Per-user history clearing boundary (clearedAt)
 *  - Admin oversight with mandatory audit logging (NO message content in audit logs)
 *  - Instant FCM push notifications (privacy-safe: content hidden on lock screen)
 *  - Server-side idempotent cleanup of expired messages & attachments
 */

import crypto from 'crypto';
import { adminDb, adminMessaging, removeUndefinedFields } from './firebaseAdmin';
import {
  broadcastChatMessage,
  broadcastMessageDeleted,
  broadcastHistoryCleared,
} from './chatSocketService';
import {
  deletePhysicalAttachment,
  cleanupOrphanAttachments,
  StoredAttachmentMeta,
  CHAT_MAX_FILE_SIZE_BYTES,
  isDangerousFile,
  classifyAttachmentType,
  sanitizeFilename,
} from './chatStorageService';

export interface ChatAttachmentMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  downloadUrl: string;
  storageKey?: string;
}

export interface ChatMessageRecord {
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
}

export interface ParticipantProfile {
  uid: string;
  displayName: string;
  email?: string;
  role: 'admin' | 'user';
  department?: string;
  designation?: string;
  photoURL?: string | null;
  lastSeenAt?: string;
}

export interface ConversationRecord {
  id: string;
  participantIds: string[];
  participantProfiles: Record<string, ParticipantProfile>;
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

// 72 Hours in milliseconds
export const RETENTION_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Generates a stable deterministic conversation ID for a pair of users.
 * Guarantees User A and User B cannot create duplicate 1-to-1 conversations.
 */
export function getDeterministicConversationId(userA: string, userB: string): string {
  const sorted = [userA.trim(), userB.trim()].sort();
  const hash = crypto.createHash('sha256').update(sorted.join(':::')).digest('hex').slice(0, 20);
  return `conv_${hash}`;
}

/**
 * Searches authorized JpMC Synapse users by name, department, or designation.
 * Excludes sensitive fields (passwords, tokens, device keys).
 */
export async function searchSynapseUsers(
  searchTerm: string,
  excludeUserId?: string
): Promise<ParticipantProfile[]> {
  try {
    const snap = await adminDb.collection('authorizedUsers').where('active', '==', true).get();
    const query = (searchTerm || '').trim().toLowerCase();

    const results: ParticipantProfile[] = [];

    snap.forEach((doc) => {
      const data = doc.data();
      const uid = doc.id;
      if (excludeUserId && uid === excludeUserId) return;

      const displayName = data.displayName || data.name || 'JpMC Staff';
      const department = data.department || '';
      const designation = data.designation || '';
      const email = data.email || '';

      if (
        !query ||
        displayName.toLowerCase().includes(query) ||
        department.toLowerCase().includes(query) ||
        designation.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query)
      ) {
        results.push({
          uid,
          displayName,
          email: data.role === 'admin' ? email : undefined,
          role: data.role === 'admin' ? 'admin' : 'user',
          department: data.department || null,
          designation: data.designation || null,
          photoURL: data.photoURL || null,
          lastSeenAt: data.updatedAt || data.createdAt || null,
        });
      }
    });

    // Sort by name
    return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (err) {
    console.error('[Chat] Search users error:', err);
    return [];
  }
}

/**
 * Retrieves public profile for a single user by ID.
 */
export async function getSynapseUserProfile(userId: string): Promise<ParticipantProfile | null> {
  if (!userId) return null;
  try {
    const docSnap = await adminDb.collection('authorizedUsers').doc(userId).get();
    if (!docSnap.exists) return null;
    const data = docSnap.data()!;
    return {
      uid: userId,
      displayName: data.displayName || data.name || 'JpMC Staff',
      role: data.role === 'admin' ? 'admin' : 'user',
      department: data.department || null,
      designation: data.designation || null,
      photoURL: data.photoURL || null,
      lastSeenAt: data.updatedAt || data.createdAt || null,
    };
  } catch (err) {
    console.error('[Chat] Get user profile error:', err);
    return null;
  }
}

/**
 * Gets or creates a one-to-one conversation between two users.
 */
export async function getOrCreateConversation(
  userAId: string,
  userBId: string,
  userAProfile?: Partial<ParticipantProfile>,
  userBProfile?: Partial<ParticipantProfile>
): Promise<ConversationRecord> {
  const conversationId = getDeterministicConversationId(userAId, userBId);
  const convRef = adminDb.collection('conversations').doc(conversationId);
  const snap = await convRef.get();

  const nowIso = new Date().toISOString();

  // Fetch full profiles if not provided
  const profileA = userAProfile?.displayName
    ? (userAProfile as ParticipantProfile)
    : (await getSynapseUserProfile(userAId)) || {
        uid: userAId,
        displayName: 'JpMC Staff',
        role: 'user',
      };

  const profileB = userBProfile?.displayName
    ? (userBProfile as ParticipantProfile)
    : (await getSynapseUserProfile(userBId)) || {
        uid: userBId,
        displayName: 'JpMC Staff',
        role: 'user',
      };

  if (snap.exists) {
    const existing = snap.data() as ConversationRecord;

    // Update profiles in background if changed
    const updatedProfiles = {
      ...existing.participantProfiles,
      [userAId]: { ...existing.participantProfiles?.[userAId], ...profileA },
      [userBId]: { ...existing.participantProfiles?.[userBId], ...profileB },
    };

    await convRef.set(
      {
        participantProfiles: updatedProfiles,
        updatedAt: nowIso,
      },
      { merge: true }
    );

    return {
      ...existing,
      id: conversationId,
      participantProfiles: updatedProfiles,
    };
  }

  // Create new conversation
  const newConversation: ConversationRecord = {
    id: conversationId,
    participantIds: [userAId, userBId],
    participantProfiles: {
      [userAId]: profileA,
      [userBId]: profileB,
    },
    lastMessage: null,
    lastMessageAt: nowIso,
    participantStates: {
      [userAId]: { clearedAt: null, unreadCount: 0, lastReadAt: nowIso },
      [userBId]: { clearedAt: null, unreadCount: 0, lastReadAt: null },
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await convRef.set(removeUndefinedFields(newConversation));
  return newConversation;
}

/**
 * Retrieves all conversations for a specific user, sorted by last message.
 */
export async function getUserConversations(userId: string): Promise<ConversationRecord[]> {
  try {
    const snap = await adminDb
      .collection('conversations')
      .where('participantIds', 'array-contains', userId)
      .get();

    const list: ConversationRecord[] = [];
    const now = Date.now();

    snap.forEach((doc) => {
      const data = doc.data() as ConversationRecord;
      data.id = doc.id;

      // Check if lastMessage has passed 72h
      if (data.lastMessage?.createdAt) {
        const msgTime = new Date(data.lastMessage.createdAt).getTime();
        if (now - msgTime > RETENTION_WINDOW_MS) {
          data.lastMessage = null;
        }
      }

      list.push(data);
    });

    // Sort descending by last activity
    return list.sort((a, b) => {
      const timeA = new Date(a.lastMessageAt || a.createdAt).getTime();
      const timeB = new Date(b.lastMessageAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  } catch (err) {
    console.error('[Chat] getUserConversations error:', err);
    return [];
  }
}

/**
 * Retrieves messages for a conversation with strict security, retention, and clearing filters.
 *
 * Rules:
 *  - Strict 72-Hour Expiration: Messages older than 72 hours are NEVER returned to anyone (user or admin).
 *  - User View:
 *      * Soft-deleted messages (deletedByUser == true) are EXCLUDED.
 *      * Messages sent before the user's `clearedAt` timestamp are EXCLUDED.
 *  - Admin Oversight View:
 *      * Soft-deleted messages are INCLUDED, but flagged with `deletedByUser: true` and deletion metadata.
 *      * Messages before `clearedAt` are INCLUDED for institutional oversight.
 */
export async function getConversationMessages(
  conversationId: string,
  requestingUserId: string,
  isAdminOversight: boolean = false
): Promise<ChatMessageRecord[]> {
  const convRef = adminDb.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    throw new Error('Conversation not found');
  }

  const convData = convSnap.data() as ConversationRecord;
  if (!isAdminOversight && !convData.participantIds.includes(requestingUserId)) {
    throw new Error('Forbidden: You are not a participant in this conversation.');
  }

  const userClearedAtStr = convData.participantStates?.[requestingUserId]?.clearedAt;
  const userClearedAtTime = userClearedAtStr ? new Date(userClearedAtStr).getTime() : 0;

  const snap = await convRef.collection('messages').orderBy('createdAt', 'asc').get();

  const now = Date.now();
  const validMessages: ChatMessageRecord[] = [];
  const expiredMessageIds: string[] = [];

  snap.forEach((doc) => {
    const msg = doc.data() as ChatMessageRecord;
    msg.id = doc.id;

    // Strict 72-Hour Check
    const expiresAtTime = msg.expiresAt
      ? new Date(msg.expiresAt).getTime()
      : new Date(msg.createdAt).getTime() + RETENTION_WINDOW_MS;

    if (now >= expiresAtTime) {
      expiredMessageIds.push(doc.id);
      return; // Do NOT return expired message
    }

    if (!isAdminOversight) {
      // 1. Filter out user-deleted messages
      if (msg.deletedByUser) {
        return;
      }
      // 2. Filter out messages prior to user's clearing boundary
      const msgCreatedTime = new Date(msg.createdAt).getTime();
      if (userClearedAtTime > 0 && msgCreatedTime <= userClearedAtTime) {
        return;
      }
    }

    validMessages.push(msg);
  });

  // Background non-blocking cleanup of detected expired messages
  if (expiredMessageIds.length > 0) {
    purgeSpecificMessages(conversationId, expiredMessageIds).catch((err) =>
      console.warn('[Chat] Background expired purge warning:', err)
    );
  }

  return validMessages;
}

/**
 * Sends a message in a conversation.
 * Enforces server-side sender ID validation, 72-hour TTL, and triggers FCM push notifications.
 */
export async function sendChatMessage(data: {
  conversationId: string;
  senderId: string;
  senderName?: string;
  content: string;
  type?: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file';
  attachment?: ChatAttachmentMeta | null;
  clientMsgId?: string | null;
}): Promise<ChatMessageRecord> {
  const { conversationId, senderId, senderName, content, type = 'text', attachment, clientMsgId } = data;

  const convRef = adminDb.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) {
    throw new Error('Conversation not found');
  }

  const convData = convSnap.data() as ConversationRecord;
  if (!convData.participantIds.includes(senderId)) {
    throw new Error('Forbidden: You are not a participant in this conversation.');
  }

  const receiverId = convData.participantIds.find((id) => id !== senderId);
  if (!receiverId) {
    throw new Error('Invalid conversation participants.');
  }

  // Idempotency check with clientMsgId
  if (clientMsgId) {
    const existingSnap = await convRef
      .collection('messages')
      .where('clientMsgId', '==', clientMsgId)
      .limit(1)
      .get();
    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0].data() as ChatMessageRecord;
      existing.id = existingSnap.docs[0].id;
      return existing;
    }
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + RETENTION_WINDOW_MS).toISOString(); // STRICT 72h

  const msgId = `msg_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const messageDoc: ChatMessageRecord = {
    id: msgId,
    conversationId,
    senderId,
    receiverId,
    content: (content || '').trim(),
    type,
    attachment: attachment || null,
    createdAt,
    expiresAt,
    deliveredAt: createdAt,
    readAt: null,
    deletedByUser: false,
    deletedAt: null,
    deletedByUserId: null,
    clientMsgId: clientMsgId || null,
  };

  // Write message document
  await convRef.collection('messages').doc(msgId).set(removeUndefinedFields(messageDoc));

  // If message contains an attachment, link it to prevent orphan deletion
  if (attachment?.id) {
    adminDb
      .collection('chatAttachments')
      .doc(attachment.id)
      .set({ linkedMessageId: msgId }, { merge: true })
      .catch((err) => console.warn('[Chat] Failed linking attachment:', err));
  }

  // Update conversation record
  const currentUnread = convData.participantStates?.[receiverId]?.unreadCount || 0;
  const previewText =
    type === 'text'
      ? (content || '').slice(0, 70)
      : type === 'image'
      ? '📷 ছবি (Photo)'
      : type === 'video'
      ? '🎥 ভিডিও (Video)'
      : type === 'voice'
      ? '🎙️ ভয়েস বার্তা (Voice)'
      : type === 'audio'
      ? '🎵 অডিও ফাইল (Audio)'
      : type === 'pdf'
      ? '📄 PDF ডকুমেন্ট'
      : type === 'archive'
      ? '📦 আর্কাইভ ফাইল (Zip/Rar)'
      : '📎 ফাইল (Attachment)';

  await convRef.set(
    {
      lastMessage: {
        content: previewText,
        senderId,
        createdAt,
        type,
        hasAttachment: Boolean(attachment),
      },
      lastMessageAt: createdAt,
      updatedAt: createdAt,
      [`participantStates.${receiverId}.unreadCount`]: currentUnread + 1,
    },
    { merge: true }
  );

  // Real-time instant Socket.IO broadcast to room
  try {
    broadcastChatMessage(conversationId, messageDoc);
  } catch (socketErr) {
    console.warn('[Chat] Socket broadcast error:', socketErr);
  }

  // Send FCM Push Notification to receiver (Runs in background)
  sendChatPushNotification({
    receiverId,
    senderDisplayName: senderName || convData.participantProfiles?.[senderId]?.displayName || 'JpMC Staff',
    conversationId,
    senderId,
  }).catch((pushErr) => console.warn('[Chat] Push notification send error:', pushErr));

  return messageDoc;
}

/**
 * Sends a privacy-safe FCM push notification to the recipient.
 * CRITICAL PRIVACY RULE: Does NOT expose confidential message content on the lock screen.
 */
async function sendChatPushNotification(params: {
  receiverId: string;
  senderDisplayName: string;
  conversationId: string;
  senderId: string;
}) {
  const { receiverId, senderDisplayName, conversationId, senderId } = params;

  try {
    // Find active registered devices for this user
    const snap = await adminDb
      .collection('devices')
      .where('userId', '==', receiverId)
      .where('notificationsEnabled', '==', true)
      .get();

    if (snap.empty) {
      return;
    }

    const title = 'JpMC Synapse';
    // Privacy-safe notification body: states who sent message without exposing content
    const body = `${senderDisplayName} আপনাকে একটি বার্তা পাঠিয়েছেন।`;
    const targetUrl = `/?tab=chat&u=${senderId}`;

    const tokens: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.fcmToken) tokens.push(data.fcmToken);
    });

    if (tokens.length === 0) return;

    for (const token of tokens) {
      try {
        const payloadData = {
          type: 'chat_message',
          conversationId,
          senderId,
          url: targetUrl,
          click_action: targetUrl,
        };

        await adminMessaging.send({
          token,
          notification: {
            title,
            body,
          },
          data: payloadData,
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              title,
              body,
              icon: '/pwa-192x192.png',
              badge: '/icon.svg',
              tag: `chat_${conversationId}`,
              data: payloadData,
            },
            fcmOptions: {
              link: targetUrl,
            },
          },
        });
      } catch (err: any) {
        // Ignore inactive or uninstalled device tokens
        if (err?.code !== 'messaging/registration-token-not-registered') {
          console.warn('[Chat] Token dispatch warning:', err?.message || err);
        }
      }
    }
  } catch (err) {
    console.warn('[Chat] sendChatPushNotification error:', err);
  }
}

/**
 * Soft-deletes an individual message for the normal user.
 * Marks `deletedByUser = true`.
 * Does NOT delete the server-side copy from admin retention.
 * Does NOT extend or reset the original 72-hour `expiresAt`.
 */
export async function deleteIndividualMessage(
  conversationId: string,
  messageId: string,
  userId: string
): Promise<{ success: boolean }> {
  const convRef = adminDb.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) throw new Error('Conversation not found');

  const convData = convSnap.data() as ConversationRecord;
  if (!convData.participantIds.includes(userId)) {
    throw new Error('Forbidden: You are not a participant in this conversation.');
  }

  const msgRef = convRef.collection('messages').doc(messageId);
  const msgSnap = await msgRef.get();
  if (!msgSnap.exists) throw new Error('Message not found');

  const nowIso = new Date().toISOString();
  await msgRef.set(
    {
      deletedByUser: true,
      deletedAt: nowIso,
      deletedByUserId: userId,
    },
    { merge: true }
  );

  // Broadcast deletion event via Socket.IO
  try {
    broadcastMessageDeleted(conversationId, messageId);
  } catch (err) {
    console.warn('[Chat] Socket broadcast deletion warning:', err);
  }

  return { success: true };
}

/**
 * Clears conversation history for the requesting user only.
 * Sets `clearedAt = now` in the user's participant state.
 * Preserves the other participant's view and retains records for Admin oversight until original 72h expiry.
 */
export async function clearConversationHistory(
  conversationId: string,
  userId: string
): Promise<{ success: boolean }> {
  const convRef = adminDb.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) throw new Error('Conversation not found');

  const convData = convSnap.data() as ConversationRecord;
  if (!convData.participantIds.includes(userId)) {
    throw new Error('Forbidden: You are not a participant in this conversation.');
  }

  const nowIso = new Date().toISOString();
  await convRef.set(
    {
      [`participantStates.${userId}.clearedAt`]: nowIso,
      [`participantStates.${userId}.unreadCount`]: 0,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  // Broadcast clear history event via Socket.IO
  try {
    broadcastHistoryCleared(conversationId, userId);
  } catch (err) {
    console.warn('[Chat] Socket broadcast clear warning:', err);
  }

  return { success: true };
}

/**
 * Marks all incoming messages in a conversation as read.
 */
export async function markConversationAsRead(
  conversationId: string,
  userId: string
): Promise<void> {
  const convRef = adminDb.collection('conversations').doc(conversationId);
  const convSnap = await convRef.get();
  if (!convSnap.exists) return;

  const nowIso = new Date().toISOString();
  await convRef.set(
    {
      [`participantStates.${userId}.unreadCount`]: 0,
      [`participantStates.${userId}.lastReadAt`]: nowIso,
    },
    { merge: true }
  );

  // Update readAt on messages
  const unreadSnap = await convRef
    .collection('messages')
    .where('receiverId', '==', userId)
    .where('readAt', '==', null)
    .get();

  if (!unreadSnap.empty) {
    const batch = adminDb.batch();
    unreadSnap.docs.forEach((doc) => {
      batch.update(doc.ref, { readAt: nowIso });
    });
    await batch.commit().catch(() => {});
  }
}

/**
 * Uploads and stores an institutional attachment with 72-hour TTL.
 */
export async function saveChatAttachment(params: {
  conversationId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  size: number;
  base64Data: string;
}): Promise<ChatAttachmentMeta> {
  const { conversationId, uploaderId, filename, mimeType, size, base64Data } = params;

  // Strict validation: max 10MB
  if (size > 10 * 1024 * 1024) {
    throw new Error('File size exceeds the 10 MB institutional limit.');
  }

  // Allowed MIME types
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];

  if (!allowedMimes.includes(mimeType.toLowerCase())) {
    throw new Error('Unsupported or unauthorized file format.');
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + RETENTION_WINDOW_MS).toISOString();

  const attachmentId = `att_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  await adminDb.collection('chatAttachments').doc(attachmentId).set({
    id: attachmentId,
    conversationId,
    uploaderId,
    filename: safeFilename,
    mimeType,
    size,
    data: base64Data,
    createdAt,
    expiresAt,
  });

  return {
    id: attachmentId,
    name: safeFilename,
    size,
    mimeType,
    downloadUrl: `/api/chat/attachments/${attachmentId}`,
  };
}

/**
 * Retrieves attachment data with authorization check.
 */
export async function getChatAttachment(
  attachmentId: string,
  requesterUserId: string,
  isAdmin: boolean = false
): Promise<{ filename: string; mimeType: string; base64Data: string } | null> {
  const doc = await adminDb.collection('chatAttachments').doc(attachmentId).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  const now = Date.now();
  const expiresAtTime = new Date(data.expiresAt).getTime();

  // Strict 72h expiration
  if (now >= expiresAtTime) {
    // Purge immediately
    doc.ref.delete().catch(() => {});
    return null;
  }

  // Authorization check: requester must be in conversation or admin
  if (!isAdmin) {
    const convDoc = await adminDb.collection('conversations').doc(data.conversationId).get();
    if (!convDoc.exists) return null;
    const conv = convDoc.data() as ConversationRecord;
    if (!conv.participantIds.includes(requesterUserId)) {
      return null;
    }
  }

  return {
    filename: data.filename,
    mimeType: data.mimeType,
    base64Data: data.data,
  };
}

/**
 * Admin Oversight: Lists all conversations with retention and deletion statistics.
 */
export async function getAdminConversationsOversight(): Promise<
  Array<{
    conversation: ConversationRecord;
    totalMessagesIn72h: number;
    userDeletedMessagesCount: number;
    activeAttachmentCount: number;
  }>
> {
  const convSnap = await adminDb.collection('conversations').get();
  const results = [];
  const now = Date.now();

  for (const doc of convSnap.docs) {
    const conv = doc.data() as ConversationRecord;
    conv.id = doc.id;

    const msgsSnap = await doc.ref.collection('messages').get();
    let totalMessagesIn72h = 0;
    let userDeletedMessagesCount = 0;
    let activeAttachmentCount = 0;

    msgsSnap.forEach((mDoc) => {
      const m = mDoc.data() as ChatMessageRecord;
      const exp = new Date(m.expiresAt).getTime();
      if (now < exp) {
        totalMessagesIn72h++;
        if (m.deletedByUser) userDeletedMessagesCount++;
        if (m.attachment) activeAttachmentCount++;
      }
    });

    results.push({
      conversation: conv,
      totalMessagesIn72h,
      userDeletedMessagesCount,
      activeAttachmentCount,
    });
  }

  return results.sort(
    (a, b) =>
      new Date(b.conversation.lastMessageAt || 0).getTime() -
      new Date(a.conversation.lastMessageAt || 0).getTime()
  );
}

/**
 * Records an Administrative Access Log for Chat Oversight.
 * PRIVACY RULE: NEVER copies message content into the audit log!
 */
export async function logAdminChatOversightAccess(params: {
  adminId: string;
  adminEmail: string;
  action: 'view_oversight_list' | 'view_conversation_oversight';
  conversationId?: string;
}): Promise<void> {
  const { adminId, adminEmail, action, conversationId } = params;

  try {
    const logId = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await adminDb.collection('chatAdminAuditLogs').doc(logId).set({
      id: logId,
      adminId,
      adminEmail: adminEmail || 'Admin',
      action,
      conversationId: conversationId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Chat] Failed recording oversight audit log:', err);
  }
}

/**
 * Purges specific messages and their attachments permanently.
 */
async function purgeSpecificMessages(conversationId: string, messageIds: string[]): Promise<void> {
  const convRef = adminDb.collection('conversations').doc(conversationId);
  for (const id of messageIds) {
    try {
      const msgSnap = await convRef.collection('messages').doc(id).get();
      if (msgSnap.exists) {
        const msg = msgSnap.data() as ChatMessageRecord;
        if (msg.attachment?.id) {
          await adminDb.collection('chatAttachments').doc(msg.attachment.id).delete().catch(() => {});
        }
        await msgSnap.ref.delete();
      }
    } catch (err) {
      console.warn(`[Chat] Purge message ${id} error:`, err);
    }
  }
}

/**
 * STRICT 72-HOUR PERMANENT AUTO-DELETION CLEANUP ROUTINE.
 *
 * Scans all conversations for messages with expiresAt <= now.
 * Permanently removes:
 *  - normal visible copy
 *  - admin-retained/hidden copy
 *  - associated attachments in chatAttachments
 *  - message records
 *
 * Runs on cron or interval. Idempotent and failsafe.
 */
export async function cleanupExpiredChatMessages(): Promise<{
  deletedMessagesCount: number;
  deletedAttachmentsCount: number;
}> {
  let deletedMessagesCount = 0;
  let deletedAttachmentsCount = 0;
  const nowIso = new Date().toISOString();

  try {
    const convSnap = await adminDb.collection('conversations').get();

    for (const doc of convSnap.docs) {
      const convRef = doc.ref;
      const expiredMsgsSnap = await convRef
        .collection('messages')
        .where('expiresAt', '<=', nowIso)
        .get();

      if (!expiredMsgsSnap.empty) {
        for (const msgDoc of expiredMsgsSnap.docs) {
          const msgData = msgDoc.data() as ChatMessageRecord;

          // Delete attachment if present
          if (msgData.attachment?.id) {
            try {
              const attDoc = await adminDb.collection('chatAttachments').doc(msgData.attachment.id).get();
              if (attDoc.exists) {
                const meta = attDoc.data() as StoredAttachmentMeta;
                await deletePhysicalAttachment(meta);
              } else {
                await adminDb.collection('chatAttachments').doc(msgData.attachment.id).delete();
              }
              deletedAttachmentsCount++;
            } catch {}
          }

          // Permanently delete message doc
          await msgDoc.ref.delete();
          deletedMessagesCount++;
        }
      }
    }

    // Also clean up any expired attachments older than 72 hours
    const expiredAttSnap = await adminDb
      .collection('chatAttachments')
      .where('expiresAt', '<=', nowIso)
      .get();

    if (!expiredAttSnap.empty) {
      for (const attDoc of expiredAttSnap.docs) {
        const meta = attDoc.data() as StoredAttachmentMeta;
        await deletePhysicalAttachment(meta);
        deletedAttachmentsCount++;
      }
    }

    // Clean up orphan uploads that were never linked to a message within 1 hour
    const orphanCleaned = await cleanupOrphanAttachments();
    if (orphanCleaned > 0) {
      deletedAttachmentsCount += orphanCleaned;
    }

    if (deletedMessagesCount > 0 || deletedAttachmentsCount > 0) {
      console.log(
        `[Chat Cleanup] 72-hour TTL execution completed: ${deletedMessagesCount} expired messages, ${deletedAttachmentsCount} attachments permanently deleted.`
      );
    }
  } catch (err) {
    console.error('[Chat Cleanup] Error running 72h cleanup:', err);
  }

  return { deletedMessagesCount, deletedAttachmentsCount };
}
