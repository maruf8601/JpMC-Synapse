import React, { useState, useEffect } from 'react';
import { EventEntity, Language, Category, Priority, ReviewStatus } from '../domain/models';
import {
  CATEGORIES,
  getDhakaNow,
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
  language: Language;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onAddEvent,
  language,
}) => {
  const [activeMode, setActiveMode] = useState<'ai' | 'manual'>('manual');
  const [nlInput, setNlInput] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<Partial<EventEntity> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Manual Form State
  const now = getDhakaNow();
  const defaultDate = now.toISOString().split('T')[0];

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
  // Smart Bengali Schedule Parser error state (must remain before any early return)
  const [extractionError, setExtractionError] = useState<string | null>(null);

  // Reset form cleanly whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveMode('manual');
      setTitle('');
      const dhakaDate = getDhakaNow().toISOString().split('T')[0];
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
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
      const res = await apiFetch('/api/extract-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: text,
          timezone: 'Asia/Dhaka (UTC+6)',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Gemini extraction failed');
      }

      const data = await res.json();
      if (!data.events || data.events.length === 0) {
        setExtractionError('পাঠ্যটি থেকে কোনো নির্দিষ্ট সূচি চিহ্নিত করা যায়নি। অনুগ্রহ করে তারিখ ও সময় উল্লেখ করুন।');
        setParsedPreview(null);
        return;
      }

      const ev = data.events[0];
      const hasDate = Boolean(ev.date);
      const hasStartTime = Boolean(ev.startTime);
      const hasVenue = Boolean(ev.venue);
      const hasValidConfidence =
        typeof ev.confidence === 'number' && !isNaN(ev.confidence) && ev.confidence >= 0 && ev.confidence <= 1;

      const ambiguities: string[] = Array.isArray(ev.ambiguities) ? [...ev.ambiguities] : [];

      let confidence: number | null = null;
      if (hasValidConfidence) {
        confidence = ev.confidence;
      } else {
        confidence = 0;
        ambiguities.push('AI confidence score পাওয়া যায়নি।');
      }

      if (!hasDate) ambiguities.push('তারিখ অনুপস্থিত (Date missing)');
      if (!hasStartTime) ambiguities.push('সময় অনুপস্থিত (Time missing)');
      if (!hasVenue) ambiguities.push('ভেন্যু অনুপস্থিত (Venue missing)');

      // Rule 10: Auto-approved only when valid date, startTime, confidence >= 0.90, and no critical ambiguities
      const isMissingRequired = !hasDate || !hasStartTime;
      const isLowConfidence = confidence < 0.90;
      const reviewStatus: ReviewStatus = isMissingRequired || isLowConfidence || ambiguities.length > 0
        ? 'needs_review'
        : 'auto_approved';

      const rawTitle = typeof ev.title === 'string' ? ev.title.trim() : '';
      const hasMeaningfulTitle = rawTitle.length > 0 && !/^[\s-_.,]*$/.test(rawTitle);
      if (!hasMeaningfulTitle) {
        ambiguities.push('ইভেন্টের শিরোনাম নির্ধারণ প্রয়োজন।');
      }

      const rawCategory = typeof ev.category === 'string' ? ev.category.trim() : '';
      const category: Category = (rawCategory && ['সভা', 'একাডেমিক', 'পরীক্ষা', 'সেমিনার', 'ওয়ার্কশপ', 'প্রশিক্ষণ', 'প্রশাসনিক', 'জাতীয় দিবস', 'ক্রয়/টেন্ডার', 'ছাত্র বিষয়ক', 'ব্যক্তিগত', 'অন্যান্য'].includes(rawCategory))
        ? (rawCategory as Category)
        : 'অন্যান্য';

      setParsedPreview({
        title: hasMeaningfulTitle ? rawTitle : 'শিরোনাম নির্ধারণ প্রয়োজন',
        eventDate: ev.date || null,
        startTime: ev.startTime || null,
        endTime: ev.endTime || null,
        venue: ev.venue || null,
        category,
        priority: ev.priority || 'normal',
        description: ev.description || text,
        confidence,
        reviewStatus,
        source: 'AI Extracted',
        ambiguities,
      });
    } catch (err: any) {
      console.error('[QuickAddModal] AI parsing error:', err);
      setExtractionError(err?.message || 'সার্ভার থেকে এআই বিশ্লেষণ ব্যর্থ হয়েছে।');
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleSaveParsedPreview = async () => {
    if (!parsedPreview || isSaving) return;

    const hasValidDate = Boolean(parsedPreview.eventDate);
    const hasValidStartTime = Boolean(parsedPreview.startTime);
    const isComplete = hasValidDate && hasValidStartTime;
    const confidence = typeof parsedPreview.confidence === 'number' ? parsedPreview.confidence : 0;
    const hasAmbiguities = Boolean(parsedPreview.ambiguities && parsedPreview.ambiguities.length > 0);

    const reviewStatus: ReviewStatus = (isComplete && confidence >= 0.90 && !hasAmbiguities)
      ? 'auto_approved'
      : 'needs_review';

    // Time-specific reminders must remain disabled until valid date + startTime exist.
    const reminders = isComplete && reviewStatus === 'auto_approved'
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
    };

    console.log('[QuickAdd] Confirmed AI event saving:', payload);
    try {
      await onAddEvent(payload);
      console.log('[QuickAdd] Firestore write succeeded for AI event');
      onClose();
    } catch (err: any) {
      console.error('[QuickAdd] Firestore write failed for AI event:', err);
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
      reminders: [
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

    console.log('[QuickAdd] Confirmed manual event saving:', payload);
    try {
      await onAddEvent(payload);
      console.log('[QuickAdd] Firestore write succeeded for manual event');
      onClose();
    } catch (err: any) {
      console.error('[QuickAdd] Firestore write failed for manual event:', err);
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
              {language === 'bn' ? 'নতুন কর্মসূচি যোগ করুন' : 'Add New Schedule'}
            </h2>
            <span className="text-[10px] bg-teal-800 text-teal-200 px-2 py-0.5 rounded-full font-semibold">
              JpMC
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-teal-700 text-teal-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (AI Natural Language vs Manual Form) */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs">
          <button
            onClick={() => setActiveMode('ai')}
            className={`flex-1 py-3 px-4 font-bold flex items-center justify-center gap-2 transition ${
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
            className={`flex-1 py-3 px-4 font-bold flex items-center justify-center gap-2 transition ${
              activeMode === 'manual'
                ? 'text-[#006A60] border-b-2 border-[#006A60] bg-white'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileEdit className="w-4 h-4 text-teal-600" />
            <span>{language === 'bn' ? 'ম্যানুয়াল ফরম (Detailed)' : 'Manual Form'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{saveError}</div>
              <button
                type="button"
                onClick={() => setSaveError(null)}
                className="text-rose-500 hover:text-rose-800 text-xs ml-1"
              >
                ✕
              </button>
            </div>
          )}

          {activeMode === 'ai' ? (
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
                    ? 'উদাহরণ: "আগামী বৃহস্পতিবার সকাল সাড়ে ৯টায় শিক্ষক কক্ষে মিটিং"'
                    : 'e.g. "Meeting in Faculty Room tomorrow at 10 AM"'}
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
                    className="flex items-center gap-1.5 bg-[#006A60] hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl transition shadow-xs"
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

                  <span className="text-[11px] text-slate-400">Asia/Dhaka UTC+6</span>
                </div>

                {extractionError && (
                  <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{extractionError}</span>
                  </div>
                )}
              </div>

              {/* Quick Prompt Test Case Chips */}
              <div className="pt-2">
                <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                  {language === 'bn' ? 'নমুনা টেস্ট কেস (ক্লিক করে পরীক্ষা করুন):' : 'Sample Test Prompts:'}
                </span>
                <div className="flex flex-col gap-1.5">
                  {testPhrases.map((phrase, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setNlInput(phrase);
                        parseBengaliNaturalLanguage(phrase);
                      }}
                      className="text-left text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 p-2 rounded-lg border border-slate-200 transition"
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
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          parsedPreview.reviewStatus === 'needs_review'
                            ? 'bg-amber-200 text-amber-900'
                            : 'bg-emerald-200 text-emerald-900'
                        }`}
                      >
                        {parsedPreview.reviewStatus === 'needs_review'
                          ? language === 'bn'
                            ? 'যাচাই প্রয়োজন'
                            : 'Needs Review'
                          : language === 'bn'
                          ? 'অনুমোদিত'
                          : 'Approved'}
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
                      <span className="text-slate-500">{language === 'bn' ? 'তারিখ: ' : 'Date: '}</span>
                      <span className={`font-semibold ${parsedPreview.eventDate ? 'text-[#006A60]' : 'text-amber-700'}`}>
                        {parsedPreview.eventDate
                          ? language === 'bn'
                            ? formatBengaliDate(parsedPreview.eventDate)
                            : parsedPreview.eventDate
                          : language === 'bn'
                          ? 'উল্লেখ নেই'
                          : 'Unspecified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">{language === 'bn' ? 'শুরুর সময়: ' : 'Start Time: '}</span>
                      <span className={`font-semibold ${parsedPreview.startTime ? 'text-[#006A60]' : 'text-amber-700'}`}>
                        {parsedPreview.startTime
                          ? language === 'bn'
                            ? formatBengaliTime(parsedPreview.startTime)
                            : parsedPreview.startTime
                          : language === 'bn'
                          ? 'উল্লেখ নেই'
                          : 'Unspecified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">{language === 'bn' ? 'স্থান / ভেন্যু: ' : 'Venue: '}</span>
                      <span className="font-medium">
                        {parsedPreview.venue || (language === 'bn' ? 'উল্লেখ নেই' : 'Unspecified')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">{language === 'bn' ? 'ক্যাটাগরি: ' : 'Category: '}</span>
                      <span className="font-semibold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {parsedPreview.category || 'অন্যান্য'}
                      </span>
                    </div>
                  </div>

                  {parsedPreview.ambiguities && parsedPreview.ambiguities.length > 0 && (
                    <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                      <span className="font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{language === 'bn' ? 'অস্পষ্টতা / অনুপস্থিত তথ্য:' : 'Ambiguities / Missing Info:'}</span>
                      </span>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                        {parsedPreview.ambiguities.map((amb, idx) => (
                          <li key={idx}>{amb}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(!parsedPreview.eventDate || !parsedPreview.startTime) && (
                    <p className="text-[11px] text-amber-800 bg-amber-100/60 p-2 rounded-lg leading-relaxed">
                      {language === 'bn'
                        ? '⚠️ তারিখ বা শুরুর সময় অনুপস্থিত থাকায় স্বয়ংক্রিয় রিমাইন্ডার বন্ধ থাকবে। রিভিউ সেন্টারে অথবা সরাসরি ম্যানুয়াল ফর্মে তথ্য পূরণ করে নিন।'
                        : '⚠️ Time-specific reminders remain disabled until valid date and time are provided.'}
                    </p>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleTransferPreviewToManual}
                      className="flex-1 py-2 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                            {parsedPreview.reviewStatus === 'needs_review'
                              ? language === 'bn'
                                ? 'রিভিউ সেন্টারে সংরক্ষণ'
                                : 'Save for Review'
                              : language === 'bn'
                              ? 'কর্মসূচি সংরক্ষণ করুন'
                              : 'Save Schedule'}
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
                  className="rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <label htmlFor="all-day-toggle" className="text-slate-700 font-medium">
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
                    <span>{language === 'bn' ? 'কর্মসূচি সংরক্ষণ করুন' : 'Save Event'}</span>
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
