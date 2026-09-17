import React, { useState, useEffect } from 'react';
import { TelegramMessageEntity, Language, EventEntity, ReviewStatus } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';
import { TelegramTextToMeeting } from './TelegramTextToMeeting';
import { parseNoticeWithGemini } from '../services/telegramMeetingParser';
import { eventRepository } from '../data/eventRepository';
import {
  MessageSquare,
  FileText,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CopyCheck,
  Send,
  PenTool,
  Loader2,
} from 'lucide-react';

interface TelegramInboxViewProps {
  messages: TelegramMessageEntity[];
  language: Language;
  onOpenReview: () => void;
  onSelectEvent?: (event: EventEntity) => void;
}

export const TelegramInboxView: React.FC<TelegramInboxViewProps> = ({
  messages,
  language,
  onOpenReview,
  onSelectEvent,
}) => {
  const [activeSegment, setActiveSegment] = useState<'text_to_meeting' | 'inbox'>('text_to_meeting');
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const [reprocessSuccess, setReprocessSuccess] = useState<number | null>(null);
  const [botConfigured, setBotConfigured] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/telegram/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.configured) {
          setBotConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleReprocess = async (msg: TelegramMessageEntity) => {
    setReprocessingId(msg.id);
    try {
      const res = await parseNoticeWithGemini(msg.rawText);
      if (res.events && res.events.length > 0) {
        const item = res.events[0];
        const hasDate = Boolean(item.eventDate);
        const hasStartTime = Boolean(item.startTime);
        const hasValidConfidence =
          typeof item.confidence === 'number' && !isNaN(item.confidence) && item.confidence >= 0 && item.confidence <= 1;

        const ambiguities: string[] = Array.isArray(item.ambiguities) ? [...item.ambiguities] : [];

        let confidence: number | null = null;
        if (hasValidConfidence) {
          confidence = item.confidence;
        } else {
          confidence = 0;
          ambiguities.push('AI confidence score পাওয়া যায়নি।');
        }

        if (!hasDate) ambiguities.push('তারিখ অনুপস্থিত (Date missing)');
        if (!hasStartTime) ambiguities.push('সময় অনুপস্থিত (Time missing)');
        if (!item.venue) ambiguities.push('ভেন্যু অনুপস্থিত (Venue missing)');

        const isMissingRequired = !hasDate || !hasStartTime;
        const isLowConfidence = confidence < 0.90;
        const reviewStatus: ReviewStatus = isMissingRequired || isLowConfidence || ambiguities.length > 0
          ? 'needs_review'
          : 'auto_approved';

        const rawTitle = typeof item.title === 'string' ? item.title.trim() : '';
        const hasMeaningfulTitle = rawTitle.length > 0 && !/^[\s-_.,]*$/.test(rawTitle);

        const created = eventRepository.addEvent({
          title: hasMeaningfulTitle ? rawTitle : 'শিরোনাম নির্ধারণ প্রয়োজন',
          description: item.description || msg.rawText,
          eventDate: item.eventDate || null,
          startTime: item.startTime || null,
          endTime: item.endTime || null,
          venue: item.venue || null,
          category: item.category || 'অন্যান্য',
          priority: item.priority || 'normal',
          reviewStatus,
          syncStatus: 'pending',
          confidence,
          source: 'Telegram',
          originalText: msg.rawText,
          sender: msg.senderName,
          ambiguities,
          isCompleted: false,
        });

        if (onSelectEvent) {
          onSelectEvent(created);
        }
      }
      setReprocessSuccess(msg.id);
      setTimeout(() => setReprocessSuccess(null), 3500);
    } catch (err) {
      console.warn('Reprocess error:', err);
    } finally {
      setReprocessingId(null);
    }
  };

  const getStatusBadge = (status: TelegramMessageEntity['status']) => {
    switch (status) {
      case 'Schedule Created':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{language === 'bn' ? 'সূচি তৈরি সম্পন্ন' : 'Schedule Created'}</span>
          </span>
        );
      case 'Needs Review':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>{language === 'bn' ? 'যাচাই প্রয়োজন' : 'Needs Review'}</span>
          </span>
        );
      case 'Not a Schedule':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3 text-slate-400" />
            <span>{language === 'bn' ? 'সূচি সংশ্লিষ্ট নয়' : 'Not a Schedule'}</span>
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

      {/* Segment Switcher */}
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

            return (
              <div
                key={msg.id}
                id={`telegram-msg-${msg.id}`}
                className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs space-y-3"
              >
                {/* Meta header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{msg.senderName}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span>{msg.senderRole}</span>
                      <span>•</span>
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                  {getStatusBadge(msg.status)}
                </div>

                {/* Message text */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-sans">
                  "{msg.rawText}"
                </div>

                {/* Document attachment pill if present */}
                {msg.hasDocument && (
                  <div className="flex items-center gap-2 text-xs bg-teal-50 text-[#006A60] px-3 py-1.5 rounded-lg border border-teal-200 w-fit">
                    <FileText className="w-4 h-4 text-teal-600" />
                    <span className="font-semibold">{msg.documentName}</span>
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

                  <div className="flex items-center gap-2">
                    {msg.status === 'Needs Review' && (
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
                          : language === 'bn'
                          ? 'পুনরায় এআই প্রসেস'
                          : 'Reprocess with Gemini'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
