import React, { useState, useRef, useEffect } from 'react';
import {
  Check,
  CheckCheck,
  Trash2,
  Download,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Play,
  Pause,
  Film,
  Music,
  Archive,
  Maximize2,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  ChatMessage,
  deleteIndividualMessage,
  formatFileSize,
  getActiveAuthToken,
  buildMediaAttachmentUrl,
} from '../../services/chatClientService';
import { Language } from '../../domain/models';

interface MessageBubbleProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  senderName: string;
  language: Language;
  onMessageDeleted?: (messageId: string) => void;
  onRetrySend?: (message: ChatMessage) => void;
  isAdminOversight?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isCurrentUser,
  senderName,
  language,
  onMessageDeleted,
  onRetrySend,
  isAdminOversight = false,
}) => {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Authenticated Media and Download URLs
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string>('');
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string>('');

  // Audio / Voice Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Resolve authenticated URL with user token for media elements
  useEffect(() => {
    let isMounted = true;
    const rawMedia =
      message.attachment?.downloadUrl ||
      (message.attachment?.id ? `/api/chat/attachments/${message.attachment.id}/stream` : '');
    const rawDownload = message.attachment?.id
      ? `/api/chat/attachments/${message.attachment.id}/download`
      : rawMedia;

    if (!rawMedia) {
      setResolvedMediaUrl('');
      setResolvedDownloadUrl('');
      return;
    }

    getActiveAuthToken().then((token) => {
      if (isMounted) {
        setResolvedMediaUrl(buildMediaAttachmentUrl(rawMedia, token));
        setResolvedDownloadUrl(buildMediaAttachmentUrl(rawDownload, token));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [message.attachment?.id, message.attachment?.downloadUrl]);

  // Format time (HH:mm)
  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '';
    }
  };

  // Format duration in mm:ss
  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Remaining hours calculation for 72h TTL
  const getRemainingHours = (expiresAtIso: string) => {
    try {
      const msLeft = new Date(expiresAtIso).getTime() - Date.now();
      if (msLeft <= 0) return 0;
      return Math.max(1, Math.round(msLeft / (60 * 60 * 1000)));
    } catch {
      return 72;
    }
  };

  // Fallback duration in seconds from content metadata (especially for WebM with Infinity duration)
  const contentSec =
    message.content && !isNaN(Number(message.content)) ? Number(message.content) : 0;
  const effectiveDuration =
    audioDuration && isFinite(audioDuration) && audioDuration > 0
      ? audioDuration
      : contentSec;

  // Audio Playback Controller
  const togglePlayAudio = async () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlayingAudio(true);
      } catch (err) {
        console.warn('[MessageBubble] Audio play error:', err);
        setIsPlayingAudio(false);
      }
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const total = audioRef.current.duration;
      setAudioCurrentTime(current);
      const totalDur = isFinite(total) && total > 0 ? total : effectiveDuration;
      if (totalDur > 0) {
        setAudioProgress(Math.min(100, (current / totalDur) * 100));
      }
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const handleAudioSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const dur = effectiveDuration;
    if (!audioRef.current || !dur || dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    try {
      audioRef.current.currentTime = percentage * dur;
      setAudioProgress(percentage * 100);
    } catch {}
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteIndividualMessage(message.conversationId, message.id);
      setShowConfirmDelete(false);
      onMessageDeleted?.(message.id);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete message.');
    } finally {
      setIsDeleting(false);
    }
  };

  const remainingHours = getRemainingHours(message.expiresAt);
  const isDeletedByUser = message.deletedByUser;

  // Media URLs fallback
  const mediaUrl =
    resolvedMediaUrl ||
    message.attachment?.downloadUrl ||
    (message.attachment?.id ? `/api/chat/attachments/${message.attachment.id}/stream` : '');
  const downloadUrl =
    resolvedDownloadUrl ||
    (message.attachment?.id ? `/api/chat/attachments/${message.attachment.id}/download` : mediaUrl);

  return (
    <div className={`flex flex-col mb-3 ${isCurrentUser && !isAdminOversight ? 'items-end' : 'items-start'}`}>
      {/* Sender name for incoming or admin oversight */}
      {(!isCurrentUser || isAdminOversight) && (
        <span className="text-[11px] font-medium text-slate-500 mb-1 px-1">
          {senderName}
        </span>
      )}

      {/* Admin Oversight Notice if message was deleted by user */}
      {isAdminOversight && isDeletedByUser && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 mb-1 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-[11px] font-medium">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>
            {language === 'bn'
              ? 'ব্যবহারকারী কর্তৃক মোছা হয়েছে (৭২ ঘণ্টা পর্যন্ত অ্যাডমিন সংরক্ষিত)'
              : 'Deleted by user (retained for 72h admin oversight)'}
          </span>
        </div>
      )}

      {/* Message bubble */}
      <div
        className={`relative max-w-[88%] sm:max-w-[75%] rounded-2xl p-3 shadow-xs break-words text-sm transition-all group ${
          isCurrentUser && !isAdminOversight
            ? 'bg-[#006A60] text-white rounded-br-xs'
            : isDeletedByUser && isAdminOversight
            ? 'bg-amber-50/95 text-slate-800 border border-amber-200 rounded-bl-xs'
            : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
        }`}
      >
        {/* VOICE MESSAGE PLAYER (▶ ━━━━━━━━━ 0:24) */}
        {message.type === 'voice' && message.attachment && (
          <div className="min-w-[220px] sm:min-w-[260px] py-1">
            <audio
              ref={audioRef}
              src={mediaUrl}
              onTimeUpdate={handleAudioTimeUpdate}
              onLoadedMetadata={handleAudioLoadedMetadata}
              onError={() => setIsPlayingAudio(false)}
              onEnded={() => {
                setIsPlayingAudio(false);
                setAudioProgress(0);
              }}
              preload="metadata"
            />
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlayAudio}
                className={`p-2 rounded-full transition cursor-pointer shrink-0 ${
                  isCurrentUser && !isAdminOversight
                    ? 'bg-teal-700 hover:bg-teal-600 text-white'
                    : 'bg-[#006A60] hover:bg-teal-700 text-white'
                }`}
                title={isPlayingAudio ? 'Pause' : 'Play voice message'}
              >
                {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              {/* Progress Scrubber Bar */}
              <div
                onClick={handleAudioSeek}
                className="flex-1 h-3 flex items-center cursor-pointer group/bar relative"
              >
                <div
                  className={`w-full h-1.5 rounded-full overflow-hidden ${
                    isCurrentUser && !isAdminOversight ? 'bg-teal-800/80' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className={`h-full transition-all ${
                      isCurrentUser && !isAdminOversight ? 'bg-cyan-300' : 'bg-[#006A60]'
                    }`}
                    style={{ width: `${audioProgress}%` }}
                  />
                </div>
              </div>

              {/* Duration Text */}
              <span
                className={`font-mono text-xs font-medium shrink-0 ${
                  isCurrentUser && !isAdminOversight ? 'text-teal-100' : 'text-slate-600'
                }`}
              >
                {isPlayingAudio ? formatDuration(audioCurrentTime) : formatDuration(effectiveDuration)}
              </span>
            </div>
          </div>
        )}

        {/* IMAGE ATTACHMENT */}
        {message.type === 'image' && message.attachment && (
          <div className="mb-2">
            <div
              onClick={() => setLightboxOpen(true)}
              className="rounded-xl overflow-hidden border border-black/10 bg-slate-100 max-h-72 flex items-center justify-center cursor-pointer relative group/img"
            >
              <img
                src={mediaUrl}
                alt={message.attachment.name}
                loading="lazy"
                className="w-full h-full object-cover max-h-72 hover:scale-102 transition duration-200"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition">
                <Maximize2 className="w-6 h-6 text-white drop-shadow-md" />
              </div>
            </div>
          </div>
        )}

        {/* VIDEO ATTACHMENT */}
        {message.type === 'video' && message.attachment && (
          <div className="mb-2 rounded-xl overflow-hidden border border-black/10 bg-black">
            <video
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-72 object-contain"
            />
          </div>
        )}

        {/* AUDIO FILE ATTACHMENT */}
        {message.type === 'audio' && message.attachment && (
          <div className="mb-2">
            <audio
              ref={audioRef}
              src={mediaUrl}
              controls
              preload="metadata"
              className="w-full max-w-xs"
            />
          </div>
        )}

        {/* DOCUMENT / PDF / ARCHIVE / GENERAL FILE ATTACHMENT */}
        {message.attachment && message.type !== 'image' && message.type !== 'video' && message.type !== 'voice' && (
          <div
            className={`flex items-center justify-between gap-2 p-2.5 rounded-xl mb-1.5 ${
              isCurrentUser && !isAdminOversight
                ? 'bg-teal-800/60 text-teal-50'
                : 'bg-slate-100 text-slate-800'
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              {message.type === 'pdf' ? (
                <FileText className="w-6 h-6 text-red-400 shrink-0" />
              ) : message.type === 'archive' ? (
                <Archive className="w-6 h-6 text-amber-400 shrink-0" />
              ) : (
                <FileText className="w-6 h-6 text-teal-400 shrink-0" />
              )}
              <div className="overflow-hidden">
                <p className="text-xs font-semibold truncate max-w-[170px] sm:max-w-[220px]">
                  {message.attachment.name}
                </p>
                <p className="text-[11px] opacity-75">
                  {formatFileSize(message.attachment.size)}
                </p>
              </div>
            </div>

            <a
              href={downloadUrl}
              download={message.attachment.name}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-lg transition shrink-0 cursor-pointer ${
                isCurrentUser && !isAdminOversight
                  ? 'hover:bg-teal-700 text-teal-100'
                  : 'hover:bg-slate-200 text-slate-700'
              }`}
              title={language === 'bn' ? 'ডাউনলোড করুন' : 'Download'}
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        )}

        {/* Text message content */}
        {message.content && message.type !== 'voice' && (
          <p className="whitespace-pre-wrap leading-relaxed select-text font-normal">
            {message.content}
          </p>
        )}

        {/* Footer info: time, read ticks, expiration */}
        <div
          className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] select-none ${
            isCurrentUser && !isAdminOversight ? 'text-teal-200' : 'text-slate-400'
          }`}
        >
          {/* Expiration badge */}
          <span className="opacity-80 font-mono text-[9px]" title="72h Auto-Deletion Retention">
            ⌛ {remainingHours}h
          </span>

          <span>{formatTime(message.createdAt)}</span>

          {/* Delivery & Read ticks for current user */}
          {isCurrentUser && !isAdminOversight && (
            <span>
              {message.sending ? (
                <Loader2 className="w-3 h-3 animate-spin text-teal-300" title="Sending..." />
              ) : message.failed ? (
                <button
                  type="button"
                  onClick={() => onRetrySend?.(message)}
                  className="flex items-center gap-0.5 text-red-300 hover:text-white cursor-pointer"
                  title="Failed to send. Click to retry."
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              ) : message.readAt ? (
                <CheckCheck className="w-3.5 h-3.5 text-cyan-300" title="Read" />
              ) : message.deliveredAt ? (
                <CheckCheck className="w-3.5 h-3.5 text-teal-200" title="Delivered" />
              ) : (
                <Check className="w-3.5 h-3.5 text-teal-300" title="Sent" />
              )}
            </span>
          )}

          {/* Delete button (only for normal user view) */}
          {!isAdminOversight && !message.sending && (
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              className="ml-1 opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition cursor-pointer"
              title={language === 'bn' ? 'বার্তা মুছুন' : 'Delete message'}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Fullscreen Image Viewing */}
      {lightboxOpen && message.attachment && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition cursor-pointer z-50"
            title="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={mediaUrl}
            alt={message.attachment.name}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Confirmation Modal for Message Deletion */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-800 mb-2">
              {language === 'bn' ? 'বার্তাটি মুছে ফেলতে চান?' : 'Delete this message?'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              {language === 'bn'
                ? 'বার্তাটি আপনার চ্যাট থেকে অবিলম্বে অদৃশ্য হবে। তবে প্রাতিষ্ঠানিক নীতি অনুযায়ী মূল ৭২ ঘণ্টার অবশিষ্ট সময় পর্যন্ত অনুমোদিত অ্যাডমিন নজরদারিতে সংরক্ষিত থাকবে এবং ৭২ ঘণ্টা পূর্ণ হলে স্থায়ীভাবে ধ্বংস হয়ে যাবে।'
                : 'This message will disappear from normal chat immediately. However, it will remain retained in authorized Admin oversight for the remainder of its 72-hour institutional retention window, after which it is permanently purged.'}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <span>{language === 'bn' ? 'মুছে ফেলা হচ্ছে...' : 'Deleting...'}</span>
                ) : (
                  <span>{language === 'bn' ? 'মুছে ফেলুন' : 'Delete'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
