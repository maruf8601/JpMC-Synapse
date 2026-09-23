import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { eventRepository } from './data/eventRepository';
import { EventEntity, NavigationTab, Language, Category, AnnouncementEntity } from './domain/models';
import { TopAppBar } from './components/TopAppBar';
import { BottomNavBar } from './components/BottomNavBar';
import { DashboardView } from './components/DashboardView';
import { DeviceFrame } from './components/DeviceFrame';
import { SplashScreen } from './components/SplashScreen';
import { LoginScreen } from './components/LoginScreen';
import { checkAndRunDailyAutoBackup } from './services/autoBackupService';
import { checkScheduledReminders } from './services/reminderNotificationService';
import { initForegroundNotificationListener } from './services/pushNotificationService';
import { getPendingAnnouncementsForUser } from './services/announcementService';
import { auth } from './services/firebaseClient';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import {
  getStoredUserSession,
  verifyStoredUserSession,
  clearStoredUserSession,
  getStoredAdminSession,
  storeAdminSession,
  clearStoredAdminSession,
  verifyAdminOnServer,
  logoutUser,
  UserSessionProfile,
  AppAuthState,
} from './services/authService';
import {
  getUserAboutVersionSeen,
  setUserAboutVersionSeen,
  CURRENT_ABOUT_VERSION,
  hasUserSeenAbout,
  setUserSeenAbout,
} from './services/userPreferencesService';

