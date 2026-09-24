import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  X,
  Loader2,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Image as ImageIcon,
  FileText,
  Video,
  Archive,
  RefreshCw,
} from 'lucide-react';
import {
  uploadChatAttachmentStream,
  ChatAttachmentMeta,
  formatFileSize,
  isDangerousExtension,
  classifyFileCategory,
} from '../../services/chatClientService';
import { Language } from '../../domain/models';

interface MessageComposerProps {
  conversationId: string;
  onSendMessage: (
    content: string,
    type?: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file',
    attachment?: ChatAttachmentMeta | null
  ) => Promise<void>;
  language: Language;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  conversationId,
  onSendMessage,
  language,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Upload Progress & Abort
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Voice Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  // Close attachment dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup audio preview URL on unmount
  useEffect(() => {
    return () => {
      if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [audioPreviewUrl]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAttachMenu(false);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadError(null);

      // 100 MB Limit Check
      if (file.size > 100 * 1024 * 1024) {
        alert(
          language === 'bn'
            ? 'ফাইলের আকার ১০০ মেগাবাইট (100 MB) এর কম হতে হবে।'
            : 'File is too large. Maximum allowed file size is 100 MB.'
        );
        return;
      }

      // Dangerous file check
      if (isDangerousExtension(file.name)) {
        alert(
          language === 'bn'
            ? 'নিরাপত্তাজনিত কারণে এক্সিকিউটেবল (.exe, .bat ইত্যাদি) ফাইল পাঠানো যাবে না।'
            : 'Security restriction: Executable or script files cannot be transmitted.'
        );
        return;
      }

      setSelectedFile(file);
    }
  };

  // Start voice recording
  const startRecording = async () => {
    try {
      setUploadError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Browser-compatible Opus/WebM recording
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? { mimeType: 'audio/ogg;codecs=opus' }
        : undefined;

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        setRecordedAudioBlob(audioBlob);
        const url = URL.createObjectURL(audioBlob);
        setAudioPreviewUrl(url);

        // Stop stream tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('[MessageComposer] Mic permission error:', err);
      alert(
        language === 'bn'
          ? 'মাইক্রোফোনের অনুমতি পাওয়া যায়নি। দয়া করে ব্রাউজার সেটিংসে অনুমতি দিন।'
          : 'Microphone access denied. Please grant permission in browser settings.'
      );
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  // Cancel voice recording
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setRecordedAudioBlob(null);
    setAudioPreviewUrl(null);
    setRecordingSeconds(0);
  };

  // Play / Pause voice preview
  const togglePlayPreview = () => {
    if (!previewAudioRef.current && audioPreviewUrl) {
      previewAudioRef.current = new Audio(audioPreviewUrl);
      previewAudioRef.current.onended = () => setIsPlayingPreview(false);
    }

    if (previewAudioRef.current) {
      if (isPlayingPreview) {
        previewAudioRef.current.pause();
        setIsPlayingPreview(false);
      } else {
        previewAudioRef.current.play();
        setIsPlayingPreview(true);
      }
    }
  };

  // Handle final send
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSending || disabled) return;

    // Send recorded voice message
    if (recordedAudioBlob) {
      setIsSending(true);
      setUploadPercent(0);
      try {
        const voiceFile = new File(
          [recordedAudioBlob],
          `voice_${Date.now()}.webm`,
          { type: recordedAudioBlob.type || 'audio/webm' }
        );

        const { promise, abort } = uploadChatAttachmentStream(
          conversationId,
          voiceFile,
          (pct) => setUploadPercent(pct)
        );
        abortUploadRef.current = abort;

        const attachmentMeta = await promise;
        await onSendMessage('', 'voice', attachmentMeta);

        cancelRecording();
      } catch (err: any) {
        setUploadError(err?.message || 'Voice upload failed');
      } finally {
        setIsSending(false);
        setUploadPercent(null);
        abortUploadRef.current = null;
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;

    setIsSending(true);

    try {
      let attachmentMeta: ChatAttachmentMeta | null = null;
      let msgType: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file' = 'text';

      if (selectedFile) {
        setUploadPercent(0);
        const { promise, abort } = uploadChatAttachmentStream(
          conversationId,
          selectedFile,
          (pct) => setUploadPercent(pct)
        );
        abortUploadRef.current = abort;

        attachmentMeta = await promise;
        msgType = classifyFileCategory(selectedFile.name, selectedFile.type);
      }

      await onSendMessage(trimmed, msgType, attachmentMeta);

      setText('');
      setSelectedFile(null);
      setUploadPercent(null);
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err: any) {
      setUploadError(err?.message || (language === 'bn' ? 'বার্তা পাঠাতে ত্রুটি হয়েছে।' : 'Failed to send message.'));
    } finally {
      setIsSending(false);
      setUploadPercent(null);
      abortUploadRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    if (abortUploadRef.current) {
      abortUploadRef.current();
      abortUploadRef.current = null;
    }
    setUploadPercent(null);
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white border-t border-slate-200/90 p-2 sm:p-3 relative z-20 pb-safe">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z"
      />

      {/* Selected File Preview Banner with 100 MB size and upload progress */}
      {selectedFile && (
        <div className="mb-2 bg-teal-50/90 border border-teal-200/90 rounded-xl p-2.5 text-xs text-teal-900 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-hidden">
              {selectedFile.type.startsWith('image/') ? (
                <ImageIcon className="w-5 h-5 text-teal-600 shrink-0" />
              ) : selectedFile.type.startsWith('video/') ? (
                <Video className="w-5 h-5 text-teal-600 shrink-0" />
              ) : selectedFile.type.includes('pdf') ? (
                <FileText className="w-5 h-5 text-red-500 shrink-0" />
              ) : (
                <Archive className="w-5 h-5 text-teal-600 shrink-0" />
              )}
              <div className="overflow-hidden">
                <span className="font-semibold truncate block max-w-[200px] sm:max-w-xs">{selectedFile.name}</span>
                <span className="text-[11px] text-teal-700">{formatFileSize(selectedFile.size)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setUploadPercent(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="p-1 text-slate-400 hover:text-red-500 rounded-full transition cursor-pointer"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Real-time Upload Progress Bar */}
          {uploadPercent !== null && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-teal-800 mb-1">
                <span>{language === 'bn' ? `আপলোড হচ্ছে: ${uploadPercent}%` : `Uploading: ${uploadPercent}%`}</span>
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="text-red-600 hover:underline font-semibold cursor-pointer"
                >
                  {language === 'bn' ? 'বাতিল' : 'Cancel'}
                </button>
              </div>
              <div className="w-full bg-teal-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#006A60] h-1.5 transition-all duration-200"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Voice Recording / Preview Bar */}
      {isRecording ? (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-2xl px-4 py-2 text-red-700 animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            <span className="text-xs font-semibold">{language === 'bn' ? 'রেকর্ড হচ্ছে...' : 'Recording...'}</span>
            <span className="font-mono text-xs font-bold text-red-800">{formatTimer(recordingSeconds)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-1.5 text-slate-500 hover:text-red-600 rounded-full cursor-pointer"
              title="Cancel recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1"
            >
              <Square className="w-3.5 h-3.5" />
              <span>{language === 'bn' ? 'থামুন' : 'Stop'}</span>
            </button>
          </div>
        </div>
      ) : recordedAudioBlob ? (
        /* Voice Message Preview Before Send */
        <div className="flex items-center justify-between bg-teal-50 border border-teal-200 rounded-2xl px-3 py-2 text-teal-900 mb-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlayPreview}
              className="p-2 rounded-full bg-[#006A60] text-white hover:bg-teal-700 transition cursor-pointer"
              title={isPlayingPreview ? 'Pause' : 'Play'}
            >
              {isPlayingPreview ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-semibold">
                {language === 'bn' ? 'ভয়েস বার্তা প্রিভিউ' : 'Voice Message Preview'}
              </span>
              <span className="text-[10px] text-teal-700 font-mono">{formatTimer(recordingSeconds)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="p-1.5 text-slate-400 hover:text-red-500 transition cursor-pointer"
              title="Delete voice message"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={isSending}
              className="px-3 py-1.5 bg-[#006A60] hover:bg-teal-700 text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1 shadow-xs"
            >
              {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{language === 'bn' ? 'পাঠান' : 'Send'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Standard Composer Input Row */
        <form onSubmit={handleSend} className="flex items-end gap-1.5 sm:gap-2">
          {/* Attachment Button & Popup */}
          <div className="relative" ref={attachMenuRef}>
            <button
              type="button"
              onClick={() => setShowAttachMenu((prev) => !prev)}
              disabled={isSending || disabled}
              className="p-2.5 text-slate-500 hover:text-[#006A60] hover:bg-teal-50 rounded-full transition cursor-pointer shrink-0"
              title={language === 'bn' ? 'ফাইল যুক্ত করুন (সর্বোচ্চ ১০০ MB)' : 'Attach file (Max 100 MB)'}
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Attachment Menu Popover */}
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-30 animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4 text-emerald-600" />
                  <span>{language === 'bn' ? 'ছবি (Photo)' : 'Photo'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'video/*';
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <Video className="w-4 h-4 text-blue-600" />
                  <span>{language === 'bn' ? 'ভিডিও (Video)' : 'Video'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-red-500" />
                  <span>{language === 'bn' ? 'ডকুমেন্ট (PDF/Doc)' : 'Document'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = '*/*';
                      fileInputRef.current.click();
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <Archive className="w-4 h-4 text-amber-500" />
                  <span>{language === 'bn' ? 'অন্যান্য ফাইল (Max 100MB)' : 'File / Archive'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Text Area */}
          <div className="flex-1 bg-slate-100/80 rounded-2xl border border-slate-200 focus-within:border-[#006A60] focus-within:bg-white transition-all px-3 py-1.5 flex items-center">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={handleKeyDown}
              disabled={isSending || disabled}
              placeholder={language === 'bn' ? 'বার্তা লিখুন...' : 'Type a message...'}
              className="w-full bg-transparent resize-none text-sm text-slate-800 focus:outline-hidden placeholder:text-slate-400 max-h-28 leading-snug py-1"
            />
          </div>

          {/* Microphone Voice Button (if no text typed and no file) */}
          {!text.trim() && !selectedFile ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={isSending || disabled}
              className="p-2.5 rounded-full bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-[#006A60] transition cursor-pointer shrink-0"
              title={language === 'bn' ? 'ভয়েস বার্তা রেকর্ড করুন' : 'Record voice message'}
            >
              <Mic className="w-5 h-5" />
            </button>
          ) : (
            /* Send Button */
            <button
              type="submit"
              disabled={(!text.trim() && !selectedFile) || isSending || disabled}
              className="p-2.5 rounded-full bg-[#006A60] hover:bg-[#00554d] active:scale-95 text-white transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer shrink-0"
              title={language === 'bn' ? 'পাঠান' : 'Send'}
            >
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          )}
        </form>
      )}

      {/* Upload Error Banner with Retry */}
      {uploadError && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 flex items-center justify-between">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => handleSend()}
            className="flex items-center gap-1 font-semibold text-red-700 hover:underline cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{language === 'bn' ? 'পুনরায় চেষ্টা' : 'Retry'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
