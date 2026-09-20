import React, { useState } from 'react';
import { EventEntity, Language } from '../domain/models';
import {
  formatBengaliDate,
  formatBengaliTime,
  toBengaliNumber,
  BENGALI_MONTHS,
  BENGALI_WEEKDAYS,
  CATEGORY_COLORS,
  getDhakaDateString,
  isEventInPast,
} from '../domain/constants';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  FolderArchive,
  History as HistoryIcon,
  ArrowRight,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { EventHistoryDriveView } from './EventHistoryDriveView';

interface CalendarViewProps {
  events: EventEntity[];
  onSelectEvent: (event: EventEntity) => void;
  language: Language;
  role?: 'admin' | 'user';
  onAddEventOnDate?: (dateStr: string) => void;
}

type CalendarMode = 'month' | 'week' | 'day';

export const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  onSelectEvent,
  language,
  role = 'user',
  onAddEventOnDate,
}) => {
  const [activeSection, setActiveSection] = useState<'calendar' | 'history'>('calendar');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(getDhakaDateString());
  const [calendarMode, setCalendarMode] = useState<CalendarMode>('month');

  const todayStr = getDhakaDateString();
  const pastEvents = events.filter(
    (e) => isEventInPast(e.eventDate, e.endTime, e.startTime) || e.isCompleted
  );

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

  return (
    <div id="calendar-view" className="space-y-4 pb-20">
      {/* Top Segmented Control for Calendar vs History */}
      <div className="flex bg-slate-200/80 p-1 rounded-2xl max-w-md mx-auto shadow-inner">
        <button
          type="button"
          onClick={() => setActiveSection('calendar')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSection === 'calendar'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'ক্যালেন্ডার ও সূচি' : 'Calendar & Schedule'}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSection('history')}
          className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            activeSection === 'history'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'পূর্ববর্তী ইতিহাস ও ড্রাইভ' : 'History & Drive Archive'}</span>
        </button>
      </div>

      {activeSection === 'history' ? (
        <EventHistoryDriveView
          pastEvents={pastEvents}
          allEvents={events}
          language={language}
          onSelectEvent={onSelectEvent}
          role={role}
        />
      ) : (
        <>
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

          {/* Month Navigator Card */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                title={language === 'bn' ? 'আগের মাস' : 'Previous month'}
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
                title={language === 'bn' ? 'পরের মাস' : 'Next month'}
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
                const isToday = cell.dateStr === todayStr;

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
                  {language === 'bn' ? formatBengaliDate(selectedDateStr) : selectedDateStr}
                </span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                  {language === 'bn'
                    ? `${toBengaliNumber(eventsOnSelectedDate.length)} টি কর্মসূচি`
                    : `${eventsOnSelectedDate.length} events`}
                </span>
                {role === 'admin' && onAddEventOnDate && (
                  <button
                    type="button"
                    onClick={() => onAddEventOnDate(selectedDateStr)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#006A60] hover:bg-teal-700 text-white font-semibold text-xs shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'যোগ করুন' : 'Add'}</span>
                  </button>
                )}
              </div>
            </div>

            {eventsOnSelectedDate.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/90 text-slate-500 text-xs space-y-2">
                <p>
                  {language === 'bn'
                    ? 'এই তারিখে কোনো কর্মসূচি নির্ধারিত নেই।'
                    : 'No scheduled events on this date.'}
                </p>
                {role === 'admin' && onAddEventOnDate && (
                  <button
                    type="button"
                    onClick={() => onAddEventOnDate(selectedDateStr)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#006A60] font-bold text-xs border border-teal-200 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {language === 'bn'
                        ? 'এই তারিখে কর্মসূচি যোগ করুন'
                        : 'Add Event on this Date'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {eventsOnSelectedDate.map((event) => {
                  const categoryStyle =
                    CATEGORY_COLORS[event.category] || CATEGORY_COLORS['অন্যান্য'];
                  const timeFormatted =
                    language === 'bn' ? formatBengaliTime(event.startTime) : event.startTime;
                  const isHistorical =
                    isEventInPast(event.eventDate, event.endTime, event.startTime) ||
                    event.isCompleted;

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
                              {timeFormatted || (language === 'bn' ? 'সারাদিন' : 'All day')}
                            </span>
                            <span
                              className={`text-[11px] font-medium px-2 py-0.5 rounded border ${categoryStyle.bg} ${categoryStyle.border}`}
                            >
                              {event.category}
                            </span>
                            {isHistorical && (
                              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>{language === 'bn' ? 'অতীত / সম্পন্ন' : 'Past / Done'}</span>
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 group-hover:text-[#006A60] transition leading-snug">
                            {event.title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-teal-700" />
                            <span>
                              {event.venue || (language === 'bn' ? 'স্থান নির্ধারিত নেই' : 'Venue not specified')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* History & Drive Backup Quick Link Banner */}
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#006A60] text-white flex items-center justify-center shrink-0 shadow-xs">
                <FolderArchive className="w-5 h-5 text-teal-100" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  {language === 'bn'
                    ? 'আগের কর্মসূচির ইতিহাস ও গুগল ড্রাইভ ব্যাকআপ'
                    : 'Past Events History & Google Drive Backup'}
                </h4>
                <p className="text-[11px] text-slate-600">
                  {language === 'bn'
                    ? `পূর্বে সম্পন্ন হওয়া ${toBengaliNumber(pastEvents.length)}টি কর্মসূচি সংরক্ষণ এবং গুগল ড্রাইভে এক্সপোর্ট করুন`
                    : `Archive and export ${pastEvents.length} past events directly to Google Drive`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveSection('history')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#006A60] hover:bg-teal-700 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              <span>{language === 'bn' ? 'ইতিহাস দেখুন' : 'View History'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};