// Lazy-loaded non-critical views and modals for optimal initial load time and code-splitting
const UpcomingView = lazy(() =>
  import('./components/UpcomingView').then((m) => ({ default: m.UpcomingView }))
);
const CalendarView = lazy(() =>
  import('./components/CalendarView').then((m) => ({ default: m.CalendarView }))
);
const ReviewCenterView = lazy(() =>
  import('./components/ReviewCenterView').then((m) => ({ default: m.ReviewCenterView }))
);
const TelegramInboxView = lazy(() =>
  import('./components/TelegramInboxView').then((m) => ({ default: m.TelegramInboxView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const EventHistoryDriveView = lazy(() =>
  import('./components/EventHistoryDriveView').then((m) => ({ default: m.EventHistoryDriveView }))
);
const AdminManagementView = lazy(() =>
  import('./components/AdminManagementView').then((m) => ({ default: m.AdminManagementView }))
);
const EventDetailsModal = lazy(() =>
  import('./components/EventDetailsModal').then((m) => ({ default: m.EventDetailsModal }))
);
const QuickAddModal = lazy(() =>
  import('./components/QuickAddModal').then((m) => ({ default: m.QuickAddModal }))
);
const AboutModal = lazy(() =>
  import('./components/AboutModal').then((m) => ({ default: m.AboutModal }))
);
const AnnouncementModal = lazy(() =>
  import('./components/AnnouncementModal').then((m) => ({ default: m.AnnouncementModal }))
);
const PrivacyPolicyPage = lazy(() =>
  import('./components/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage }))
);
const TermsOfServicePage = lazy(() =>
  import('./components/TermsOfServicePage').then((m) => ({ default: m.TermsOfServicePage }))
);
const PWAInstallGuideModal = lazy(() =>
  import('./components/PWAInstallGuideModal').then((m) => ({ default: m.PWAInstallGuideModal }))
);

// Fallback spinner for deferred components
const ViewSuspenseFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center p-12 min-h-[220px]">
    <div className="w-7 h-7 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
    <span className="text-xs text-slate-500 font-medium mt-3">লোড হচ্ছে...</span>
  </div>
);

export default function App() {
  const [language, setLanguage] = useState<Language>('bn');
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');

  // Synchronous cache restoration: eliminates splash screen delay on PWA relaunch
  const [authState, setAuthState] = useState<AppAuthState>(() => {
    // 1. Check persistent Normal User session first
    const stored = getStoredUserSession();
    if (stored?.token && stored?.user) {
      return {
        initialized: true,
        authenticated: true,
        authMethod: 'normal-user',
        role: 'user',
        profile: { ...stored.user, role: 'user', authMethod: 'normal-user' },
      };
    }

    // 2. Check persistent Admin session
    const storedAdmin = getStoredAdminSession();
    if (storedAdmin?.uid && storedAdmin?.role === 'admin') {
      return {
        initialized: true,
        authenticated: true,
        authMethod: 'admin-google',
        role: 'admin',
        profile: storedAdmin,
      };
    }

    // 3. Fallback to uninitialized for first launch
    return {
      initialized: false,
      authenticated: false,
      authMethod: null,
      role: null,
      profile: null,
    };
  });

  const userProfile = authState.profile;
  const userRole = authState.role || 'user';
  const authStatus = !authState.initialized
    ? 'checking'
    : !authState.authenticated
    ? 'unauthenticated'
    : 'authenticated';

  const [isFirstLoginAbout, setIsFirstLoginAbout] = useState(false);
  const [isSavingAboutPref, setIsSavingAboutPref] = useState(false);
  const checkedFirstLoginAboutRef = useRef<string | null>(null);

  // Announcement popup state
  const [announcementQueue, setAnnouncementQueue] = useState<AnnouncementEntity[]>([]);
  const [sessionDismissedAnnouncementIds, setSessionDismissedAnnouncementIds] = useState<string[]>([]);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);

  // Repositories state
  const [, setVersion] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<EventEntity | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventEntity | null>(null);
  const [prefilledDate, setPrefilledDate] = useState<string | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPWAInstallModalOpen, setIsPWAInstallModalOpen] = useState(false);
  const [isReviewOpenFromHeader, setIsReviewOpenFromHeader] = useState(false);

  // Public Legal Routes state (/privacy and /terms)
  const [isPrivacyRoute, setIsPrivacyRoute] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/privacy');
  });

  const [isTermsRoute, setIsTermsRoute] = useState<boolean>(() => {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/terms');
  });

  useEffect(() => {
    const handleLocationChange = () => {
      setIsPrivacyRoute(window.location.pathname.startsWith('/privacy'));
      setIsTermsRoute(window.location.pathname.startsWith('/terms'));
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Dual-Authentication & Authorization Resolver:
  // Render backend requests NEVER block the splash screen.
  // Auth state is checked locally and confirmed in background.
  useEffect(() => {
    let isMounted = true;

    // Fail-safe timeout: guarantees splash screen never hangs longer than 1200ms
    const splashTimeout = setTimeout(() => {
      if (isMounted) {
        setAuthState((prev) => {
          if (prev.initialized) return prev;
          console.warn('[Auth] Splash fail-safe timeout reached. Displaying application.');
          return {
            ...prev,
            initialized: true,
          };
        });
      }
    }, 1200);

    // Step A: Normal User Session (Non-blocking background validation)
    const stored = getStoredUserSession();
    if (stored?.token) {
      clearTimeout(splashTimeout);
      // Asynchronously verify session in background without delaying UI render
      verifyStoredUserSession()
        .then((verifiedUser) => {
          if (!isMounted) return;
          if (verifiedUser) {
            setAuthState((prev) => ({
              ...prev,
              initialized: true,
              authenticated: true,
              authMethod: 'normal-user',
              role: 'user',
              profile: verifiedUser,
            }));
          } else {
            // Explicit revocation by server (401/403)
            console.warn('[Auth] Normal user session explicitly revoked.');
            setAuthState({
              initialized: true,
              authenticated: false,
              authMethod: null,
              role: null,
              profile: null,
            });
          }
        })
        .catch((err) => {
          console.warn('[Auth] Background session check note:', err);
        });

      return () => {
        isMounted = false;
        clearTimeout(splashTimeout);
      };
    }

    // Step B: Firebase Auth listener for Admin Google Sign-In
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!isMounted) return;
      clearTimeout(splashTimeout);

      // If active normal user session was saved in the meantime, ignore
      const activeStored = getStoredUserSession();
      if (activeStored?.token) return;

      if (!firebaseUser) {
        // No Firebase user and no stored user session: prompt login
        setAuthState({
          initialized: true,
          authenticated: false,
          authMethod: null,
          role: null,
          profile: null,
        });
        return;
      }

      // Check if we already have verified admin session cached
      const cachedAdmin = getStoredAdminSession();
      if (cachedAdmin && cachedAdmin.uid === firebaseUser.uid) {
        setAuthState({
          initialized: true,
          authenticated: true,
          authMethod: 'admin-google',
          role: 'admin',
          profile: cachedAdmin,
        });
      } else {
        // Optimistically set authenticated admin so UI renders immediately
        setAuthState({
          initialized: true,
          authenticated: true,
          authMethod: 'admin-google',
          role: 'admin',
          profile: {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Admin',
            role: 'admin',
            active: true,
            authMethod: 'admin-google',
          },
        });
      }

      // Background confirmation with Render backend (NON-BLOCKING)
      verifyAdminOnServer(firebaseUser)
        .then((result) => {
          if (!isMounted) return;
          if (result.authorized === false) {
            console.warn('[Auth] Non-admin Google account logged out.');
            signOut(auth).catch(() => {});
            setAuthState({
              initialized: true,
              authenticated: false,
              authMethod: null,
              role: null,
              profile: null,
            });
          } else if (result.profile) {
            setAuthState((prev) => ({
              ...prev,
              initialized: true,
              authenticated: true,
              authMethod: 'admin-google',
              role: 'admin',
              profile: result.profile!,
            }));
          }
        })
        .catch((err) => {
          console.warn('[Auth] Background admin verification note:', err);
        });
    });

    return () => {
      isMounted = false;
      clearTimeout(splashTimeout);
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser(authState.authMethod, getStoredUserSession()?.token);
    } catch (e) {
      console.warn('[App] Logout error:', e);
    }
    setAuthState({
      initialized: true,
      authenticated: false,
      authMethod: null,
      role: null,
      profile: null,
    });
  };

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

      // If notification is an announcement broadcast, refresh announcements immediately
      if (data?.type === 'announcement' && userProfile?.uid) {
        getPendingAnnouncementsForUser(
          userProfile.uid,
          userProfile.role,
          sessionDismissedAnnouncementIds
        ).then((queue) => {
          if (queue.length > 0) {
            setAnnouncementQueue(queue);
            setIsAnnouncementModalOpen(true);
          }
        });
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
  }, [userProfile?.uid, userProfile?.role, sessionDismissedAnnouncementIds]);

  // Automatically show the About modal for authenticated users on their first successful login
  useEffect(() => {
    if (!authState.authenticated || !userProfile) return;

    // Use unique identifier per user session to avoid double checks in StrictMode
    const userIdentifier = userProfile.uid || userProfile.displayName || 'authenticated_user';
    if (checkedFirstLoginAboutRef.current === userIdentifier) return;
    checkedFirstLoginAboutRef.current = userIdentifier;

    const userParam = {
      uid: userProfile.uid,
      authMethod: authState.authMethod || undefined,
      displayName: userProfile.displayName,
    };

    // If already seen locally, no need to auto-open
    if (hasUserSeenAbout(userParam)) {
      return;
    }

    // Check remote Firestore preference if Google user
    if (authState.authMethod === 'admin-google' && userProfile.uid) {
      getUserAboutVersionSeen(userProfile.uid)
        .then((remoteVersion) => {
          if (!remoteVersion) {
            setIsFirstLoginAbout(true);
            setIsAboutOpen(true);
          } else {
            setUserSeenAbout(userParam);
          }
        })
        .catch(() => {
          setIsFirstLoginAbout(true);
          setIsAboutOpen(true);
        });
      return;
    }

    // For Staff Account users or offline/first-login:
    setIsFirstLoginAbout(true);
    setIsAboutOpen(true);
  }, [authState.authenticated, authState.authMethod, userProfile]);

  // Check active announcements for the authenticated user
  useEffect(() => {
    if (!userProfile?.uid) return;

    let isMounted = true;

    const checkAnnouncements = async () => {
      try {
        const queue = await getPendingAnnouncementsForUser(
          userProfile.uid,
          userProfile.role,
          sessionDismissedAnnouncementIds
        );
        if (isMounted && queue.length > 0) {
          setAnnouncementQueue(queue);
          setIsAnnouncementModalOpen(true);
        }
      } catch (err) {
        console.warn('[App] Announcement check failed:', err);
      }
    };

    // If first-login About modal is open, wait until user closes it before showing popup announcements
    if (!isAboutOpen) {
      checkAnnouncements();
    }

    return () => {
      isMounted = false;
    };
  }, [userProfile?.uid, userProfile?.role, isAboutOpen]);

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
    setEditingEvent(event);
    setSelectedEvent(null);
    setIsQuickAddOpen(true);
  };

  const handleUpdateEvent = async (updatedEvent: EventEntity) => {
    await eventRepository.updateEvent(updatedEvent);
    if (selectedEvent && selectedEvent.id === updatedEvent.id) {
      setSelectedEvent(updatedEvent);
    }
  };

  const handleGetStartedFromAbout = async () => {
    setIsSavingAboutPref(true);
    try {
      if (userProfile) {
        // Mark user seen in device localStorage
        setUserSeenAbout({
          uid: userProfile.uid,
          authMethod: authState.authMethod || undefined,
          displayName: userProfile.displayName,
        });

        // If Google account, also persist to Firestore
        if (authState.authMethod === 'admin-google' && userProfile.uid) {
          await setUserAboutVersionSeen(userProfile.uid, CURRENT_ABOUT_VERSION);
        }
      }
    } catch (err) {
      console.warn('Error saving about version preference:', err);
    } finally {
      setIsSavingAboutPref(false);
      setIsAboutOpen(false);
      setIsFirstLoginAbout(false);
    }
  };

  // Public route: /privacy is accessible without authentication or login
  if (isPrivacyRoute) {
    return (
      <Suspense fallback={<ViewSuspenseFallback />}>
        <PrivacyPolicyPage
          onBack={() => {
            if (window.location.pathname.startsWith('/privacy')) {
              window.history.pushState(null, '', '/');
            }
            setIsPrivacyRoute(false);
          }}
        />
      </Suspense>
    );
  }

  // Public route: /terms is accessible without authentication or login
  if (isTermsRoute) {
    return (
      <Suspense fallback={<ViewSuspenseFallback />}>
        <TermsOfServicePage
          onBack={() => {
            if (window.location.pathname.startsWith('/terms')) {
              window.history.pushState(null, '', '/');
            }
            setIsTermsRoute(false);
          }}
        />
      </Suspense>
    );
  }

  if (!authState.initialized) {
    return <SplashScreen />;
  }

  if (!authState.authenticated) {
    return (
      <LoginScreen
        onLoginSuccess={(profile) => {
          if (profile) {
            setAuthState({
              initialized: true,
              authenticated: true,
              authMethod: profile.authMethod,
              role: profile.role,
              profile,
            });
          } else {
            const stored = getStoredUserSession();
            if (stored?.user) {
              setAuthState({
                initialized: true,
                authenticated: true,
                authMethod: stored.user.authMethod,
                role: stored.user.role,
                profile: stored.user,
              });
            }
          }
        }}
      />
    );
  }

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
            <Suspense fallback={<ViewSuspenseFallback />}>
              <ReviewCenterView
                events={pendingReviewEvents}
                onApprove={handleApproveEvent}
                onReject={handleRejectEvent}
                language={language}
              />
            </Suspense>
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
                onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                language={language}
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                userProfile={userProfile || undefined}
              />
            )}

            <Suspense fallback={<ViewSuspenseFallback />}>
              {currentTab === 'calendar' && (
                <div className="space-y-6">
                  <UpcomingView
                    events={allUpcomingEvents}
                    onSelectEvent={setSelectedEvent}
                    language={language}
                  />
                  <CalendarView
                    events={allHistoryRecords}
                    onSelectEvent={setSelectedEvent}
                    language={language}
                    role={userRole}
                    onAddEventOnDate={
                      userRole === 'admin'
                        ? (dateStr) => {
                            setPrefilledDate(dateStr);
                            setEditingEvent(null);
                            setIsQuickAddOpen(true);
                          }
                        : undefined
                    }
                  />
                </div>
              )}

              {currentTab === 'history' && (
                <EventHistoryDriveView
                  pastEvents={pastEvents}
                  allEvents={allHistoryRecords}
                  language={language}
                  onSelectEvent={setSelectedEvent}
                  role={userRole}
                />
              )}

              {currentTab === 'inbox' && (
                <TelegramInboxView
                  messages={telegramMessages}
                  language={language}
                  onOpenReview={() => setIsReviewOpenFromHeader(true)}
                  onSelectEvent={setSelectedEvent}
                  role={userRole}
                />
              )}

              {currentTab === 'admin' && (
                <AdminManagementView
                  pendingReviewEvents={pendingReviewEvents}
                  onApproveEvent={handleApproveEvent}
                  onRejectEvent={handleRejectEvent}
                  onOpenQuickAdd={() => setIsQuickAddOpen(true)}
                  language={language}
                  onMeetingCreated={handleAddEvent}
                  pastEvents={pastEvents}
                  allEvents={allHistoryRecords}
                  onSelectEvent={setSelectedEvent}
                />
              )}

              {currentTab === 'settings' && (
                <SettingsView
                  language={language}
                  onLanguageChange={setLanguage}
                  onOpenAbout={() => setIsAboutOpen(true)}
                  onOpenPrivacy={() => {
                    window.history.pushState(null, '', '/privacy');
                    setIsPrivacyRoute(true);
                    setIsTermsRoute(false);
                  }}
                  onOpenTerms={() => {
                    window.history.pushState(null, '', '/terms');
                    setIsTermsRoute(true);
                    setIsPrivacyRoute(false);
                  }}
                  onResetData={() => eventRepository.resetToDefaults()}
                  onNavigateToTab={setCurrentTab}
                  onOpenInstallModal={() => setIsPWAInstallModalOpen(true)}
                  userProfile={userProfile}
                  onLogout={handleLogout}
                />
              )}
            </Suspense>
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
        role={userRole}
      />

      {/* 5. Modals & Overlays */}
      <Suspense fallback={null}>
        {selectedEvent && (
          <EventDetailsModal
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onToggleComplete={(id) => handleToggleComplete(id)}
            onDelete={handleDeleteEvent}
            onEdit={handleEditEvent}
            language={language}
            role={userRole}
          />
        )}

        {isQuickAddOpen && (
          <QuickAddModal
            isOpen={isQuickAddOpen}
            onClose={() => {
              setIsQuickAddOpen(false);
              setEditingEvent(null);
              setPrefilledDate(null);
            }}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            initialEvent={editingEvent}
            prefilledDate={prefilledDate}
            language={language}
          />
        )}

        {isAboutOpen && (
          <AboutModal
            isOpen={isAboutOpen}
            onClose={() => {
              if (isFirstLoginAbout) {
                handleGetStartedFromAbout();
              } else {
                setIsAboutOpen(false);
              }
            }}
            language={language}
            isFirstLogin={isFirstLoginAbout}
            onGetStarted={handleGetStartedFromAbout}
            isSavingPreference={isSavingAboutPref}
          />
        )}

        {isPWAInstallModalOpen && (
          <PWAInstallGuideModal
            isOpen={isPWAInstallModalOpen}
            onClose={() => setIsPWAInstallModalOpen(false)}
            language={language}
          />
        )}

        {/* 6. In-App Popup Announcement Modal */}
        {isAnnouncementModalOpen && announcementQueue.length > 0 && (
          <AnnouncementModal
            queue={announcementQueue}
            userId={userProfile?.uid}
            onDismiss={() => {
              setIsAnnouncementModalOpen(false);
              setSessionDismissedAnnouncementIds((prev) => [
                ...prev,
                ...announcementQueue.map((a) => a.id),
              ]);
              setAnnouncementQueue([]);
            }}
          />
        )}
      </Suspense>
    </DeviceFrame>
  );
}
