import React, { useState, useEffect } from 'react';
import { Language, EventEntity, ReviewStatus, Category, Priority } from '../domain/models';
import {
  parseNoticeWithGemini,
  ParsedMeetingResult,
} from '../services/telegramMeetingParser';
import { formatBengaliDate, toBengaliNumber } from '../domain/constants';
import { eventRepository } from '../data/eventRepository';
import {
  MessageSquare,
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertTriangle,
  CheckCircle2,
  Send,
  HelpCircle,
  Copy,
  Check,
  Bot,
  ArrowRight,
  FileText,
  Upload,
  Loader2,
  X,
} from 'lucide-react';

interface TelegramTextToMeetingProps {
  language: Language;
  onMeetingCreated: (event: EventEntity) => void;
}

export const TelegramTextToMeeting: React.FC<TelegramTextToMeetingProps> = ({
  language,
  onMeetingCreated,
}) => {
  const [rawText, setRawText] = useState('');
  const [senderName, setSenderName] = useState('অধ্যক্ষ মহোদয়ের দপ্তর (Principal Office)');
  const [showBotGuide, setShowBotGuide] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedResults, setExtractedResults] = useState<ParsedMeetingResult[]>([]);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [successEvent, setSuccessEvent] = useState<EventEntity | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // File upload state for PDF / Image notices
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    mimeType: string;
    base64: string;
  } | null>(null);

  // Pre-configured medical college sample notices
  const sampleNotices = [
    {
      label: language === 'bn' ? 'অ্যাকাডেমিক কাউন্সিল' : 'Academic Council',
      text: 'জরুরি নোটিশ: আগামী ১৮ অক্টোবর ২০২৬ দুপুর ১২:৩০ টায় অধ্যক্ষের সম্মেলন কক্ষে জেপিএমসি অ্যাকাডেমিক কাউন্সিলের বিশেষ সভা অনুষ্ঠিত হবে। সকল বিভাগীয় প্রধানগণকে যথাসময়ে উপস্থিত থাকার জন্য অনুরোধ করা হলো।',
    },
    {
      label: language === 'bn' ? 'পরীক্ষা নিয়ন্ত্রণ' : 'Exam Committee',
      text: 'আগামী ২১ অক্টোবর ২০২৬ সকাল ১০টায় লেকচার গ্যালারি ১-এ এমবিবিএস ফেজ-২ সাপ্লিমেন্টারি পরীক্ষা নিয়ন্ত্রণ কমিটির প্রস্তুতিমূলক সভা হবে। সংশ্লিষ্ট শিক্ষকবৃন্দ উপস্থিত থাকবেন।',
    },
    {
      label: language === 'bn' ? 'সংক্রমণ প্রতিরোধ' : 'Infection Control',
      text: 'জরুরি সভা: ২৩ অক্টোবর সকাল ১১টায় ওটি কমপ্লেক্স সম্মেলন কক্ষে হাসপাতাল সংক্রমণ প্রতিরোধ ও অ্যান্টিমাইক্রোবিয়াল স্টিওয়ার্ডশিপ কমিটির মাসিক পর্যালোচনা সভা অনুষ্ঠিত হবে।',
    },
    {
      label: language === 'bn' ? 'ইন্টার্ন কো-অর্ডিনেশন' : 'Intern Coordination',
      text: 'সকল ইন্টার্ন চিকিৎসকদের জানানো যাচ্ছে যে, আগামী ২৫ অক্টোবর বিকাল ৩টায় হাসপাতাল কনফারেন্স হলে জরুরি ক্লিনিক্যাল রিভিউ মিটিং অনুষ্ঠিত হবে।',
    },
  ];

  // Trigger Gemini Extraction
  const handleExtractWithGemini = async (textToUse?: string) => {
    const queryText = (textToUse !== undefined ? textToUse : rawText).trim();
    if (!queryText && !selectedFile) return;

    setIsExtracting(true);
    setExtractError(null);
    setExtractedResults([]);

    try {
      const res = await parseNoticeWithGemini(queryText || 'Official Notice Attachment', {
        documentBase64: selectedFile?.base64,
        documentMimeType: selectedFile?.mimeType,
      });

      if (res.events && res.events.length > 0) {
        setExtractedResults(res.events);
      } else {
        setExtractError(
          language === 'bn'
            ? 'নোটিশে কোনো সুনির্দিষ্ট মিটিং বা কর্মসূচির তথ্য শনাক্ত করা যায়নি।'
            : 'No specific meeting or schedule was detected in this notice.'
        );
      }
    } catch (err: any) {
      setExtractError(err?.message || 'Gemini extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || '';
      setSelectedFile({
        name: file.name,
        mimeType: file.type || 'application/pdf',
        base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleCreateMeeting = (item: ParsedMeetingResult) => {
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

    const newEvent = eventRepository.addEvent({
      title: hasMeaningfulTitle ? rawTitle : 'শিরোনাম নির্ধারণ প্রয়োজন',
      description: item.description || rawText || selectedFile?.name || '',
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
      originalText: rawText || selectedFile?.name,
      sender: senderName,
      ambiguities,
      isCompleted: false,
    });

    setSuccessEvent(newEvent);
    onMeetingCreated(newEvent);

    setTimeout(() => {
      setSuccessEvent(null);
      setExtractedResults((prev) => prev.filter((e) => e !== item));
    }, 3500);
  };

  const derivePublicWebhookUrl = (): string => {
    if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
      return `${window.location.origin}/api/telegram/webhook`;
    }
    return 'https://jpmc-synapse.marufjb.workers.dev/api/telegram/webhook';
  };

  const handleCopyWebhookUrl = () => {
    const webhookUrl = derivePublicWebhookUrl();
    navigator.clipboard.writeText(webhookUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div id="telegram-text-meeting-creator" className="space-y-4">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-900 via-teal-900 to-[#004D40] text-white rounded-2xl p-4 sm:p-5 shadow-xs relative overflow-hidden">
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/20">
              <Bot className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  {language === 'bn'
                    ? 'টেলিগ্রাম নোটিশ থেকে এআই মিটিং তৈরি'
                    : 'Telegram Notice-to-Meeting AI'}
                </h3>
                <span className="text-[10px] font-bold bg-sky-400 text-slate-900 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Gemini 3.8 Flash
                </span>
              </div>
              <p className="text-xs text-sky-100/90 mt-0.5">
                {language === 'bn'
                  ? 'টেলিগ্রাম বার্তা বা নোটিশের টেক্সট/পিডিএফ দিন; সার্ভার সাইড জেমিনাই স্বয়ংক্রিয়ভাবে তারিখ, সময় ও ভেন্যু শনাক্ত করবে'
                  : 'Paste Telegram notice or upload PDF/Scan; Gemini extracts strict schedule with zero hallucination'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowBotGuide(!showBotGuide)}
            className="flex items-center gap-1 text-xs text-sky-200 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-xl transition cursor-pointer shrink-0"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>{language === 'bn' ? 'ওয়েবহুক গাইড' : 'Webhook Guide'}</span>
          </button>
        </div>
      </div>

      {/* Bot Webhook Guide Accordion */}
      {showBotGuide && (
        <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sky-900">
              {language === 'bn'
                ? 'টেলিগ্রাম বটের লাইভ ওয়েবহুক কনফিগারেশন'
                : 'Production Telegram Bot Webhook Integration'}
            </span>
            <button
              onClick={handleCopyWebhookUrl}
              className="flex items-center gap-1 text-[11px] font-semibold text-sky-800 hover:text-sky-950 bg-white border border-sky-300 px-2 py-1 rounded-lg transition cursor-pointer"
            >
              {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{isCopied ? 'কপিকৃত!' : 'Webhook URL কপি'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-600">
            {language === 'bn'
              ? '১. টেলিগ্রামে @BotFather দিয়ে আপনার বট তৈরি করে .env তে TELEGRAM_BOT_TOKEN যোগ করুন।'
              : '1. Create a bot using @BotFather and set TELEGRAM_BOT_TOKEN in .env.'}
          </p>
          <div className="bg-white p-2.5 rounded-xl border border-sky-200 font-mono text-[11px] text-slate-700 select-all overflow-x-auto">
            curl -F "url={derivePublicWebhookUrl()}" https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/setWebhook
          </div>
          <p className="text-[11px] text-slate-600">
            {language === 'bn'
              ? '২. অফিশিয়াল চ্যানেলে বটকে যোগ করলে যেকোনো বার্তা ও নোটিশ স্বয়ংক্রিয়ভাবে ইনজেস্ট হয়ে সিঙ্ক হবে।'
              : '2. Add bot as admin to group; every text, document or scanned photo will be ingested idempotently.'}
          </p>
        </div>
      )}

      {/* Sample Quick Chips */}
      <div>
        <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" />
          <span>{language === 'bn' ? 'নমুনা নোটিশ দিয়ে পরীক্ষা করুন:' : 'Quick test sample notices:'}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sampleNotices.map((sample, idx) => (
            <button
              key={idx}
              onClick={() => {
                setRawText(sample.text);
                handleExtractWithGemini(sample.text);
              }}
              className="text-xs bg-white hover:bg-teal-50 text-slate-700 hover:text-[#006A60] border border-slate-200 hover:border-teal-300 px-2.5 py-1.2 rounded-xl transition cursor-pointer shadow-2xs font-medium"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text & File Input Area */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            {language === 'bn'
              ? 'টেলিগ্রাম টেক্সট বা নোটিশের ভাষা (Telegram Notice Text)'
              : 'Telegram Notice or Message Text'}
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={4}
            placeholder={
              language === 'bn'
                ? 'উদাহরণ: জরুরি নোটিশ: আগামী ১৮ অক্টোবর ২০২৬ দুপুর ১২:৩০ টায় অধ্যক্ষের সম্মেলন কক্ষে জেপিএমসি অ্যাকাডেমিক কাউন্সিলের বিশেষ সভা অনুষ্ঠিত হবে।'
                : 'e.g., Notice: Next Sunday at 11:30 AM in Conference Room, Academic Council Meeting...'
            }
            className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-hidden focus:border-[#006A60] focus:ring-1 focus:ring-[#006A60] resize-none font-sans leading-relaxed text-slate-800"
          />
        </div>

        {/* Multimodal Attachment: PDF or Image Scan */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-bold text-slate-700">
              {language === 'bn' ? 'নোটিশ ফাইল / ছবি আপলোড (PDF বা স্ক্যান ছবি)' : 'Attach Document or Image Scan (PDF / Image)'}
            </span>
            {selectedFile && (
              <button
                onClick={() => setSelectedFile(null)}
                className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>{language === 'bn' ? 'মুছে ফেলুন' : 'Remove'}</span>
              </button>
            )}
          </div>

          {selectedFile ? (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-700" />
                <div>
                  <span className="text-xs font-bold text-teal-900 block">{selectedFile.name}</span>
                  <span className="text-[10px] text-teal-700 uppercase font-mono">{selectedFile.mimeType}</span>
                </div>
              </div>
              <span className="text-[10px] bg-teal-200/80 text-teal-900 px-2 py-0.5 rounded-full font-bold">
                {language === 'bn' ? 'সংযুক্ত' : 'Ready'}
              </span>
            </div>
          ) : (
            <label className="border border-dashed border-slate-300 hover:border-teal-500 rounded-xl p-3.5 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/50 hover:bg-teal-50/30 transition">
              <Upload className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-xs font-medium text-slate-700">
                {language === 'bn'
                  ? 'পিডিএফ নোটিশ বা স্ক্যান করা ছবির ফাইল নির্বাচন করুন'
                  : 'Click to select notice PDF or scanned image'}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                PDF, JPG, PNG (Max 10MB)
              </span>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Sender and Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[11px] shrink-0">
              {language === 'bn' ? 'প্রেরক:' : 'Sender:'}
            </span>
            <input
              type="text"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-hidden focus:border-[#006A60] w-full sm:w-auto"
            />
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                setRawText('');
                setSelectedFile(null);
                setExtractedResults([]);
                setExtractError(null);
              }}
              disabled={!rawText && !selectedFile}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition cursor-pointer disabled:opacity-40 px-2 py-1"
            >
              {language === 'bn' ? 'মুছে ফেলুন' : 'Clear'}
            </button>

            <button
              onClick={() => handleExtractWithGemini()}
              disabled={isExtracting || (!rawText.trim() && !selectedFile)}
              className="flex items-center gap-1.5 bg-[#006A60] hover:bg-teal-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isExtracting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>
                {isExtracting
                  ? language === 'bn'
                    ? 'জেমিনাই এক্সট্র্যাক্ট করছে...'
                    : 'Gemini Extracting...'
                  : language === 'bn'
                  ? 'জেমিনাই দিয়ে বিশ্লেষণ করুন'
                  : 'Extract with Gemini'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {extractError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-3.5 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{extractError}</span>
        </div>
      )}

      {/* Success Notification */}
      {successEvent && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-xs text-emerald-900">
                {language === 'bn'
                  ? 'কর্মসূচি সফলভাবে তৈরি হয়েছে এবং ক্লাউডে সংরক্ষিত হয়েছে!'
                  : 'Event created and persisted to Cloud Firestore!'}
              </h4>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                "{successEvent.title}" — {successEvent.eventDate} ({successEvent.startTime})
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gemini Extracted Results Display */}
      {extractedResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>
                {language === 'bn'
                  ? `জেমিনাই এক্সট্র্যাকশন ফলাফল (${toBengaliNumber(extractedResults.length)}টি সূচি সনাক্ত)`
                  : `Gemini Extraction Results (${extractedResults.length} event(s) identified)`}
              </span>
            </span>
          </div>

          {extractedResults.map((item, index) => {
            const hasConfidence =
              typeof item.confidence === 'number' && !isNaN(item.confidence) && item.confidence > 0;
            const confidencePct = hasConfidence ? Math.round(item.confidence * 100) : 0;
            const isMissingData = !item.eventDate || !item.startTime || !item.venue;

            return (
              <div
                key={index}
                className="bg-white rounded-2xl border-2 border-teal-500/80 p-4 shadow-sm space-y-3.5 animate-in fade-in"
              >
                {/* Extracted Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold bg-teal-50 text-[#006A60] px-2.5 py-0.5 rounded-full border border-teal-200">
                        {item.category}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.priority === 'urgent'
                            ? 'bg-rose-100 text-rose-800'
                            : item.priority === 'important'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm mt-1.5">
                      {item.title}
                    </h4>
                  </div>

                  {/* Confidence pill */}
                  <div className="flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>
                      {hasConfidence
                        ? `${toBengaliNumber(confidencePct)}% AI Confidence`
                        : language === 'bn'
                        ? 'Confidence পাওয়া যায়নি'
                        : 'AI Confidence: N/A'}
                    </span>
                  </div>
                </div>

                {/* Grid of Extracted Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                    <Calendar className="w-4 h-4 text-[#006A60] shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 block">
                        {language === 'bn' ? 'তারিখ (Date)' : 'Date'}
                      </span>
                      <span className="font-bold text-slate-800">
                        {item.eventDate
                          ? language === 'bn'
                            ? formatBengaliDate(item.eventDate)
                            : item.eventDate
                          : language === 'bn'
                          ? 'তারিখ পাওয়া যায়নি'
                          : 'Date missing'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
                    <Clock className="w-4 h-4 text-[#006A60] shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 block">
                        {language === 'bn' ? 'সময় (Time)' : 'Time'}
                      </span>
                      <span className="font-bold text-slate-800">
                        {item.startTime
                          ? toBengaliNumber(item.startTime) +
                            (item.endTime ? ` - ${toBengaliNumber(item.endTime)}` : '')
                          : language === 'bn'
                          ? 'সময় পাওয়া যায়নি'
                          : 'Time missing'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 sm:col-span-2">
                    <MapPin className="w-4 h-4 text-[#006A60] shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-500 block">
                        {language === 'bn' ? 'স্থান / ভেন্যু (Venue)' : 'Venue'}
                      </span>
                      <span className="font-bold text-slate-800">
                        {item.venue || (language === 'bn' ? 'ভেন্যু নির্দিষ্ট করা নেই' : 'Unspecified venue')}
                      </span>
                    </div>
                  </div>

                  {item.participants && (
                    <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 sm:col-span-2">
                      <Users className="w-4 h-4 text-[#006A60] shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-500 block">
                          {language === 'bn' ? 'অংশগ্রহণকারী (Participants)' : 'Participants'}
                        </span>
                        <span className="font-medium text-slate-700">{item.participants}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Conflict warning */}
                {item.conflicts && item.conflicts.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">
                        {language === 'bn'
                          ? `সতর্কতা: একই সময়ে ইতোমধ্যে সূচি রয়েছে!`
                          : `Schedule Conflict: Existing event at same time!`}
                      </span>
                      <span className="text-[11px] text-amber-800">
                        {item.conflicts.map((c) => c.title).join(', ')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Missing fields notice */}
                {isMissingData && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-900">
                    <span className="font-bold block mb-1">
                      {language === 'bn'
                        ? 'সতর্কতা: কিছু ফিল্ড নোটিশে অনুপস্থিত ছিল (যাচাই তালিকায় যাবে)'
                        : 'Notice: Some fields were not found in text (Will require human review)'}
                    </span>
                    <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                      {!item.eventDate && <li>{language === 'bn' ? 'তারিখ অনুপস্থিত' : 'Date missing'}</li>}
                      {!item.startTime && <li>{language === 'bn' ? 'সময় অনুপস্থিত' : 'Time missing'}</li>}
                      {!item.venue && <li>{language === 'bn' ? 'ভেন্যু অনুপস্থিত' : 'Venue missing'}</li>}
                    </ul>
                  </div>
                )}

                {/* Action button */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">
                    {isMissingData
                      ? language === 'bn'
                        ? 'অনুমোদনের জন্য রিভিউ সেন্টারে যুক্ত হবে'
                        : 'Will be added to Review Center for confirmation'
                      : language === 'bn'
                      ? 'স্বয়ংক্রিয়ভাবে ক্যালেন্ডার ও নোটিফিকেশনে যুক্ত হবে'
                      : 'Will be added to JpMC Calendar & Reminders'}
                  </span>

                  <button
                    onClick={() => handleCreateMeeting(item)}
                    className="flex items-center gap-2 bg-[#006A60] hover:bg-[#004D40] text-white font-bold px-4 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {language === 'bn' ? 'মিটিং তৈরি করুন' : 'Confirm & Create Event'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
