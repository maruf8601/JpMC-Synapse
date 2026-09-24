/**
 * JpMC Synapse — Socket.IO Real-Time & WebRTC Signaling Engine
 * Organization: Jamalpur Medical College (JpMC)
 *
 * Implements:
 * - Authenticated WebSocket connections (Session Token or Firebase ID token)
 * - Server-side room access authorization (no unauthorized conversation eavesdropping)
 * - Instant message delivery & read receipts
 * - WebRTC Audio & Video Call signaling (Call Invitation, SDP offer/answer, ICE candidates, End Call)
 * - Call event logging into chat with 72-hour retention
 * - Active call state management & orphan session cleanup
 */

import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { adminAuth, adminDb, getUserRoleAndActive, verifyUserSession } from './firebaseAdmin';
import { sendChatMessage, getDeterministicConversationId } from './chatService';

export interface AuthenticatedSocketUser {
  uid: string;
  displayName: string;
  role: 'admin' | 'user';
}

export interface ActiveCallSession {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  receiverId: string;
  receiverName: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'connected' | 'ended' | 'declined' | 'missed';
  startTime: number;
  connectTime?: number;
  timeoutTimer?: NodeJS.Timeout;
}

let ioInstance: SocketIOServer | null = null;
const activeCalls = new Map<string, ActiveCallSession>();

/**
 * Initializes and binds the Socket.IO server to the HTTP server instance.
 */
