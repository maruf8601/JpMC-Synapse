import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  SwitchCamera,
  Maximize2,
  Minimize2,
  Volume2,
  AlertCircle,
} from 'lucide-react';
import { WebRtcCallSession } from '../../services/webrtcService';
import { chatSocket } from '../../services/chatSocketClient';
import { Language } from '../../domain/models';

export interface ActiveCallState {
  callId: string;
  conversationId: string;
  targetUserId: string;
  targetUserName: string;
  type: 'audio' | 'video';
  isIncoming?: boolean;
  status: 'ringing' | 'connected' | 'ended';
}

interface WebRtcCallModalProps {
  call: ActiveCallState;
  currentUserId: string;
  language: Language;
  onClose: () => void;
}

/**
 * Generates an audio tone cadence for incoming ringing and outgoing ringback tone.
 */
function playToneCadence(isIncoming: boolean): () => void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return () => {};
    const ctx = new AudioCtx();
    let isPlaying = true;

    const playPulse = () => {
      if (!isPlaying || ctx.state === 'closed') return;
      try {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.value = isIncoming ? 440 : 440;
        osc2.frequency.value = isIncoming ? 480 : 480;

        gain.gain.value = 0.04; // Gentle volume

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.2);
        osc2.stop(now + 1.2);
      } catch {}

      setTimeout(() => {
        if (isPlaying) playPulse();
      }, isIncoming ? 2500 : 3500);
    };

    playPulse();

    return () => {
      isPlaying = false;
      try {
        ctx.close();
      } catch {}
    };
  } catch {
    return () => {};
  }
}

