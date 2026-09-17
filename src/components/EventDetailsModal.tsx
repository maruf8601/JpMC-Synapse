import React, { useState } from 'react';
import { EventEntity, Language } from '../domain/models';
import {
  formatBengaliDate,
  formatBengaliTime,
  CATEGORY_COLORS,
  toBengaliNumber,
} from '../domain/constants';
import { createGoogleCalendarEvent } from '../services/googleCalendarService';
import { eventRepository } from '../data/eventRepository';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  Bell,
  Users,
  FileText,
  Share2,
  CalendarPlus,
  Trash2,
  CheckCircle2,
  Edit3,
  Circle,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface EventDetailsModalProps {
  event: EventEntity | null;
  onClose: () => void;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (event: EventEntity) => void;
  language: Language;
}

export const EventDetailsModal: React.FC<EventDetailsModalProps> = ({
  event,
  onClose,
  onToggleComplete,
  onDelete,
  onEdit,
  language,
}) => {
  const [showOriginalNotice, setShowOriginalNotice] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isGCalSynced, setIsGCalSynced] = useState(
    Boolean(event?.googleCalendarEventId || event?.source === 'Google Calendar' || event?.isGCalSynced)
  );
  const [isSyncingGCal, setIsSyncingGCal] = useState(false);
  const [gcalError, setGcalError] = useState<string | null>(null);
  const [gcalSuccessLink, setGcalSuccessLink] = useState<string | null>(null);

  if (!event) return null;

  const categoryStyle = CATEGORY_COLORS[event.category] || CATEGORY_COLORS['অন্যান্য'];
  const formattedDate =
    language === 'bn' ? formatBengaliDate(event.eventDate) : event.eventDate;
  const formattedStartTime =
    language === 'bn' ? formatBengaliTime(event.startTime) : event.startTime;
  const formattedEndTime = event.endTime
    ? language === 'bn'
      ? formatBengaliTime(event.endTime)
      : event.endTime
    : null;

  const handleShare = () => {
    const textToShare = `*${event.title}*\n📅 ${formattedDate}\n⏰ ${formattedStartTime}\n📍 ${event.venue}\n🏥 জামালপুর মেডিকেল কলেজ (JpMC Synapse)`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(textToShare);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleSyncToGCal = async () => {
    if (isGCalSynced && !gcalError) return;
    setIsSyncingGCal(true);
    setGcalError(null);
    try {
      const result = await createGoogleCalendarEvent(event);
      setIsGCalSynced(true);
      if (result.htmlLink) {
        setGcalSuccessLink(result.htmlLink);
      }
      // Persist real sync status in event repository and Firestore
      eventRepository.updateEvent({
        ...event,
        isGCalSynced: true,
        googleCalendarEventId: result.id,
        calendarId: 'primary',
        lastCalendarSyncAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[EventDetailsModal] Google Calendar sync failed:', err);
      if (
        err?.message?.includes('GOOGLE_CALENDAR_AUTH_REQUIRED') ||
        err?.message?.includes('OAuth') ||
        err?.message?.includes('Sign in')
      ) {
        setGcalError(
          language === 'bn'
            ? 'গুগল সাইন-ইন প্রয়োজন। অনুগ্রহ করে সেটিংস ট্যাব থেকে গুগল অ্যাকাউন্ট যুক্ত করুন।'
            : 'Google Sign-in required. Please connect your Google account in Settings.'
        );
      } else {
        setGcalError(
          err?.message ||
            (language === 'bn' ? 'গুগল ক্যালেন্ডার সিঙ্ক ব্যর্থ হয়েছে' : 'Google Calendar sync failed')
        );
      }
      setIsGCalSynced(false);
    } finally {
      setIsSyncingGCal(false);
    }
  };

  return (
    <div
      id="event-details-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="event-details-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Top Header Bar */}
        <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${categoryStyle.bg} ${categoryStyle.border}`}
            >
              {event.category}
            </span>
            <span className="text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
              {event.source}
            </span>
            {event.priority === 'urgent' && (
              <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                {language === 'bn' ? 'জরুরি' : 'Urgent'}
              </span>
            )}
          </div>

          <button
            id="close-event-details-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Title & Complete Checkbox */}
          <div className="flex items-start gap-3">
            <button
              onClick={() => onToggleComplete(event.id)}
              className="mt-1 p-1 text-slate-400 hover:text-emerald-600 transition"
              title={event.isCompleted ? 'Mark pending' : 'Mark completed'}
            >
              {event.isCompleted ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-600 fill-emerald-100" />
              ) : (
                <Circle className="w-6 h-6 text-slate-300 hover:text-teal-600" />
              )}
            </button>
            <div>
              <h2
                className={`text-lg font-bold text-slate-900 leading-snug ${
                  event.isCompleted ? 'line-through text-slate-500' : ''
                }`}
              >
                {event.title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {language === 'bn'
                  ? 'জামালপুর মেডিকেল কলেজ অফিশিয়াল সূচি'
                  : 'Official Schedule of Jamalpur Medical College'}
              </p>
            </div>
          </div>

          {/* Core Info Grid */}
          <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/80 space-y-2.5 text-xs">
            {/* Date */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <Calendar className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="font-semibold">{formattedDate}</span>
            </div>

            {/* Time */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <Clock className="w-4 h-4 text-teal-700 shrink-0" />
              <span>
                {formattedStartTime}
                {formattedEndTime ? ` — ${formattedEndTime}` : ''}
                <span className="text-slate-400 ml-1.5">(বাংলাদেশ স্ট্যান্ডার্ড টাইম Asia/Dhaka)</span>
              </span>
            </div>

            {/* Venue */}
            <div className="flex items-center gap-2.5 text-slate-700">
              <MapPin className="w-4 h-4 text-teal-700 shrink-0" />
              <span className="font-semibold text-slate-900">{event.venue}</span>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                {language === 'bn' ? 'বিবরণ ও আলোচ্যসূচি' : 'Description & Agenda'}
              </h4>
              <p className="text-xs text-slate-700 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed">
                {event.description}
              </p>
            </div>
          )}

          {/* Committee / Participants */}
          {(event.committee || event.participants) && (
            <div className="bg-teal-50/40 p-3 rounded-xl border border-teal-200/80 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-[#006A60] font-bold">
                <Users className="w-4 h-4" />
                <span>{language === 'bn' ? 'অংশগ্রহণকারী ও কমিটি' : 'Participants & Committee'}</span>
              </div>
              {event.committee && (
                <p className="text-slate-700">
                  <span className="font-semibold">{language === 'bn' ? 'কমিটি: ' : 'Committee: '}</span>
                  {event.committee}
                </p>
              )}
              {event.participants && (
                <p className="text-slate-700">
                  <span className="font-semibold">{language === 'bn' ? 'উপস্থিত থাকবেন: ' : 'Attendees: '}</span>
                  {event.participants}
                </p>
              )}
            </div>
          )}

          {/* Reminder Configuration */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-teal-700" />
                <span>{language === 'bn' ? 'স্মার্ট রিমাইন্ডার কনফিগারেশন' : 'Smart Reminders'}</span>
              </span>
              <span className="text-[10px] text-teal-800 bg-teal-100/70 font-semibold px-1.5 py-0.5 rounded">
                {language === 'bn' ? 'ক্লাউড পুশ সক্রিয়' : 'Web Push Active'}
              </span>
            </div>
            <div className="space-y-1 text-slate-600 text-[11px]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{language === 'bn' ? 'কর্মসূচির ২ ঘণ্টা পূর্বে ক্লাউড পুশ' : '2 hours before event (Cloud Push)'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{language === 'bn' ? 'কর্মসূচির ৩০ মিনিট পূর্বে ক্লাউড পুশ' : '30 minutes before event (Cloud Push)'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>{language === 'bn' ? 'সকাল ৭:৩০ মিনিটে দৈনিক ব্রিফিং পুশ' : '7:30 AM Daily Morning Briefing Push'}</span>
              </div>
            </div>
          </div>

          {/* GCal Status or Error Message */}
          {gcalError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">{language === 'bn' ? 'গুগল ক্যালেন্ডার সিঙ্ক ত্রুটি' : 'Google Calendar Sync Error'}</p>
                <p className="text-[11px] text-rose-700 mt-0.5">{gcalError}</p>
              </div>
            </div>
          )}

          {gcalSuccessLink && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{language === 'bn' ? 'গুগল ক্যালেন্ডারে যোগ করা হয়েছে' : 'Added to Google Calendar'}</span>
              </span>
              <a
                href={gcalSuccessLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-700 font-bold hover:underline flex items-center gap-1"
              >
                <span>{language === 'bn' ? 'দেখুন' : 'Open'}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* Original Source Notice Toggle */}
          {event.originalText && (
            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <button
                onClick={() => setShowOriginalNotice(!showOriginalNotice)}
                className="w-full bg-slate-100 hover:bg-slate-200 px-3 py-2 flex items-center justify-between text-slate-700 font-semibold transition"
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>{language === 'bn' ? 'টেলিগ্রাম মূল নোটিশ দেখুন' : 'View Original Notice'}</span>
                </div>
                <span className="text-[11px] text-teal-800">
                  {showOriginalNotice ? 'আড়াল করুন' : 'প্রদর্শন করুন'}
                </span>
              </button>
              {showOriginalNotice && (
                <div className="p-3 bg-slate-50 text-slate-800 italic leading-relaxed border-t border-slate-200">
                  "{event.originalText}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons Bar */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={() => onToggleComplete(event.id)}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 transition"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{event.isCompleted ? (language === 'bn' ? 'অসম্পূর্ণ' : 'Pending') : (language === 'bn' ? 'সম্পন্ন' : 'Done')}</span>
            </button>

            <button
              onClick={handleSyncToGCal}
              disabled={isSyncingGCal}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border font-semibold transition ${
                isGCalSynced
                  ? 'bg-sky-50 border-sky-300 text-sky-800'
                  : 'bg-white border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              {isSyncingGCal ? (
                <Loader2 className="w-4 h-4 text-sky-600 animate-spin" />
              ) : (
                <CalendarPlus className="w-4 h-4 text-sky-600" />
              )}
              <span>
                {isSyncingGCal
                  ? (language === 'bn' ? 'সিঙ্ক হচ্ছে...' : 'Syncing...')
                  : isGCalSynced
                  ? (language === 'bn' ? 'গুগল সিঙ্কড' : 'GCal Synced')
                  : (language === 'bn' ? 'গুগলে সিঙ্ক' : 'Sync GCal')}
              </span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 transition"
            >
              <Share2 className="w-4 h-4 text-teal-700" />
              <span>{isCopied ? (language === 'bn' ? 'কপি হয়েছে' : 'Copied') : (language === 'bn' ? 'শেয়ার' : 'Share')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onEdit(event)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#006A60] hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition"
            >
              <Edit3 className="w-4 h-4" />
              <span>{language === 'bn' ? 'সম্পাদনা করুন' : 'Edit Event'}</span>
            </button>

            <button
              onClick={() => {
                if (window.confirm(language === 'bn' ? 'আপনি কি এই কর্মসূচিটি মুছে ফেলতে নিশ্চিত?' : 'Are you sure you want to delete this event?')) {
                  onDelete(event.id);
                  onClose();
                }
              }}
              className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 transition"
              title={language === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
