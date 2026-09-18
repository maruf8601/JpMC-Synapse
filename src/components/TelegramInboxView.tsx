import React, { useState, useEffect } from 'react';
import { TelegramMessageEntity, Language, EventEntity, ReviewStatus } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';
import { TelegramTextToMeeting } from './TelegramTextToMeeting';
import { eventRepository } from '../data/eventRepository';
import { fetchTelegramStatus } from '../config/api';
import {
  MessageSquare,
  FileText,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CopyCheck,
  Loader2,
  DownloadCloud,
  FileQuestion,
  Image as ImageIcon,
} from 'lucide-react';

interface TelegramInboxViewProps {
  messages: TelegramMessageEntity[];
  language: Language;
  onOpenReview: () => void;
  onSelectEvent?: (event: EventEntity) => void;
  role?: 'admin' | 'user';
}

export const TelegramInboxView: React.FC<TelegramInboxViewProps> = ({
  messages,
  language,
  onOpenReview,
  onSelectEvent,
  role = 'user',
}) => {
  const isAdmin = role === 'admin';
  const [activeSegment, setActiveSegment] = useState<'text_to_meeting' | 'inbox'>(
    isAdmin ? 'text_to_meeting' : 'inbox'
  );
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const [reprocessSuccess, setReprocessSuccess] = useState<number | null>(null);
  const [reprocessError, setReprocessError] = useState<number | null>(null);
  const [botConfigured, setBotConfigured] = useState<boolean>(false);

  useEffect(() => {
    fetchTelegramStatus()
      .then((data) => {
        if (data?.configured) {
          setBotConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleReprocess = async (msg: TelegramMessageEntity) => {
    setReprocessingId(msg.id);
    setReprocessError(null);
    try {
      const res = await fetch('/api/telegram/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: msg.chatId,
          messageId: msg.messageId,
          telegramFileId: msg.telegramFileId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reprocess message');
      }

      // Sync fresh records across entire app
      await eventRepository.fetchServerUpdates();

      if (data.events && data.events.length > 0 && onSelectEvent) {
        onSelectEvent(data.events[0]);
      }

      setReprocessSuccess(msg.id);
      setTimeout(() => setReprocessSuccess(null), 3500);
    } catch (err) {
      console.warn('Reprocess error:', err);
      setReprocessError(msg.id);
      setTimeout(() => setReprocessError(null), 4000);
    } finally {
      setReprocessingId(null);
    }
  };

  const getStatusBadge = (status: TelegramMessageEntity['status']) => {
    switch (status) {
      case 'Schedule Created':
      case 'Processed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{language === 'bn' ? 'সূচি তৈরি সম্পন্ন' : 'Schedule Created'}</span>
          </span>
        );
      case 'Needs Review':
      case 'Review Required':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>{language === 'bn' ? 'যাচাই প্রয়োজন' : 'Needs Review'}</span>
          </span>
        );
      case 'Processing':
      case 'Received':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
            <Loader2 className="w-3 h-3 text-sky-600 animate-spin" />
            <span>{language === 'bn' ? 'বিশ্লেষণ চলছে...' : 'Processing...'}</span>
          </span>
        );
      case 'Not a Schedule':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3 text-slate-400" />
            <span>{language === 'bn' ? 'সূচি সংশ্লিষ্ট নয়' : 'Not a Schedule'}</span>
          </span>
        );
      case 'Download Failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <DownloadCloud className="w-3 h-3 text-rose-600" />
            <span>{language === 'bn' ? 'ডকুমেন্ট ডাউনলোড ব্যর্থ' : 'Download Failed'}</span>
          </span>
        );
      case 'Gemini Processing Failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>{language === 'bn' ? 'এআই প্রসেসিং ব্যর্থ' : 'Gemini Failed'}</span>
          </span>
        );
      case 'Unsupported Document':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <FileQuestion className="w-3 h-3 text-amber-600" />
            <span>{language === 'bn' ? 'অসমর্থিত ডকুমেন্ট' : 'Unsupported Doc'}</span>
          </span>
        );
      case 'Duplicate':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
            <CopyCheck className="w-3 h-3 text-indigo-600" />
            <span>{language === 'bn' ? 'সম্ভাব্য ডুপ্লিকেট' : 'Duplicate'}</span>
          </span>
        );
      case 'Processing Failed':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>{language === 'bn' ? 'প্রসেসিং ব্যর্থ' : 'Processing Failed'}</span>
          </span>
        );
    }
  };

  return (
    <div id="telegram-inbox-view" className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-sky-600" />
            <span>{language === 'bn' ? 'টেলিগ্রাম ইনবক্স' : 'Telegram Inbox'}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'জেপিএমসি অফিশিয়াল টেলিগ্রাম গ্রুপ থেকে ইনজেস্টেড বার্তা ও নোটিশ'
              : 'Ingested notices from official JpMC Telegram channels'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-sky-800 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-200 font-medium">
          <span className={`w-2 h-2 rounded-full ${botConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
          <span>{botConfigured ? (language === 'bn' ? 'বট সক্রিয়' : 'Bot Active') : (language === 'bn' ? 'ওয়েবহুক প্রস্তুত' : 'Webhook Ready')}</span>
        </div>
      </div>

      {/* Segment Switcher (Admin only: regular staff have direct notices view) */}
      {isAdmin && (
        <div className="flex bg-slate-200/80 p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveSegment('text_to_meeting')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSegment === 'text_to_meeting'
                ? 'bg-white text-[#006A60] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>{language === 'bn' ? 'বার্তা দিয়ে মিটিং তৈরি' : 'Text to Meeting'}</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-full">
              Gemini
            </span>
          </button>

          <button
            onClick={() => setActiveSegment('inbox')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeSegment === 'inbox'
                ? 'bg-white text-[#006A60] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
            <span>{language === 'bn' ? 'টেলিগ্রাম বার্তা ফিড' : 'Messages Feed'}</span>
            <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded-full">
              {toBengaliNumber(messages.length)}
            </span>
          </button>
        </div>
      )}

      {/* Segment Content */}
      {activeSegment === 'text_to_meeting' ? (
        <TelegramTextToMeeting
          language={language}
          onMeetingCreated={(evt) => {
            if (onSelectEvent) onSelectEvent(evt);
          }}
        />
      ) : (
        /* Message List */
        <div className="space-y-3">
          {messages.map((msg) => {
            const isReprocessing = reprocessingId === msg.id;
            const isSuccess = reprocessSuccess === msg.id;
            const isFailed = reprocessError === msg.id;

            return (
              <div
                key={msg.id}
                id={`telegram-msg-${msg.id}`}
                className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3"
              >
                {/* Meta header: Canonical identity is TelegramBot with Telegram source */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">TelegramBot</h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span className="font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded text-[10px]">
                        Telegram
                      </span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                  {getStatusBadge(msg.status)}
                </div>

                {/* Message text */}
                {msg.rawText && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-sans">
                    "{msg.rawText}"
                  </div>
                )}

                {/* Document or Image attachment pill if present */}
                {msg.hasDocument && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs bg-teal-50 text-[#006A60] px-3 py-2 rounded-xl border border-teal-200">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {msg.documentType === 'image' ? (
                          <ImageIcon className="w-4 h-4 text-teal-600 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                        )}
                        <span className="font-semibold truncate">
                          {msg.documentName ||
                            (msg.documentType === 'image'
                              ? language === 'bn'
                                ? 'সংযুক্ত ছবি / ফটোগ্রাফ'
                                : 'Attached Notice Photo'
                              : language === 'bn'
                              ? 'সংযুক্ত ডকুমেন্ট (PDF)'
                              : 'Attached Document (PDF)')}
                        </span>
                      </div>
                      {msg.fileSize && msg.fileSize > 0 && (
                        <span className="text-[10px] text-teal-700/80 font-mono shrink-0">
                          {(msg.fileSize / 1024).toFixed(0)} KB
                        </span>
                      )}
                    </div>

                    {/* Optional Image Preview if message has image attachment */}
                    {msg.documentType === 'image' && msg.chatId && msg.messageId && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative group">
                        <img
                          src={`/api/telegram/file-preview/${encodeURIComponent(msg.chatId)}/${msg.messageId}`}
                          alt={msg.documentName || 'Notice preview'}
                          className="w-full max-h-48 object-contain bg-slate-950/5"
                          loading="lazy"
                          onError={(e) => {
                            // If preview fails to load or offline, collapse smoothly
                            const parent = (e.target as HTMLElement).parentElement;
                            if (parent) parent.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      {language === 'bn'
                        ? `কনফিডেন্স: ${toBengaliNumber(Math.round(msg.confidence * 100))}%`
                        : `Confidence: ${Math.round(msg.confidence * 100)}%`}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      {(msg.status === 'Needs Review' || msg.status === 'Review Required') && (
                        <button
                          onClick={onOpenReview}
                          className="text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-lg transition cursor-pointer"
                        >
                          {language === 'bn' ? 'যাচাই করুন' : 'Review'}
                        </button>
                      )}

                      <button
                        onClick={() => handleReprocess(msg)}
                        disabled={isReprocessing}
                        className="flex items-center gap-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition disabled:opacity-50 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-spin' : ''}`} />
                        <span>
                          {isReprocessing
                            ? language === 'bn'
                              ? 'জেমিনাই এক্সট্র্যাক্ট করছে...'
                              : 'Gemini Extracting...'
                            : isSuccess
                            ? language === 'bn'
                              ? 'সম্পন্ন!'
                              : 'Done!'
                            : isFailed
                            ? language === 'bn'
                              ? 'ব্যর্থ হয়েছে'
                              : 'Failed'
                            : language === 'bn'
                            ? 'পুনরায় এআই প্রসেস'
                            : 'Reprocess with Gemini'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

