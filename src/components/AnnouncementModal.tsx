/**
 * JpMC Synapse — Popup Announcement Modal
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import React, { useState } from 'react';
import { AnnouncementEntity } from '../domain/models';
import { recordAnnouncementSeen, recordAnnouncementAcknowledged } from '../services/announcementService';
import { auth } from '../services/firebaseClient';
import { getStoredUserSession } from '../services/authService';
import { formatDhakaDate, formatDhakaDateTime } from '../utils/dateSafe';
import {
  AlertTriangle,
  AlertCircle,
  Bell,
  CheckCircle2,
  X,
  Calendar,
  Users,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

interface AnnouncementModalProps {
  queue: AnnouncementEntity[];
  userId?: string;
  onDismiss: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  queue,
  userId,
  onDismiss,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!queue || queue.length === 0 || currentIndex >= queue.length) {
    return null;
  }

  const announcement = queue[currentIndex];
  const totalCount = queue.length;
  const isRequireAck = announcement.displayMode === 'require_acknowledgement';

  const getEffectiveUser = () => {
    const firebaseUser = auth.currentUser;
    const storedSession = getStoredUserSession();
    const effectiveUid =
      userId ||
      firebaseUser?.uid ||
      storedSession?.user?.uid ||
      storedSession?.user?.email;
    const displayName =
      firebaseUser?.displayName ||
      storedSession?.user?.displayName ||
      storedSession?.user?.email ||
      undefined;
    const email = firebaseUser?.email || storedSession?.user?.email || undefined;
    return { uid: effectiveUid, displayName, email };
  };

  const handleNextOrFinish = async (isAckAction: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);

    const user = getEffectiveUser();

    try {
      if (user.uid) {
        if (isRequireAck || isAckAction) {
          await recordAnnouncementAcknowledged(announcement.id, user.uid, {
            displayName: user.displayName,
            email: user.email,
          });
        } else {
          await recordAnnouncementSeen(announcement.id, user.uid, {
            displayName: user.displayName,
            email: user.email,
          });
        }
      }

      // Mark in session storage so it doesn't pop up again in this session
      try {
        sessionStorage.setItem(`seen_announcement_${announcement.id}`, 'true');
      } catch {
        // Ignore storage exceptions
      }

      if (currentIndex + 1 < totalCount) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        onDismiss();
      }
    } catch (err: any) {
      console.error('[AnnouncementModal] Error saving acknowledgement:', err);
      // For mandatory acknowledgement, notify user if write failed so they can retry
      if (isRequireAck) {
        setActionError(err?.message || 'স্বীকৃতি সংরক্ষণ করা সম্ভব হয়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন।');
      } else {
        if (currentIndex + 1 < totalCount) {
          setCurrentIndex((prev) => prev + 1);
        } else {
          onDismiss();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Priority color styles & badges
  const getPriorityTheme = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return {
          border: 'border-red-500/30',
          bgHeader: 'bg-red-500/10 text-red-700 dark:text-red-300',
          badge: 'bg-red-600 text-white',
          badgeText: 'জরুরি বিজ্ঞপ্তি',
          icon: <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />,
          accentBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-400 text-white',
        };
      case 'important':
        return {
          border: 'border-amber-500/30',
          bgHeader: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
          badge: 'bg-amber-500 text-white',
          badgeText: 'গুরুত্বপূর্ণ বিজ্ঞপ্তি',
          icon: <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
          accentBtn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-400 text-white',
        };
      default:
        return {
          border: 'border-emerald-500/30',
          bgHeader: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
          badge: 'bg-emerald-600 text-white',
          badgeText: 'প্রাতিষ্ঠানিক বিজ্ঞপ্তি',
          icon: <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
          accentBtn: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-400 text-white',
        };
    }
  };

  const theme = getPriorityTheme(announcement.priority);

  return (
    <div
      id="announcement-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-title"
    >
      <div
        id={`announcement-card-${announcement.id}`}
        className={`relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border ${theme.border} overflow-hidden transform transition-all animate-scale-up`}
      >
        {/* Header Ribbon */}
        <div className={`px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 ${theme.bgHeader}`}>
          <div className="flex items-center space-x-2.5">
            <span className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 shadow-xs">
              {theme.icon}
            </span>
            <div className="flex items-center space-x-2">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${theme.badge}`}>
                {theme.badgeText}
              </span>
              {totalCount > 1 && (
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-800/60 px-2 py-0.5 rounded-full">
                  {currentIndex + 1} / {totalCount}
                </span>
              )}
            </div>
          </div>

          {/* Close button only when acknowledgement is NOT strictly mandatory */}
          {!isRequireAck ? (
            <button
              id="announcement-close-btn"
              onClick={() => handleNextOrFinish(false)}
              disabled={isSubmitting}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-label="Close Announcement"
            >
              <X className="w-5 h-5" />
            </button>
          ) : (
            <span className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1 bg-red-100 dark:bg-red-950/50 px-2 py-0.5 rounded">
              <AlertTriangle className="w-3 h-3" />
              স্বীকৃতি আবশ্যক
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <h2
              id="announcement-title"
              className="text-xl font-bold text-slate-900 dark:text-white leading-snug font-bengali"
            >
              {announcement.title}
            </h2>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {formatDhakaDate(announcement.startAt)}
              </span>
              {announcement.targetAudience === 'admins_only' && (
                <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 font-medium">
                  <Users className="w-3.5 h-3.5" />
                  শুধুমাত্র অ্যাডমিনদের জন্য
                </span>
              )}
            </div>
          </div>

          <div
            id="announcement-message-body"
            className="text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-bengali bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/60"
          >
            {announcement.message}
          </div>

          {isRequireAck && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 font-bengali">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                কর্তৃপক্ষ এই বিজ্ঞপ্তির জন্য আপনার সচেতন সম্মতি ও পাঠের স্বীকৃতি নিশ্চিত করতে নির্দেশ দিয়েছেন।
              </span>
            </div>
          )}

          {actionError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 font-bengali">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 order-2 sm:order-1">
            জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেম
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto order-1 sm:order-2">
            {isRequireAck ? (
              <button
                id="announcement-ack-btn"
                onClick={() => handleNextOrFinish(true)}
                disabled={isSubmitting}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm shadow-md transition-all ${theme.accentBtn} disabled:opacity-50`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'সংরক্ষণ করা হচ্ছে...'
                    : currentIndex + 1 < totalCount
                    ? 'আমি অবগত হয়েছি এবং পরবর্তী'
                    : 'আমি অবগত হয়েছি (স্বীকৃতি প্রদান)'}
                </span>
                {currentIndex + 1 < totalCount && <ChevronRight className="w-4 h-4 ml-1" />}
              </button>
            ) : (
              <button
                id="announcement-dismiss-btn"
                onClick={() => handleNextOrFinish(false)}
                disabled={isSubmitting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 shadow-md transition-all disabled:opacity-50"
              >
                <span>
                  {currentIndex + 1 < totalCount ? 'পরবর্তী বিজ্ঞপ্তি' : 'বুঝেছি / বন্ধ করুন'}
                </span>
                {currentIndex + 1 < totalCount && <ChevronRight className="w-4 h-4 ml-1" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
