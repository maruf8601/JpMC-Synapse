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
  ShieldAlert,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { EventEntity, Language } from '../domain/models';
import { auth } from '../services/firebaseClient';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  requestDriveAccess,
  subscribeDriveAuth,
  getDriveAuthState,
} from '../services/googleAuth';
import {
  saveEventHistoryToDrive,
  listDriveHistoryFiles,
  deleteDriveFile,
  DriveSavedFile,
  formatDriveFileSize,
  getDriveFileTypeLabel,
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
import { toBengaliNumber, formatBengaliDate, formatBengaliTime } from '../domain/constants';

interface EventHistoryDriveViewProps {
  pastEvents: EventEntity[];
  allEvents: EventEntity[];
  language: Language;
  onSelectEvent: (event: EventEntity) => void;
  role?: 'admin' | 'user';
}

export const EventHistoryDriveView: React.FC<EventHistoryDriveViewProps> = ({
  pastEvents,
  allEvents,
  language,
  onSelectEvent,
  role = 'user',
}) => {
  const isAdmin = role === 'admin';
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
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const [driveFetchError, setDriveFetchError] = useState<string | null>(null);

  // Confirmation modal states for destructive operation
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
        await loadDriveFiles();
      }
    } catch (e: any) {
      setAutoBackupResultMsg(e?.message || 'Auto-backup failed');
    } finally {
      setIsRunningAutoBackup(false);
    }
  };

  const loadDriveFiles = async () => {
    setIsLoadingFiles(true);
    setDriveFetchError(null);
    try {
      const files = await listDriveHistoryFiles();
      setDriveFiles(files);
      setHasFetchedOnce(true);
    } catch (e: any) {
      console.warn('[EventHistoryDriveView] Error loading drive files:', e);
      if (e?.message !== 'NOT_AUTHENTICATED') {
        setDriveFetchError(e?.message || 'FAILED_TO_LOAD');
      }
      setHasFetchedOnce(true);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Check auth and load existing drive archives on mount & on auth changes
  useEffect(() => {
    let isMounted = true;

    const checkTokenOnMount = async () => {
      setUser(auth.currentUser);
      const token = await getAccessToken();
      if (isMounted) {
        const isAuth = !!token;
        setHasToken(isAuth);
        if (isAuth && isAdmin) {
          loadDriveFiles();
        }
      }
    };
    checkTokenOnMount();

    // Subscribe to Google Drive state changes
    const unsubDrive = subscribeDriveAuth((dState) => {
      if (!isMounted) return;
      if (dState.isAuthorized && dState.status === 'connected') {
        setHasToken(true);
        setUser(auth.currentUser);
        if (isAdmin) {
          loadDriveFiles();
        }
      } else if (dState.status === 'not_connected') {
        setHasToken(false);
        setDriveFiles([]);
        setHasFetchedOnce(false);
      }
    });

    const unsubscribe = initAuth(
      async (currentUser) => {
        if (!isMounted) return;
        setUser(currentUser);
        const token = await getAccessToken();
        const isAuth = !!token;
        setHasToken(isAuth);
        if (isAuth && isAdmin) {
          loadDriveFiles();
        }
      },
      () => {
        if (!isMounted) return;
        setUser(null);
        setHasToken(false);
        setDriveFiles([]);
        setHasFetchedOnce(false);
      }
    );

    return () => {
      isMounted = false;
      unsubDrive();
      unsubscribe();
    };
  }, [isAdmin]);

  const handleSignIn = async () => {
    if (!isAdmin) return;
    setIsSigningIn(true);
    setUploadErrorMsg(null);
    try {
      if (!auth.currentUser) {
        const res = await googleSignIn();
        if (!res) {
          setIsSigningIn(false);
          return;
        }
        setUser(res.user);
      }
      // Incremental Authorization: Request Drive access only when using Drive Backup
      const token = await requestDriveAccess('consent');
      if (token) {
        setHasToken(true);
        setUser(auth.currentUser);
        await loadDriveFiles();
      }
    } catch (err: any) {
      if (err?.message === 'POPUP_CLOSED' || err?.message === 'ACCESS_DENIED') {
        // User closed or dismissed popup
      } else if (err?.message === 'POPUP_BLOCKED') {
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
    setHasFetchedOnce(false);
  };

  const handleSaveToDrive = async () => {
    if (!isAdmin) return;
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
      let token = await getAccessToken();
      if (!token) {
        token = await requestDriveAccess('consent');
        setHasToken(true);
      }

      const prefix = customArchiveName.trim()
        ? customArchiveName.trim().replace(/\s+/g, '_')
        : exportScope === 'past_only'
        ? 'JpMC_Past_Events_History'
        : 'JpMC_Complete_Schedule_History';

      const result = await saveEventHistoryToDrive(eventsToExport, prefix);

      setUploadSuccessMsg(
        language === 'bn'
          ? `সফলভাবে গুগল ড্রাইভে সংরক্ষিত হয়েছে! (${result.fileName})`
          : `Successfully saved to Google Drive! (${result.fileName})`
      );

      // Refresh drive files list immediately so new file appears
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
      // Background refresh to guarantee consistency
      loadDriveFiles();
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
              ? 'জামালপুর মেডিকেল কলেজের অতীত ও সম্পন্নকৃত সভাসমূহ সরাসরি গুগল ড্রাইভে সংরক্ষণ ও পূর্বের রেকর্ড পর্যালোচনা করুন।'
              : 'Safely backup past academic sessions, meetings, and official events directly to Google Drive and review historical records.'}
          </p>
        </div>
      </div>

      {/* Non-Admin Notice Banner */}
      {!isAdmin && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2.5 text-xs text-amber-900 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            {language === 'bn'
              ? 'গুগল ড্রাইভ ব্যাকআপ ও ক্লাউড এক্সপোর্ট শুধুমাত্র সিস্টেম অ্যাডমিনের জন্য সংরক্ষিত। নিচে আপনার কলেজের সম্পন্ন সূচিসমূহ দেখতে পারেন।'
              : 'Google Drive backup and cloud export are managed by administrators. You can view past completed schedules below.'}
          </span>
        </div>
      )}

      {/* Admin-only Google Drive Management Section */}
      {isAdmin && (
        <>
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
                    <span>{language === 'bn' ? 'গুগল ড্রাইভ অ্যাকাউন্ট সংযোগ' : 'Google Drive Account Connection'}</span>
                    {hasToken ? (
                      <span className="text-[10px] bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.2 rounded-full border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>{language === 'bn' ? 'সংযুক্ত' : 'Connected'}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-2 py-0.2 rounded-full border border-amber-200">
                        {language === 'bn' ? 'সংযোগ প্রয়োজন' : 'Not Connected'}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {user ? (
                      <span>
                        {user.displayName || user.email} ({user.email})
                      </span>
                    ) : language === 'bn' ? (
                      'ড্রাইভে ব্যাকআপ নিতে ও পূর্বের ফাইল দেখতে গুগল ড্রাইভ সংযোগ করুন'
                    ) : (
                      'Connect Google Drive to enable backup and view archives'
                    )}
                  </p>
                </div>
              </div>

              <div>
                {!hasToken ? (
                  <button
                    id="google-drive-sign-in-btn"
                    onClick={handleSignIn}
                    disabled={isSigningIn}
                    className="gsi-material-button inline-flex items-center gap-2 px-3.5 py-2 bg-[#006A60] hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <CloudUpload className="w-4 h-4 text-teal-100" />
                    <span>
                      {isSigningIn
                        ? language === 'bn'
                          ? 'অনুমোদন হচ্ছে...'
                          : 'Connecting...'
                        : language === 'bn'
                        ? 'গুগল ড্রাইভ সংযোগ করুন'
                        : 'Connect Google Drive'}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-200 bg-teal-50 text-xs text-teal-800 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>{language === 'bn' ? 'ড্রাইভ প্রস্তুত' : 'Drive Ready'}</span>
                    </span>
                    <button
                      onClick={handleSignOut}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title={language === 'bn' ? 'সংযোগ বিচ্ছিন্ন করুন' : 'Disconnect'}
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
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
                      ? 'প্রতিদিন এশিয়া/ঢাকা রাত ২৩:৩০ মিনিটে সম্পন্নকৃত অতীত সভাগুলো স্বয়ংক্রিয়ভাবে গুগল ড্রাইভে ব্যাকআপ হবে।'
                      : 'Automatically archives past completed events to Google Drive once every day at 23:30 (Dhaka time).'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  id="btn-run-auto-backup-now"
                  onClick={handleRunAutoBackupNow}
                  disabled={isRunningAutoBackup || !hasToken}
                  className="px-3 py-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-800 text-[11px] font-bold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-2xs"
                  title="Run backup trigger immediately"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRunningAutoBackup ? 'animate-spin' : ''}`} />
                  <span>{language === 'bn' ? 'এখনই ব্যাকআপ চালান' : 'Run Backup Now'}</span>
                </button>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoBackupActive}
                    onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {/* Last Backup Info & Feedback */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-emerald-100 gap-2">
              <div>
                <span>{language === 'bn' ? 'সর্বশেষ স্বয়ংক্রিয় ব্যাকআপ: ' : 'Last auto-backup: '}</span>
                <span className="font-semibold text-slate-700">
                  {lastAutoBackupDate ? `${lastAutoBackupDate} (Asia/Dhaka)` : language === 'bn' ? 'এখনও চালানো হয়নি' : 'Never'}
                </span>
              </div>
              {autoBackupResultMsg && (
                <span className="text-emerald-700 font-medium bg-emerald-100/60 px-2 py-0.5 rounded">
                  {autoBackupResultMsg}
                </span>
              )}
            </div>
          </div>

          {/* 2. Manual Export / Archive Generator */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <CloudUpload className="w-4 h-4 text-teal-700" />
              <span>{language === 'bn' ? 'ম্যানুয়াল ব্যাকআপ ও এক্সপোর্ট' : 'Manual Backup & Export'}</span>
            </h3>

            {/* Selection scope */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setExportScope('past_only')}
                className={`p-2.5 rounded-xl border text-left font-semibold transition cursor-pointer ${
                  exportScope === 'past_only'
                    ? 'border-[#006A60] bg-teal-50/70 text-[#006A60]'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{language === 'bn' ? 'শুধুমাত্র পূর্ববর্তী কর্মসূচি' : 'Past Events Only'}</span>
                  <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-white border border-teal-200">
                    {pastEvents.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                  {language === 'bn' ? 'সম্পন্ন ও পূর্ববর্তী মিটিংয়ের তালিকা' : 'Archived & completed events'}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportScope('all')}
                className={`p-2.5 rounded-xl border text-left font-semibold transition cursor-pointer ${
                  exportScope === 'all'
                    ? 'border-[#006A60] bg-teal-50/70 text-[#006A60]'
                    : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{language === 'bn' ? 'সকল কর্মসূচি (সম্পূর্ণ)' : 'All Events (Complete)'}</span>
                  <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-white border border-teal-200">
                    {allEvents.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-normal mt-0.5">
                  {language === 'bn' ? 'অতীত, বর্তমান ও ভবিষ্যৎ সম্পূর্ণ রেকর্ড' : 'Full schedule database export'}
                </p>
              </button>
            </div>

            {/* Archive custom name */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                {language === 'bn' ? 'কাস্টম ফাইলের নাম (ঐচ্ছিক)' : 'Custom File Name (Optional)'}
              </label>
              <input
                type="text"
                value={customArchiveName}
                onChange={(e) => setCustomArchiveName(e.target.value)}
                placeholder={
                  language === 'bn'
                    ? 'যেমন: JpMC_Academic_Council_2026'
                    : 'e.g., JpMC_Academic_Council_2026'
                }
                className="w-full text-xs p-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-600 bg-slate-50/50"
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
                disabled={isLoadingFiles || !hasToken}
                className="text-[11px] text-[#006A60] hover:underline flex items-center gap-1 font-semibold disabled:text-slate-400 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                <span>{language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}</span>
              </button>
            </div>

            {/* State: Not connected */}
            {!hasToken ? (
              <div className="p-5 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-500 space-y-2">
                <p>
                  {language === 'bn'
                    ? 'গুগল ড্রাইভে সংরক্ষিত পূর্ববর্তী ফাইল দেখতে অনুগ্রহ করে উপরে গুগল ড্রাইভ সংযোগ করুন।'
                    : 'Connect Google Drive above to browse your existing Drive archives.'}
                </p>
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#006A60] hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  <CloudUpload className="w-3.5 h-3.5 text-teal-100" />
                  <span>{language === 'bn' ? 'গুগল ড্রাইভ সংযোগ করুন' : 'Connect Google Drive'}</span>
                </button>
              </div>
            ) : isLoadingFiles ? (
              /* State: Loading (B8) */
              <div className="py-8 text-center text-xs text-slate-600 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#006A60]" />
                <span className="font-semibold">
                  {language === 'bn'
                    ? 'Google Drive থেকে সংরক্ষিত ইতিহাস লোড হচ্ছে...'
                    : 'Loading saved event history from Google Drive...'}
                </span>
              </div>
            ) : driveFetchError ? (
              /* State: Error (B8) */
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-center text-xs text-rose-800 space-y-2">
                <div className="flex items-center justify-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    {language === 'bn'
                      ? 'Google Drive থেকে সংরক্ষিত ইতিহাস লোড করা যায়নি।'
                      : 'Could not load saved history from Google Drive.'}
                  </span>
                </div>
                <p className="text-[11px] text-rose-600 max-w-sm mx-auto">{driveFetchError}</p>
                <button
                  type="button"
                  onClick={loadDriveFiles}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-rose-100/50 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 cursor-pointer shadow-2xs"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{language === 'bn' ? 'আবার চেষ্টা করুন' : 'Try Again'}</span>
                </button>
              </div>
            ) : hasFetchedOnce && driveFiles.length === 0 ? (
              /* State: Empty (B8) */
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 space-y-1">
                <p className="font-bold text-slate-700">
                  {language === 'bn'
                    ? 'Google Drive-এ পূর্ববর্তী কোনো সংরক্ষিত ইতিহাস পাওয়া যায়নি।'
                    : 'No previously saved event history found in Google Drive.'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {language === 'bn'
                    ? 'নতুন ব্যাকআপ তৈরি করতে উপরের "গুগল ড্রাইভে ইতিহাস সংরক্ষণ করুন" বোতামে চাপুন।'
                    : 'Click "Save Events History to Google Drive" above to create your first archive.'}
                </p>
              </div>
            ) : (
              /* List Archives (B7) */
              <div className="space-y-2">
                {driveFiles.map((file) => {
                  const typeLabel = getDriveFileTypeLabel(file.mimeType, file.name);
                  const formattedSize = formatDriveFileSize(file.size);

                  return (
                    <div
                      key={file.id}
                      className="p-3 bg-slate-50/80 hover:bg-slate-100/70 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs transition"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-teal-100/80 text-teal-800 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-slate-800 truncate" title={file.name}>
                              {file.name}
                            </p>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-teal-50 text-[#006A60] border border-teal-200 shrink-0">
                              {typeLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span>
                              {new Date(file.createdTime).toLocaleString(
                                language === 'bn' ? 'bn-BD' : 'en-US',
                                {
                                  timeZone: 'Asia/Dhaka',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )}
                            </span>
                            <span>•</span>
                            <span>{formattedSize}</span>
                          </div>
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
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* 4. Past & Completed Events List in the App */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-4 h-4 text-teal-700" />
            <span>{language === 'bn' ? 'পূর্ববর্তী কর্মসূচির তালিকা' : 'Past & Completed Events'}</span>
          </h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {language === 'bn'
              ? `${toBengaliNumber(pastEvents.length)} টি সূচি`
              : `${pastEvents.length} events`}
          </span>
        </div>

        {pastEvents.length === 0 ? (
          <div className="p-6 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
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
                      {language === 'bn' ? formatBengaliDate(evt.eventDate) : evt.eventDate} •{' '}
                      {language === 'bn' ? formatBengaliTime(evt.startTime) : evt.startTime}
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
                  <span>{evt.venue || (language === 'bn' ? 'স্থান নির্ধারিত নেই' : 'Venue not specified')}</span>
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