export function initChatSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  ioInstance = io;

  // Socket Authentication Middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.query?.token as string) ||
        '';

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // 1. Try Firebase ID Token
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        const authInfo = await getUserRoleAndActive(decoded.uid);
        if (authInfo?.active !== false) {
          socket.data.user = {
            uid: decoded.uid,
            displayName: decoded.name || 'JpMC Staff',
            role: authInfo?.role === 'admin' ? 'admin' : 'user',
          };
          return next();
        }
      } catch {
        // Fallback to normal user session token
      }

      // 2. Try User Session Token
      const sessionRes = await verifyUserSession(token);
      if (sessionRes.valid && sessionRes.user && sessionRes.user.active !== false) {
        socket.data.user = {
          uid: sessionRes.user.uid,
          displayName: sessionRes.user.displayName || 'JpMC Staff',
          role: sessionRes.user.role === 'admin' ? 'admin' : 'user',
        };
        return next();
      }

      return next(new Error('Invalid authentication session'));
    } catch (err: any) {
      return next(new Error('Authentication error: ' + (err?.message || 'unknown')));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthenticatedSocketUser;
    const userRoom = `user:${user.uid}`;
    socket.join(userRoom);

    // ==========================================
    // CONVERSATION ROOM MANAGEMENT
    // ==========================================
    socket.on('conversation:join', async ({ conversationId }, ack) => {
      try {
        if (!conversationId) return ack?.({ success: false, error: 'Missing conversationId' });

        // Verify user is a participant or admin
        const convDoc = await adminDb.collection('conversations').doc(conversationId).get();
        if (!convDoc.exists) {
          return ack?.({ success: false, error: 'Conversation not found' });
        }

        const convData = convDoc.data()!;
        const isParticipant = (convData.participantIds || []).includes(user.uid);
        const isAdmin = user.role === 'admin';

        if (!isParticipant && !isAdmin) {
          return ack?.({ success: false, error: 'Forbidden: You are not authorized for this conversation' });
        }

        socket.join(`conv:${conversationId}`);
        ack?.({ success: true, conversationId });
      } catch (err: any) {
        ack?.({ success: false, error: err.message });
      }
    });

    socket.on('conversation:leave', ({ conversationId }) => {
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // ==========================================
    // TYPING INDICATOR
    // ==========================================
    socket.on('chat:typing', ({ conversationId, isTyping }) => {
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit('chat:typing', {
          conversationId,
          userId: user.uid,
          userName: user.displayName,
          isTyping,
        });
      }
    });

    // ==========================================
    // MESSAGE READ ACKNOWLEDGEMENT
    // ==========================================
    socket.on('chat:read', ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit('chat:read', {
          conversationId,
          readByUserId: user.uid,
          readAt: new Date().toISOString(),
        });
      }
    });

    // ==========================================
    // WEBRTC CALL SIGNALING
    // ==========================================

    // 1. Initiate / Start Call (handles both 'call:start' and 'call:initiate')
    const handleStartCall = async (data: any, ack?: (res: any) => void) => {
      try {
        const targetUserId = data?.targetUserId;
        const conversationId = data?.conversationId;
        const callType = data?.callType || data?.type || 'audio';
        const callId = data?.callId || `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        if (!targetUserId) {
          return ack?.({ success: false, error: 'Invalid call initiation parameters: targetUserId required' });
        }

        // Fetch receiver display name if available
        let receiverName = 'Staff';
        if (conversationId) {
          try {
            const convDoc = await adminDb.collection('conversations').doc(conversationId).get();
            if (convDoc.exists) {
              const participants = convDoc.data()?.participantIds || [];
              if (participants.includes(user.uid) && participants.includes(targetUserId)) {
                receiverName = convDoc.data()?.participantProfiles?.[targetUserId]?.displayName || 'Staff';
              }
            }
          } catch {}
        }

        const session: ActiveCallSession = {
          callId,
          conversationId: conversationId || `direct_${user.uid}_${targetUserId}`,
          callerId: user.uid,
          callerName: user.displayName || 'Staff Member',
          receiverId: targetUserId,
          receiverName,
          type: callType === 'video' ? 'video' : 'audio',
          status: 'ringing',
          startTime: Date.now(),
        };

        // Ringing timeout (45 seconds)
        session.timeoutTimer = setTimeout(() => {
          if (activeCalls.has(callId) && activeCalls.get(callId)?.status === 'ringing') {
            endCallSession(callId, 'missed');
            io.to(`user:${session.callerId}`).emit('call:ended', {
              callId,
              reason: 'missed',
              message: 'কলটির উত্তর পাওয়া যায়নি (No Answer)',
            });
            io.to(`user:${session.receiverId}`).emit('call:ended', {
              callId,
              reason: 'missed',
            });
          }
        }, 45000);

        activeCalls.set(callId, session);

        // Signal target user
        io.to(`user:${targetUserId}`).emit('call:incoming', {
          callId,
          conversationId: session.conversationId,
          callerId: user.uid,
          callerName: user.displayName || 'Staff Member',
          callType: session.type,
          type: session.type,
        });

        ack?.({ success: true, callId });
      } catch (err: any) {
        ack?.({ success: false, error: err.message });
      }
    };

    socket.on('call:initiate', handleStartCall);
    socket.on('call:start', handleStartCall);

    // 2. Accept Call
    socket.on('call:accept', ({ callId, callerId }) => {
      const session = activeCalls.get(callId);
      if (session) {
        if (session.timeoutTimer) {
          clearTimeout(session.timeoutTimer);
          session.timeoutTimer = undefined;
        }
        session.status = 'connected';
        session.connectTime = Date.now();
      }

      const targetCallerId = session?.callerId || callerId;
      if (targetCallerId) {
        io.to(`user:${targetCallerId}`).emit('call:accepted', {
          callId,
          acceptorId: user.uid,
        });
      }
    });

    // 2b. Call Ready (Peer is fully initialized with media & ready for SDP offer)
    socket.on('call:ready', ({ callId, targetUserId }) => {
      const session = activeCalls.get(callId);
      const destinationId =
        targetUserId ||
        (session
          ? session.callerId === user.uid
            ? session.receiverId
            : session.callerId
          : null);

      if (destinationId) {
        io.to(`user:${destinationId}`).emit('call:ready', {
          callId,
          senderId: user.uid,
        });
      }
    });

    // 3. Decline Call
    socket.on('call:decline', ({ callId, callerId, reason }) => {
      const session = activeCalls.get(callId);
      if (session?.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
      }
      if (callId) endCallSession(callId, 'declined');

      const targetCallerId = session?.callerId || callerId;
      if (targetCallerId) {
        io.to(`user:${targetCallerId}`).emit('call:declined', {
          callId,
          reason: reason || 'declined',
        });
      }
    });

    // 4. WebRTC Signal (SDP Offer/Answer & ICE Candidates)
    socket.on('call:signal', ({ callId, targetUserId, signal }) => {
      const session = activeCalls.get(callId);
      let destinationId = targetUserId;
      if (session) {
        destinationId = session.callerId === user.uid ? session.receiverId : session.callerId;
      }

      if (destinationId) {
        io.to(`user:${destinationId}`).emit('call:signal', {
          callId,
          senderId: user.uid,
          signal,
        });
      }
    });

    // 5. End Call
    socket.on('call:end', ({ callId, targetUserId, reason }) => {
      const session = activeCalls.get(callId);
      const durationSec = session?.connectTime ? Math.round((Date.now() - session.connectTime) / 1000) : 0;
      if (callId) endCallSession(callId, reason || 'ended', durationSec);

      const otherUserId = session
        ? session.callerId === user.uid
          ? session.receiverId
          : session.callerId
        : targetUserId;

      if (otherUserId) {
        io.to(`user:${otherUserId}`).emit('call:ended', {
          callId,
          reason: reason || 'ended',
          durationSec,
        });
      }
    });

    // Disconnect cleanup
    socket.on('disconnect', () => {
      // Find any ongoing calls for this user and terminate gracefully
      for (const [callId, session] of activeCalls.entries()) {
        if (session.callerId === user.uid || session.receiverId === user.uid) {
          const otherUserId = session.callerId === user.uid ? session.receiverId : session.callerId;
          io.to(`user:${otherUserId}`).emit('call:ended', {
            callId,
            reason: 'disconnected',
            message: 'অন্য প্রান্তের সংযোগ বিচ্ছিন্ন হয়েছে (Peer Disconnected)',
          });
          endCallSession(callId, 'ended');
        }
      }
    });
  });

  return io;
}

/**
 * Ends a call session, clears timers, and posts a Call Event record in the conversation.
 */
function endCallSession(callId: string, finalStatus: 'connected' | 'ended' | 'declined' | 'missed', durationSec: number = 0) {
  const session = activeCalls.get(callId);
  if (!session) return;

  if (session.timeoutTimer) {
    clearTimeout(session.timeoutTimer);
  }

  activeCalls.delete(callId);

  // Record Call Event into conversation (72h retention applies)
  (async () => {
    try {
      const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
      };

      const icon = session.type === 'video' ? '🎥' : '📞';
      const typeLabel = session.type === 'video' ? 'ভিডিও কল' : 'অডিও কল';
      let content = '';

      if (finalStatus === 'missed') {
        content = `${icon} মিসড ${typeLabel}`;
      } else if (finalStatus === 'declined') {
        content = `${icon} প্রত্যাখ্যাত ${typeLabel}`;
      } else {
        content = `${icon} ${typeLabel} — ${formatDuration(durationSec)}`;
      }

      await sendChatMessage({
        conversationId: session.conversationId,
        senderId: session.callerId,
        senderName: session.callerName,
        content,
        type: 'text',
      });
    } catch (err) {
      console.warn('[ChatSocket] Failed recording call event to conversation:', err);
    }
  })();
}

/**
 * Broadcasts a new message event to all sockets listening in the conversation room.
 */
export function broadcastChatMessage(conversationId: string, message: any) {
  if (!ioInstance) return;
  ioInstance.to(`conv:${conversationId}`).emit('chat:message', {
    conversationId,
    message,
  });

  // Also notify recipient's personal room for global notification badges
  if (message.receiverId) {
    ioInstance.to(`user:${message.receiverId}`).emit('chat:new_message_badge', {
      conversationId,
      senderId: message.senderId,
    });
  }
}

/**
 * Broadcasts a message deletion event.
 */
export function broadcastMessageDeleted(conversationId: string, messageId: string) {
  if (!ioInstance) return;
  ioInstance.to(`conv:${conversationId}`).emit('chat:message_deleted', {
    conversationId,
    messageId,
  });
}

/**
 * Broadcasts a clear history event.
 */
export function broadcastHistoryCleared(conversationId: string, clearedByUserId: string) {
  if (!ioInstance) return;
  ioInstance.to(`conv:${conversationId}`).emit('chat:history_cleared', {
    conversationId,
    clearedByUserId,
  });
}

/**
 * Returns the active Socket.IO server instance.
 */
export function getChatSocketServer(): SocketIOServer | null {
  return ioInstance;
}
