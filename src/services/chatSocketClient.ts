/**
 * JpMC Synapse — Frontend Socket.IO Client
 * Handles real-time messaging, typing indicators, read receipts,
 * and WebRTC audio/video call signaling with auto-reconnection.
 */

import { io, Socket } from 'socket.io-client';
import { getAuthHeader } from './authService';

type SocketEventListener = (...args: any[]) => void;

class ChatSocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<SocketEventListener>> = new Map();
  private currentConversationId: string | null = null;
  private isConnecting: boolean = false;

  /**
   * Retrieves active auth token (Firebase ID token or User Session token)
   */
  private async getAuthToken(): Promise<string> {
    try {
      const headers = await getAuthHeader();
      const authVal = headers.Authorization || headers.authorization || '';
      if (authVal.startsWith('Bearer ')) {
        return authVal.substring(7);
      }
    } catch {}

    return '';
  }

  /**
   * Connects to the Socket.IO server.
   */
  public async connect(): Promise<Socket | null> {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }
    if (this.isConnecting) return null;

    this.isConnecting = true;
    try {
      const token = await this.getAuthToken();
      if (!token) {
        this.isConnecting = false;
        return null;
      }

      const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
      this.socket = io(socketUrl, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      this.socket.on('connect', () => {
        // If we were inside a conversation, rejoin room
        if (this.currentConversationId) {
          this.joinConversation(this.currentConversationId);
        }
      });

      this.socket.on('connect_error', (err) => {
        console.warn('[ChatSocketClient] Connection error:', err.message);
      });

      // Forward registered listeners to socket instance
      for (const [event, callbacks] of this.listeners.entries()) {
        callbacks.forEach((cb) => {
          this.socket?.on(event, cb);
        });
      }

      this.isConnecting = false;
      return this.socket;
    } catch (err) {
      this.isConnecting = false;
      console.warn('[ChatSocketClient] Failed connecting:', err);
      return null;
    }
  }

  /**
   * Joins a conversation room for real-time messaging.
   */
  public joinConversation(conversationId: string) {
    this.currentConversationId = conversationId;
    if (this.socket && this.socket.connected) {
      this.socket.emit('conversation:join', { conversationId });
    }
  }

  /**
   * Leaves the active conversation room.
   */
  public leaveConversation(conversationId: string) {
    if (this.currentConversationId === conversationId) {
      this.currentConversationId = null;
    }
    if (this.socket && this.socket.connected) {
      this.socket.emit('conversation:leave', { conversationId });
    }
  }

  /**
   * Sends typing indicator status.
   */
  public sendTyping(conversationId: string, isTyping: boolean) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:typing', { conversationId, isTyping });
    }
  }

  /**
   * Acknowledges that messages in a conversation have been read.
   */
  public sendReadAck(conversationId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('chat:read', { conversationId });
    }
  }

  /**
   * Subscribes to a socket event.
   */
  public on(event: string, callback: SocketEventListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }

    return () => this.off(event, callback);
  }

  /**
   * Unsubscribes from a socket event.
   */
  public off(event: string, callback: SocketEventListener) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  /**
   * Emits a socket event.
   */
  public emit(event: string, data?: any, ack?: (res: any) => void) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data, ack);
    } else {
      this.connect().then((sock) => {
        sock?.emit(event, data, ack);
      });
    }
  }

  /**
   * Disconnects socket.
   */
  public disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const chatSocket = new ChatSocketClient();
