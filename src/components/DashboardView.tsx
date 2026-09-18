import React from 'react';
import { EventEntity, Language, Category, NavigationTab } from '../domain/models';
import {
  formatBengaliDate,
  toBengaliNumber,
  getDhakaNow,
  CATEGORIES,
} from '../domain/constants';
import { TodayTimeline } from './TodayTimeline';
import {
  CalendarDays,
  CalendarClock,
  ClipboardCheck,
  CalendarRange,
  AlertCircle,
  ArrowRight,
  Filter,
  Plus,
} from 'lucide-react';

interface DashboardViewProps {
  todayEvents: EventEntity[];
  pendingReviewEvents: EventEntity[];
  allUpcomingEvents: EventEntity[];
  eventsThisWeek: EventEntity[];
  onSelectEvent: (event: EventEntity) => void;
  onToggleComplete: (id: string, e: React.MouseEvent) => void;
  onNavigateToTab: (tab: NavigationTab) => void;
  onOpenReviewModal: () => void;
  onOpenQuickAdd?: () => void;
  language: Language;
  selectedCategory: Category | 'all';
  onSelectCategory: (cat: Category | 'all') => void;
  userProfile?: {
    displayName?: string;
    role?: 'admin' | 'user';
    email?: string;
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  todayEvents,
  pendingReviewEvents,
  allUpcomingEvents,
  eventsThisWeek,
  onSelectEvent,
  onToggleComplete,
  onNavigateToTab,
  onOpenReviewModal,
  onOpenQuickAdd,
  language,
  selectedCategory,
  onSelectCategory,
  userProfile,
}) => {
  const dhakaNow = getDhakaNow();
  const currentHour = dhakaNow.getHours();
  const currentMinutes = dhakaNow.getMinutes();
  const totalMinutes = currentHour * 60 + currentMinutes;

  // Exact Asia/Dhaka Greeting Logic:
  // Morning (05:00 - 11:59): 'শুভ সকাল' / 'Good morning'
  // Noon/Afternoon (12:00 - 16:59): 'শুভ দুপুর' / 'Good afternoon'
  // Late afternoon (17:00 - 18:29): 'শুভ বিকেল' / 'Good afternoon'
  // Evening/Night (18:30 - 04:59): 'শুভ সন্ধ্যা' / 'Good evening'
  let greetingBn = 'শুভ সকাল';
  let greetingEn = 'Good morning';

  if (totalMinutes >= 300 && totalMinutes < 720) {
    greetingBn = 'শুভ সকাল';
    greetingEn = 'Good morning';
  } else if (totalMinutes >= 720 && totalMinutes < 1020) {
    greetingBn = 'শুভ দুপুর';
    greetingEn = 'Good afternoon';
  } else if (totalMinutes >= 1020 && totalMinutes < 1110) {
    greetingBn = 'শুভ বিকেল';
    greetingEn = 'Good afternoon';
  } else {
    greetingBn = 'শুভ সন্ধ্যা';
    greetingEn = 'Good evening';
  }

  const isAdmin = userProfile?.role === 'admin';
  const userDisplayName = userProfile?.displayName || (isAdmin ? 'অ্যাডমিন' : 'স্টাফ');

  const formattedDate = formatBengaliDate(dhakaNow);

  // Filter today's events by selected category if any
  const filteredTodayEvents =
    selectedCategory === 'all'
      ? todayEvents
      : todayEvents.filter((e) => e.category === selectedCategory);

  return (
    <div id="dashboard-view" className="space-y-4 pb-20">
      {/* Institutional Header Banner */}
      <div className="bg-gradient-to-br from-[#006A60] via-[#005a52] to-[#004841] text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
        {/* Subtle decorative medical cross & wave watermark */}
        <div className="absolute right-[-16px] top-[-16px] w-32 h-32 bg-white/5 rounded-full pointer-events-none blur-xl"></div>
        <div className="absolute right-4 bottom-2 text-white/10 font-bold text-6xl select-none pointer-events-none">
          JpMC
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-200 bg-teal-800/60 px-2.5 py-1 rounded-full border border-teal-600/40">
                {language === 'bn' ? 'জামালপুর মেডিকেল কলেজ' : 'Jamalpur Medical College'}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isAdmin
                    ? 'bg-amber-400/20 text-amber-200 border-amber-300/40'
                    : 'bg-teal-200/20 text-teal-100 border-teal-300/30'
                }`}
              >
                {isAdmin
                  ? language === 'bn'
                    ? 'অ্যাডমিন'
                    : 'Admin'
                  : language === 'bn'
                  ? 'স্টাফ'
                  : 'Staff'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && onOpenQuickAdd && (
                <button
                  id="dashboard-header-quick-add-btn"
                  onClick={onOpenQuickAdd}
                  className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-[#006A60] font-bold text-xs px-3 py-1 rounded-full shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer border border-teal-100"
                  title="নতুন কর্মসূচি যোগ করুন"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{language === 'bn' ? 'কর্মসূচি যোগ' : 'Quick Add'}</span>
                </button>
              )}
              <span className="text-xs text-teal-200/90 font-medium">
                {language === 'bn' ? formattedDate : dhakaNow.toLocaleDateString('en-GB')}
              </span>
            </div>
          </div>

          <div className="mt-3">
            <h2 className="text-2xl font-bold tracking-tight text-white font-['Tiro_Bangla',sans-serif]">
              {language === 'bn'
                ? `${greetingBn}, ${userDisplayName}`
                : `${greetingEn}, ${userDisplayName}`}
            </h2>
            <p className="text-sm text-teal-100 font-medium mt-1 font-['Tiro_Bangla',sans-serif]">
              {language === 'bn' ? (
                todayEvents.length > 0 ? (
                  <>
                    আজ আপনার <span className="font-bold underline decoration-teal-300">{toBengaliNumber(todayEvents.length)}টি</span> নির্ধারিত কর্মসূচি রয়েছে
                  </>
                ) : (
                  'আজ কোনো নির্ধারিত কর্মসূচি নেই'
                )
              ) : (
                `You have ${todayEvents.length} scheduled event${todayEvents.length === 1 ? '' : 's'} today`
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Review Required Action Banner (Admin only & if pending items exist) */}
      {isAdmin && pendingReviewEvents.length > 0 && (
        <div
          id="review-alert-banner"
          onClick={onOpenReviewModal}
          className="cursor-pointer bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-center justify-between hover:bg-amber-100/80 transition-all shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900">
                  {language === 'bn' ? 'তথ্য যাচাই প্রয়োজন' : 'Review Required'}
                </span>
                <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.2 rounded-full">
                  {language === 'bn' ? toBengaliNumber(pendingReviewEvents.length) : pendingReviewEvents.length}
                </span>
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5">
                {language === 'bn'
                  ? 'টেলিগ্রাম নোটিশ থেকে নিষ্কাশিত কর্মসূচি নিশ্চিত করুন'
                  : 'Confirm schedules extracted from Telegram notices'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-amber-900 group-hover:translate-x-1 transition-transform">
            <span>{language === 'bn' ? 'যাচাই করুন' : 'Review'}</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Dashboard 4 Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: আজকের কর্মসূচি */}
        <div
          id="stat-card-today"
          onClick={() => {
            const el = document.getElementById('today-timeline-container');
            el?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="bg-white p-3.5 rounded-2xl border border-teal-200/80 shadow-xs hover:border-teal-400 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              {language === 'bn' ? 'আজকের কর্মসূচি' : "Today's Schedule"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#006A60] flex items-center justify-center">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-800">
              {language === 'bn' ? toBengaliNumber(todayEvents.length) : todayEvents.length}
            </span>
            <span className="text-[11px] font-medium text-[#006A60] bg-teal-50 px-2 py-0.5 rounded-md">
              {language === 'bn' ? 'আজ' : 'Today'}
            </span>
          </div>
        </div>

        {/* Card 2: আসন্ন */}
        <div
          id="stat-card-upcoming"
          onClick={() => onNavigateToTab('calendar')}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-teal-400 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              {language === 'bn' ? 'আসন্ন কর্মসূচি' : 'Upcoming'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-800">
              {language === 'bn' ? toBengaliNumber(allUpcomingEvents.length) : allUpcomingEvents.length}
            </span>
            <span className="text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
              {language === 'bn' ? 'মোট' : 'Total'}
            </span>
          </div>
        </div>

        {/* Card 3: যাচাই প্রয়োজন */}
        <div
          id="stat-card-review"
          onClick={onOpenReviewModal}
          className={`p-3.5 rounded-2xl border shadow-xs cursor-pointer transition-all flex flex-col justify-between ${
            pendingReviewEvents.length > 0
              ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              {language === 'bn' ? 'যাচাই প্রয়োজন' : 'Review Required'}
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                pendingReviewEvents.length > 0
                  ? 'bg-amber-200/80 text-amber-900'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-800">
              {language === 'bn' ? toBengaliNumber(pendingReviewEvents.length) : pendingReviewEvents.length}
            </span>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${
                pendingReviewEvents.length > 0
                  ? 'bg-amber-200 text-amber-900 font-bold'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {language === 'bn' ? 'পেন্ডিং' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Card 4: এই সপ্তাহে */}
        <div
          id="stat-card-week"
          onClick={() => onNavigateToTab('calendar')}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-teal-400 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              {language === 'bn' ? 'এই সপ্তাহে' : 'This Week'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CalendarRange className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-800">
              {language === 'bn' ? toBengaliNumber(eventsThisWeek.length) : eventsThisWeek.length}
            </span>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
              {language === 'bn' ? '৭ দিন' : '7 Days'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Add Action Card (Restricted to Admin users only) */}
      {isAdmin && onOpenQuickAdd && (
        <div
          id="dashboard-admin-quick-add-banner"
          onClick={onOpenQuickAdd}
          className="cursor-pointer bg-gradient-to-r from-teal-50 via-emerald-50/60 to-slate-50 border border-teal-200/90 rounded-2xl p-3 flex items-center justify-between hover:border-teal-400 transition-all shadow-xs group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#006A60] text-white flex items-center justify-center shadow-xs">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  {language === 'bn' ? 'দ্রুত কর্মসূচি যোগ করুন (কুইক অ্যাড)' : 'Quick Add Schedule'}
                </span>
                <span className="text-[9px] font-bold bg-teal-100 text-[#006A60] px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                  Admin Only
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {language === 'bn'
                  ? 'নতুন সভা, সেমিনার বা প্রাতিষ্ঠানিক কর্মসূচির বিবরণ দ্রুত যুক্ত করুন'
                  : 'Quickly create a new institutional meeting or official event'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold text-[#006A60] group-hover:translate-x-1 transition-transform">
            <span>{language === 'bn' ? 'যোগ করুন' : 'Add'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Category Filter Horizontal Scroll */}
      <div className="pt-1">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => onSelectCategory('all')}
            className={`text-xs px-3 py-1.5 rounded-full font-medium shrink-0 transition ${
              selectedCategory === 'all'
                ? 'bg-[#006A60] text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {language === 'bn' ? 'সকল বিভাগ' : 'All Categories'}
          </button>
          {CATEGORIES.slice(0, 6).map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory(selectedCategory === cat ? 'all' : cat)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium shrink-0 transition ${
                selectedCategory === cat
                  ? 'bg-[#006A60] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Today's Timeline Section */}
      <div className="pt-2">
        <TodayTimeline
          events={filteredTodayEvents}
          onSelectEvent={onSelectEvent}
          onToggleComplete={onToggleComplete}
          language={language}
        />
      </div>
    </div>
  );
};
