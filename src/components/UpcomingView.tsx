import React, { useState } from 'react';
import { EventEntity, Language } from '../domain/models';
import {
  formatBengaliDate,
  formatBengaliTime,
  CATEGORY_COLORS,
  toBengaliNumber,
} from '../domain/constants';
import { MapPin, Bell, Calendar, ChevronRight, CheckCircle2, Clock } from 'lucide-react';

interface UpcomingViewProps {
  events: EventEntity[];
  onSelectEvent: (event: EventEntity) => void;
  language: Language;
}

type UpcomingFilter = 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'next_30_days';

export const UpcomingView: React.FC<UpcomingViewProps> = ({
  events,
  onSelectEvent,
  language,
}) => {
  const [activeFilter, setActiveFilter] = useState<UpcomingFilter>('this_week');

  const filterTabs = [
    { id: 'today' as UpcomingFilter, labelBn: 'আজ', labelEn: 'Today' },
    { id: 'tomorrow' as UpcomingFilter, labelBn: 'আগামীকাল', labelEn: 'Tomorrow' },
    { id: 'this_week' as UpcomingFilter, labelBn: 'এই সপ্তাহ', labelEn: 'This Week' },
    { id: 'next_week' as UpcomingFilter, labelBn: 'পরবর্তী সপ্তাহ', labelEn: 'Next Week' },
    { id: 'next_30_days' as UpcomingFilter, labelBn: 'পরবর্তী ৩০ দিন', labelEn: 'Next 30 Days' },
  ];

  // Helper date calculations
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const thisWeekEnd = new Date(now);
  thisWeekEnd.setDate(now.getDate() + 7);
  const thisWeekEndStr = thisWeekEnd.toISOString().split('T')[0];

  const nextWeekEnd = new Date(now);
  nextWeekEnd.setDate(now.getDate() + 14);
  const nextWeekEndStr = nextWeekEnd.toISOString().split('T')[0];

  const thirtyDaysEnd = new Date(now);
  thirtyDaysEnd.setDate(now.getDate() + 30);
  const thirtyDaysEndStr = thirtyDaysEnd.toISOString().split('T')[0];

  const filteredEvents = events.filter((e) => {
    if (activeFilter === 'today') {
      return e.eventDate === todayStr;
    } else if (activeFilter === 'tomorrow') {
      return e.eventDate === tomorrowStr;
    } else if (activeFilter === 'this_week') {
      return e.eventDate >= todayStr && e.eventDate <= thisWeekEndStr;
    } else if (activeFilter === 'next_week') {
      return e.eventDate > thisWeekEndStr && e.eventDate <= nextWeekEndStr;
    } else if (activeFilter === 'next_30_days') {
      return e.eventDate >= todayStr && e.eventDate <= thirtyDaysEndStr;
    }
    return true;
  });

  return (
    <div id="upcoming-view" className="space-y-4 pb-20">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">
            {language === 'bn' ? 'আসন্ন কর্মসূচি' : 'Upcoming Schedules'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'bn'
              ? 'জামালপুর মেডিকেল কলেজের অনুমোদিত সরকারি ও প্রাতিষ্ঠানিক সূচি'
              : 'Approved official schedules of Jamalpur Medical College'}
          </p>
        </div>
        <span className="text-xs font-semibold bg-teal-50 text-[#006A60] px-2.5 py-1 rounded-full border border-teal-200">
          {language === 'bn'
            ? `${toBengaliNumber(filteredEvents.length)} টি ইভেন্ট`
            : `${filteredEvents.length} events`}
        </span>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.id;
          const label = language === 'bn' ? tab.labelBn : tab.labelEn;
          return (
            <button
              key={tab.id}
              id={`upcoming-tab-${tab.id}`}
              onClick={() => setActiveFilter(tab.id)}
              className={`text-xs px-3.5 py-2 rounded-full font-semibold shrink-0 transition-all ${
                isActive
                  ? 'bg-[#006A60] text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-slate-700">
            {language === 'bn' ? 'এই সময়সীমার মধ্যে কোনো কর্মসূচি নেই' : 'No schedules in this time range'}
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            {language === 'bn'
              ? 'অন্যান্য ট্যাব পরীক্ষা করুন অথবা নতুন কর্মসূচি যুক্ত করুন।'
              : 'Check other tabs or add a new schedule.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEvents.map((event) => {
            const categoryStyle = CATEGORY_COLORS[event.category] || CATEGORY_COLORS['অন্যান্য'];
            const dateStr = language === 'bn' ? formatBengaliDate(event.eventDate) : event.eventDate;
            const timeStr = language === 'bn' ? formatBengaliTime(event.startTime) : event.startTime;
            const hasReminders = event.reminders && event.reminders.length > 0;

            return (
              <div
                key={event.id}
                id={`upcoming-card-${event.id}`}
                onClick={() => onSelectEvent(event)}
                className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs hover:border-teal-400 hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                        {dateStr}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{timeStr}</span>
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${categoryStyle.bg} ${categoryStyle.border}`}
                      >
                        {event.category}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-800 leading-snug group-hover:text-[#006A60] transition mt-1">
                      {event.title}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-slate-600 pt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      <span className="truncate font-medium">{event.venue}</span>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition shrink-0 self-center" />
                </div>

                {/* Footer metadata: Source & Reminders */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">{language === 'bn' ? 'উৎস:' : 'Source:'}</span>
                    <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                      {event.source}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-slate-500">
                    <Bell className={`w-3.5 h-3.5 ${hasReminders ? 'text-teal-600' : 'text-slate-400'}`} />
                    <span>
                      {hasReminders
                        ? language === 'bn'
                          ? 'রিমাইন্ডার সক্রিয়'
                          : 'Reminder Active'
                        : language === 'bn'
                        ? 'রিমাইন্ডার বন্ধ'
                        : 'No reminder'}
                    </span>
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
