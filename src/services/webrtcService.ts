/**
 * JpMC Synapse — WebRTC Peer Connection & Audio/Video Call Manager
 * Organization: Jamalpur Medical College (JpMC)
 *
 * Implements:
 * - Dynamic STUN / TURN server configuration retrieval
 * - RTCPeerConnection lifecycle (Offer, Answer, ICE Candidates)
 * - Microphone & Camera capture with device fallback
 * - Mute / Unmute, Camera Enable / Disable, Camera Flipping (front/rear)
 * - Safe resource cleanup (stops MediaStream tracks, closes peer connection)
 * - Call state events & timer
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
      gain.gain.value = 0; // Silent
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const track = dst.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false;
        return dst.stream;
      }
    }
  } catch (e) {
    console.warn('[WebRTC] Silent audio track generator fallback unavailable:', e);
  }
  return new MediaStream();
}

export class WebRtcCallSession {
  private config: WebRtcCallConfig;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private isCleanedUp: boolean = false;
  private facingMode: 'user' | 'environment' = 'user';
  private hasPermissionError: boolean = false;

  constructor(config: WebRtcCallConfig) {
    this.config = config;
  }

  /**
   * Initializes call: fetches STUN/TURN config, acquires media, binds socket signaling.
   */
  public async start(): Promise<void> {
    try {
      // 1. Fetch ICE Servers configuration from server
      const iceServers = await this.fetchIceServers();

      // 2. Initialize RTCPeerConnection
      this.peerConnection = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 2,
      });

      // 3. Acquire Local Audio / Video Media
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

      try {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          throw new Error('MediaDevices API not available in this environment');
        }
      } catch (mediaErr: any) {
        // If video fails (e.g. no webcam on desktop or camera permission blocked), try audio only fallback
        if (this.config.type === 'video') {
          try {
            console.warn('[WebRTC] Camera unavailable, attempting audio-only fallback...');
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (audioErr: any) {
            console.warn('[WebRTC] Audio/Camera permission not granted:', audioErr?.message || audioErr);
            this.hasPermissionError = true;
            this.config.onPermissionDenied?.(
              audioErr?.message || 'Microphone and Camera permission not granted in browser.'
            );
            this.localStream = createSilentAudioStream();
          }
        } else {
          console.warn('[WebRTC] Microphone permission not granted:', mediaErr?.message || mediaErr);
          this.hasPermissionError = true;
          this.config.onPermissionDenied?.(
            mediaErr?.message || 'Microphone permission not granted in browser.'
          );
          this.localStream = createSilentAudioStream();
        }
      }

      this.config.onLocalStream?.(this.localStream);

      // Add local tracks to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          if (this.peerConnection && this.localStream) {
            this.peerConnection.addTrack(track, this.localStream);
          }
        });
      }

      // 4. Handle Remote Track Events
      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
          this.config.onRemoteStream?.(this.remoteStream);
        }
      };

      // 5. Handle ICE Candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          chatSocket.emit('call:signal', {
            callId: this.config.callId,
            targetUserId: this.config.targetUserId,
            signal: { candidate: event.candidate },
          });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection) {
          const state = this.peerConnection.connectionState;
          this.config.onConnectionStateChange?.(state);
          if (state === 'failed' || state === 'closed' || state === 'disconnected') {
            console.log('[WebRTC] Connection state changed to:', state);
          }
        }
      };

      // 6. Listen to incoming signaling from socket
      this.bindSocketSignals();

      // 7. If caller, create and send SDP offer
      if (this.config.isCaller) {
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
      }
    } catch (err: any) {
      console.warn('[WebRTC] Call setup note:', err?.message || err);
      this.config.onError?.(err);
      this.cleanup();
    }
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
            ? {
                facingMode: this.facingMode,
                width: { ideal: 640 },
                height: { ideal: 480 },
              }
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
   * Binds socket events for incoming signaling data.
   */
  private bindSocketSignals() {
    chatSocket.on('call:signal', async (data: any) => {
      if (this.isCleanedUp || data.callId !== this.config.callId) return;

      try {
        const { signal } = data;
        if (!this.peerConnection) return;

        if (signal.sdp) {
          const remoteDesc = new RTCSessionDescription(signal.sdp);
          await this.peerConnection.setRemoteDescription(remoteDesc);

          // If we received an offer, generate answer
          if (signal.sdp.type === 'offer') {
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            chatSocket.emit('call:signal', {
              callId: this.config.callId,
              targetUserId: this.config.targetUserId,
              signal: { sdp: this.peerConnection.localDescription },
            });
          }
        } else if (signal.candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('[WebRTC] Failed adding ice candidate:', e);
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Signal handling error:', err);
      }
    });

    chatSocket.on('call:ended', (data: any) => {
      if (data.callId === this.config.callId) {
        this.config.onCallEnded?.(data.reason || 'ended');
        this.cleanup();
      }
    });
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

    // Stop current video track
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

        // Replace track on peer connection sender
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

    // Release local media devices (releases hardware mic/cam indicator)
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
  }

  /**
   * Fetches STUN/TURN server configuration.
   */
  private async fetchIceServers(): Promise<RTCIceServer[]> {
    try {
      const authHeaders = await getAuthHeader();
      const res = await apiFetch('/api/chat/webrtc/config', {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers && Array.isArray(data.iceServers)) {
          return data.iceServers;
        }
      }
    } catch (err) {
      console.warn('[WebRTC] Config fetch fallback to public STUN:', err);
    }

    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
  }
}
