import React, { useState, useEffect } from 'react';
import { Language, NavigationTab } from '../domain/models';
import {
  Bell,
  Calendar,
  MessageSquare,
  Clock,
  Globe,
  Palette,
  Sparkles,
  RefreshCw,
  Info,
  Sliders,
  Database,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FolderArchive,
  CloudUpload,
  Smartphone,
  Copy,
  Check,
  ShieldCheck,
  Scale,
  LogIn,
  Loader2,
} from 'lucide-react';
import { syncWithGoogleCalendar } from '../services/googleCalendarService';
import {
  auth,
  testFirestoreConnection,
} from '../services/firebaseClient';
import {
  googleSignIn,
  logoutGoogle,
  requestCalendarAccess,
  logoutCalendar,
  subscribeCalendarAuth,
  getCalendarAuthState,
  CalendarAuthState,
} from '../services/googleAuth';
import {
  getNotificationPermission,
  requestNotificationPermission,
  showNotification,
  NotificationPermissionState,
} from '../services/reminderNotificationService';
import {
  enablePushNotifications,
  getDevicePushStatus,
  sendTestPushNotification,
  DevicePushStatus,
} from '../services/pushNotificationService';
import { eventRepository } from '../data/eventRepository';
import {
  apiFetch,
  apiUrl,
  fetchTelegramStatus,
  RENDER_PRODUCTION_BACKEND_URL,
} from '../config/api';

