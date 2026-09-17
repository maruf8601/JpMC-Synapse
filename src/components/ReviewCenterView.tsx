import React, { useState } from 'react';
import { EventEntity, Language, Category } from '../domain/models';
import {
  formatBengaliDate,
  formatBengaliTime,
  toBengaliNumber,
  CATEGORIES,
} from '../domain/constants';
import {
  Check,
  Edit2,
  X,
  AlertTriangle,
  FileText,
  Sparkles,
  HelpCircle,
  Clock,
  MapPin,
  Calendar,
} from 'lucide-react';

interface ReviewCenterViewProps {
  events: EventEntity[];
  onApprove: (id: string, overrides?: Partial<EventEntity>) => void;
  onReject: (id: string) => void;
  language: Language;
}

export const ReviewCenterView: React.FC<ReviewCenterViewProps> = ({
  events,
  onApprove,
  onReject,
  language,
}) => {
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<EventEntity>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleStartEdit = (event: EventEntity) => {
    setEditingEventId(event.id);
    setFormError(null);
    setEditForm({
      title: event.title,
      eventDate: event.eventDate,
      startTime: event.startTime,
      venue: event.venue,
      category: event.category,
    });
  };

  const handleSaveAndApprove = (id: string) => {
    const hasDate = Boolean(editForm.eventDate && editForm.eventDate.trim());
    const hasStartTime = Boolean(editForm.startTime && editForm.startTime.trim());

    if (!hasDate || !hasStartTime) {
      setFormError(
        language === 'bn'
          ? 'অনুমোদনের জন্য বৈধ তারিখ এবং শুরুর সময় উভয়ই আবশ্যক।'
          : 'Both a valid Date and Start Time are required for approval.'
      );
      return;
    }

    onApprove(id, editForm);
    setEditingEventId(null);
    setFormError(null);
  };

  const handleDirectApprove = (event: EventEntity) => {
    if (!event.eventDate || !event.startTime) {
      // Missing required data - automatically open editor so user can complete it
      handleStartEdit(event);
      setFormError(
        language === 'bn'
          ? 'অনুমোদনের পূর্বে অনুগ্রহ করে অনুপস্থিত তারিখ ও সময় পূরণ করুন।'
          : 'Please provide missing date and time before approval.'
      );
      return;
    }
    onApprove(event.id);
  };

  if (events.length === 0) {
    return (
      <div id="review-center-empty" className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
          <Check className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-slate-800">
          {language === 'bn' ? 'যাচাইয়ের জন্য কোনো কর্মসূচি নেই' : 'No schedules requiring review'}
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          {language === 'bn'
            ? 'টেলিগ্রাম নোটিশ থেকে প্রাপ্ত সকল কর্মসূচি অনুমোদিত বা স্বয়ংক্রিয়ভাবে প্রসেস করা হয়েছে।'
            : 'All notices extracted from Telegram have been approved or auto-processed.'}
        </p>
      </div>
    );
  }

  return (
    <div id="review-center-view" className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              {language === 'bn' ? 'যাচাই প্রয়োজন' : 'Review Required'}
            </h2>
            <span className="text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
              {language === 'bn' ? toBengaliNumber(events.length) : events.length}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'এআই-নিষ্কাশিত নোটিশে অনিশ্চয়তা থাকায় মানুষের চূড়ান্ত অনুমোদন প্রয়োজন'
              : 'AI extraction has ambiguities requiring human confirmation'}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {events.map((event) => {
          const isEditing = editingEventId === event.id;
          const hasConfidence =
            typeof event.confidence === 'number' && !isNaN(event.confidence) && event.confidence > 0;
          const confidencePct = hasConfidence ? Math.round(event.confidence! * 100) : 0;
          const isMissingDate = !event.eventDate;
          const isMissingTime = !event.startTime;
          const isIncomplete = isMissingDate || isMissingTime;

          return (
            <div
              key={event.id}
              id={`review-card-${event.id}`}
              className="bg-white rounded-2xl border-2 border-amber-200/90 shadow-sm overflow-hidden"
            >
              {/* Header Badge */}
              <div className="bg-amber-50/80 px-4 py-2.5 border-b border-amber-200/70 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {isIncomplete
                      ? language === 'bn'
                        ? 'অসম্পূর্ণ তথ্য — সংশোধন আবশ্যক'
                        : 'Incomplete — Editing Required'
                      : language === 'bn'
                      ? 'তথ্য যাচাই প্রয়োজন'
                      : 'Verification Required'}
                  </span>
                  <span className="text-[10px] bg-amber-200/70 text-amber-950 font-normal px-2 py-0.5 rounded-full ml-1">
                    {event.source || 'Telegram'}
                    {event.sender ? ` • ${event.sender}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold bg-white text-slate-700 px-2 py-0.5 rounded-md border border-amber-200">
                  <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>
                    {hasConfidence
                      ? language === 'bn'
                        ? `কনফিডেন্স: ${toBengaliNumber(confidencePct)}%`
                        : `Confidence: ${confidencePct}%`
                      : language === 'bn'
                      ? 'Confidence পাওয়া যায়নি'
                      : 'AI Confidence: N/A'}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-3.5">
                {/* 1. Original Notice Excerpt */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500 font-semibold mb-1">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'মূল নোটিশ (Original Text):' : 'Original Notice:'}</span>
                  </div>
                  <p className="text-slate-800 italic leading-relaxed">
                    "{event.originalText || event.description}"
                  </p>
                </div>

                {/* 2. Ambiguities & Missing Fields warning */}
                {((event.ambiguities && event.ambiguities.length > 0) || isIncomplete) && (
                  <div className="bg-amber-50/50 rounded-xl p-2.5 border border-amber-200/70 text-xs text-amber-900 space-y-1.5">
                    <span className="font-bold flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{language === 'bn' ? 'অস্পষ্টতা ও অনুপস্থিত তথ্য:' : 'Ambiguities & Missing Data:'}</span>
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                      {isMissingDate && (
                        <li className="text-rose-700 font-semibold">
                          {language === 'bn' ? 'তারিখ অনুপস্থিত (Date missing)' : 'Date is missing'}
                        </li>
                      )}
                      {isMissingTime && (
                        <li className="text-rose-700 font-semibold">
                          {language === 'bn' ? 'শুরুর সময় অনুপস্থিত (Start time missing)' : 'Start time is missing'}
                        </li>
                      )}
                      {!event.venue && (
                        <li className="text-amber-800">
                          {language === 'bn' ? 'ভেন্যু নির্দিষ্ট করা নেই (Venue unspecified)' : 'Venue unspecified'}
                        </li>
                      )}
                      {!hasConfidence && (
                        <li className="text-slate-700">
                          {language === 'bn' ? 'AI confidence score পাওয়া যায়নি।' : 'AI confidence score not available.'}
                        </li>
                      )}
                      {(event.ambiguities || []).map((amb, i) => (
                        <li key={i}>{amb}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 3. AI Interpretation (View or Edit mode) */}
                {isEditing ? (
                  <div className="bg-teal-50/40 p-3.5 rounded-xl border border-teal-200 space-y-3">
                    <h4 className="text-xs font-bold text-[#006A60]">
                      {language === 'bn' ? 'কর্মসূচির বিবরণ সংশোধন করুন:' : 'Edit Event Details:'}
                    </h4>

                    {formError && (
                      <div className="p-2 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg text-xs flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{formError}</span>
                      </div>
                    )}

                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        {language === 'bn' ? 'শিরোনাম (Title) *' : 'Title *'}
                      </label>
                      <input
                        type="text"
                        value={editForm.title || ''}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          {language === 'bn' ? 'তারিখ (Date) *' : 'Date *'}
                        </label>
                        <input
                          type="date"
                          required
                          value={editForm.eventDate || ''}
                          onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })}
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          {language === 'bn' ? 'সময় (Time) *' : 'Time *'}
                        </label>
                        <input
                          type="time"
                          required
                          value={editForm.startTime || ''}
                          onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value })}
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          {language === 'bn' ? 'স্থান / ভেন্যু (Venue)' : 'Venue'}
                        </label>
                        <input
                          type="text"
                          placeholder={language === 'bn' ? 'যেমন: অধ্যক্ষের কার্যালয়' : 'e.g. Principal Office'}
                          value={editForm.venue || ''}
                          onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          {language === 'bn' ? 'ক্যাটাগরি (Category)' : 'Category'}
                        </label>
                        <select
                          value={editForm.category || 'অন্যান্য'}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Category })}
                          className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => {
                          setEditingEventId(null);
                          setFormError(null);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                      >
                        {language === 'bn' ? 'বাতিল' : 'Cancel'}
                      </button>
                      <button
                        onClick={() => handleSaveAndApprove(event.id)}
                        className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-[#006A60] text-white hover:bg-teal-700 shadow-xs"
                      >
                        {language === 'bn' ? 'সংরক্ষণ ও অনুমোদন' : 'Save & Approve'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-teal-50/30 p-3 rounded-xl border border-teal-200/80">
                    <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wide block mb-1.5">
                      {language === 'bn' ? 'এআই ব্যাখ্যা (AI Interpretation):' : 'AI Interpretation:'}
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block">{language === 'bn' ? 'শিরোনাম:' : 'Title:'}</span>
                        <span className="font-semibold text-slate-800">
                          {event.title || (language === 'bn' ? 'শিরোনাম নির্ধারণ প্রয়োজন' : 'Title Needed')}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{language === 'bn' ? 'ক্যাটাগরি:' : 'Category:'}</span>
                        <span className="font-semibold text-slate-800">{event.category || 'অন্যান্য'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">{language === 'bn' ? 'তারিখ:' : 'Date:'}</span>
                        {event.eventDate ? (
                          <span className="font-semibold text-slate-800">
                            {language === 'bn' ? formatBengaliDate(event.eventDate) : event.eventDate}
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded border border-rose-300">
                            {language === 'bn' ? 'তারিখ অনুপস্থিত' : 'Date Missing'}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 block">{language === 'bn' ? 'সময়:' : 'Time:'}</span>
                        {event.startTime ? (
                          <span className="font-semibold text-slate-800">
                            {language === 'bn' ? formatBengaliTime(event.startTime) : event.startTime}
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded border border-rose-300">
                            {language === 'bn' ? 'সময় অনুপস্থিত' : 'Time Missing'}
                          </span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-500 block">{language === 'bn' ? 'স্থান / ভেন্যু:' : 'Venue:'}</span>
                        <span className="font-semibold text-slate-800">
                          {event.venue || (language === 'bn' ? 'উল্লেখ নেই' : 'Unspecified')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Action Buttons (✓ অনুমোদন করুন, ✎ সংশোধন করুন, × বাতিল করুন) */}
                {!isEditing && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      id={`approve-btn-${event.id}`}
                      onClick={() => handleDirectApprove(event)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-semibold text-xs shadow-xs transition ${
                        isIncomplete
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-[#006A60] hover:bg-teal-700 text-white'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {isIncomplete
                          ? language === 'bn'
                            ? 'তথ্য পূরণ ও অনুমোদন'
                            : 'Complete & Approve'
                          : language === 'bn'
                          ? '✓ অনুমোদন করুন'
                          : 'Approve'}
                      </span>
                    </button>

                    <button
                      id={`edit-btn-${event.id}`}
                      onClick={() => handleStartEdit(event)}
                      className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>{language === 'bn' ? '✎ সংশোধন করুন' : 'Edit'}</span>
                    </button>

                    <button
                      id={`reject-btn-${event.id}`}
                      onClick={() => onReject(event.id)}
                      className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
                      title={language === 'bn' ? 'বাতিল করুন' : 'Discard'}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
