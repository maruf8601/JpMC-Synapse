import React, { useState, useEffect } from 'react';
import { eventRepository } from './data/eventRepository';
import { EventEntity, NavigationTab, Language, Category } from './domain/models';
import { TopAppBar } from './components/TopAppBar';
import { BottomNavBar } from './components/BottomNavBar';
import { DashboardView } from './components/DashboardView';
import { UpcomingView } from './components/UpcomingView';
import { CalendarView } from './components/CalendarView';
import { ReviewCenterView } from './components/ReviewCenterView';
import { TelegramInboxView } from './components/TelegramInboxView';
import { SettingsView } from './components/SettingsView';
import { EventHistoryDriveView } from './components/EventHistoryDriveView';
import { EventDetailsModal } from './components/EventDetailsModal';
import { QuickAddModal } from './components/QuickAddModal';
import { AboutModal } from './components/AboutModal';
import { PWAInstallGuideModal } from './components/PWAInstallGuideModal';
import { DeviceFrame } from './components/DeviceFrame';
import { checkAndRunDailyAutoBackup } from './services/autoBackupService';
import { checkScheduledReminders } from './services/reminderNotificationService';
import { initForegroundNotificationListener } from './services/pushNotificationService';

export default function App() {
  const [language, setLanguage] = useState<Language>('bn');
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');

  // Repositories state
  const [, setVersion] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<EventEntity | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPWAInstallModalOpen, setIsPWAInstallModalOpen] = useState(false);
  const [isReviewOpenFromHeader, setIsReviewOpenFromHeader] = useState(false);

  // Initialize Foreground FCM Listener and Service Worker deep link messages
  useEffect(() => {
    initForegroundNotificationListener((data) => {
      const targetEventId = data?.eventId || data?.data?.eventId;
      if (targetEventId) {
        const ev = eventRepository.getEventById(targetEventId);
        if (ev) {
          setSelectedEvent(ev);
        }
      }
    });

    // Check URL query parameters for deep linking (e.g. from background notification click)
    const urlParams = new URLSearchParams(window.location.search);
    const linkedEventId = urlParams.get('eventId');
    const linkedTab = urlParams.get('tab') as NavigationTab | null;

    if (linkedEventId) {
      const ev = eventRepository.getEventById(linkedEventId);
      if (ev) setSelectedEvent(ev);
    }
    if (linkedTab) {
      setCurrentTab(linkedTab);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = eventRepository.subscribe(() => {
      setVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  // Automatic everyday backup of previous events
  useEffect(() => {
    checkAndRunDailyAutoBackup();

    const interval = setInterval(() => {
      checkAndRunDailyAutoBackup();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Real scheduled reminder notifications (2h, 30m, morning briefing)
  useEffect(() => {
    const runReminderCheck = () => {
      const events = eventRepository.getAllEvents();
      checkScheduledReminders(events);
    };

    runReminderCheck();
    const interval = setInterval(runReminderCheck, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const todayEvents = eventRepository.getTodayEvents();
  const allUpcomingEvents = eventRepository.getUpcomingEvents();
  const pastEvents = eventRepository.getPastEvents();
  const allHistoryRecords = eventRepository.getAllHistoryRecords();
  const pendingReviewEvents = eventRepository.getPendingReviewEvents();
  const eventsThisWeek = eventRepository.getEventsThisWeek();
  const telegramMessages = eventRepository.getTelegramMessages();
  const searchResults = searchQuery ? eventRepository.searchEvents(searchQuery) : [];

  const handleToggleComplete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    eventRepository.toggleComplete(id);
    if (selectedEvent && selectedEvent.id === id) {
      const updated = eventRepository.getEventById(id);
      if (updated) setSelectedEvent(updated);
    }
  };

  const handleApproveEvent = (id: string, overrides?: Partial<EventEntity>) => {
    eventRepository.approveEvent(id, overrides);
  };

  const handleRejectEvent = (id: string) => {
    eventRepository.rejectEvent(id);
  };

  const handleAddEvent = async (eventData: Omit<EventEntity, 'id' | 'createdAt' | 'updatedAt'>) => {
    return await eventRepository.addEvent(eventData);
  };

  const handleDeleteEvent = async (id: string) => {
    await eventRepository.deleteEvent(id);
    setSelectedEvent(null);
  };

  const handleEditEvent = (event: EventEntity) => {
    // Open QuickAdd or inline edit
    setSelectedEvent(null);
    setIsQuickAddOpen(true);
  };

  return (
    <DeviceFrame language={language}>
      {/* 1. Top App Bar with JpMC seal, search & notification bell */}
      <TopAppBar
        language={language}
        onLanguageChange={setLanguage}
        reviewCount={pendingReviewEvents.length}
        onOpenReview={() => setIsReviewOpenFromHeader(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* 3. Main Body Scroll Area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-2xl mx-auto w-full">
        {/* If Active Search Mode */}
        {searchQuery ? (
          <div className="space-y-4 pb-20">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">
                {language === 'bn'
                  ? `অনুসন্ধানের ফলাফল ("${searchQuery}")`
                  : `Search Results ("${searchQuery}")`}
              </h3>
              <span className="text-xs bg-teal-50 text-[#006A60] font-semibold px-2 py-0.5 rounded-full border border-teal-200">
                {searchResults.length} {language === 'bn' ? 'টি' : 'results'}
              </span>
            </div>

            {searchResults.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-500 text-xs">
                {language === 'bn'
                  ? 'কোনো কর্মসূচি খুঁজে পাওয়া যায়নি। ভিন্ন শব্দ দিয়ে অনুসন্ধান করুন।'
                  : 'No matching schedules found.'}
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((event) => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-teal-400 cursor-pointer transition"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded">
                        {event.eventDate}
                      </span>
                      <span className="text-[11px] font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                        {event.startTime}
                      </span>
                      <span className="text-[11px] text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded">
                        {event.category}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800">{event.title}</h4>
                    <p className="text-xs text-slate-600 mt-1">{event.venue}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : isReviewOpenFromHeader ? (
          /* Review Required View triggered from notification icon */
          <div className="space-y-3">
            <button
              onClick={() => setIsReviewOpenFromHeader(false)}
              className="text-xs text-[#006A60] font-semibold hover:underline flex items-center gap-1 mb-2"
            >
              ← {language === 'bn' ? 'ড্যাশবোর্ডে ফিরুন' : 'Back to Dashboard'}
            </button>
            <ReviewCenterView
              events={pendingReviewEvents}
              onApprove={handleApproveEvent}
              onReject={handleRejectEvent}
              language={language}
            />
          </div>
        ) : (
          /* Active Screen by Tab */
          <>
            {currentTab === 'home' && (
              <DashboardView
                todayEvents={todayEvents}
                pendingReviewEvents={pendingReviewEvents}
                allUpcomingEvents={allUpcomingEvents}
                eventsThisWeek={eventsThisWeek}
                onSelectEvent={setSelectedEvent}
                onToggleComplete={handleToggleComplete}
                onNavigateToTab={setCurrentTab}
                onOpenReviewModal={() => setIsReviewOpenFromHeader(true)}
                language={language}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            )}

            {currentTab === 'calendar' && (
              <div className="space-y-6">
                <UpcomingView
                  events={allUpcomingEvents}
                  onSelectEvent={setSelectedEvent}
                  language={language}
                />
                <CalendarView
                  events={allUpcomingEvents}
                  onSelectEvent={setSelectedEvent}
                  language={language}
                />
              </div>
            )}

            {currentTab === 'history' && (
              <EventHistoryDriveView
                pastEvents={pastEvents}
                allEvents={allHistoryRecords}
                language={language}
                onSelectEvent={setSelectedEvent}
              />
            )}

            {currentTab === 'inbox' && (
              <TelegramInboxView
                messages={telegramMessages}
                language={language}
                onOpenReview={() => setIsReviewOpenFromHeader(true)}
                onSelectEvent={setSelectedEvent}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                language={language}
                onLanguageChange={setLanguage}
                onOpenAbout={() => setIsAboutOpen(true)}
                onResetData={() => eventRepository.resetToDefaults()}
                onNavigateToTab={setCurrentTab}
                onOpenInstallModal={() => setIsPWAInstallModalOpen(true)}
              />
            )}
          </>
        )}
      </main>

      {/* 4. Bottom Navigation Bar */}
      <BottomNavBar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setIsReviewOpenFromHeader(false);
          setSearchQuery('');
          if (tab === 'add') {
            setIsQuickAddOpen(true);
          } else {
            setCurrentTab(tab);
          }
        }}
        language={language}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        reviewCount={pendingReviewEvents.length}
      />

      {/* 5. Modals & Overlays */}
      <EventDetailsModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onToggleComplete={(id) => handleToggleComplete(id)}
        onDelete={handleDeleteEvent}
        onEdit={handleEditEvent}
        language={language}
      />

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onAddEvent={handleAddEvent}
        language={language}
      />

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        language={language}
      />

      <PWAInstallGuideModal
        isOpen={isPWAInstallModalOpen}
        onClose={() => setIsPWAInstallModalOpen(false)}
        language={language}
      />
    </DeviceFrame>
  );
}