interface SettingsViewProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenAbout: () => void;
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
  onResetData: () => void;
  onNavigateToTab?: (tab: NavigationTab) => void;
  onOpenInstallModal?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  language,
  onLanguageChange,
  onOpenAbout,
  onOpenPrivacy,
  onOpenTerms,
  onResetData,
  onNavigateToTab,
  onOpenInstallModal,
}) => {
  // Telegram Bot real status from server
  const [telegramStatus, setTelegramStatus] = useState<{
    configured: boolean;
    webhookUrl: string;
    totalMessagesReceived: number;
    lastReceived: string | null;
  }>({
    configured: false,
    webhookUrl: '',
    totalMessagesReceived: 0,
    lastReceived: null,
  });

  const derivePublicWebhookUrl = (serverWebhookUrl?: string): string => {
    // 1. If server already provided a valid non-localhost URL, use it
    if (serverWebhookUrl && !serverWebhookUrl.includes('localhost') && !serverWebhookUrl.includes('127.0.0.1')) {
      return serverWebhookUrl;
    }

    // 2. Client-side environment variable (if provided)
    const envPublicUrl = (import.meta as any).env?.VITE_PUBLIC_APP_URL || (import.meta as any).env?.VITE_APP_URL;
    if (envPublicUrl && !envPublicUrl.includes('localhost') && !envPublicUrl.includes('127.0.0.1')) {
      return `${envPublicUrl.replace(/\/$/, '')}/api/telegram/webhook`;
    }

    // 3. If running in browser and the origin is not localhost (e.g., deployed domain or Cloud Run)
    if (typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('127.0.0.1')) {
      return `${window.location.origin}/api/telegram/webhook`;
    }

    // 4. Default canonical production Render URL if valid
    if (RENDER_PRODUCTION_BACKEND_URL && !RENDER_PRODUCTION_BACKEND_URL.includes('localhost') && !RENDER_PRODUCTION_BACKEND_URL.includes('127.0.0.1')) {
      return `${RENDER_PRODUCTION_BACKEND_URL}/api/telegram/webhook`;
    }

    return '';
  };

  // Gemini AI real status
  const [geminiStatus, setGeminiStatus] = useState<{
    configured: boolean;
    model: string;
  }>({
    configured: false,
    model: 'gemini-3.8-flash (Auto-failover: gemini-3.1-flash-lite)',
  });

  // Google User & Calendar real state
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(
    auth.currentUser?.email || null
  );
  const [calendarAuth, setCalendarAuth] = useState<CalendarAuthState>(getCalendarAuthState());
  const [isAuthorizingCalendar, setIsAuthorizingCalendar] = useState(false);
  const [calendarAuthMessage, setCalendarAuthMessage] = useState<string | null>(null);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [calendarSyncResult, setCalendarSyncResult] = useState<string | null>(null);

  // Firestore status
  const [isFirestoreConnected, setIsFirestoreConnected] = useState(false);

  // Notification status
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(
    getNotificationPermission()
  );

  // Reminder preferences
  const [briefingTime, setBriefingTime] = useState('07:30');
  const [isBriefingEnabled, setIsBriefingEnabled] = useState(true);
  const [defaultReminder2h, setDefaultReminder2h] = useState(true);
  const [defaultReminder30m, setDefaultReminder30m] = useState(true);
  const [isCopiedWebhook, setIsCopiedWebhook] = useState(false);

  // Push Notification state
  const [devicePushStatus, setDevicePushStatus] = useState<DevicePushStatus | null>(null);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [testPushResult, setTestPushResult] = useState<string | null>(null);
  const [registeredDevicesCount, setRegisteredDevicesCount] = useState<number>(0);
  const [schedulerStatus, setSchedulerStatus] = useState<{ isRunning: boolean; lastTickAt: string | null } | null>(null);

  // Load live server statuses
  useEffect(() => {
    // 1. Fetch Telegram Bot status directly from server API (supports native Capacitor & web)
    fetchTelegramStatus()
      .then((tgData) => {
        setTelegramStatus({
          configured: tgData.configured,
          webhookUrl: derivePublicWebhookUrl(tgData.webhookUrl),
          totalMessagesReceived: tgData.totalMessagesReceived || tgData.processedCount || 0,
          lastReceived: tgData.lastReceived || null,
        });
      })
      .catch((err) => {
        console.warn('[Settings] Telegram status notice:', err);
      });

    // 2. Fetch comprehensive integration status
    apiFetch('/api/integrations/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.telegram) {
            setTelegramStatus((prev) => ({
              configured: Boolean(data.telegram.configured) || prev.configured,
              webhookUrl: derivePublicWebhookUrl(data.telegram.webhookUrl || prev.webhookUrl),
              totalMessagesReceived: data.telegram.totalMessagesReceived ?? data.telegram.recentCount ?? prev.totalMessagesReceived,
              lastReceived: data.telegram.lastMessageAt || data.telegram.lastReceived || prev.lastReceived,
            }));
          }
          if (data.gemini) {
            setGeminiStatus({
              configured: Boolean(data.gemini.configured),
              model: data.gemini.model || 'gemini-3.8-flash (Auto-failover)',
            });
          }
          if (data.firestore) {
            setIsFirestoreConnected(Boolean(data.firestore.connected));
          }
        }
      })
      .catch(() => {
        setTelegramStatus((prev) => ({
          ...prev,
          webhookUrl: derivePublicWebhookUrl(prev.webhookUrl),
        }));
      });

    // 3. Fetch Notification & Scheduler Status
    apiFetch('/api/notifications/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRegisteredDevicesCount(data.registeredDevicesCount || 0);
          setSchedulerStatus(data.scheduler || null);
        }
      })
      .catch(() => {});

    // 3. Check client device push status
    getDevicePushStatus().then((status) => {
      setDevicePushStatus(status);
    });

    // 4. Auth listener for Google Staff Account
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentUserEmail(user?.email || null);
    });

    // 5. Calendar Auth listener for Google Calendar
    const unsubscribeCal = subscribeCalendarAuth((state) => {
      setCalendarAuth(state);
    });

    // 6. Test Firestore directly
    testFirestoreConnection().then((connected) => {
      setIsFirestoreConnected(connected);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeCal();
    };
  }, []);

  const handleEnableFCM = async () => {
    setIsEnablingPush(true);
    setTestPushResult(null);
    try {
      const res = await enablePushNotifications();
      const updated = await getDevicePushStatus();
      setDevicePushStatus(updated);
      setNotificationPermission(updated.permission as any);
      if (res.success) {
        // Refresh registered device count
        apiFetch('/api/notifications/status')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d && typeof d.registeredDevicesCount === 'number') {
              setRegisteredDevicesCount(d.registeredDevicesCount);
            }
          })
          .catch(() => {});

        setTestPushResult(
          language === 'bn'
            ? 'এফসিএম পুশ নোটিফিকেশন সফলভাবে সক্রিয় হয়েছে!'
            : 'FCM Web Push successfully enabled!'
        );
      } else {
        setTestPushResult(res.error || 'বিজ্ঞপ্তি সক্রিয় করা সম্ভব হয়নি।');
      }
    } catch (err: any) {
      setTestPushResult(err?.message || 'Error enabling push');
    } finally {
      setIsEnablingPush(false);
    }
  };

  const handleSendServerTestPush = async () => {
    setIsSendingTestPush(true);
    setTestPushResult(null);
    try {
      const res = await sendTestPushNotification();
      setTestPushResult(res.message);
    } catch (err: any) {
      setTestPushResult(err?.message || 'Failed to dispatch test push');
    } finally {
      setIsSendingTestPush(false);
    }
  };

  const handleSaveReminderPreferences = async (
    updates: Partial<{
      dailyBriefingTime: string;
      dailyBriefingEnabled: boolean;
      defaultReminder2h: boolean;
      defaultReminder30m: boolean;
    }>
  ) => {
    const payload = {
      dailyBriefingTime: updates.dailyBriefingTime ?? briefingTime,
      dailyBriefingEnabled: updates.dailyBriefingEnabled ?? isBriefingEnabled,
      defaultReminder2h: updates.defaultReminder2h ?? defaultReminder2h,
      defaultReminder30m: updates.defaultReminder30m ?? defaultReminder30m,
    };

    try {
      await apiFetch('/api/settings/reminder-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[Settings] Save reminder preferences notice:', err);
    }
  };

  const handleCopyWebhook = () => {
    const url = derivePublicWebhookUrl(telegramStatus.webhookUrl);
    navigator.clipboard.writeText(url);
    setIsCopiedWebhook(true);
    setTimeout(() => setIsCopiedWebhook(false), 2000);
  };

  const handleGoogleSignInToggle = async () => {
    if (currentUserEmail) {
      await logoutGoogle();
      setCurrentUserEmail(null);
    } else {
      try {
        const res = await googleSignIn();
        if (res?.user?.email) {
          setCurrentUserEmail(res.user.email);
        }
      } catch (err: any) {
        if (err?.message !== 'POPUP_CLOSED') {
          alert(err?.message || 'Google Sign-in was cancelled or blocked.');
        }
      }
    }
  };

  const handleConnectCalendar = async () => {
    setIsAuthorizingCalendar(true);
    setCalendarAuthMessage(null);
    try {
      await requestCalendarAccess('consent');
      setCalendarAuthMessage(
        language === 'bn'
          ? 'গুগল ক্যালেন্ডার পারমিশন সফলভাবে অনুমোদিত ও যাচাই হয়েছে!'
          : 'Google Calendar successfully authorized and verified!'
      );
    } catch (err: any) {
      console.warn('[SettingsView] Calendar auth error:', err);
      if (err?.message === 'POPUP_CLOSED') {
        setCalendarAuthMessage(
          language === 'bn'
            ? 'পপআপ বন্ধ করা হয়েছে। কানেক্ট করতে পুনরায় চেষ্টা করুন।'
            : 'Popup window closed before completion. Please retry.'
        );
      } else if (err?.message === 'POPUP_BLOCKED') {
        setCalendarAuthMessage(
          language === 'bn'
            ? 'ব্রাউজার পপআপ আটকে দিয়েছে। ব্রাউজার বারে Popups Allow করুন।'
            : 'Popup was blocked by browser. Please allow popups for this site.'
        );
      } else {
        setCalendarAuthMessage(
          err?.message || (language === 'bn' ? 'ক্যালেন্ডার অনুমোদন ব্যর্থ হয়েছে।' : 'Calendar authorization failed.')
        );
      }
    } finally {
      setIsAuthorizingCalendar(false);
    }
  };

  const handleDisconnectCalendar = () => {
    logoutCalendar();
    setCalendarAuthMessage(
      language === 'bn' ? 'গুগল ক্যালেন্ডার ডিসকানেক্ট করা হয়েছে।' : 'Google Calendar disconnected.'
    );
  };

  const handleCalendarSyncNow = async () => {
    if (!calendarAuth.isAuthorized) {
      setCalendarAuthMessage(
        language === 'bn'
          ? 'গুগল ক্যালেন্ডার সিঙ্কের পূর্বে ক্যালেন্ডার পারমিশন কানেক্ট করুন।'
          : 'Please connect and authorize Google Calendar before syncing.'
      );
      return;
    }
    setIsCalendarSyncing(true);
    setCalendarSyncResult(null);
    try {
      const res = await syncWithGoogleCalendar();
      setCalendarSyncResult(
        language === 'bn'
          ? `সিঙ্ক সম্পন্ন! এক্সপোর্ট: ${res.exportedCount}টি, ইমপোর্ট: ${res.importedCount}টি`
          : `Sync completed! Exported: ${res.exportedCount}, Imported: ${res.importedCount}`
      );
    } catch (err: any) {
      setCalendarSyncResult(
        language === 'bn'
          ? `সিঙ্ক ব্যর্থ: ${err?.message || 'পুনরায় ক্যালেন্ডার কানেক্ট করুন'}`
          : `Sync failed: ${err?.message || 'Please reconnect Google Calendar'}`
      );
    } finally {
      setIsCalendarSyncing(false);
    }
  };

  const handleRequestNotification = async () => {
    const perm = await requestNotificationPermission();
    setNotificationPermission(perm);
  };

  const handleTestNotification = () => {
    showNotification('JpMC Synapse টেস্ট রিমাইন্ডার', {
      body: 'জামালপুর মেডিকেল কলেজ: পরীক্ষা নিয়ন্ত্রণ কমিটির প্রস্তুতিমূলক সভা (বেলা ১১:৩০)।',
    });
  };

  return (
    <div id="settings-view" className="space-y-4 pb-20">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">
          {language === 'bn' ? 'সেটিংস ও প্রডাকশন কনফিগারেশন' : 'Settings & Production Integrations'}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {language === 'bn'
            ? 'টেলিগ্রাম ওয়েবহুক, গুগল ক্যালেন্ডার, ফায়ারস্টোর ক্লাউড এবং রিমাইন্ডার'
            : 'Configure real Telegram webhook, Google Calendar, Cloud Firestore & notifications'}
        </p>
      </div>

      {/* 1. Real Connectivity Status Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span>{language === 'bn' ? 'সরাসরি ক্লাউড ও এআই ডাটা সোর্স' : 'Live Cloud & AI Integrations'}</span>
        </h3>

        {/* Gemini AI Notice Extractor */}
        <div className="py-2.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'জেমিনি এআই নোটিশ এক্সট্রাক্টর' : 'Gemini AI Extractor'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {geminiStatus.configured
                  ? `${geminiStatus.model} • ${language === 'bn' ? 'সার্ভার-সাইড সক্রিয়' : 'Server-side ready'}`
                  : language === 'bn'
                  ? 'GEMINI_API_KEY কনফিগারেশন প্রয়োজন'
                  : 'GEMINI_API_KEY missing in environment'}
              </p>
            </div>
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              geminiStatus.configured
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {geminiStatus.configured
              ? language === 'bn'
                ? 'সক্রিয় ✓'
                : 'Active'
              : language === 'bn'
              ? 'কী বাকি'
              : 'Key Needed'}
          </span>
        </div>

        {/* Telegram Webhook Real Status */}
        <div className="py-2.5 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  {language === 'bn' ? 'টেলিগ্রাম ওয়েবহুক (Telegram Ingestion)' : 'Telegram Bot Ingestion'}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {telegramStatus.configured
                    ? language === 'bn'
                      ? 'টোকেন সক্রিয় • মেসেজ গৃহীত: ' + telegramStatus.totalMessagesReceived
                      : 'Token active • Messages received: ' + telegramStatus.totalMessagesReceived
                    : language === 'bn'
                    ? 'টোকেন সেট করা হয়নি (TELEGRAM_BOT_TOKEN)'
                    : 'Awaiting bot token (TELEGRAM_BOT_TOKEN)'}
                </p>
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                telegramStatus.configured
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {telegramStatus.configured
                ? language === 'bn'
                  ? 'সক্রিয় ✓'
                  : 'Active'
                : language === 'bn'
                ? 'টোকেন বাকি'
                : 'Pending'}
            </span>
          </div>

          {/* Webhook endpoint copy row */}
          {(() => {
            const webhookUrl = derivePublicWebhookUrl(telegramStatus.webhookUrl);
            return (
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between text-[11px]">
                <span className={`font-mono truncate mr-2 ${webhookUrl ? 'text-slate-600' : 'text-amber-700 italic'}`}>
                  {webhookUrl || (language === 'bn' ? 'পাবলিক হোস্ট ইউআরএল কনফিগার করা হয়নি' : 'Public host URL not configured')}
                </span>
                {webhookUrl && (
                  <button
                    onClick={handleCopyWebhook}
                    className="flex items-center gap-1 font-semibold text-[#006A60] bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs shrink-0 cursor-pointer hover:bg-slate-50"
                  >
                    {isCopiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{isCopiedWebhook ? (language === 'bn' ? 'কপি হয়েছে' : 'Copied') : (language === 'bn' ? 'কপি' : 'Copy')}</span>
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Staff Google Institutional Account (Firebase Auth) */}
        <div className="py-2.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'প্রাতিষ্ঠানিক অ্যাকাউন্ট (Staff Account)' : 'Institutional Staff Account'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {currentUserEmail
                  ? `${currentUserEmail} • ${language === 'bn' ? 'অনুমোদিত স্টাফ' : 'Authorized Staff'}`
                  : language === 'bn'
                  ? 'কোন অ্যাকাউন্ট সাইন ইন করা নেই'
                  : 'No account signed in'}
              </p>
            </div>
          </div>

          <button
            onClick={handleGoogleSignInToggle}
            className={`text-xs font-semibold px-3 py-1 rounded-full border transition cursor-pointer ${
              currentUserEmail
                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
            }`}
          >
            {currentUserEmail
              ? language === 'bn'
                ? 'লগআউট'
                : 'Sign out'
              : language === 'bn'
              ? 'গুগল সাইন ইন'
              : 'Sign in with Google'}
          </button>
        </div>

        {/* Google Calendar Real OAuth & Sync */}
        <div className="py-2.5 border-b border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  {language === 'bn' ? 'গুগল ক্যালেন্ডার (Google Calendar API)' : 'Google Calendar API'}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {calendarAuth.status === 'connected'
                    ? `${calendarAuth.email || 'Primary Calendar'} • ${
                        language === 'bn' ? 'অনুমোদিত ও যাচাইকৃত' : 'Authorized & verified'
                      }`
                    : calendarAuth.status === 'checking'
                    ? language === 'bn'
                      ? 'যাচাই করা হচ্ছে...'
                      : 'Verifying calendar access...'
                    : calendarAuth.status === 'error'
                    ? calendarAuth.errorMessage || (language === 'bn' ? 'অনুমোদনে ত্রুটি' : 'Authorization error')
                    : language === 'bn'
                    ? 'ক্যালেন্ডার পারমিশন প্রয়োজন (calendar.events)'
                    : 'Awaiting calendar.events scope'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  calendarAuth.status === 'connected'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : calendarAuth.status === 'checking'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                {calendarAuth.status === 'connected'
                  ? language === 'bn'
                    ? 'সংযুক্ত ✓'
                    : 'Connected'
                  : calendarAuth.status === 'checking'
                  ? language === 'bn'
                    ? 'যাচাই হচ্ছে...'
                    : 'Checking...'
                  : language === 'bn'
                  ? 'অনুমোদন বাকি'
                  : 'Not Connected'}
              </span>

              {calendarAuth.isAuthorized ? (
                <button
                  onClick={handleDisconnectCalendar}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  {language === 'bn' ? 'ডিসকানেক্ট' : 'Disconnect'}
                </button>
              ) : (
                <button
                  onClick={handleConnectCalendar}
                  disabled={isAuthorizingCalendar}
                  className="text-xs font-semibold px-3 py-1 rounded-full border border-teal-600 bg-[#006A60] hover:bg-teal-700 text-white shadow-2xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  {isAuthorizingCalendar && <Loader2 className="w-3 h-3 animate-spin" />}
                  <span>
                    {isAuthorizingCalendar
                      ? language === 'bn'
                        ? 'অনুমোদন হচ্ছে...'
                        : 'Connecting...'
                      : language === 'bn'
                      ? 'ক্যালেন্ডার কানেক্ট'
                      : 'Connect Calendar'}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Sync actions & result message */}
          {calendarAuth.isAuthorized && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={handleCalendarSyncNow}
                disabled={isCalendarSyncing}
                className="flex items-center gap-1.5 text-xs bg-[#006A60] hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-xl shadow-2xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCalendarSyncing ? 'animate-spin' : ''}`} />
                <span>
                  {isCalendarSyncing
                    ? language === 'bn'
                      ? 'ক্যালেন্ডার সিঙ্ক হচ্ছে...'
                      : 'Syncing Calendar...'
                    : language === 'bn'
                    ? 'গুগল ক্যালেন্ডারে সিঙ্ক করুন'
                    : 'Sync with Google Calendar'}
                </span>
              </button>

              {calendarSyncResult && (
                <span className="text-[11px] text-teal-800 font-medium">
                  {calendarSyncResult}
                </span>
              )}
            </div>
          )}

          {calendarAuthMessage && (
            <div className="p-2 rounded-lg bg-teal-50/80 border border-teal-200 text-teal-900 text-[11px]">
              {calendarAuthMessage}
            </div>
          )}
        </div>

        {/* Firestore Database Status */}
        <div className="flex items-center justify-between py-2 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'ক্লাউড ফায়ারস্টোর (Cloud Firestore)' : 'Cloud Firestore'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {isFirestoreConnected
                  ? language === 'bn'
                    ? 'রিয়েলটাইম সিঙ্ক সক্রিয় (Collections: events, telegram)'
                    : 'Real-time database sync active'
                  : language === 'bn'
                  ? 'লোকাল ক্যাশ মোড'
                  : 'Local cache fallback'}
              </p>
            </div>
          </div>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              isFirestoreConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            {isFirestoreConnected
              ? language === 'bn'
                ? 'সংযুক্ত ✓'
                : 'Connected'
              : language === 'bn'
              ? 'ক্যাশ মোড'
              : 'Offline Cache'}
          </span>
        </div>

        {/* Google Drive Archive */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <FolderArchive className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'গুগল ড্রাইভ ব্যাকআপ (Google Drive)' : 'Google Drive Backup'}
              </h4>
              <p className="text-[11px] text-slate-500">
                {language === 'bn'
                  ? 'প্রতিদিনের অতীত কর্মসূচির ক্লাউড ড্রাইভ আর্কাইভ'
                  : 'Automated daily backup of event records'}
              </p>
            </div>
          </div>
          {onNavigateToTab ? (
            <button
              onClick={() => onNavigateToTab('history')}
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-teal-200 bg-teal-50 text-[#006A60] hover:bg-teal-100 transition cursor-pointer flex items-center gap-1"
            >
              <CloudUpload className="w-3 h-3" />
              <span>{language === 'bn' ? 'ড্রাইভ ভিউ' : 'Manage'}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Real Web/PWA Notification Architecture (Replacing fake AlarmManager) */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-teal-700" />
            <span>{language === 'bn' ? 'পুশ নোটিফিকেশন সেটিংস' : 'Push Notifications'}</span>
          </span>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
              notificationPermission === 'granted'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : notificationPermission === 'denied'
                ? 'bg-rose-100 text-rose-900 border border-rose-300'
                : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}
          >
            {notificationPermission === 'granted'
              ? (language === 'bn' ? 'অনুমোদিত (Granted)' : 'Granted')
              : notificationPermission === 'denied'
              ? (language === 'bn' ? 'অস্বীকৃত (Denied)' : 'Denied')
              : (language === 'bn' ? 'অনুরোধ করা হয়নি (Not Enabled)' : 'Not Enabled')}
          </span>
        </h3>

        <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200/80 space-y-3">
          <div>
            <h4 className="font-bold text-teal-950">
              {language === 'bn' ? 'ব্রাউজার ও পিডব্লিউএ পুশ রিমাইন্ডার' : 'Browser & PWA Web Push Alerts'}
            </h4>
            <p className="text-[11px] text-teal-800">
              {language === 'bn'
                ? 'অ্যাপ বা ব্রাউজার বন্ধ থাকলেও সার্ভার ব্যাকগ্রাউন্ড থেকে ২ ঘণ্টা ও ৩০ মিনিট পূর্বে বিজ্ঞপ্তি পাঠাবে।'
                : 'Delivers background push alerts 2h & 30m before meetings even when app/browser is closed.'}
            </p>
          </div>

          {/* Status Presentation Grid */}
          <div className="bg-white/90 rounded-xl p-2.5 border border-teal-200/70 text-[11px] text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500">
                {language === 'bn' ? 'পারমিশন:' : 'Permission:'}
              </span>
              <span className={`font-semibold ${
                notificationPermission === 'granted'
                  ? 'text-emerald-700'
                  : notificationPermission === 'denied'
                  ? 'text-rose-700'
                  : 'text-amber-700'
              }`}>
                {notificationPermission === 'granted'
                  ? 'Granted'
                  : notificationPermission === 'denied'
                  ? 'Denied'
                  : 'Not Enabled'}
              </span>
            </div>

            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500">
                {language === 'bn' ? 'ডিভাইস রেজিস্ট্রেশন:' : 'Device Registration:'}
              </span>
              <span className={`font-semibold ${
                devicePushStatus?.hasToken && notificationPermission === 'granted'
                  ? 'text-emerald-700'
                  : 'text-slate-600'
              }`}>
                {devicePushStatus?.hasToken && notificationPermission === 'granted'
                  ? (language === 'bn' ? 'নিবন্ধিত (Registered)' : 'Registered')
                  : (language === 'bn' ? 'অনিবন্ধিত (Not Registered)' : 'Not Registered')}
              </span>
            </div>

            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500">
                {language === 'bn' ? 'পুশ সার্ভিস:' : 'Push Service:'}
              </span>
              <span className={`font-semibold ${
                devicePushStatus?.hasToken && notificationPermission === 'granted'
                  ? 'text-emerald-700'
                  : 'text-amber-700'
              }`}>
                {devicePushStatus?.hasToken && notificationPermission === 'granted'
                  ? (language === 'bn' ? 'সক্রিয় (Active)' : 'Active')
                  : (language === 'bn' ? 'কনফিগারেশন প্রয়োজন' : 'Configuration Required')}
              </span>
            </div>

            <div className="flex items-center justify-between py-0.5">
              <span className="text-slate-500">
                {language === 'bn' ? 'নিবন্ধিত পুশ ডিভাইস:' : 'Registered Push Devices:'}
              </span>
              <span className="font-semibold text-slate-800">
                {registeredDevicesCount > 0
                  ? (language === 'bn' ? `${registeredDevicesCount}টি ডিভাইস` : `${registeredDevicesCount} device(s)`)
                  : (language === 'bn' ? '০টি ডিভাইস' : '0 devices')}
              </span>
            </div>

            <div className="flex items-center justify-between py-0.5 sm:col-span-2 text-[10px] text-slate-400 font-mono border-t border-slate-100 pt-1">
              <span>Platform: {devicePushStatus?.platform?.toUpperCase() || 'WEB'}</span>
              <span className="truncate max-w-[200px]">ID: {devicePushStatus?.deviceId || 'dev-local'}</span>
            </div>
          </div>

          {/* FCM Push Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {notificationPermission !== 'granted' ? (
              <button
                onClick={handleEnableFCM}
                disabled={isEnablingPush || notificationPermission === 'denied'}
                className="bg-[#006A60] hover:bg-teal-700 disabled:opacity-50 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition cursor-pointer text-xs flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>
                  {isEnablingPush
                    ? (language === 'bn' ? 'সক্রিয় হচ্ছে...' : 'Activating...')
                    : (language === 'bn' ? 'নোটিফিকেশন সক্রিয় করুন' : 'Enable Notifications')}
                </span>
              </button>
            ) : !devicePushStatus?.hasToken ? (
              <button
                onClick={handleEnableFCM}
                disabled={isEnablingPush}
                className="bg-[#006A60] hover:bg-teal-700 disabled:opacity-50 text-white font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition cursor-pointer text-xs flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>
                  {isEnablingPush
                    ? (language === 'bn' ? 'টোকেন প্রস্তুত হচ্ছে...' : 'Registering Token...')
                    : (language === 'bn' ? 'টোকেন নিবন্ধন করুন' : 'Register Push Token')}
                </span>
              </button>
            ) : (
              <button
                onClick={handleSendServerTestPush}
                disabled={isSendingTestPush}
                className="bg-white hover:bg-teal-50 text-[#006A60] border border-teal-300 font-bold px-3.5 py-1.5 rounded-lg shadow-2xs transition cursor-pointer text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSendingTestPush ? 'animate-spin' : ''}`} />
                <span>
                  {isSendingTestPush
                    ? (language === 'bn' ? 'টেস্ট পুশ পাঠানো হচ্ছে...' : 'Sending Push...')
                    : (language === 'bn' ? 'সার্ভার পুশ নোটিফিকেশন পরীক্ষা' : 'Send Test Server Push')}
                </span>
              </button>
            )}

            <button
              onClick={handleTestNotification}
              className="bg-teal-100/70 hover:bg-teal-200 text-teal-900 border border-teal-300/80 font-medium px-2.5 py-1.5 rounded-lg text-xs transition"
            >
              {language === 'bn' ? 'লোকাল চিম সাউন্ড' : 'Local Sound Chime'}
            </button>
          </div>

          {notificationPermission === 'denied' && (
            <p className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
              {language === 'bn'
                ? 'ব্রাউজার সেটিংসে নোটিফিকেশন বন্ধ রয়েছে। শিডিউল সতর্কবার্তা পেতে ক্রোম বা ব্রাউজারের সাইট সেটিংস থেকে নোটিফিকেশন অ্যালাও করুন।'
                : 'Notifications are blocked in your browser. To receive meeting alerts, please allow notifications for this site in your browser site settings.'}
            </p>
          )}

          {testPushResult && (
            <div className="p-2.5 bg-white rounded-lg border border-teal-300 text-xs text-teal-950 font-medium shadow-2xs">
              {testPushResult}
            </div>
          )}
        </div>

        {/* Morning Briefing Row */}
        <div className="flex items-center justify-between py-1">
          <div>
            <h4 className="font-bold text-slate-800">
              {language === 'bn' ? 'দৈনিক সকাল ০৭:৩০ ব্রিফিং' : 'Daily 07:30 Morning Briefing'}
            </h4>
            <p className="text-[11px] text-slate-500">
              {language === 'bn'
                ? 'আজকের সকল কর্মসূচির সারসংক্ষেপ এআই ব্রিফিং'
                : 'Automated morning schedule summary for Asia/Dhaka'}
            </p>
          </div>
          <input
            type="checkbox"
            checked={isBriefingEnabled}
            onChange={(e) => {
              setIsBriefingEnabled(e.target.checked);
              handleSaveReminderPreferences({ dailyBriefingEnabled: e.target.checked });
            }}
            className="w-4 h-4 text-teal-600 rounded cursor-pointer"
          />
        </div>

        {isBriefingEnabled && (
          <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="font-medium text-slate-700">
              {language === 'bn' ? 'ব্রিফিংয়ের সময় (Time)' : 'Briefing Time'}
            </span>
            <input
              type="time"
              value={briefingTime}
              onChange={(e) => {
                setBriefingTime(e.target.value);
                handleSaveReminderPreferences({ dailyBriefingTime: e.target.value });
              }}
              className="text-xs bg-white px-2 py-1 rounded-lg border border-slate-300 font-bold text-teal-800"
            />
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <span className="font-bold text-slate-700 block mb-2">
            {language === 'bn' ? 'ডিফল্ট ইভেন্ট অ্যালার্ম:' : 'Default Event Reminders:'}
          </span>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={defaultReminder2h}
                onChange={(e) => {
                  setDefaultReminder2h(e.target.checked);
                  handleSaveReminderPreferences({ defaultReminder2h: e.target.checked });
                }}
                className="w-4 h-4 text-teal-600 rounded"
              />
              <span className="text-slate-700">
                {language === 'bn' ? 'কর্মসূচির ২ ঘণ্টা পূর্বে নোটিফিকেশন ও চিম' : '2 hours before meeting (Notification & Chime)'}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={defaultReminder30m}
                onChange={(e) => {
                  setDefaultReminder30m(e.target.checked);
                  handleSaveReminderPreferences({ defaultReminder30m: e.target.checked });
                }}
                className="w-4 h-4 text-teal-600 rounded"
              />
              <span className="text-slate-700">
                {language === 'bn' ? 'কর্মসূচির ৩০ মিনিট পূর্বে চূড়ান্ত অ্যালার্ম' : '30 minutes before meeting (Final Alert)'}
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* 3. General Preferences: Language & Theme */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-teal-700" />
          <span>{language === 'bn' ? 'অ্যাপ পছন্দ ও ভাষা' : 'App Preferences'}</span>
        </h3>

        <div className="flex items-center justify-between py-1 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-800">
              {language === 'bn' ? 'ভাষা (Language)' : 'Language'}
            </span>
          </div>
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => onLanguageChange('bn')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                language === 'bn' ? 'bg-[#006A60] text-white shadow-xs' : 'text-slate-600'
              }`}
            >
              বাংলা
            </button>
            <button
              onClick={() => onLanguageChange('en')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                language === 'en' ? 'bg-[#006A60] text-white shadow-xs' : 'text-slate-600'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-slate-500" />
            <span className="font-medium text-slate-800">
              {language === 'bn' ? 'থিম (Theme)' : 'Theme'}
            </span>
          </div>
          <span className="text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg font-medium">
            M3 Medical Teal (Light)
          </span>
        </div>
      </div>

      {/* 4. About App & Reset */}
      <div className="space-y-2">
        <button
          onClick={onOpenAbout}
          className="w-full bg-white hover:bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between text-left transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'অ্যাপ সম্পর্কে (About JpMC Synapse)' : 'About JpMC Synapse'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Developed by Abdullah Al Maruf • Jamalpur Medical College
              </p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => {
            if (onOpenTerms) {
              onOpenTerms();
            } else {
              window.history.pushState(null, '', '/terms');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          className="w-full bg-white hover:bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between text-left transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'ব্যবহারের শর্তাবলী (Terms of Service)' : 'Terms of Service'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Institutional usage rules, Google Sign-In & authorized activity guidelines
              </p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => {
            if (onOpenPrivacy) {
              onOpenPrivacy();
            } else {
              window.history.pushState(null, '', '/privacy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          className="w-full bg-white hover:bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between text-left transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-800">
                {language === 'bn' ? 'গোপনীয়তা নীতি (Privacy Policy)' : 'Privacy Policy'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Data handling, Google Sign-In & institutional privacy terms
              </p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-400" />
        </button>

        <button
          onClick={() => {
            if (
              window.confirm(
                language === 'bn'
                  ? 'আপনি কি ডেমো ডাটা পুনরায় প্রাথমিক অবস্থায় রিসেট করতে চান?'
                  : 'Do you want to reset demo data back to default?'
              )
            ) {
              onResetData();
            }
          }}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <Database className="w-3.5 h-3.5 text-slate-500" />
          <span>{language === 'bn' ? 'নমুনা ডাটা রিসেট করুন' : 'Reset Sample Data'}</span>
        </button>
      </div>
    </div>
  );
};
