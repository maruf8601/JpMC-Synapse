/**
 * JpMC Synapse — WebRTC Peer Connection & Audio/Video Call Manager
 * Organization: Jamalpur Medical College (JpMC)
 *
 * Implements:
 * - Dynamic STUN / TURN server configuration retrieval with reliable fallback
 * - Immediate socket signal buffering (zero dropped SDP offers or early ICE candidates)
 * - Two-way readiness handshake (Caller sends offer when Callee is ready)
 * - Safe track collection (both audio and video tracks preserved across ontrack events)
 * - Camera & Microphone capture with progressive fallback
 * - Mute / Unmute, Camera Flip, Hardware Track cleanup
 */

import { chatSocket } from './chatSocketClient';
import { apiFetch } from '../config/api';
import { getAuthHeader } from './authService';

export interface WebRtcCallConfig {
  callId: string;
  conversationId: string;
  targetUserId: string;
  isCaller: boolean;
  type: 'audio' | 'video';
  autoOffer?: boolean;
  onRemoteStream?: (stream: MediaStream) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onCallEnded?: (reason: string) => void;
  onError?: (err: Error) => void;
  onPermissionDenied?: (message: string) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

/**
 * Creates a silent audio stream fallback so RTCPeerConnection can still
 * negotiate SDP and connect when microphone access is denied or unavailable.
 */
function createSilentAudioStream(): MediaStream {
  try {
    const AudioContextClass =
      typeof window !== 'undefined'
        ? window.AudioContext || (window as any).webkitAudioContext
        : null;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // Audible to WebRTC encoder, silent to human ear
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = true;
        return dst.stream;
      }
    }
  } catch (e) {
    console.warn('[WebRTC] Silent audio generator fallback unavailable:', e);
  }
  return new MediaStream();
}

export class WebRtcCallSession {
  private config: WebRtcCallConfig;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isCleanedUp: boolean = false;
  private isStarted: boolean = false;
  private facingMode: 'user' | 'environment' = 'user';
  private hasPermissionError: boolean = false;

  // Signal and ICE Candidate buffers to eliminate race conditions
  private earlySignalQueue: any[] = [];
  private queuedCandidates: any[] = [];
  private offerRetryTimer: any = null;
  private unbindListeners: (() => void)[] = [];

  constructor(config: WebRtcCallConfig) {
    this.config = config;
    // Bind socket events IMMEDIATELY so no incoming signal is ever lost during media acquisition
    this.bindSocketSignals();
  }

  /**
   * Initializes call: acquires STUN/TURN, captures media, binds peer tracks, and signals readiness.
   */
  public async start(): Promise<void> {
    if (this.isCleanedUp || this.isStarted) return;
    this.isStarted = true;

    try {
      // 1. Fetch ICE Servers configuration from server (with robust STUN fallbacks)
      const iceServers = await this.fetchIceServers();

      // 2. Initialize RTCPeerConnection
      this.peerConnection = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 2,
      });

      // 3. Setup Remote Track Listener
      this.remoteStream = new MediaStream();
      this.peerConnection.ontrack = (event) => {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }

        // Add track directly if not already present
        if (event.track) {
          const exists = this.remoteStream.getTracks().some((t) => t.id === event.track.id);
          if (!exists) {
            this.remoteStream.addTrack(event.track);
          }
        }

