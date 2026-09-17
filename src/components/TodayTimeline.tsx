import React from 'react';
import { EventEntity, Language } from '../domain/models';
import {
  formatBengaliTime,
  calculateTimeUntil,
  CATEGORY_COLORS,
  toBengaliNumber,
} from '../domain/constants';
import { MapPin, Clock, CheckCircle2, Circle, AlertTriangle, ArrowRight } from 'lucide-react';

interface TodayTimelineProps {
  events: EventEntity[];
  onSelectEvent: (event: EventEntity) => void;
  onToggleComplete: (id: string, e: React.MouseEvent) => void;
  language: Language;
}

export const TodayTimeline: React.FC<TodayTimelineProps> = ({
  events,
  onSelectEvent,
  onToggleComplete,
  language,
}) => {
  if (events.length === 0) {
    return (
      <div
        id="today-timeline-empty"
        className="bg-white rounded-2xl p-6 text-center border border-slate-200/80 shadow-sm"
      >
        <div className="w-12 h-12 mx-auto rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-800">
          {language === 'bn' ? 'আজ কোনো নির্ধারিত কর্মসূচি নেই' : 'No schedules today'}
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          {language === 'bn'
            ? 'নতুন কর্মসূচি যোগ করতে নিচের + বাটনে চাপুন।'
            : 'Press the + button below to add a new schedule.'}
        </p>
      </div>
    );
  }

  // Find next upcoming incomplete event
  const nextIncompleteEvent = events.find((e) => !e.isCompleted);
  const nextCountdown = nextIncompleteEvent
    ? calculateTimeUntil(nextIncompleteEvent.eventDate, nextIncompleteEvent.startTime)
    : null;

  return (
    <div id="today-timeline-container" className="space-y-3">
      {/* Highlight Next Event Banner */}
      {nextIncompleteEvent && nextCountdown && (
        <div
          id="next-event-banner"
          onClick={() => onSelectEvent(nextIncompleteEvent)}
          className="cursor-pointer bg-gradient-to-r from-teal-900 to-[#005a52] text-white p-3.5 rounded-2xl shadow-md hover:shadow-lg transition-all border border-teal-700/50 flex items-center justify-between group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-300"></span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-emerald-200 uppercase tracking-wider">
                  {language === 'bn' ? 'পরবর্তী কর্মসূচি' : 'Next Event'}
                </span>
                <span className="text-[11px] bg-emerald-500/30 text-emerald-100 px-1.5 py-0.2 rounded font-semibold">
                  {nextCountdown.text}
                </span>
              </div>
              <h4 className="text-sm font-semibold truncate text-white mt-0.5 group-hover:text-teal-100 transition">
                {nextIncompleteEvent.title}
              </h4>
              <div className="flex items-center gap-2 text-[12px] text-teal-200 mt-0.5">
                <span>
                  {language === 'bn'
                    ? formatBengaliTime(nextIncompleteEvent.startTime)
                    : nextIncompleteEvent.startTime || 'Time not set'}
                </span>
                {nextIncompleteEvent.venue && (
                  <>
                    <span>•</span>
                    <span className="truncate">{nextIncompleteEvent.venue}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-teal-200 shrink-0 group-hover:translate-x-1 transition-transform ml-2" />
        </div>
      )}

      {/* Vertical Timeline Card */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200/90">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#006A60]"></div>
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">
              {language === 'bn' ? 'আজকের সময়সূচি (Timeline)' : "Today's Timeline"}
            </h3>
          </div>
          <span className="text-xs font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
            {language === 'bn' ? `${toBengaliNumber(events.length)} টি ইভেন্ট` : `${events.length} events`}
          </span>
        </div>

        <div className="relative pl-6 space-y-6">
          {/* Vertical Connecting Line */}
          <div className="absolute left-[11px] top-3 bottom-3 w-[2px] bg-slate-200"></div>

          {events.map((event, index) => {
            const isNext = nextIncompleteEvent?.id === event.id;
            const categoryStyle = CATEGORY_COLORS[event.category] || CATEGORY_COLORS['অন্যান্য'];
            const formattedTime =
              language === 'bn' ? formatBengaliTime(event.startTime) : event.startTime;

            return (
              <div
                key={event.id}
                id={`timeline-event-${event.id}`}
                onClick={() => onSelectEvent(event)}
                className={`relative group cursor-pointer transition-all ${
                  event.isCompleted ? 'opacity-60' : 'opacity-100'
                }`}
              >
                {/* Timeline Node Point */}
                <div
                  className={`absolute -left-6 top-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    event.isCompleted
                      ? 'bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-50'
                      : isNext
                      ? 'bg-[#006A60] text-white shadow-md ring-4 ring-teal-100'
                      : 'bg-white border-2 border-slate-300 text-slate-400 group-hover:border-teal-600'
                  }`}
                >
                  {event.isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-current"></span>
                  )}
                </div>

                {/* Event Card Content */}
                <div
                  className={`p-3.5 rounded-xl border transition-all ${
                    isNext
                      ? 'bg-teal-50/50 border-teal-300 shadow-sm'
                      : 'bg-slate-50/60 border-slate-200/80 group-hover:bg-slate-50 group-hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#006A60] bg-white px-2 py-0.5 rounded-md border border-teal-200 shadow-xs">
                        {formattedTime}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${categoryStyle.bg} ${categoryStyle.border}`}
                      >
                        {event.category}
                      </span>
                      {event.priority === 'urgent' && (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>{language === 'bn' ? 'জরুরি' : 'Urgent'}</span>
                        </span>
                      )}
                    </div>

                    <button
                      id={`toggle-complete-${event.id}`}
                      onClick={(e) => onToggleComplete(event.id, e)}
                      className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                      title={event.isCompleted ? 'Mark pending' : 'Mark completed'}
                    >
                      {event.isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300 hover:text-teal-600" />
                      )}
                    </button>
                  </div>

                  <h4
                    className={`text-sm font-semibold text-slate-800 mt-2 leading-snug group-hover:text-[#006A60] transition ${
                      event.isCompleted ? 'line-through text-slate-500' : ''
                    }`}
                  >
                    {event.title}
                  </h4>

                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-600 flex-wrap">
                    {event.venue ? (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                        <span className="font-medium text-slate-700">{event.venue}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-slate-400 italic">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{language === 'bn' ? 'ভেন্যু নির্দিষ্ট নেই' : 'No venue specified'}</span>
                      </div>
                    )}

                    <span className="text-slate-300">•</span>

                    <span className="text-[11px] text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                      {event.source}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