export const WebRtcCallModal: React.FC<WebRtcCallModalProps> = ({
  call,
  currentUserId,
  language,
  onClose,
}) => {
  const [session, setSession] = useState<WebRtcCallSession | null>(null);
  const sessionRef = useRef<WebRtcCallSession | null>(null);
  const [callStatus, setCallStatus] = useState<'ringing' | 'connected' | 'ended'>(call.status);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(call.type === 'video');
  const [duration, setDuration] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [isRetryingPermission, setIsRetryingPermission] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Play ringing sound until connected or ended
  useEffect(() => {
    if (callStatus === 'ringing') {
      const stopTone = playToneCadence(Boolean(call.isIncoming));
      return () => stopTone();
    }
  }, [callStatus, call.isIncoming]);

  // Synchronize local media stream to local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, callStatus, isExpanded]);

  // Synchronize remote media stream to video and audio elements with guaranteed playback
  useEffect(() => {
    if (remoteStream) {
      // 1. Remote Video Element (Muted so video frames render immediately without autoplay restriction)
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch((err) => {
          console.warn('[WebRTC] remoteVideo play error:', err);
        });
      }

      // 2. Remote Audio Element (Plays incoming voice)
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        const playPromise = remoteAudioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsAudioBlocked(false);
            })
            .catch((err) => {
              console.warn('[WebRTC] remoteAudio play error:', err);
              // Browser autoplay policy might require a user interaction
              setIsAudioBlocked(true);
            });
        }
      }
    }
  }, [remoteStream, callStatus, isExpanded]);

  const unlockAudio = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current
        .play()
        .then(() => setIsAudioBlocked(false))
        .catch(() => {});
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.play().catch(() => {});
    }
  };

  // Setup WebRTC Call Session when call is accepted or outgoing
  const initializeCallSession = (isCaller: boolean) => {
    const rtcSession = new WebRtcCallSession({
      callId: call.callId,
      conversationId: call.conversationId,
      targetUserId: call.targetUserId,
      isCaller,
      type: call.type,
      autoOffer: false, // Offer is sent once receiver reports readiness
      onLocalStream: (stream) => {
        setLocalStream(stream);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
        setCallStatus('connected');
      },
      onCallEnded: (reason) => {
        console.log('[WebRTC] Call ended:', reason);
        setCallStatus('ended');
        setTimeout(() => onClose(), 1200);
      },
      onPermissionDenied: (msg) => {
        setPermissionNotice(
          language === 'bn'
            ? 'মাইক্রোফোন/ক্যামেরার অনুমতি প্রয়োজন। অনুমতি দিতে "অনুমতি দিন" চাপুন।'
            : 'Microphone/camera permission was not granted. Please allow device access.'
        );
      },
      onError: (err) => {
        console.warn('[WebRTC] Session note:', err?.message || err);
      },
    });

    rtcSession.start();
    sessionRef.current = rtcSession;
    setSession(rtcSession);
    return rtcSession;
  };

  // If outgoing call, start immediately
  useEffect(() => {
    if (!call.isIncoming) {
      chatSocket.emit('call:start', {
        callId: call.callId,
        conversationId: call.conversationId,
        targetUserId: call.targetUserId,
        type: call.type,
        callType: call.type,
      });
      chatSocket.emit('call:initiate', {
        callId: call.callId,
        conversationId: call.conversationId,
        targetUserId: call.targetUserId,
        type: call.type,
        callType: call.type,
      });
      initializeCallSession(true);
    }

    const unsubAccepted = chatSocket.on('call:accepted', (data: any) => {
      if (data.callId === call.callId) {
        setCallStatus('connected');
      }
    });

    const unsubDeclined = chatSocket.on('call:declined', (data: any) => {
      if (data.callId === call.callId) {
        setCallStatus('ended');
        setTimeout(() => onClose(), 1200);
      }
    });

    const unsubEnded = chatSocket.on('call:ended', (data: any) => {
      if (data.callId === call.callId) {
        setCallStatus('ended');
        setTimeout(() => onClose(), 1200);
      }
    });

    return () => {
      unsubAccepted();
      unsubDeclined();
      unsubEnded();
    };
  }, [call.callId]);

  // Duration Timer
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.cleanup();
      session?.cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleAccept = () => {
    // Callee accepts: send accept event, then initialize local session which will emit call:ready
    chatSocket.emit('call:accept', {
      callId: call.callId,
      callerId: call.targetUserId,
    });
    setCallStatus('connected');
    initializeCallSession(false);
  };

  const handleDecline = () => {
    chatSocket.emit('call:decline', {
      callId: call.callId,
      callerId: call.targetUserId,
      reason: 'declined',
    });
    sessionRef.current?.cleanup();
    session?.cleanup();
    onClose();
  };

  const handleEndCall = () => {
    chatSocket.emit('call:end', {
      callId: call.callId,
      targetUserId: call.targetUserId,
      reason: 'hangup',
    });
    sessionRef.current?.cleanup();
    session?.cleanup();
    setCallStatus('ended');
    setTimeout(() => onClose(), 800);
  };

  const handleToggleMute = () => {
    if (session) {
      const muted = session.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleToggleVideo = () => {
    if (session) {
      const enabled = session.toggleVideo();
      setIsVideoEnabled(enabled);
    }
  };

  const handleSwitchCamera = () => {
    session?.switchCamera();
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if remote video tracks are live
  const hasRemoteVideo =
    call.type === 'video' &&
    remoteStream &&
    remoteStream.getVideoTracks().length > 0 &&
    remoteStream.getVideoTracks().some((t) => t.readyState === 'live');

  // INCOMING CALL PROMPT SCREEN
  if (call.isIncoming && callStatus === 'ringing') {
    return (
      <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center text-white flex flex-col items-center animate-pulse">
          <div className="w-20 h-20 rounded-full bg-teal-600/30 border-2 border-teal-400 flex items-center justify-center mb-4 text-2xl font-bold shadow-lg shadow-teal-500/20">
            {call.type === 'video' ? (
              <Video className="w-8 h-8 text-teal-300" />
            ) : (
              <Phone className="w-8 h-8 text-teal-300" />
            )}
          </div>

          <h3 className="text-xl font-bold mb-1 truncate max-w-[240px]">{call.targetUserName}</h3>
          <p className="text-sm text-teal-300 font-medium mb-6">
            {call.type === 'video'
              ? language === 'bn'
                ? 'ইনকামিং ভিডিও কল...'
                : 'Incoming Video Call...'
              : language === 'bn'
              ? 'ইনকামিং অডিও কল...'
              : 'Incoming Audio Call...'}
          </p>

          <div className="flex items-center justify-center gap-8 w-full">
            {/* Decline */}
            <button
              type="button"
              onClick={handleDecline}
              className="flex flex-col items-center gap-1.5 p-3.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-full transition shadow-lg cursor-pointer"
              title="Decline"
            >
              <PhoneOff className="w-6 h-6" />
            </button>

            {/* Accept */}
            <button
              type="button"
              onClick={handleAccept}
              className="flex flex-col items-center gap-1.5 p-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-full transition shadow-lg shadow-emerald-600/30 cursor-pointer"
              title="Accept"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ACTIVE CALL SCREEN (AUDIO OR VIDEO)
  return (
    <div
      onClick={unlockAudio}
      className={`fixed z-50 transition-all ${
        isExpanded
          ? 'inset-0 bg-slate-950 flex flex-col'
          : 'bottom-4 right-4 w-80 sm:w-96 rounded-2xl shadow-2xl bg-slate-900 border border-slate-700 overflow-hidden'
      }`}
    >
      {/* Remote Audio Track (Plays incoming voice) */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Main Video / Visual Area */}
      <div
        className={`relative bg-slate-950 flex items-center justify-center ${
          isExpanded ? 'flex-1 w-full' : 'h-56'
        }`}
      >
        {call.type === 'video' ? (
          <>
            {/* Remote Video Stream (Muted to ensure instant autoplay in all browsers; audio comes from <audio>) */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                hasRemoteVideo ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Fallback avatar if remote video track hasn't arrived yet */}
            {!hasRemoteVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <div className="w-20 h-20 rounded-full bg-teal-800/80 border-2 border-teal-400 flex items-center justify-center font-bold text-white text-2xl shadow-lg mb-3">
                  {call.targetUserName.charAt(0).toUpperCase()}
                </div>
                <h4 className="text-white font-bold text-base truncate max-w-[200px]">
                  {call.targetUserName}
                </h4>
                <p className="text-teal-300 text-xs mt-1 animate-pulse">
                  {callStatus === 'connected'
                    ? language === 'bn'
                      ? 'ভিডিও লোড হচ্ছে...'
                      : 'Connecting video...'
                    : language === 'bn'
                    ? 'কল বাজছে...'
                    : 'Ringing...'}
                </p>
              </div>
            )}

            {/* Local Video Stream Preview (PIP) */}
            <div className="absolute top-3 right-3 w-24 h-32 sm:w-28 sm:h-36 rounded-xl overflow-hidden border border-white/20 shadow-md bg-black z-10">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
          </>
        ) : (
          /* Audio Call Visualizer */
          <div className="flex flex-col items-center text-center p-4">
            <div className="w-20 h-20 rounded-full bg-teal-800/80 border-2 border-teal-400 flex items-center justify-center font-bold text-white text-2xl shadow-lg mb-3">
              {call.targetUserName.charAt(0).toUpperCase()}
            </div>
            <h4 className="text-white font-bold text-base truncate max-w-[200px]">
              {call.targetUserName}
            </h4>
            <p className="text-teal-300 text-xs mt-1">
              {callStatus === 'connected'
                ? formatDuration(duration)
                : callStatus === 'ringing'
                ? language === 'bn'
                  ? 'কল বাজছে...'
                  : 'Ringing...'
                : language === 'bn'
                ? 'কল সমাপ্ত'
                : 'Call Ended'}
            </p>
          </div>
        )}

        {/* Top Control Bar */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-2">
          <span className="px-2.5 py-1 bg-black/40 backdrop-blur-xs rounded-full text-white text-[11px] font-mono">
            {callStatus === 'connected' ? formatDuration(duration) : callStatus.toUpperCase()}
          </span>
          {isAudioBlocked && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                unlockAudio();
              }}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-full text-[11px] flex items-center gap-1 shadow-sm animate-bounce cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'অডিও চালু করুন' : 'Tap for Sound'}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white z-20 transition cursor-pointer"
          title={isExpanded ? 'Minimize' : 'Maximize'}
        >
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Permission Warning Notice Banner */}
      {permissionNotice && (
        <div className="bg-amber-950/90 border-t border-amber-800/80 px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-1.5 overflow-hidden">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">{permissionNotice}</span>
          </div>
          <button
            type="button"
            disabled={isRetryingPermission}
            onClick={async (e) => {
              e.stopPropagation();
              setIsRetryingPermission(true);
              const granted = await session?.retryMediaPermissions();
              setIsRetryingPermission(false);
              if (granted) {
                setPermissionNotice(null);
              }
            }}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-[11px] font-semibold shrink-0 cursor-pointer shadow-xs"
          >
            {isRetryingPermission
              ? language === 'bn'
                ? 'চেক হচ্ছে...'
                : 'Checking...'
              : language === 'bn'
              ? 'অনুমতি দিন'
              : 'Grant Access'}
          </button>
        </div>
      )}

      {/* Bottom Call Action Controls */}
      <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-3">
        {/* Mute/Unmute */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggleMute();
          }}
          className={`p-3 rounded-full transition cursor-pointer ${
            isMuted ? 'bg-amber-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle (if video call) */}
        {call.type === 'video' && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleVideo();
              }}
              className={`p-3 rounded-full transition cursor-pointer ${
                !isVideoEnabled
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title={isVideoEnabled ? 'Turn Off Video' : 'Turn On Video'}
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>

            {/* Switch Camera (mobile front/back) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSwitchCamera();
              }}
              className="p-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
              title="Switch Camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
          </>
        )}

        {/* End Call (Red) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleEndCall();
          }}
          className="p-3 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white transition shadow-md cursor-pointer ml-1"
          title="End Call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