        // Also incorporate any tracks present in event.streams
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((track) => {
            const exists = this.remoteStream!.getTracks().some((t) => t.id === track.id);
            if (!exists) {
              this.remoteStream!.addTrack(track);
            }
          });
        }

        console.log('[WebRTC] ontrack fired. Total remote tracks:', {
          audio: this.remoteStream.getAudioTracks().length,
          video: this.remoteStream.getVideoTracks().length,
        });

        this.config.onRemoteStream?.(this.remoteStream);
      };

      // 4. Setup ICE Candidate Generation
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          chatSocket.emit('call:signal', {
            callId: this.config.callId,
            targetUserId: this.config.targetUserId,
            signal: { candidate: event.candidate },
          });
        }
      };

      // 5. Setup Connection State Monitoring
      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection) {
          const state = this.peerConnection.connectionState;
          console.log('[WebRTC] Connection state:', state);
          this.config.onConnectionStateChange?.(state);
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        if (this.peerConnection) {
          console.log('[WebRTC] ICE state:', this.peerConnection.iceConnectionState);
        }
      };

      // 6. Acquire Local Audio / Video Media with graceful fallbacks
      await this.acquireLocalMedia();

      // Add local tracks to peer connection
      if (this.localStream && this.peerConnection) {
        this.localStream.getTracks().forEach((track) => {
          try {
            this.peerConnection?.addTrack(track, this.localStream!);
          } catch (e) {
            console.warn('[WebRTC] Error adding local track:', e);
          }
        });
      }

      this.config.onLocalStream?.(this.localStream!);

      // 7. Process any early signals that arrived while media was being acquired
      while (this.earlySignalQueue.length > 0) {
        const earlySignal = this.earlySignalQueue.shift();
        await this.handleIncomingSignal(earlySignal);
      }

      // 8. If Callee, notify Caller that local setup is complete and ready for SDP offer
      if (!this.config.isCaller) {
        chatSocket.emit('call:ready', {
          callId: this.config.callId,
          targetUserId: this.config.targetUserId,
        });
      } else if (this.config.autoOffer) {
        // If caller and autoOffer requested
        await this.sendOffer();
      }
    } catch (err: any) {
      console.warn('[WebRTC] Call start error:', err?.message || err);
      this.config.onError?.(err);
    }
  }

  /**
   * Acquires local media with progressive fallback to prevent blocking failures.
   */
  private async acquireLocalMedia(): Promise<void> {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      console.warn('[WebRTC] getUserMedia is not supported in this browser.');
      this.hasPermissionError = true;
      this.config.onPermissionDenied?.('MediaDevices API is not available.');
      this.localStream = createSilentAudioStream();
      return;
    }

    // Level 1: Attempt requested type (Audio or Video)
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          this.config.type === 'video'
            ? {
                facingMode: this.facingMode,
                width: { ideal: 640 },
                height: { ideal: 480 },
              }
            : false,
      };
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return;
    } catch (level1Err: any) {
      console.warn('[WebRTC] Level 1 getUserMedia attempt notice:', level1Err?.message || level1Err);
    }

    // Level 2: Try standard unconstrained video + audio (if video requested)
    if (this.config.type === 'video') {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        return;
      } catch (level2Err: any) {
        console.warn('[WebRTC] Level 2 getUserMedia attempt notice:', level2Err?.message || level2Err);
      }
    }

    // Level 3: Fallback to audio only
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return;
    } catch (audioOnlyErr: any) {
      console.warn('[WebRTC] Microphone permission denied or unavailable:', audioOnlyErr?.message || audioOnlyErr);
      this.hasPermissionError = true;
      this.config.onPermissionDenied?.(
        audioOnlyErr?.message || 'Microphone access was denied. Please allow microphone permissions in browser.'
      );
      this.localStream = createSilentAudioStream();
    }
  }

  /**
   * Generates and transmits SDP offer to the remote peer.
   */
  public async sendOffer(): Promise<void> {
    if (!this.peerConnection || this.isCleanedUp) return;

    try {
      // Create and set local offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.config.type === 'video',
      });
      await this.peerConnection.setLocalDescription(offer);

      chatSocket.emit('call:signal', {
        callId: this.config.callId,
        targetUserId: this.config.targetUserId,
        signal: { sdp: this.peerConnection.localDescription },
      });

      // Retransmission watchdog: If still in have-local-offer after 3.5 seconds, resend offer
      if (this.offerRetryTimer) clearTimeout(this.offerRetryTimer);
      this.offerRetryTimer = setTimeout(async () => {
        if (
          this.peerConnection &&
          !this.isCleanedUp &&
          this.peerConnection.signalingState === 'have-local-offer' &&
          !this.peerConnection.remoteDescription
        ) {
          console.log('[WebRTC] Retrying SDP offer transmission...');
          chatSocket.emit('call:signal', {
            callId: this.config.callId,
            targetUserId: this.config.targetUserId,
            signal: { sdp: this.peerConnection.localDescription },
          });
        }
      }, 3500);
    } catch (err: any) {
      console.warn('[WebRTC] Error sending offer:', err?.message || err);
    }
  }

  /**
   * Processes incoming WebRTC signaling data (SDP Offer/Answer & ICE Candidates).
   */
  private async handleIncomingSignal(signal: any): Promise<void> {
    if (!signal || !this.peerConnection || this.isCleanedUp) return;

    try {
      if (signal.sdp) {
        const remoteDesc = new RTCSessionDescription(signal.sdp);
        await this.peerConnection.setRemoteDescription(remoteDesc);

        // Clear offer retry timer once remote description is set
        if (this.offerRetryTimer) {
          clearTimeout(this.offerRetryTimer);
          this.offerRetryTimer = null;
        }

        // Drain any ICE candidates that arrived before remoteDescription
        while (this.queuedCandidates.length > 0) {
          const cand = this.queuedCandidates.shift();
          if (cand && this.peerConnection) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
            } catch (candErr) {
              console.warn('[WebRTC] Note adding buffered candidate:', candErr);
            }
          }
        }

        // If offer received, generate and return SDP answer
        if (signal.sdp.type === 'offer') {
          const answer = await this.peerConnection.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: this.config.type === 'video',
          });
          await this.peerConnection.setLocalDescription(answer);

          chatSocket.emit('call:signal', {
            callId: this.config.callId,
            targetUserId: this.config.targetUserId,
            signal: { sdp: this.peerConnection.localDescription },
          });
        }
      } else if (signal.candidate) {
        if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (iceErr) {
            console.warn('[WebRTC] Note adding direct candidate:', iceErr);
          }
        } else {
          this.queuedCandidates.push(signal.candidate);
        }
      }
    } catch (err: any) {
      console.warn('[WebRTC] Error processing incoming signal:', err?.message || err);
    }
  }

  /**
   * Binds socket events immediately in constructor to guarantee no dropped messages.
   */
  private bindSocketSignals(): void {
    const unsubSignal = chatSocket.on('call:signal', async (data: any) => {
      if (this.isCleanedUp || data.callId !== this.config.callId) return;

      if (!this.peerConnection) {
        // Buffer signal until peerConnection finishes local media acquisition
        this.earlySignalQueue.push(data.signal);
      } else {
        await this.handleIncomingSignal(data.signal);
      }
    });

    const unsubReady = chatSocket.on('call:ready', async (data: any) => {
      if (this.isCleanedUp || data.callId !== this.config.callId) return;
      // Peer is ready, send offer if caller
      if (this.config.isCaller) {
        console.log('[WebRTC] Remote peer reported ready, transmitting SDP offer.');
        await this.sendOffer();
      }
    });

    const unsubAccepted = chatSocket.on('call:accepted', async (data: any) => {
      if (this.isCleanedUp || data.callId !== this.config.callId) return;
      if (this.config.isCaller) {
        console.log('[WebRTC] Call accepted by peer, transmitting SDP offer.');
        await this.sendOffer();
      }
    });

    const unsubEnded = chatSocket.on('call:ended', (data: any) => {
      if (data.callId === this.config.callId) {
        this.config.onCallEnded?.(data.reason || 'ended');
        this.cleanup();
      }
    });

    this.unbindListeners = [unsubSignal, unsubReady, unsubAccepted, unsubEnded];
  }

  /**
   * Allows the user to grant microphone/camera permissions after an initial prompt or block.
   */
  public async retryMediaPermissions(): Promise<boolean> {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return false;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          this.config.type === 'video'
            ? { facingMode: this.facingMode }
            : false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.hasPermissionError = false;

      // Stop old synthetic/fallback tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
      }

      this.localStream = newStream;
      this.config.onLocalStream?.(newStream);

      // Update peer connection senders
      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        newStream.getTracks().forEach((newTrack) => {
          const sender = senders.find((s) => s.track?.kind === newTrack.kind);
          if (sender) {
            sender.replaceTrack(newTrack);
          } else {
            this.peerConnection?.addTrack(newTrack, newStream);
          }
        });
      }
      return true;
    } catch (err: any) {
      console.warn('[WebRTC] Permission retry was not granted:', err?.message || err);
      return false;
    }
  }

  /**
   * Toggles microphone audio mute state.
   */
  public toggleMute(muted?: boolean): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = muted !== undefined ? !muted : !audioTrack.enabled;
      return !audioTrack.enabled; // returns isMuted
    }
    return false;
  }

  /**
   * Toggles video camera enable/disable.
   */
  public toggleVideo(enabled?: boolean): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled !== undefined ? enabled : !videoTrack.enabled;
      return videoTrack.enabled;
    }
    return false;
  }

  /**
   * Switches mobile camera between front and back.
   */
  public async switchCamera(): Promise<void> {
    if (!this.localStream || this.config.type !== 'video') return;

    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';

    const oldVideoTrack = this.localStream.getVideoTracks()[0];
    if (oldVideoTrack) {
      oldVideoTrack.stop();
      this.localStream.removeTrack(oldVideoTrack);
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        this.localStream.addTrack(newVideoTrack);

        const sender = this.peerConnection
          ?.getSenders()
          .find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Camera flip error:', err);
    }
  }

  /**
   * Cleans up all audio/video tracks and peer connections immediately.
   */
  public cleanup(): void {
    if (this.isCleanedUp) return;
    this.isCleanedUp = true;

    if (this.offerRetryTimer) {
      clearTimeout(this.offerRetryTimer);
      this.offerRetryTimer = null;
    }

    this.unbindListeners.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
    this.unbindListeners = [];

    // Release local media devices (releases hardware mic/cam indicator)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.remoteStream = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
  }

  /**
   * Fetches STUN/TURN server configuration with broad public fallbacks.
   */
  private async fetchIceServers(): Promise<RTCIceServer[]> {
    const fallbackServers: RTCIceServer[] = [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun3.l.google.com:19302',
          'stun:stun4.l.google.com:19302',
          'stun:stun.services.mozilla.com',
        ],
      },
    ];

    try {
      const authHeaders = await getAuthHeader();
      const res = await apiFetch('/api/chat/webrtc/config', {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          return data.iceServers;
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Config fetch fallback to public STUN:', err);
    }

    return fallbackServers;
  }
}
