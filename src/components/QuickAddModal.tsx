import React, { useState, useEffect } from 'react';
import { EventEntity, Language, Category, Priority, ReviewStatus } from '../domain/models';
import {
  CATEGORIES,
  getDhakaNow,
  getDhakaDateString,
  isEventInPast,
  formatBengaliDate,
  formatBengaliTime,
} from '../domain/constants';
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Check,
  Send,
  HelpCircle,
  FileEdit,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '../config/api';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddEvent: (event: Omit<EventEntity, 'id' | 'createdAt' | 'updatedAt'>) => Promise<any> | void;
  onUpdateEvent?: (event: EventEntity) => Promise<any> | void;
  initialEvent?: EventEntity | null;
  prefilledDate?: string | null;
  language: Language;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onAddEvent,
  onUpdateEvent,
  initialEvent,
  prefilledDate,
  language,
}) => {
  const [activeMode, setActiveMode] = useState<'ai' | 'manual'>('manual');
  const [nlInput, setNlInput] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Partial<EventEntity> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Manual Form State
  const defaultDate = getDhakaDateString();

  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('সভা');
  const [priority, setPriority] = useState<Priority>('normal');
  const [committee, setCommittee] = useState('');
  const [participants, setParticipants] = useState('');
  const [isAllDay, setIsAllDay] = useState(false);
  // Smart Bengali Schedule Parser error state
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Reset/populate form whenever modal opens or inputs change
  useEffect(() => {
    if (isOpen) {
      if (initialEvent) {
        setActiveMode('manual');
        setTitle(initialEvent.title || '');
        setEventDate(initialEvent.eventDate || defaultDate);
        setStartTime(initialEvent.startTime || '10:00');
        setEndTime(initialEvent.endTime || '');
        setVenue(initialEvent.venue || '');
        setDescription(initialEvent.description || '');
        setCategory(initialEvent.category || 'সভা');
        setPriority(initialEvent.priority || 'normal');
        setCommittee(initialEvent.committee || '');
        setParticipants(initialEvent.participants || '');
        setIsAllDay(!!initialEvent.isAllDay);
        setNlInput('');
        setParsedPreview(null);
        setExtractionError(null);
        setSaveError(null);
      } else {
        setActiveMode('manual');
        setTitle('');
        const dhakaDate = prefilledDate || getDhakaDateString();
        setEventDate(dhakaDate);
        setStartTime('10:00');
        setEndTime('');
        setVenue('');
        setDescription('');
        setCategory('সভা');
        setPriority('normal');
        setCommittee('');
        setParticipants('');
        setIsAllDay(false);
        setNlInput('');
        setParsedPreview(null);
        setExtractionError(null);
        setSaveError(null);
      }
    }
  }, [isOpen, initialEvent, prefilledDate]);

  if (!isOpen) return null;

  // Real-time detection if current eventDate/time is in the past
  const isPastEvent = isEventInPast(eventDate, endTime, startTime);

  // Sample prompt test phrases from specification
  const testPhrases = [
    'আগামীকাল সকাল ১০টায় অধ্যক্ষ স্যারের সাথে মিটিং',
    'আগামী বৃহস্পতিবার সকাল সাড়ে ৯টায় শিক্ষক কক্ষে মিটিং',
    '২০ সেপ্টেম্বর দুপুর ১২টায় Gallery 2-তে সেমিনার',
    'আগামীকাল বিকাল তিনটায় PWD কর্মকর্তাদের সাথে সভা',
  ];

  const parseBengaliNaturalLanguage = async (text: string) => {
    if (!text.trim()) return;
    setIsAiParsing(true);
    setExtractionError(null);

    try {
      const response = await apiFetch('/api/parse-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          currentDate: getDhakaDateString(),
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: Failed to parse schedule`);
      }

      const parsed = await response.json();
      setParsedPreview(parsed);
    } catch (err: any) {
      console.warn('AI Parsing error, using local fallback:', err);
      setExtractionError(err?.message || 'AI parsing error');

      // Local heuristic fallback parser
      const lower = text.toLowerCase();
      let matchedCategory: Category = 'সভা';
      if (lower.includes('ক্লাস') || lower.includes('class') || lower.includes('লেকচার')) {
        matchedCategory = 'একাডেমিক';
      } else if (lower.includes('পরীক্ষা') || lower.includes('exam')) {
        matchedCategory = 'পরীক্ষা';
      } else if (lower.includes('সেমিনার') || lower.includes('কনফারেন্স') || lower.includes('seminar')) {
        matchedCategory = 'সেমিনার';
      } else if (lower.includes('ছুটি') || lower.includes('holiday')) {
        matchedCategory = 'অন্যান্য';
      }

      const fallbackPreview: Partial<EventEntity> = {
        title: text.length > 50 ? text.substring(0, 50) + '...' : text,
        eventDate: getDhakaDateString(),
        startTime: '10:00',
        endTime: null,
        venue: text.includes('কক্ষ') || text.includes('Room') ? 'শিক্ষক কক্ষ' : null,
        category: matchedCategory,
        priority: 'normal',
        description: text,
        source: 'Manual',
        confidence: 0.5,
        reviewStatus: 'needs_review',
        ambiguities: [
          language === 'bn'
            ? 'সার্ভার সংযোগ না থাকায় খসড়া তৈরি হয়েছে, সময় ও তারিখ মিলিয়ে নিন।'
            : 'Generated from local fallback, please verify date and time.',
        ],
      };
      setParsedPreview(fallbackPreview);
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleSaveParsedPreview = async () => {
    if (!parsedPreview) return;

    const hasDateAndTime = !!(parsedPreview.eventDate && parsedPreview.startTime);
    const confidence = typeof parsedPreview.confidence === 'number' ? parsedPreview.confidence : 0.8;
    const reviewStatus: ReviewStatus = hasDateAndTime && confidence >= 0.75 ? 'auto_approved' : 'needs_review';

    const isPast = isEventInPast(parsedPreview.eventDate, parsedPreview.endTime, parsedPreview.startTime);

    const reminders = (hasDateAndTime && !isPast)
      ? [
          {
            id: `rem-${Date.now()}`,
            eventId: '',
            reminderType: 'notification' as const,
            minutesBefore: 120,
            scheduledAt: '',
            enabled: true,
          },
          {
            id: `rem-${Date.now() + 1}`,
            eventId: '',
            reminderType: 'notification' as const,
            minutesBefore: 30,
            scheduledAt: '',
            enabled: true,
          },
        ]
      : [];

    setIsSaving(true);
    setSaveError(null);

    const payload = {
      title: parsedPreview.title || 'শিরোনাম নির্ধারণ প্রয়োজন',
      eventDate: parsedPreview.eventDate || null,
      startTime: parsedPreview.startTime || null,
      endTime: parsedPreview.endTime || null,
      venue: parsedPreview.venue || null,
      category: parsedPreview.category || 'অন্যান্য',
      priority: parsedPreview.priority || 'normal',
      description: parsedPreview.description || '',
      source: 'AI Extracted' as const,
      confidence,
      reviewStatus,
      syncStatus: 'synced' as const,
      ambiguities: parsedPreview.ambiguities,
      reminders,
      isCompleted: isPast ? true : false,
    };

    try {
      await onAddEvent(payload);
      onClose();
    } catch (err: any) {
      console.error('[QuickAdd] Save failed:', err);
      setSaveError(
        err?.message ||
          (language === 'bn'
            ? 'ডাটাবেজে সংরক্ষণ ব্যর্থ হয়েছে। নেটওয়ার্ক ও অনুমতি পরীক্ষা করুন।'
            : 'Failed to persist event to Firestore database. Please retry.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransferPreviewToManual = () => {
    if (!parsedPreview) return;
    if (parsedPreview.title) setTitle(parsedPreview.title);
    if (parsedPreview.eventDate) setEventDate(parsedPreview.eventDate);
    if (parsedPreview.startTime) setStartTime(parsedPreview.startTime);
    if (parsedPreview.endTime) setEndTime(parsedPreview.endTime);
    if (parsedPreview.venue) setVenue(parsedPreview.venue);
    if (parsedPreview.category) setCategory(parsedPreview.category);
    if (parsedPreview.description) setDescription(parsedPreview.description);
    setActiveMode('manual');
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    const isPast = isEventInPast(eventDate, endTime, startTime);

    if (initialEvent && onUpdateEvent) {
      const updatedEvent: EventEntity = {
        ...initialEvent,
        title: title.trim(),
        eventDate: eventDate || null,
        startTime: isAllDay ? null : (startTime && startTime.trim() ? startTime.trim() : null),
        endTime: isAllDay ? null : (endTime && endTime.trim() ? endTime.trim() : null),
        venue: venue.trim() ? venue.trim() : null,
        category,
        priority,
        description: description.trim() || '',
        committee: committee.trim() ? committee.trim() : undefined,
        participants: participants.trim() ? participants.trim() : undefined,
        isAllDay,
        isCompleted: isPast ? true : initialEvent.isCompleted,
        reminders: isPast
          ? []
          : (initialEvent.reminders || []).map((r) => ({ ...r, enabled: true })),
        updatedAt: new Date().toISOString(),
      };

      try {
        await onUpdateEvent(updatedEvent);
        onClose();
      } catch (err: any) {
        console.error('[QuickAdd] Update failed:', err);
        setSaveError(
          err?.message ||
            (language === 'bn'
              ? 'কর্মসূচি আপডেট করা সম্ভব হয়নি।'
              : 'Failed to update event.')
        );
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const payload = {
      title: title.trim(),
      eventDate: eventDate || null,
      startTime: isAllDay ? null : (startTime && startTime.trim() ? startTime.trim() : null),
      endTime: isAllDay ? null : (endTime && endTime.trim() ? endTime.trim() : null),
      venue: venue.trim() ? venue.trim() : null,
      category,
      priority,
      description: description.trim() || '',
      committee: committee.trim() ? committee.trim() : undefined,
      participants: participants.trim() ? participants.trim() : undefined,
      isAllDay,
      source: 'Manual' as const,
      confidence: null,
      reviewStatus: 'auto_approved' as const,
      syncStatus: 'synced' as const,
      isCompleted: isPast ? true : false,
      reminders: isPast
        ? []
        : [
            {
              id: `rem-${Date.now()}`,
              eventId: '',
              reminderType: 'notification' as const,
              minutesBefore: 120,
              scheduledAt: '',
              enabled: true,
            },
            {
              id: `rem-${Date.now() + 1}`,
              eventId: '',
              reminderType: 'notification' as const,
              minutesBefore: 30,
              scheduledAt: '',
              enabled: true,
            },
          ],
    };

    try {
      await onAddEvent(payload);
      onClose();
    } catch (err: any) {
      console.error('[QuickAdd] Firestore write failed:', err);
      setSaveError(
        err?.message ||
          (language === 'bn'
            ? 'ডাটাবেজে সংরক্ষণ ব্যর্থ হয়েছে। নেটওয়ার্ক ও অনুমতি পরীক্ষা করুন।'
            : 'Failed to persist event to database. Please retry.')
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="quick-add-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="quick-add-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Modal Header */}
        <div className="bg-[#006A60] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight">
              {initialEvent
                ? language === 'bn'
                  ? 'কর্মসূচি সম্পাদনা করুন'
                  : 'Edit Event Schedule'
                : language === 'bn'
                ? 'নতুন কর্মসূচি যোগ করুন'
                : 'Add New Schedule'}
            </h2>
            <span className="text-[10px] bg-teal-800 text-teal-200 px-2 py-0.5 rounded-full font-semibold">
              JpMC
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-teal-700 text-teal-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (AI Natural Language vs Manual Form) */}
        {!initialEvent && (
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs">
            <button
              onClick={() => setActiveMode('ai')}
              className={`flex-1 py-3 px-4 font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                activeMode === 'ai'
                  ? 'text-[#006A60] border-b-2 border-[#006A60] bg-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{language === 'bn' ? 'AI দিয়ে যোগ করুন (Natural)' : 'AI Natural Add'}</span>
            </button>

            <button
              onClick={() => setActiveMode('manual')}
              className={`flex-1 py-3 px-4 font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                activeMode === 'manual'
                  ? 'text-[#006A60] border-b-2 border-[#006A60] bg-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileEdit className="w-4 h-4 text-teal-600" />
              <span>{language === 'bn' ? 'ম্যানুয়াল ফরম (Detailed)' : 'Manual Form'}</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{saveError}</div>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="text-rose-500 hover:text-rose-800 text-xs ml-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeMode === 'ai' && !initialEvent ? (
            /* AI Natural Language Add Screen */
            <div className="space-y-3.5">
              <div className="bg-teal-50/70 rounded-2xl p-3.5 border border-teal-200 text-xs text-teal-900">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    {language === 'bn'
                      ? 'স্বাভাবিক বাংলায় বাক্য লিখুন, এআই স্বয়ংক্রিয়ভাবে সূচি তৈরি করবে:'
                      : 'Type naturally in Bengali or English; AI will structure the event:'}
                  </span>
                </p>
                <p className="text-[11px] text-teal-700 leading-relaxed">
                  {language === 'bn'
                    ? 'অতীত মিটিংও লিখতে পারেন, যেমন: "গত ১৫ সেপ্টেম্বর সকাল ১০টায় একাডেমিক কাউন্সিল সভা অনুষ্ঠিত হয়"'
                    : 'Historical events allowed, e.g. "Academic Council Meeting held on 15 September at 10 AM"'}
                </p>
              </div>

              {/* Input Area */}
              <div>
                <textarea
                  id="natural-language-input"
                  rows={3}
                  value={nlInput}
                  onChange={(e) => setNlInput(e.target.value)}
                  placeholder={
                    language === 'bn'
                      ? 'এখানে স্বাভাবিক ভাষায় কর্মসূচির বিবরণ লিখুন...'
                      : 'Type event details here in Bengali or English...'
                  }
                  className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-transparent bg-white shadow-inner"
                />

                <div className="flex items-center justify-between mt-2">
                  <button
                    onClick={() => parseBengaliNaturalLanguage(nlInput)}
                    disabled={!nlInput.trim() || isAiParsing}
                    className="flex items-center gap-1.5 bg-[#006A60] hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-xs cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>
                      {isAiParsing
                        ? language === 'bn'
                          ? 'বিশ্লেষণ চলছে...'
                          : 'Parsing with AI...'
                        : language === 'bn'
                        ? 'সূচি বিশ্লেষণ করুন'
                        : 'Parse with AI'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Quick test buttons */}
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'বাছাইকৃত নমুনা বাক্য (ক্লিক করুন):' : 'Sample Prompts:'}</span>
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {testPhrases.map((phrase, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNlInput(phrase);
                        parseBengaliNaturalLanguage(phrase);
                      }}
                      className="text-left text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 p-2 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      "{phrase}"
                    </button>
                  ))}
                </div>
              </div>

              {/* Parsed Preview Card */}
              {parsedPreview && (
                <div
                  className={`rounded-2xl p-4 border space-y-3 animate-in fade-in duration-200 ${
                    parsedPreview.reviewStatus === 'needs_review'
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-emerald-50/60 border-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold flex items-center gap-1.5 text-slate-800">
                      {parsedPreview.reviewStatus === 'needs_review' ? (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span>
                        {parsedPreview.reviewStatus === 'needs_review'
                          ? language === 'bn'
                            ? 'যাচাই প্রয়োজন (অসম্পূর্ণ)'
                            : 'Needs Review (Incomplete)'
                          : language === 'bn'
                          ? 'প্রিভিউ প্রস্তুত'
                          : 'Preview Generated'}
                      </span>
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          typeof parsedPreview.confidence === 'number' && parsedPreview.confidence > 0
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {typeof parsedPreview.confidence === 'number' && parsedPreview.confidence > 0
                          ? `AI Confidence: ${Math.round(parsedPreview.confidence * 100)}%`
                          : language === 'bn'
                          ? 'Confidence পাওয়া যায়নি'
                          : 'AI Confidence: N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-800">
                    <div>
                      <span className="text-slate-500">{language === 'bn' ? 'শিরোনাম: ' : 'Title: '}</span>
                      <span className="font-bold">
                        {parsedPreview.title || (language === 'bn' ? 'শিরোনাম নির্ধারণ প্রয়োজন' : 'Title Needed')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">{language === 'bn' ? 'তারিখ ও সময়: ' : 'Date & Time: '}</span>
                      <span className="font-medium">
                        {parsedPreview.eventDate ? (
                          language === 'bn' ? formatBengaliDate(parsedPreview.eventDate) : parsedPreview.eventDate
                        ) : (
                          language === 'bn' ? 'অনুপস্থিত' : 'Missing'
                        )}{' '}
                        •{' '}
                        {parsedPreview.startTime ? (
                          language === 'bn' ? formatBengaliTime(parsedPreview.startTime) : parsedPreview.startTime
                        ) : (
                          language === 'bn' ? 'অনুপস্থিত' : 'Missing'
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">{language === 'bn' ? 'স্থান / ভেন্যু: ' : 'Venue: '}</span>
                      <span className="font-medium">
                        {parsedPreview.venue || (language === 'bn' ? 'উল্লেখ নেই' : 'Unspecified')}
                      </span>
                    </div>
                  </div>

                  {/* Past event badge in AI preview */}
                  {isEventInPast(parsedPreview.eventDate, parsedPreview.endTime, parsedPreview.startTime) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-900 bg-amber-100/70 border border-amber-300 px-2.5 py-1.5 rounded-xl">
                      <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>
                        {language === 'bn'
                          ? 'ঐতিহাসিক / সম্পন্ন সূচি (স্মার্ট রিমাইন্ডার বন্ধ থাকবে)'
                          : 'Historical / Completed Event (Reminders will be disabled)'}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleTransferPreviewToManual}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>{language === 'bn' ? 'নিজে তথ্য পূরণ / সম্পাদন' : 'Edit in Form'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSaveParsedPreview}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#006A60] hover:bg-teal-700 disabled:bg-slate-400 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>{language === 'bn' ? 'সংরক্ষণ হচ্ছে...' : 'Saving to Database...'}</span>
                        </>
                      ) : (
                        <>
                          <span>
                            {language === 'bn' ? 'কর্মসূচি সংরক্ষণ করুন' : 'Save Schedule'}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Manual Form */
            <form onSubmit={handleManualSubmit} className="space-y-3 text-xs">
              {/* Informative Historical Badge when date/time is in the past */}
              {isPastEvent && (
                <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">
                      {language === 'bn' ? 'ঐতিহাসিক / সম্পন্ন কর্মসূচি:' : 'Historical / Past Meeting:'}
                    </span>{' '}
                    <span className="text-[11px] text-amber-800">
                      {language === 'bn'
                        ? 'এই সূচিটি অতীত সময়ের। এটি সম্পন্ন হিসেবে সংরক্ষিত হবে এবং কোনো ভবিষ্যৎ রিমাইন্ডার শিডিউল হবে না।'
                        : 'This date/time has already passed. It will be recorded as completed with reminders disabled.'}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'bn' ? 'কর্মসূচির শিরোনাম *' : 'Event Title *'}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={language === 'bn' ? 'যেমন: একাডেমিক কাউন্সিল সভা' : 'e.g. Academic Council Meeting'}
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {language === 'bn' ? 'তারিখ *' : 'Date *'}
                  </label>
                  {/* Notice: No min attribute, allows any past or future date */}
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {language === 'bn' ? 'ক্যাটাগরি' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-white font-medium"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Time inputs */}
              {!isAllDay && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {language === 'bn' ? 'শুরুর সময় *' : 'Start Time *'}
                    </label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      {language === 'bn' ? 'সমাপ্তির সময় (ঐচ্ছিক)' : 'End Time (Optional)'}
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                    />
                  </div>
                </div>
              )}

              {/* All day toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="all-day-toggle"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="all-day-toggle" className="text-slate-700 font-medium cursor-pointer">
                  {language === 'bn' ? 'সারাদিনব্যাপী কর্মসূচি (All-day event)' : 'All-day event'}
                </label>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'bn' ? 'স্থান / ভেন্যু (ঐচ্ছিক)' : 'Venue (Optional)'}
                </label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder={language === 'bn' ? 'যেমন: কনফারেন্স রুম / অডিটোরিয়াম' : 'e.g. Conference Room / Auditorium'}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {language === 'bn' ? 'অগ্রাধিকার (Priority)' : 'Priority'}
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="normal">{language === 'bn' ? 'সাধারণ (Normal)' : 'Normal'}</option>
                    <option value="important">{language === 'bn' ? 'গুরুত্বপূর্ণ (Important)' : 'Important'}</option>
                    <option value="urgent">{language === 'bn' ? 'জরুরি (Urgent)' : 'Urgent'}</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    {language === 'bn' ? 'কমিটি (ঐচ্ছিক)' : 'Committee (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={committee}
                    onChange={(e) => setCommittee(e.target.value)}
                    placeholder="ইন্টার্ন ইনডাকশন কমিটি"
                    className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'bn' ? 'অংশগ্রহণকারী (ঐচ্ছিক)' : 'Participants (Optional)'}
                </label>
                <input
                  type="text"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  placeholder={language === 'bn' ? 'সকল বিভাগীয় প্রধান ও ফ্যাকাল্টি সদস্য' : 'All Department Heads'}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'bn' ? 'বিবরণ ও আলোচ্যসূচি' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={language === 'bn' ? 'বিস্তারিত এজেন্ডা বা সভার কার্যবিবরণী...' : 'Details or meeting agenda...'}
                  className="w-full p-2 rounded-xl border border-slate-300 bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#006A60] hover:bg-teal-700 disabled:bg-slate-400 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>{language === 'bn' ? 'ডাটাবেজে সংরক্ষণ হচ্ছে...' : 'Saving to Database...'}</span>
                    </>
                  ) : (
                    <span>
                      {initialEvent
                        ? language === 'bn'
                          ? 'পরিবর্তন সংরক্ষণ করুন'
                          : 'Save Changes'
                        : language === 'bn'
                        ? 'কর্মসূচি সংরক্ষণ করুন'
                        : 'Save Event'}
                    </span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
