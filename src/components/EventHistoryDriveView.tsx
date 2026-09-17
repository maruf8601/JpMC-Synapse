import React, { useState, useEffect } from 'react';
import {
  CloudUpload,
  History,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  ExternalLink,
  Trash2,
  RefreshCw,
  FolderArchive,
  Download,
  AlertTriangle,
  FileText,
  LogIn,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { EventEntity, Language } from '../domain/models';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
} from '../services/googleAuth';
import {
  saveEventHistoryToDrive,
  listDriveHistoryFiles,
  deleteDriveFile,
  DriveSavedFile,
} from '../services/googleDriveService';
import {
  isAutoBackupEnabled,
  setAutoBackupEnabled,
  getLastAutoBackupDate,
  getAutoBackupLogs,
  checkAndRunDailyAutoBackup,
  subscribeToAutoBackup,
  AutoBackupLog,
} from '../services/autoBackupService';
import { toBengaliNumber } from '../domain/constants';

interface EventHistoryDriveViewProps {
  pastEvents: EventEntity[];
  allEvents: EventEntity[];
  language: Language;
  onSelectEvent: (event: EventEntity) => void;
}

export const EventHistoryDriveView: React.FC<EventHistoryDriveViewProps> = ({
  pastEvents,
  allEvents,
  language,
  onSelectEvent,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Drive sync states
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);

  // Drive archives list
  const [driveFiles, setDriveFiles] = useState<DriveSavedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Confirmation modal states for mandatory destructive operation
  const [fileToDelete, setFileToDelete] = useState<DriveSavedFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Selection for export: 'past_only' | 'all'
  const [exportScope, setExportScope] = useState<'past_only' | 'all'>('past_only');
  const [customArchiveName, setCustomArchiveName] = useState('');

  // Auto Daily Backup states
  const [autoBackupActive, setAutoBackupActive] = useState(isAutoBackupEnabled());
  const [lastAutoBackupDate, setLastAutoBackupDate] = useState<string | null>(getLastAutoBackupDate());
  const [autoBackupLogs, setAutoBackupLogs] = useState<AutoBackupLog[]>(getAutoBackupLogs());
  const [isRunningAutoBackup, setIsRunningAutoBackup] = useState(false);
  const [autoBackupResultMsg, setAutoBackupResultMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuto = subscribeToAutoBackup(() => {
      setAutoBackupActive(isAutoBackupEnabled());
      setLastAutoBackupDate(getLastAutoBackupDate());
      setAutoBackupLogs(getAutoBackupLogs());
    });
    return () => unsubAuto();
  }, []);

  const handleToggleAutoBackup = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    setAutoBackupActive(enabled);
  };

  const handleRunAutoBackupNow = async () => {
    setIsRunningAutoBackup(true);
    setAutoBackupResultMsg(null);
    try {
      const res = await checkAndRunDailyAutoBackup();
      setAutoBackupResultMsg(res.message);
      if (res.executed) {
        loadDriveFiles();
      }
    } catch (e: any) {
      setAutoBackupResultMsg(e?.message || 'Auto-backup failed');
    } finally {
      setIsRunningAutoBackup(false);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setHasToken(!!token);
        loadDriveFiles();
      },
      () => {
        setUser(null);
        setHasToken(false);
        setDriveFiles([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const loadDriveFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const files = await listDriveHistoryFiles();
      setDriveFiles(files);
    } catch (e) {
      console.warn('Could not load drive files', e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setUploadErrorMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setHasToken(true);
        await loadDriveFiles();
      }
      // If res is null, the user cancelled or closed the popup; no error needed
    } catch (err: any) {
      if (err?.message === 'POPUP_BLOCKED') {
        setUploadErrorMsg(
          language === 'bn'
            ? 'ব্রাউজারে পপ-আপ উইন্ডো ব্লক করা হয়েছে। অনুগ্রহ করে ব্রাউজারের অ্যাড্রেস বার থেকে পপ-আপ অনুমোদন করুন।'
            : 'Popup window was blocked by your browser. Please allow popups for this site in your browser URL bar.'
        );
      } else {
        setUploadErrorMsg(
          language === 'bn'
            ? 'গুগল ড্রাইভ অথোরাইজেশন সম্পন্ন করা সম্ভব হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।'
            : 'Google Drive authorization could not be completed. Please try again.'
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setUser(null);
    setHasToken(false);
    setDriveFiles([]);
  };

  const handleSaveToDrive = async () => {
    const eventsToExport = exportScope === 'past_only' ? pastEvents : allEvents;

    if (eventsToExport.length === 0) {
      setUploadErrorMsg(
        language === 'bn'
          ? 'সংরক্ষণ করার মতো কোনো কর্মসূচি পাওয়া যায়নি।'
          : 'No events found to archive.'
      );
      return;
    }

    setIsUploading(true);
    setUploadSuccessMsg(null);
    setUploadErrorMsg(null);

    try {
      const prefix = customArchiveName.trim()
        ? customArchiveName.trim().replace(/\s+/g, '_')
        : exportScope === 'past_only'
        ? 'JpMC_Past_Events_History'
        : 'JpMC_Complete_Schedule_History';

      const result = await saveEventHistoryToDrive(eventsToExport, prefix);

      setUploadSuccessMsg(
        language === 'bn'
          ? `সফলভাবে গুগল ড্রাইভে সংরক্ষিত হয়েছে! (ফাইল: ${result.fileName})`
          : `Successfully saved to Google Drive! (${result.fileName})`
      );

      // Refresh drive files list
      await loadDriveFiles();
    } catch (err: any) {
      console.error(err);
      setUploadErrorMsg(
        language === 'bn'
          ? `ড্রাইভে আপলোড ব্যর্থ হয়েছে: ${err.message || 'নেটওয়ার্ক বা অনুমতি সমস্যা'}`
          : `Failed to upload to Drive: ${err.message || 'Permission or network error'}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Mandatory user confirmation for destructive delete
  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDriveFile(fileToDelete.id);
      setDriveFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err: any) {
      setUploadErrorMsg(
        language === 'bn'
          ? 'ফাইলটি গুগল ড্রাইভ থেকে ডিলিট করা যায়নি।'
          : 'Failed to delete file from Google Drive.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id="event-history-drive-view" className="space-y-4 pb-20">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#004D40] via-[#006A60] to-[#00897B] text-white p-4.5 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-white/20 backdrop-blur-xs text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-white/25">
              <FolderArchive className="w-3.5 h-3.5 text-teal-200" />
              <span>Google Drive Cloud Sync</span>
            </span>
          </div>
          <h2 className="text-lg font-bold tracking-tight">
            {language === 'bn'
              ? 'কর্মসূচির পূর্ববর্তী ইতিহাস ও গুগল ড্রাইভ ব্যাকআপ'
              : 'Previous Events History & Google Drive Archive'}
          </h2>
          <p className="text-xs text-teal-100 mt-1 max-w-md leading-relaxed">
            {language === 'bn'
              ? 'জামালপুর মেডিকেল কলেজের অতীত ও সম্পন্নকৃত সভাসমূহ সরাসরি আপনার গুগল ড্রাইভে নিরাপদ সংরক্ষণ করুন।'
              : 'Safely backup past academic sessions, meetings, and official events directly to your personal Google Drive.'}
          </p>
        </div>
      </div>

      {/* 1. Google Account Connection Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#006A60] flex items-center justify-center border border-teal-100 shrink-0">
              {user ? (
                user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Google User'}
                    className="w-10 h-10 rounded-2xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon className="w-5 h-5 text-teal-700" />
                )
              ) : (
                <CloudUpload className="w-5 h-5 text-teal-700" />
              )}
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>{language === 'bn' ? 'গুগল অ্যাকাউন্ট সংযোগ' : 'Google Account Connection'}</span>
                {user && (
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.2 rounded-full border border-emerald-200">
                    {language === 'bn' ? 'সংযুক্ত' : 'Connected'}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-500">
                {user ? (
                  <span>
                    {user.displayName || user.email} • {user.email}
                  </span>
                ) : language === 'bn' ? (
                  'ড্রাইভে ব্যাকআপ নিতে গুগল অ্যাকাউন্ট দিয়ে সাইন ইন করুন'
                ) : (
                  'Sign in with Google to enable Drive backup'
                )}
              </p>
            </div>
          </div>

          <div>
            {!user ? (
              <button
                id="google-drive-sign-in-btn"
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="gsi-material-button inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-xs transition active:scale-95 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
                <span>{isSigningIn ? (language === 'bn' ? 'সাইন ইন হচ্ছে...' : 'Signing in...') : (language === 'bn' ? 'গুগল সাইন ইন' : 'Sign in with Google')}</span>
              </button>
            ) : (
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs text-slate-600 font-semibold transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'লগআউট' : 'Sign Out'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Automatic Daily Backup Card */}
      <div className="bg-gradient-to-br from-emerald-50/80 via-teal-50/50 to-white rounded-2xl p-4 border border-emerald-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <RefreshCw className={`w-4.5 h-4.5 ${isRunningAutoBackup ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900">
                  {language === 'bn'
                    ? 'প্রতিদিনের স্বয়ংক্রিয় ক্লাউড ব্যাকআপ (Auto Daily Backup)'
                    : 'Everyday Automatic Cloud Backup'}
                </h3>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full">
                  {autoBackupActive
                    ? language === 'bn'
                      ? 'সক্রিয়'
                      : 'Active'
                    : language === 'bn'
                    ? 'নিষ্ক্রিয়'
                    : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {language === 'bn'
                  ? 'প্রতিদিন স্বয়ংক্রিয়ভাবে অতীত ও সম্পন্নকৃত সভাসমূহ আপনার গুগল ড্রাইভের "JpMC Synapse Archives" ফোল্ডারে সংরক্ষিত হবে।'
                  : 'Automatically archives all past and completed events to your Google Drive every single day.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button
              onClick={() => handleToggleAutoBackup(!autoBackupActive)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition cursor-pointer ${
                autoBackupActive
                  ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
            >
              {autoBackupActive
                ? language === 'bn'
                  ? 'স্বয়ংক্রিয় অন'
                  : 'Auto ON'
                : language === 'bn'
                ? 'স্বয়ংক্রিয় অফ'
                : 'Auto OFF'}
            </button>

            <button
              onClick={handleRunAutoBackupNow}
              disabled={isRunningAutoBackup}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white border border-emerald-300 hover:border-emerald-500 text-emerald-800 hover:bg-emerald-50 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRunningAutoBackup ? 'animate-spin' : ''}`} />
              <span>{isRunningAutoBackup ? (language === 'bn' ? 'চলছে...' : 'Running...') : (language === 'bn' ? 'এখনই চালান' : 'Run Today Now')}</span>
            </button>
          </div>
        </div>

        {/* Status Line */}
        <div className="bg-white/80 rounded-xl p-2.5 border border-emerald-200/50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              {language === 'bn' ? 'সর্বশেষ স্বয়ংক্রিয় ব্যাকআপ তারিখ:' : 'Last Auto-Backup Date:'}{' '}
              <strong className="text-slate-800">
                {lastAutoBackupDate ? toBengaliNumber(lastAutoBackupDate) : language === 'bn' ? 'আজ এখনও হয়নি' : 'Not run yet today'}
              </strong>
            </span>
          </div>

          <span className="text-[10px] text-slate-500">
            {language === 'bn'
              ? 'গুগল ড্রাইভে ফাইল নেম: JpMC_Daily_AutoBackup_YYYY-MM-DD.json'
              : 'File pattern: JpMC_Daily_AutoBackup_YYYY-MM-DD.json'}
          </span>
        </div>

        {autoBackupResultMsg && (
          <div className="bg-emerald-100/70 border border-emerald-300 text-emerald-900 text-[11px] font-medium p-2 rounded-xl flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>{autoBackupResultMsg}</span>
          </div>
        )}
      </div>

      {/* 2. Save Events to Drive Action Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <CloudUpload className="w-4 h-4 text-[#006A60]" />
            <span>{language === 'bn' ? 'ড্রাইভে ব্যাকআপ তৈরি করুন' : 'Export & Save to Drive'}</span>
          </h3>
          <span className="text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
            {language === 'bn'
              ? `${toBengaliNumber(pastEvents.length)} টি পূর্ববর্তী কর্মসূচি প্রস্তুত`
              : `${pastEvents.length} past events available`}
          </span>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:border-teal-400 bg-slate-50/50 cursor-pointer">
            <input
              type="radio"
              name="exportScope"
              checked={exportScope === 'past_only'}
              onChange={() => setExportScope('past_only')}
              className="mt-0.5 text-teal-600"
            />
            <div>
              <span className="font-bold text-slate-800 block">
                {language === 'bn' ? 'শুধু পূর্ববর্তী/সম্পন্ন কর্মসূচি' : 'Past & Completed Events Only'}
              </span>
              <span className="text-[11px] text-slate-500">
                {language === 'bn'
                  ? `মোট ${toBengaliNumber(pastEvents.length)} টি সম্পন্ন বা অতীতের রেকর্ড`
                  : `${pastEvents.length} finished / past medical records`}
              </span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-slate-200 hover:border-teal-400 bg-slate-50/50 cursor-pointer">
            <input
              type="radio"
              name="exportScope"
              checked={exportScope === 'all'}
              onChange={() => setExportScope('all')}
              className="mt-0.5 text-teal-600"
            />
            <div>
              <span className="font-bold text-slate-800 block">
                {language === 'bn' ? 'সমস্ত কর্মসূচির পূর্ণাঙ্গ রেকর্ড' : 'All Events & Archives (Full)'}
              </span>
              <span className="text-[11px] text-slate-500">
                {language === 'bn'
                  ? `অতীত ও বর্তমান সহ সর্বমোট ${toBengaliNumber(allEvents.length)} টি কর্মসূচি`
                  : `Complete database (${allEvents.length} events)`}
              </span>
            </div>
          </label>
        </div>

        {/* Custom title / note */}
        <div>
          <label className="text-[11px] font-semibold text-slate-600 block mb-1">
            {language === 'bn' ? 'ফাইলের শিরোনাম/চিহ্নক (ঐচ্ছিক):' : 'Archive Tag / File Title (Optional):'}
          </label>
          <input
            type="text"
            value={customArchiveName}
            onChange={(e) => setCustomArchiveName(e.target.value)}
            placeholder={
              language === 'bn'
                ? 'উদাহরণ: JpMC_Monthly_Review_Sep2026'
                : 'e.g. JpMC_Monthly_Review_Sep2026'
            }
            className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-600 bg-slate-50/50"
          />
        </div>

        {/* Feedback messages */}
        {uploadSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{uploadSuccessMsg}</span>
          </div>
        )}

        {uploadErrorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{uploadErrorMsg}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          id="btn-upload-drive-history"
          onClick={handleSaveToDrive}
          disabled={isUploading}
          className="w-full bg-[#006A60] hover:bg-[#004D40] disabled:bg-slate-300 text-white p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition active:scale-[0.99] cursor-pointer"
        >
          {isUploading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{language === 'bn' ? 'গুগল ড্রাইভে সংরক্ষণ হচ্ছে...' : 'Saving to Google Drive...'}</span>
            </>
          ) : (
            <>
              <CloudUpload className="w-4 h-4" />
              <span>
                {language === 'bn'
                  ? 'গুগল ড্রাইভে ইতিহাস সংরক্ষণ করুন'
                  : 'Save Events History to Google Drive'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* 3. Previously Saved Backups on Google Drive */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <FolderArchive className="w-4 h-4 text-teal-700" />
            <span>{language === 'bn' ? 'গুগল ড্রাইভে সংরক্ষিত ফাইলসমূহ' : 'Saved Archives in Google Drive'}</span>
          </h3>
          <button
            onClick={loadDriveFiles}
            disabled={isLoadingFiles || !user}
            className="text-[11px] text-[#006A60] hover:underline flex items-center gap-1 font-semibold disabled:text-slate-400 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
            <span>{language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
          </button>
        </div>

        {!user ? (
          <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500">
            {language === 'bn'
              ? 'গুগল ড্রাইভে সংরক্ষিত পূর্ববর্তী ফাইল দেখতে অনুগ্রহ করে উপরে সাইন ইন করুন।'
              : 'Sign in above to browse your existing Drive archives.'}
          </div>
        ) : isLoadingFiles ? (
          <div className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#006A60]" />
            <span>{language === 'bn' ? 'ফাইল তালিকা লোড হচ্ছে...' : 'Loading Drive files...'}</span>
          </div>
        ) : driveFiles.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
            {language === 'bn'
              ? 'গুগল ড্রাইভে এখনো কোনো ইতিহাস ব্যাকআপ পাওয়া যায়নি। উপরের বাটন দিয়ে ব্যাকআপ তৈরি করুন।'
              : 'No archives saved yet on Google Drive. Click Save above to create your first archive.'}
          </div>
        ) : (
          <div className="space-y-2">
            {driveFiles.map((file) => (
              <div
                key={file.id}
                className="p-3 bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs transition"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-teal-100/80 text-teal-800 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="font-bold text-slate-800 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(file.createdTime).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US', {
                        timeZone: 'Asia/Dhaka',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-teal-700 hover:bg-teal-50 rounded-lg transition"
                      title={language === 'bn' ? 'গুগল ড্রাইভে খুলুন' : 'Open in Google Drive'}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => setFileToDelete(file)}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                    title={language === 'bn' ? 'ডিলিট করুন' : 'Delete'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Past & Completed Events List in the App */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-4 h-4 text-teal-700" />
            <span>{language === 'bn' ? 'পূর্ববর্তী কর্মসূচির তালিকা' : 'Past Events History Records'}</span>
          </h3>
          <span className="text-[11px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
            {language === 'bn'
              ? `${toBengaliNumber(pastEvents.length)} টি`
              : `${pastEvents.length} events`}
          </span>
        </div>

        {pastEvents.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
            {language === 'bn' ? 'কোনো পূর্ববর্তী কর্মসূচি পাওয়া যায়নি।' : 'No past events found.'}
          </div>
        ) : (
          <div className="space-y-2.5">
            {pastEvents.map((evt) => (
              <div
                key={evt.id}
                onClick={() => onSelectEvent(evt)}
                className="p-3 bg-slate-50/70 hover:bg-teal-50/50 border border-slate-200 rounded-xl cursor-pointer transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-2 py-0.2 rounded bg-slate-200 text-slate-800">
                      {evt.category}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">
                      {evt.eventDate} • {evt.startTime}
                    </span>
                  </div>
                  {evt.isCompleted && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>{language === 'bn' ? 'সম্পন্ন' : 'Done'}</span>
                    </span>
                  )}
                </div>
                <h4 className="text-xs font-bold text-slate-800">{evt.title}</h4>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>{evt.venue}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mandatory User Confirmation Dialog for Destructive Operations (Drive File Deletion) */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-3.5">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                {language === 'bn'
                  ? 'গুগল ড্রাইভ ফাইল ডিলিট নিশ্চিতকরণ'
                  : 'Confirm Google Drive File Deletion'}
              </h4>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                {language === 'bn'
                  ? `আপনি কি নিশ্চিত যে গুগল ড্রাইভ থেকে "${fileToDelete.name}" ফাইলটি স্থায়ীভাবে ডিলিট করতে চান? এই ক্রিয়াটি বাতিল করা সম্ভব নয়।`
                  : `Are you sure you want to permanently delete "${fileToDelete.name}" from your Google Drive? This action cannot be undone.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                id="btn-confirm-delete-drive-file"
                onClick={confirmDeleteFile}
                disabled={isDeleting}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{language === 'bn' ? 'ডিলিট হচ্ছে...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{language === 'bn' ? 'হ্যাঁ, ডিলিট করুন' : 'Confirm Delete'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
