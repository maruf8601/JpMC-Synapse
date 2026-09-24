/**
 * JpMC Synapse — Discussion Forum Main View (আলোচনা)
 * Organization: Jamalpur Medical College (JpMC)
 * Timezone: Asia/Dhaka
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquareText,
  Plus,
  Search,
  Filter,
  HardDrive,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { ForumPostFeedItem, ForumPostStatus } from '../../domain/forumModels';
import { FORUM_TOPICS_LIST } from '../../domain/forumTopics';
import { fetchForumPosts } from '../../services/forumService';
import { ForumPostCard } from './ForumPostCard';
import { ForumPostComposer } from './ForumPostComposer';
import { ForumDetailView } from './ForumDetailView';
import { ForumAdminSettingsModal } from './ForumAdminSettingsModal';

interface ForumViewProps {
  currentUser: {
    uid: string;
    displayName: string;
    role: 'admin' | 'user';
    email?: string;
  };
  initialPostId?: string | null;
  onSelectPost?: (postId: string | null) => void;
}

export const ForumView: React.FC<ForumViewProps> = ({
  currentUser,
  initialPostId,
  onSelectPost,
}) => {
  const [activePostId, setActivePostId] = useState<string | null>(initialPostId || null);
  const [isComposing, setIsComposing] = useState(false);
  const [showDriveSettings, setShowDriveSettings] = useState(false);

  // Feed Query State
  const [posts, setPosts] = useState<ForumPostFeedItem[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'lastActivity' | 'newest'>('lastActivity');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync initialPostId prop
  useEffect(() => {
    if (initialPostId) {
      setActivePostId(initialPostId);
    }
  }, [initialPostId]);

  // Load feed whenever filters change
  useEffect(() => {
    if (!activePostId && !isComposing) {
      loadFeed();
    }
  }, [selectedTopic, selectedStatus, debouncedSearch, sortBy, page, activePostId, isComposing]);

  const loadFeed = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchForumPosts({
        topic: selectedTopic,
        status: selectedStatus,
        q: debouncedSearch,
        sortBy,
        page,
        limit: 15,
      });

      setPosts(res.posts);
      setTotalPosts(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err?.message || 'আলোচনা তালিকা লোড করতে ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPost = (postId: string) => {
    setActivePostId(postId);
    if (onSelectPost) onSelectPost(postId);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'forum');
    url.searchParams.set('post', postId);
    window.history.pushState({}, '', url.toString());
  };

  const handleBackToFeed = () => {
    setActivePostId(null);
    if (onSelectPost) onSelectPost(null);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'forum');
    url.searchParams.delete('post');
    window.history.pushState({}, '', url.toString());
  };

  // If a specific post is open, show the detail view
  if (activePostId) {
    return (
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
        <ForumDetailView
          postId={activePostId}
          currentUser={currentUser}
          onBack={handleBackToFeed}
          onPostDeleted={() => {
            handleBackToFeed();
            loadFeed();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <MessageSquareText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">
                আলোচনা (Discussion Forum)
              </h1>
              <p className="text-xs text-slate-500">
                জামালপুর মেডিকেল কলেজ একাডেমিক, ডিপার্টমেন্টাল ও প্রাতিষ্ঠানিক আলোচনা ফোরাম
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {currentUser.role === 'admin' && (
            <button
              onClick={() => setShowDriveSettings(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              title="গুগল ড্রাইভ স্টোরেজ কনফিগারেশন"
            >
              <HardDrive className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">ড্রাইভ স্টোরেজ</span>
            </button>
          )}

          <button
            onClick={() => setIsComposing(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন আলোচনা শুরু করুন</span>
          </button>
        </div>
      </div>

      {/* Composer Modal / Inline */}
      {isComposing && (
        <ForumPostComposer
          isAdmin={currentUser.role === 'admin'}
          onSuccess={(post) => {
            setIsComposing(false);
            handleOpenPost(post.id);
          }}
          onCancel={() => setIsComposing(false)}
        />
      )}

      {/* Search, Filter & Sort Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="আলোচনার শিরোনাম, লেখক বা বিষয়বস্তু দিয়ে খুঁজুন..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white flex-1 sm:flex-initial"
            >
              <option value="all">সব স্ট্যাটাস</option>
              <option value="waiting_answer">উত্তরের অপেক্ষায়</option>
              <option value="solved">সমাধান হয়েছে</option>
              <option value="closed">বন্ধ</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white flex-1 sm:flex-initial"
            >
              <option value="lastActivity">সর্বশেষ কার্যক্রম</option>
              <option value="newest">নতুন পোস্ট</option>
            </select>
          </div>
        </div>

        {/* Topic Pills Carousel */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => {
              setSelectedTopic('all');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full font-medium shrink-0 transition-all ${
              selectedTopic === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            সকল বিষয় ({totalPosts})
          </button>

          {FORUM_TOPICS_LIST.map((topic) => (
            <button
              key={topic.id}
              onClick={() => {
                setSelectedTopic(topic.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full font-medium shrink-0 transition-all ${
                selectedTopic === topic.id
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {topic.label}
            </button>
          ))}
        </div>
      </div>

      {/* Posts Feed List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2 bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
          <span className="text-xs font-medium">আলোচনা লোড হচ্ছে...</span>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-2">
          <AlertCircle className="w-7 h-7 text-red-600 mx-auto" />
          <p className="text-xs font-semibold text-red-900">{error}</p>
          <button
            onClick={loadFeed}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>পুনরায় চেষ্টা করুন</span>
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
          <MessageSquareText className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">কোনো আলোচনা পাওয়া যায়নি</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'আপনার অনুসন্ধানের সাথে মিলে এমন কোনো আলোচনা নেই। অন্য শব্দ দিয়ে খুঁজে দেখুন।'
              : 'এখনও কোনো আলোচনা শুরু করা হয়নি। আপনিই প্রথম নতুন আলোচনা তৈরি করুন!'}
          </p>
          <button
            onClick={() => setIsComposing(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন আলোচনা শুরু করুন</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <ForumPostCard
              key={post.id}
              post={post}
              onClick={() => handleOpenPost(post.id)}
            />
          ))}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl text-xs text-slate-600">
              <span>
                পৃষ্ঠা {page} / {totalPages} (মোট {totalPosts}টি আলোচনা)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                  title="পূর্ববর্তী পৃষ্ঠা"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
                  title="পরবর্তী পৃষ্ঠা"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin Google Drive Modal */}
      {showDriveSettings && (
        <ForumAdminSettingsModal onClose={() => setShowDriveSettings(false)} />
      )}
    </div>
  );
};
