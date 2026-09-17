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
  LogIn,
} from 'lucide-react';
import { syncWithGoogleCalendar } from '../services/googleCalendarService';
import {
  auth,
  testFirestoreConnection,
} from '../services/firebaseClient';
import {
  googleSignIn,
  logoutGoogle,
  hasCachedGoogleAuth,
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

interface SettingsViewProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onOpenAbout: () => void;
  onResetData: () => void;
  onNavigateToTab?: (tab: NavigationTab) => void;
  onOpenInstallModal?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  language,
  onLanguageChange,
  onOpenAbout,
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

  // Gemini AI real status
  const [geminiStatus, setGeminiStatus] = useState<{
    configured: boolean;
    model: string;
  }>({
    configured: false,
    model: 'gemini-2.5-flash',
  });

  // Google User & Calendar real state
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(
    auth.currentUser?.email || null
  );
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
    // 1. Fetch comprehensive integration status
    fetch('/api/integrations/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          if (data.telegram) {
            setTelegramStatus({
              configured: Boolean(data.telegram.configured),
              webhookUrl: data.telegram.webhookUrl || `${window.location.origin}/api/telegram/webhook`,
              totalMessagesReceived: data.telegram.recentCount || 0,
              lastReceived: data.telegram.lastMessageAt || null,
            });
          }
          if (data.gemini) {
            setGeminiStatus({
              configured: Boolean(data.gemini.configured),
              model: data.gemini.model || 'gemini-2.5-flash',
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
          webhookUrl: `${window.location.origin}/api/telegram/webhook`,
        }));
      });

    // 2. Fetch Notification & Scheduler Status
    fetch('/api/notifications/status')
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

    // 4. Auth listener for Google
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setCurrentUserEmail(user?.email || null);
    });

    // 5. Test Firestore directly
    testFirestoreConnection().then((connected) => {
      setIsFirestoreConnected(connected);
    });

    return () => unsubscribeAuth();
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
      await fetch('/api/settings/reminder-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[Settings] Save reminder preferences notice:', err);
    }
  };

  const handleCopyWebhook = () => {
    const url = telegramStatus.webhookUrl || `${window.location.origin}/api/telegram/webhook`;
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
        alert(err?.message || 'Google Sign-in was cancelled or blocked.');
      }
    }
  };

  const handleCalendarSyncNow = async () => {
    if (!currentUserEmail) {
      alert(
        language === 'bn'
          ? 'গুগল ক্যালেন্ডার সিঙ্কের পূর্বে আপনার গুগল অ্যাকাউন্টে সাইন ইন করুন।'
          : 'Please sign in with Google first before syncing.'
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
          ? `সিঙ্ক ব্যর্থ: ${err?.message || 'অনুগ্রহ করে পুনরায় সাইন ইন করুন'}`
          : `Sync failed: ${err?.message || 'Please sign in again'}`
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
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between text-[11px]">
            <span className="font-mono text-slate-600 truncate mr-2">
              {telegramStatus.webhookUrl || `${window.location.origin}/api/telegram/webhook`}
            </span>
            <button
              onClick={handleCopyWebhook}
              className="flex items-center gap-1 font-semibold text-[#006A60] bg-white px-2 py-1 rounded border border-slate-200 shadow-2xs shrink-0 cursor-pointer hover:bg-slate-50"
            >
              {isCopiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{isCopiedWebhook ? (language === 'bn' ? 'কপি হয়েছে' : 'Copied') : (language === 'bn' ? 'কপি' : 'Copy')}</span>
            </button>
          </div>
        </div>

        {/* Google Calendar Real OAuth & Sync */}
        <div className="py-2.5 border-b border-slate-100 space-y-2">
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
                  {currentUserEmail
                    ? currentUserEmail
                    : language === 'bn'
                    ? 'কানেক্ট করা হয়নি (লগইন প্রয়োজন)'
                    : 'Not connected (Sign in required)'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGoogleSignInToggle}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition cursor-pointer ${
                  currentUserEmail
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {currentUserEmail
                  ? language === 'bn'
                    ? 'লগআউট'
                    : 'Logout'
                  : language === 'bn'
                  ? 'গুগল লগইন'
                  : 'Sign in'}
              </button>
            </div>
          </div>

          {currentUserEmail && (
            <div className="flex items-center justify-between pt-1">
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
            <span>{language === 'bn' ? 'রিমাইন্ডার ও নোটিফিকেশন সিস্টেম' : 'Real Reminder & Notification Engine'}</span>
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              notificationPermission === 'granted'
                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                : notificationPermission === 'denied'
                ? 'bg-rose-100 text-rose-900 border border-rose-300'
                : 'bg-amber-100 text-amber-900 border border-amber-300'
            }`}
          >
            {notificationPermission === 'granted'
              ? language === 'bn'
                ? 'অনুমোদিত (Granted)'
                : 'Granted'
              : notificationPermission === 'denied'
              ? language === 'bn'
                ? 'অস্বীকৃত (Denied)'
                : 'Denied'
              : language === 'bn'
              ? 'অনুরোধ প্রয়োজন'
              : 'Prompt Required'}
          </span>
        </h3>

        <div className="p-3 bg-teal-50/60 rounded-xl border border-teal-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-teal-950 flex items-center gap-1.5">
                <span>{language === 'bn' ? 'ব্রাউজার ও পিডব্লিউএ পুশ নোটিফিকেশন' : 'Browser & PWA Notifications'}</span>
                {devicePushStatus?.hasToken && (
                  <span className="text-[10px] bg-teal-200 text-teal-900 font-bold px-1.5 py-0.2 rounded-full">
                    FCM Active
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-teal-800">
                {language === 'bn'
                  ? 'অ্যাপ বা ব্রাউজার বন্ধ থাকলেও সার্ভার ব্যাকগ্রাউন্ড থেকে ২ ঘণ্টা ও ৩০ মিনিট পূর্বে বিজ্ঞপ্তি পাঠাবে।'
                  : 'Delivers background push alerts 2h & 30m before meetings even when app/browser is closed.'}
              </p>
            </div>
          </div>

          {/* FCM Push Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-teal-200/60">
            {!devicePushStatus?.hasToken ? (
              <button
                onClick={handleEnableFCM}
                disabled={isEnablingPush}
                className="bg-[#006A60] hover:bg-teal-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg shadow-2xs transition cursor-pointer text-xs flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>
                  {isEnablingPush
                    ? language === 'bn'
                      ? 'টোকেন সংযুক্ত হচ্ছে...'
                      : 'Activating...'
                    : language === 'bn'
                    ? 'এফসিএম পুশ সক্রিয় করুন'
                    : 'Enable FCM Web Push'}
                </span>
              </button>
            ) : (
              <button
                onClick={handleSendServerTestPush}
                disabled={isSendingTestPush}
                className="bg-white hover:bg-teal-50 text-[#006A60] border border-teal-300 font-bold px-3 py-1.5 rounded-lg shadow-2xs transition cursor-pointer text-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSendingTestPush ? 'animate-spin' : ''}`} />
                <span>
                  {isSendingTestPush
                    ? language === 'bn'
                      ? 'টেস্ট পুশ পাঠানো হচ্ছে...'
                      : 'Sending Push...'
                    : language === 'bn'
                    ? 'সার্ভার পুশ নোটিফিকেশন পরীক্ষা'
                    : 'Send Test Server Push'}
                </span>
              </button>
            )}

            <button
              onClick={handleTestNotification}
              className="bg-teal-100/70 hover:bg-teal-200 text-teal-900 border border-teal-300/80 font-medium px-2.5 py-1.5 rounded-lg text-xs"
            >
              {language === 'bn' ? 'লোকাল চিম সাউন্ড' : 'Local Sound Chime'}
            </button>
          </div>

          {/* Live Device & Scheduler Info */}
          <div className="bg-white/80 rounded-lg p-2 border border-teal-200/60 text-[11px] text-slate-600 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">
                {language === 'bn' ? 'সার্ভার শিডিউলার মোড:' : 'Scheduler Mode:'}
              </span>
              <span className="font-bold text-teal-800">
                {schedulerStatus?.isRunning
                  ? (language === 'bn' ? 'ইন-প্রসেস টিক সক্রিয়' : 'In-Process Tick Active')
                  : (language === 'bn' ? 'গুগল ক্লাউড শিডিউলার প্রস্তুত' : 'Google Cloud Scheduler Ready')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">
                {language === 'bn' ? 'নিবন্ধিত পুশ ডিভাইস:' : 'Registered Push Devices:'}
              </span>
              <span className="font-semibold text-slate-700">
                {registeredDevicesCount > 0
                  ? (language === 'bn' ? `${registeredDevicesCount}টি ডিভাইস` : `${registeredDevicesCount} device(s)`)
                  : (language === 'bn' ? 'কোনো ডিভাইস নেই' : '0 devices')}
              </span>
            </div>
            {devicePushStatus?.deviceId && (
              <div className="text-[10px] text-slate-400 font-mono truncate">
                Device: {devicePushStatus.deviceId}
              </div>
            )}
          </div>

          {testPushResult && (
            <div className="p-2 bg-white rounded-lg border border-teal-300 text-xs text-teal-900 font-medium">
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

      {/* 4. App Installation & Deployment */}
      {onOpenInstallModal && (
        <button
          onClick={onOpenInstallModal}
          className="w-full bg-gradient-to-r from-teal-900 to-[#004D40] text-white p-4 rounded-2xl shadow-xs flex items-center justify-between text-left transition hover:opacity-95 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-xs text-amber-300 flex items-center justify-center border border-white/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-white">
                  {language === 'bn'
                    ? 'অ্যাপ ইনস্টলেশন (Android APK / iPhone / Desktop)'
                    : 'Install App (Android APK, iPhone, Desktop & GitHub)'}
                </h4>
                <span className="text-[10px] bg-amber-400 text-slate-900 font-bold px-1.5 py-0.2 rounded-full">
                  PWA
                </span>
              </div>
              <p className="text-[11px] text-teal-100 mt-0.5">
                {language === 'bn'
                  ? 'ফোনে বা কম্পিউটারে স্বতন্ত্র অ্যাপ্লিকেশন হিসেবে ব্যবহারের পূর্ণ নির্দেশিকা'
                  : 'Step-by-step guide to install natively or deploy to GitHub'}
              </p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-teal-200" />
        </button>
      )}

      {/* 5. About App & Reset */}
      <div className="space-y-2">
        <button
          onClick={onOpenAbout}
          className="w-full bg-white hover:bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between text-left transition"
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
