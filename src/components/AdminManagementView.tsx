import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  Send,
  Bell,
  Clock,
  ExternalLink,
  Bot,
  Sliders,
  Check,
  X,
  Loader2,
  Megaphone,
  Sparkles,
  FolderArchive,
  MessageSquare,
  HardDrive,
} from 'lucide-react';
import { EventEntity, Language } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';
import { ReviewCenterView } from './ReviewCenterView';
import { AnnouncementManagerView } from './AnnouncementManagerView';
import { TelegramTextToMeeting } from './TelegramTextToMeeting';
import { EventHistoryDriveView } from './EventHistoryDriveView';
import { ChatOversightView } from './chat/ChatOversightView';
import { ForumAdminSettingsModal } from './forum/ForumAdminSettingsModal';
import { apiFetch } from '../config/api';
import { auth } from '../services/firebaseClient';

interface AdminManagementViewProps {
  pendingReviewEvents: EventEntity[];
  onApproveEvent: (id: string, overrides?: Partial<EventEntity>) => void;
  onRejectEvent: (id: string) => void;
  onOpenQuickAdd: () => void;
  language: Language;
  onMeetingCreated?: (event: EventEntity) => void;
  pastEvents?: EventEntity[];
  allEvents?: EventEntity[];
  onSelectEvent?: (event: EventEntity) => void;
}

