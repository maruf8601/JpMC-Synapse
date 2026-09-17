import React, { useState } from 'react';
import { EventEntity, Language } from '../domain/models';
import {
  formatBengaliDate,
  formatBengaliTime,
  toBengaliNumber,
  BENGALI_MONTHS,
  BENGALI_WEEKDAYS,
  CATEGORY_COLORS,
} from '../domain/constants';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { syncWithGoogleCalendar } from '../services/googleCalendarService';
import { auth } from '../services/firebaseClient';
import { googleSignIn } from '../services/googleAuth';

interface CalendarViewProps {
  events: EventEntity[];
  onSelectEvent: (event: EventEntity) => void;
  language: Language;
}

type CalendarMode = 'month' | 'week' | 'day';

export const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  onSelectEvent,
  language,
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Days in month calculation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  // Build grid days
  const calendarCells = [];
  // Empty leading cells
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarCells.push(null);
  }
  // Days of month
  for (let d = 1; d <= totalDaysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ dayNumber: d, dateStr: dStr });
  }

  // Events on selected date
  const eventsOnSelectedDate = events.filter((e) => e.eventDate === selectedDateStr);

  const handleGoogleCalendarSync = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      if (!auth.currentUser) {
        const signinRes = await googleSignIn();
        if (!signinRes) {
          setIsSyncing(false);
          return;
        }
      }

      const res = await syncWithGoogleCalendar();
      setSyncStatusMsg(
        language === 'bn'
          ? `গুগল ক্যালেন্ডার সিঙ্ক সফল! (এক্সপোর্ট: ${toBengaliNumber(res.exportedCount)}, ইমপোর্ট: ${toBengaliNumber(res.importedCount)})`
          : `Synced! Exported: ${res.exportedCount}, Imported: ${res.importedCount}`
      );
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } catch (err: any) {
      setSyncStatusMsg(
        language === 'bn'
          ? `সিঙ্ক ব্যর্থ: ${err?.message || 'পুনরায় চেষ্টা করুন'}`
          : `Sync error: ${err?.message || 'Please retry'}`
      );
      setTimeout(() => setSyncStatusMsg(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div id="calendar-view" className="space-y-4 pb-20">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            {language === 'bn' ? 'ক্যালেন্ডার সূচি' : 'Calendar View'}
          </h2>
          <p className="text-xs text-slate-500">
            {language === 'bn'
              ? 'তারিখ অনুযায়ী জামালপুর মেডিকেল কলেজের সকল কর্মসূচি'
              : 'Institutional schedules by date'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Real Google Calendar Sync Button */}
          <button
            onClick={handleGoogleCalendarSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs bg-white hover:bg-teal-50 text-[#006A60] font-semibold px-2.5 py-1.5 rounded-xl border border-teal-200 shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Sync with Google Calendar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {isSyncing
                ? language === 'bn'
                  ? 'সিঙ্ক হচ্ছে...'
                  : 'Syncing...'
                : language === 'bn'
                ? 'গুগল ক্যালেন্ডার সিঙ্ক'
                : 'Google Calendar'}
            </span>
          </button>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            {(['month', 'week', 'day'] as CalendarMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setCalendarMode(mode)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium capitalize transition cursor-pointer ${
                  calendarMode === mode
                    ? 'bg-white text-[#006A60] font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {language === 'bn'
                  ? mode === 'month'
                    ? 'মাস'
                    : mode === 'week'
                    ? 'সপ্তাহ'
                    : 'দিন'
                  : mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatusMsg && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 text-xs text-teal-900 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{syncStatusMsg}</span>
        </div>
      )}

      {/* Month Navigator Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-slate-800">
            {language === 'bn'
              ? `${BENGALI_MONTHS[month]} ${toBengaliNumber(year)}`
              : `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`}
          </span>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 text-center mb-2">
          {BENGALI_WEEKDAYS.map((w, idx) => (
            <div key={idx} className="text-[11px] font-bold text-slate-400 py-1">
              {language === 'bn' ? w.slice(0, 2) : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][idx]}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="h-9"></div>;
            }

            const isSelected = cell.dateStr === selectedDateStr;
            const dayEvents = events.filter((e) => e.eventDate === cell.dateStr);
            const hasEvents = dayEvents.length > 0;
            const isToday = cell.dateStr === new Date().toISOString().split('T')[0];

            return (
              <button
                key={cell.dateStr}
                onClick={() => setSelectedDateStr(cell.dateStr)}
                className={`h-9 rounded-xl flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#006A60] text-white font-bold shadow-xs'
                    : isToday
                    ? 'bg-teal-50 text-[#006A60] font-bold border border-teal-200'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span className="text-xs">
                  {language === 'bn' ? toBengaliNumber(cell.dayNumber) : cell.dayNumber}
                </span>

                {/* Event Dot Indicator */}
                {hasEvents && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-amber-300' : 'bg-teal-600'
                    }`}
                  ></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events for Selected Date */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-teal-700" />
            <span>
              {language === 'bn'
                ? formatBengaliDate(selectedDateStr)
                : selectedDateStr}
            </span>
          </h3>
          <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
            {language === 'bn'
              ? `${toBengaliNumber(eventsOnSelectedDate.length)} টি কর্মসূচি`
              : `${eventsOnSelectedDate.length} events`}
          </span>
        </div>

        {eventsOnSelectedDate.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/90 text-slate-500 text-xs">
            {language === 'bn'
              ? 'এই তারিখে কোনো কর্মসূচি নির্ধারিত নেই।'
              : 'No scheduled events on this date.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {eventsOnSelectedDate.map((event) => {
              const categoryStyle =
                CATEGORY_COLORS[event.category] || CATEGORY_COLORS['অন্যান্য'];
              const timeFormatted =
                language === 'bn' ? formatBengaliTime(event.startTime) : event.startTime;

              return (
                <div
                  key={event.id}
                  onClick={() => onSelectEvent(event)}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200/90 hover:border-teal-400 transition cursor-pointer shadow-xs group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#006A60] bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                          {timeFormatted}
                        </span>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded border ${categoryStyle.bg} ${categoryStyle.border}`}
                        >
                          {event.category}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 group-hover:text-[#006A60] transition leading-snug">
                        {event.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-teal-700" />
                        <span>{event.venue}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
