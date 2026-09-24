/**
 * JpMC Synapse — Forum Post Feed Card Component
 * Organization: Jamalpur Medical College (JpMC)
 */

import React from 'react';
import {
  Pin,
  Lock,
  MessageSquare,
  CheckCircle2,
  Clock,
  Paperclip,
  User as UserIcon,
} from 'lucide-react';
import { ForumPostFeedItem } from '../../domain/forumModels';
import { getForumTopic } from '../../domain/forumTopics';

interface ForumPostCardProps {
  post: ForumPostFeedItem;
  onClick: () => void;
}

export const ForumPostCard: React.FC<ForumPostCardProps> = ({ post, onClick }) => {
  const topic = getForumTopic(post.topicId);

  // Format date in Asia/Dhaka
  const formattedActivity = (() => {
    try {
      const d = new Date(post.lastActivityAt || post.createdAt);
      return d.toLocaleDateString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  const statusConfig = {
    waiting_answer: {
      label: 'উত্তরের অপেক্ষায়',
      bg: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
    },
    solved: {
      label: 'সমাধান হয়েছে',
      bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
      icon: CheckCircle2,
    },
    closed: {
      label: 'বন্ধ',
      bg: 'bg-slate-100 text-slate-700 border-slate-200',
      dot: 'bg-slate-400',
    },
  }[post.status] || {
    label: post.status,
    bg: 'bg-slate-50 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  };

  const StatusIcon = (statusConfig as any).icon;

  return (
    <article
      onClick={onClick}
      className={`group relative rounded-xl border p-4 transition-all duration-200 cursor-pointer hover:shadow-md ${
        post.isPinned
          ? 'bg-amber-50/40 border-amber-200 shadow-xs'
          : 'bg-white border-slate-200 hover:border-emerald-300'
      }`}
    >
      {/* Top Meta: Pinned / Topic / Status / Restricted */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.isPinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-900 border border-amber-200">
              <Pin className="w-3 h-3 text-amber-700 fill-amber-700" />
              <span>পিন করা</span>
            </span>
          )}

          {/* Topic Badge */}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              topic.badgeBg || 'bg-slate-100'
            } ${topic.badgeText || 'text-slate-800'}`}
          >
            {topic.label}
          </span>

          {post.isRestricted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              <Lock className="w-3 h-3 text-purple-700" />
              <span>সীমাবদ্ধ</span>
            </span>
          )}
        </div>

        {/* Status Badge */}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.bg}`}
        >
          {StatusIcon ? (
            <StatusIcon className="w-3 h-3 text-emerald-600" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
          )}
          <span>{statusConfig.label}</span>
        </span>
      </div>

      {/* Title */}
      <h3 className="text-base font-semibold text-slate-900 group-hover:text-emerald-700 line-clamp-2 mb-2 leading-snug">
        {post.title}
      </h3>

      {/* Snippet */}
      {post.previewSnippet && (
        <p className="text-sm text-slate-600 line-clamp-2 mb-3 leading-relaxed">
          {post.previewSnippet}
        </p>
      )}

      {/* Footer Info: Author, Activity, Counts */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
        {/* Author info */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0">
            {post.authorName ? post.authorName.charAt(0).toUpperCase() : <UserIcon className="w-3.5 h-3.5" />}
          </div>
          <span className="font-medium text-slate-700 truncate max-w-[120px] sm:max-w-[180px]">
            {post.authorName}
          </span>
          {post.authorRole === 'admin' && (
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-100 text-red-700 font-semibold shrink-0">
              অ্যাডমিন
            </span>
          )}
        </div>

        {/* Activity & Stats */}
        <div className="flex items-center gap-3 shrink-0">
          {post.attachmentCount ? (
            <span className="inline-flex items-center gap-1 text-slate-500" title={`${post.attachmentCount}টি ফাইল সংযুক্ত`}>
              <Paperclip className="w-3.5 h-3.5" />
              <span>{post.attachmentCount}</span>
            </span>
          ) : null}

          <span className="inline-flex items-center gap-1 text-slate-600 font-medium" title="মোট মন্তব্য">
            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
            <span>{post.replyCount || 0}</span>
          </span>

          <span className="inline-flex items-center gap-1 text-slate-400" title="সর্বশেষ কার্যক্রম (এশিয়া/ঢাকা)">
            <Clock className="w-3 h-3" />
            <span>{formattedActivity}</span>
          </span>
        </div>
      </div>
    </article>
  );
};