export const AdminManagementView: React.FC<AdminManagementViewProps> = ({
  pendingReviewEvents,
  onApproveEvent,
  onRejectEvent,
  onOpenQuickAdd,
  language,
  onMeetingCreated,
  pastEvents,
  allEvents,
  onSelectEvent,
}) => {
  const [activeTab, setActiveTab] = useState<
    'reviews' | 'announcements' | 'chat_oversight' | 'nlp_meeting' | 'drive_history' | 'telegram' | 'reminders' | 'forum_drive'
  >('reviews');
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [testNotificationStatus, setTestNotificationStatus] = useState<string | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Reminder settings state
  const [dailyBriefingTime, setDailyBriefingTime] = useState('07:30');
  const [dailyBriefingEnabled, setDailyBriefingEnabled] = useState(true);
  const [defaultReminder2h, setDefaultReminder2h] = useState(true);
  const [defaultReminder30m, setDefaultReminder30m] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveMsg, setSettingsSaveMsg] = useState<string | null>(null);

  const handleSetupWebhook = async () => {
    setIsSettingWebhook(true);
    setWebhookStatus(null);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await apiFetch('/api/telegram/setup-webhook', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      setWebhookStatus(
        data?.success
          ? language === 'bn'
            ? 'টেলিগ্রাম ওয়েবহুক সফলভাবে কনফিগার ও সক্রিয় করা হয়েছে।'
            : 'Telegram webhook successfully configured & active.'
          : data?.message || 'Failed'
      );
    } catch (err: any) {
      setWebhookStatus(err?.message || 'Webhook setup error');
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const handleSendTestNotification = async () => {
    setIsSendingTest(true);
    setTestNotificationStatus(null);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      const res = await apiFetch('/api/notifications/test-broadcast', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      setTestNotificationStatus(
        data?.success
          ? language === 'bn'
            ? `টেস্ট নোটিফিকেশন প্রেরিত: ${data.deviceCount || 1}টি ডিভাইসে বার্তা পাঠানো হয়েছে।`
            : `Test broadcast sent to ${data.deviceCount || 1} registered device(s).`
          : 'Failed'
      );
    } catch (err: any) {
      setTestNotificationStatus(err?.message || 'Notification test error');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSettingsSaveMsg(null);
    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : '';
      await apiFetch('/api/settings/reminder-preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dailyBriefingTime,
          dailyBriefingEnabled,
          defaultReminder2h,
          defaultReminder30m,
        }),
      });
      setSettingsSaveMsg(
        language === 'bn' ? 'স্মারক পছন্দসমূহ সফলভাবে সংরক্ষিত হয়েছে।' : 'Reminder preferences saved.'
      );
      setTimeout(() => setSettingsSaveMsg(null), 4000);
    } catch (err: any) {
      setSettingsSaveMsg(err?.message || 'Failed to save');
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <div id="admin-management-view" className="space-y-4 pb-20">
      {/* Institutional Admin Header */}
      <div className="bg-gradient-to-r from-[#004D40] via-[#006A60] to-[#005B52] rounded-3xl p-5 sm:p-6 text-white shadow-lg border border-teal-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-teal-200 shadow-inner shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider bg-teal-800/80 px-2 py-0.5 rounded-full border border-teal-600/50">
                  {language === 'bn' ? 'অ্যাডমিন কন্ট্রোল' : 'Admin Control'}
                </span>
                <span className="text-[11px] text-teal-200">Jamalpur Medical College</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight font-['Tiro_Bangla',sans-serif] mt-0.5">
                {language === 'bn' ? 'প্রশাসনিক ব্যবস্থাপনা ও অনুমোদন' : 'Institutional Admin Console'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenQuickAdd}
            className="inline-flex items-center gap-2 bg-white text-[#004D40] hover:bg-teal-50 px-4 py-2.5 rounded-2xl font-bold text-xs shadow-md transition active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>{language === 'bn' ? 'নতুন কর্মসূচি যোগ করুন' : 'Create Event'}</span>
          </button>
        </div>
      </div>

      {/* Segmented Sub Tabs (Responsive Horizontal Scroll) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none bg-slate-200/80 p-1.5 rounded-2xl shadow-inner max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'reviews'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'অনুমোদন' : 'Reviews'}</span>
          {pendingReviewEvents.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {toBengaliNumber(pendingReviewEvents.length)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('announcements')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'announcements'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Megaphone className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'পপআপ বিজ্ঞপ্তি' : 'Announcements'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('chat_oversight')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'chat_oversight'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'চ্যাট নজরদারি (72h)' : 'Chat Oversight (72h)'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('nlp_meeting')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'nlp_meeting'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'বার্তা → মিটিং' : 'Text → Meeting'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('drive_history')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'drive_history'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'ড্রাইভ ব্যাকআপ' : 'Drive Backup'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telegram')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'telegram'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'টেলিগ্রাম বট' : 'Telegram Bot'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reminders')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'reminders'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'স্মারক সেটিংস' : 'Reminders'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('forum_drive')}
          className={`py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeTab === 'forum_drive'
              ? 'bg-white text-[#006A60] shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>{language === 'bn' ? 'ফোরাম ড্রাইভ' : 'Forum Drive'}</span>
        </button>
      </div>

      {/* 1. Review Center Tab */}
      {activeTab === 'reviews' && (
        <ReviewCenterView
          events={pendingReviewEvents}
          onApprove={onApproveEvent}
          onReject={onRejectEvent}
          language={language}
        />
      )}

      {/* 2. Announcements Manager Tab */}
      {activeTab === 'announcements' && (
        <AnnouncementManagerView />
      )}

      {/* 2.5. Chat Oversight Tab (Strict 72-Hour Institutional Retention Audit) */}
      {activeTab === 'chat_oversight' && (
        <ChatOversightView language={language} />
      )}

      {/* 3. Text to Meeting (Relocated Admin Tool) */}
      {activeTab === 'nlp_meeting' && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs">
          <TelegramTextToMeeting
            language={language}
            onMeetingCreated={(event) => {
              if (onMeetingCreated) {
                onMeetingCreated(event);
              }
            }}
          />
        </div>
      )}

      {/* 4. Google Drive Archives (Relocated Admin Tool) */}
      {activeTab === 'drive_history' && (
        <EventHistoryDriveView
          pastEvents={pastEvents || []}
          allEvents={allEvents || []}
          language={language}
          onSelectEvent={onSelectEvent}
        />
      )}

      {/* 2. Telegram Integration Tab */}
      {activeTab === 'telegram' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#006A60] flex items-center justify-center border border-teal-100 shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {language === 'bn' ? 'টেলিগ্রাম ওয়েবহুক ও এআই প্রসেসর' : 'Telegram Webhook & AI Extraction'}
                </h3>
                <p className="text-xs text-slate-500">
                  {language === 'bn'
                    ? 'অফিশিয়াল টেলিগ্রাম গ্রুপের নোটিশ স্বয়ংক্রিয়ভাবে পেতে ওয়েবহুক কনফিগার করুন'
                    : 'Auto-extract schedules from official college Telegram channels'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">সার্ভার ব্যাকএন্ড:</span>
                <span className="font-mono text-teal-800">https://jpmc-synapse.onrender.com</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">টাইমজোন:</span>
                <span className="font-bold text-slate-800">Asia/Dhaka (UTC+6)</span>
              </div>
            </div>

            {webhookStatus && (
              <div className="bg-teal-50 border border-teal-200 text-teal-900 text-xs p-3.5 rounded-2xl">
                {webhookStatus}
              </div>
            )}

            <button
              type="button"
              onClick={handleSetupWebhook}
              disabled={isSettingWebhook}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#006A60] hover:bg-teal-700 active:scale-98 text-white font-bold text-xs transition shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSettingWebhook ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{language === 'bn' ? 'কনফিগার করা হচ্ছে...' : 'Setting up webhook...'}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>{language === 'bn' ? 'টেলিগ্রাম ওয়েবহুক সক্রিয় করুন' : 'Setup Telegram Webhook'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. Reminders & Briefing Tab */}
      {activeTab === 'reminders' && (
        <div className="space-y-4">
          <form
            onSubmit={handleSavePreferences}
            className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#006A60] flex items-center justify-center border border-teal-100 shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {language === 'bn' ? 'দৈনিক ব্রিফিং ও পূর্ব-সতর্কবার্তা' : 'Morning Briefing & Reminders'}
                </h3>
                <p className="text-xs text-slate-500">
                  {language === 'bn'
                    ? 'প্রতিদিন সকালের সংক্ষেপ ও ইভেন্ট শুরুর আগে স্বয়ংক্রিয় এলার্ট'
                    : 'Daily agenda at scheduled morning hour and 2h / 30m prior alerts'}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 cursor-pointer transition">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {language === 'bn' ? 'দৈনিক সকালের ব্রিফিং' : 'Daily Morning Briefing'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {language === 'bn' ? 'দিনের সকল কর্মসূচি সংক্ষেপে পুশ নোটিফিকেশন' : 'Push notification briefing each morning'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={dailyBriefingEnabled}
                  onChange={(e) => setDailyBriefingEnabled(e.target.checked)}
                  className="w-5 h-5 text-[#006A60] rounded accent-[#006A60] cursor-pointer"
                />
              </label>

              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {language === 'bn' ? 'ব্রিফিংয়ের সময় (ঢাকা)' : 'Briefing Time (Dhaka)'}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {language === 'bn' ? 'নির্ধারিত সময়ে নোটিফিকেশন পাঠানো হবে' : 'Scheduled morning dispatch'}
                  </div>
                </div>
                <input
                  type="time"
                  value={dailyBriefingTime}
                  onChange={(e) => setDailyBriefingTime(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-800 bg-white"
                />
              </div>

              <label className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 cursor-pointer transition">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {language === 'bn' ? 'কর্মসূচির ২ ঘণ্টা আগের নোটিফিকেশন' : '2 Hours Prior Reminder'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={defaultReminder2h}
                  onChange={(e) => setDefaultReminder2h(e.target.checked)}
                  className="w-5 h-5 text-[#006A60] rounded accent-[#006A60] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 cursor-pointer transition">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {language === 'bn' ? 'কর্মসূচির ৩০ মিনিট আগের নোটিফিকেশন' : '30 Minutes Prior Reminder'}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={defaultReminder30m}
                  onChange={(e) => setDefaultReminder30m(e.target.checked)}
                  className="w-5 h-5 text-[#006A60] rounded accent-[#006A60] cursor-pointer"
                />
              </label>
            </div>

            {settingsSaveMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl">
                {settingsSaveMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingSettings}
              className="w-full py-3 rounded-2xl bg-[#006A60] hover:bg-teal-700 active:scale-98 text-white font-bold text-xs transition shadow-sm cursor-pointer disabled:opacity-60"
            >
              {isSavingSettings
                ? language === 'bn'
                  ? 'সংরক্ষণ করা হচ্ছে...'
                  : 'Saving...'
                : language === 'bn'
                ? 'পছন্দসমূহ সংরক্ষণ করুন'
                : 'Save Preferences'}
            </button>
          </form>

          {/* Test Push Notification Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
              <Send className="w-4 h-4 text-teal-700" />
              <span>{language === 'bn' ? 'পুশ নোটিফিকেশন পরীক্ষা' : 'Push Notification Diagnostic Test'}</span>
            </h4>
            <p className="text-[11px] text-slate-500">
              {language === 'bn'
                ? 'সকল নিবন্ধিত ডিভাইসে একটি তাৎক্ষণিক পরীক্ষামূলক পুশ নোটিফিকেশন পাঠান।'
                : 'Broadcast an immediate test notification to verify FCM background reception.'}
            </p>

            {testNotificationStatus && (
              <div className="bg-slate-50 border border-slate-200 text-slate-700 text-xs p-3 rounded-xl">
                {testNotificationStatus}
              </div>
            )}

            <button
              type="button"
              onClick={handleSendTestNotification}
              disabled={isSendingTest}
              className="w-full py-2.5 rounded-xl border border-teal-300 bg-teal-50 hover:bg-teal-100 text-[#006A60] font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSendingTest ? 'পাঠানো হচ্ছে...' : language === 'bn' ? 'টেস্ট ব্রডকাস্ট পাঠান' : 'Send Test Broadcast'}
            </button>
          </div>
        </div>
      )}

      {/* 8. Forum Google Drive Storage Tab */}
      {activeTab === 'forum_drive' && (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs">
          <ForumAdminSettingsModal onClose={() => setActiveTab('reviews')} />
        </div>
      )}
    </div>
  );
};
