/**
 * JpMC Synapse — Forum Discussion Detail Page
 * Organization: Jamalpur Medical College (JpMC)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Pin,
  Lock,
  CheckCircle2,
  Clock,
  User as UserIcon,
  Paperclip,
  Download,
  Share2,
  Bookmark,
  BookmarkCheck,
  Edit3,
  Trash2,
  History,
  CornerDownRight,
  Send,
  Loader2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Check,
  MoreVertical,
  UploadCloud,
  X,
  ShieldCheck,
} from 'lucide-react';
import {
  ForumPost,
  ForumComment,
  ForumAttachment,
  ForumPostStatus,
} from '../../domain/forumModels';
import { getForumTopic } from '../../domain/forumTopics';
import {
  fetchForumPost,
  fetchForumComments,
  createForumComment,
  deleteForumPost,
  deleteForumComment,
  setForumPostStatus,
  setForumPostPinned,
  toggleFollowForumPost,
  acceptForumAnswer,
  unacceptForumAnswer,
  uploadForumAttachmentFile,
  searchUsersForMention,
} from '../../services/forumService';
import { ForumEditModal } from './ForumEditModal';
import { ForumRevisionsModal } from './ForumRevisionsModal';

interface ForumDetailViewProps {
  postId: string;
  currentUser: { uid: string; displayName: string; role: 'admin' | 'user' };
  onBack: () => void;
  onPostDeleted?: () => void;
}

export const ForumDetailView: React.FC<ForumDetailViewProps> = ({
  postId,
  currentUser,
  onBack,
  onPostDeleted,
}) => {
  const [post, setPost] = useState<ForumPost | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Comment State
  const [commentText, setCommentText] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<ForumAttachment[]>([]);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [uploadingCommentFile, setUploadingCommentFile] = useState(false);

  // Edit & Revision Modals State
  const [editingTarget, setEditingTarget] = useState<{
    type: 'post' | 'comment';
    targetId: string;
    initialTitle?: string;
    initialTopicId?: string;
    initialBody: string;
    version: number;
    isPostAuthorEditingComment?: boolean;
  } | null>(null);

  const [revisionsTarget, setRevisionsTarget] = useState<{
    type: 'post' | 'comment';
    targetId: string;
  } | null>(null);

  // Mentions
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ uid: string; displayName: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);

  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);

  const isPostAuthor = post?.authorId === currentUser.uid;
  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    loadPostAndComments();
  }, [postId]);

  const loadPostAndComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const [postRes, commentsData] = await Promise.all([
        fetchForumPost(postId),
        fetchForumComments(postId),
      ]);
      setPost(postRes.post);
      setIsFollowed(Boolean(postRes.isFollowed));
      setComments(commentsData);
    } catch (err: any) {
      setError(err?.message || 'আলোচনাটি লোড করতে ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    try {
      const nextFollow = await toggleFollowForumPost(postId);
      setIsFollowed(nextFollow);
    } catch {
      // ignore
    }
  };

  const handleShareLink = () => {
    const url = `${window.location.origin}/?tab=forum&post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('আলোচনার সরাসরি লিঙ্ক কপি করা হয়েছে!');
    });
  };

  const handleStatusChange = async (newStatus: ForumPostStatus) => {
    if (!post) return;
    try {
      const updated = await setForumPostStatus(post.id, newStatus);
      setPost(updated);
    } catch (err: any) {
      alert(err?.message || 'স্ট্যাটাস পরিবর্তন ব্যর্থ');
    }
  };

  const handleTogglePin = async () => {
    if (!post) return;
    try {
      const newPin = !post.isPinned;
      await setForumPostPinned(post.id, newPin);
      setPost({ ...post, isPinned: newPin });
    } catch (err: any) {
      alert(err?.message || 'পিন পরিবর্তন ব্যর্থ');
    }
  };

  const handleDeletePost = async () => {
    if (!post) return;
    if (!confirm('আপনি কি নিশ্চিত যে এই আলোচনাটি মুছে ফেলতে চান?')) return;
    try {
      await deleteForumPost(post.id);
      if (onPostDeleted) onPostDeleted();
      else onBack();
    } catch (err: any) {
      alert(err?.message || 'পোস্ট মুছে ফেলতে ব্যর্থ');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('আপনি কি নিশ্চিত যে এই মন্তব্যটি মুছে ফেলতে চান?')) return;
    try {
      await deleteForumComment(postId, commentId);
      await loadPostAndComments();
    } catch (err: any) {
      alert(err?.message || 'মন্তব্য মুছে ফেলতে ব্যর্থ');
    }
  };

  const handleAcceptAnswer = async (commentId: string) => {
    try {
      await acceptForumAnswer(postId, commentId);
      await loadPostAndComments();
    } catch (err: any) {
      alert(err?.message || 'সমাধানকারী উত্তর নির্ধারণ ব্যর্থ');
    }
  };

  const handleUnacceptAnswer = async (commentId: string) => {
    try {
      await unacceptForumAnswer(postId, commentId);
      await loadPostAndComments();
    } catch (err: any) {
      alert(err?.message || 'সমাধানকারী উত্তর প্রত্যাহার ব্যর্থ');
    }
  };

  // Comment submission
  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() && commentAttachments.length === 0) return;

    setSubmittingComment(true);
    try {
      await createForumComment(postId, {
        body: commentText.trim(),
        parentCommentId: replyingToCommentId,
        attachments: commentAttachments,
      });

      setCommentText('');
      setCommentAttachments([]);
      setReplyingToCommentId(null);
      await loadPostAndComments();
    } catch (err: any) {
      alert(err?.message || 'মন্তব্য পাঠাতে ব্যর্থ হয়েছে');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCommentFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? (Array.from(e.target.files) as File[]) : [];
    if (files.length === 0) return;

    setUploadingCommentFile(true);
    try {
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`"${file.name}" ফাইলটির আকার ১০ মেগাবাইটের বেশি।`);
          continue;
        }
        const att = await uploadForumAttachmentFile(file, post?.isRestricted);
        setCommentAttachments((prev) => [...prev, att]);
      }
    } catch (err: any) {
      alert(err?.message || 'ফাইল আপলোড ব্যর্থ');
    } finally {
      setUploadingCommentFile(false);
      if (commentFileRef.current) commentFileRef.current.value = '';
    }
  };

  // Render Rich Text with Markdown-like bold, italic, code, quotes, links
  const renderRichText = (text: string) => {
    if (!text) return null;
    return (
      <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed space-y-2 whitespace-pre-wrap font-normal text-sm break-words">
        {text}
      </div>
    );
  };

  // Render attachments gallery
  const renderAttachments = (atts?: ForumAttachment[]) => {
    if (!atts || atts.length === 0) return null;

    return (
      <div className="mt-4 pt-3 border-t border-slate-100">
        <h5 className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
          <span>সংযুক্ত ফাইলসমূহ ({atts.length})</span>
        </h5>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {atts.map((att) => {
            const isImage = att.mimeType.startsWith('image/');
            const sizeStr = (att.fileSize / 1024).toFixed(0) + ' KB';
            const downloadUrl = `/api/forum/attachments/${att.id}/download`;
            const previewUrl = `/api/forum/attachments/${att.id}`;

            return (
              <div
                key={att.id}
                className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs hover:border-emerald-300 transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isImage ? (
                    <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                  <div className="truncate">
                    <p className="font-medium text-slate-800 truncate">{att.fileName}</p>
                    <p className="text-[10px] text-slate-500">{sizeStr} • গুগল ড্রাইভ</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <a
                    href={downloadUrl}
                    download={att.fileName}
                    className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                    title="ডাউনলোড করুন"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <span className="text-sm font-medium">আলোচনাটি লোড হচ্ছে...</span>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
        <h3 className="font-bold text-red-900 text-base">আলোচনা দেখতে সমস্যা হয়েছে</h3>
        <p className="text-xs text-red-700">{error || 'আলোচনাটি খুঁজে পাওয়া যায়নি'}</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>আলোচনা তালিকায় ফিরে যান</span>
        </button>
      </div>
    );
  }

  const topic = getForumTopic(post.topicId);
  const createdDate = (() => {
    try {
      return new Date(post.createdAt).toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return post.createdAt;
    }
  })();

  // Separate accepted answer comment if exists
  const acceptedComment = comments.find((c) => c.isAcceptedAnswer || c.id === post.acceptedAnswerId);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-emerald-700 bg-white border border-slate-200 hover:border-emerald-300 px-3 py-2 rounded-xl transition-all shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>আলোচনায় ফিরুন</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Share */}
          <button
            onClick={handleShareLink}
            className="p-2 text-slate-600 hover:text-emerald-700 bg-white border border-slate-200 hover:border-emerald-300 rounded-xl transition-all shadow-2xs"
            title="লিঙ্ক কপি করুন"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Follow / Bookmark */}
          <button
            onClick={handleToggleFollow}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all shadow-2xs ${
              isFollowed
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
            }`}
          >
            {isFollowed ? (
              <>
                <BookmarkCheck className="w-4 h-4 text-emerald-600" />
                <span>অনুসরণ করছেন</span>
              </>
            ) : (
              <>
                <Bookmark className="w-4 h-4 text-slate-500" />
                <span>অনুসরণ করুন</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Post Card */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        {/* Meta badges: Pin, Topic, Status, Restricted */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {post.isPinned && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                <Pin className="w-3.5 h-3.5 fill-amber-700 text-amber-700" />
                <span>পিন করা</span>
              </span>
            )}

            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                topic.badgeBg || 'bg-slate-100'
              } ${topic.badgeText || 'text-slate-800'}`}
            >
              {topic.label}
            </span>

            {post.isRestricted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                <Lock className="w-3.5 h-3.5 text-purple-700" />
                <span>সীমাবদ্ধ</span>
              </span>
            )}
          </div>

          {/* Status Dropdown / Badge */}
          <div className="flex items-center gap-2">
            {isPostAuthor || isAdmin ? (
              <select
                value={post.status}
                onChange={(e) => handleStatusChange(e.target.value as ForumPostStatus)}
                className="text-xs font-semibold px-2.5 py-1 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="waiting_answer">উত্তরের অপেক্ষায়</option>
                <option value="solved">সমাধান হয়েছে</option>
                <option value="closed">বন্ধ</option>
              </select>
            ) : (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  post.status === 'solved'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : post.status === 'closed'
                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {post.status === 'solved'
                  ? 'সমাধান হয়েছে'
                  : post.status === 'closed'
                  ? 'বন্ধ'
                  : 'উত্তরের অপেক্ষায়'}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
          {post.title}
        </h1>

        {/* Author Header */}
        <div className="flex items-center justify-between flex-wrap gap-2 py-2 border-y border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
              {post.authorName ? post.authorName.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-900 text-xs sm:text-sm">{post.authorName}</span>
                {post.authorRole === 'admin' && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-red-100 text-red-700 font-semibold flex items-center gap-0.5">
                    <ShieldCheck className="w-3 h-3" />
                    অ্যাডমিন
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {createdDate}
                </span>
                {post.isEdited && (
                  <button
                    onClick={() => setRevisionsTarget({ type: 'post', targetId: post.id })}
                    className="text-emerald-700 hover:underline flex items-center gap-0.5"
                    title="সম্পাদনার ইতিহাস দেখুন"
                  >
                    <span>(সম্পাদিত)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Post Action Buttons (Edit, Delete, Pin) */}
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <button
                onClick={handleTogglePin}
                className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-slate-100 rounded-lg text-xs"
                title={post.isPinned ? 'আনপিন করুন' : 'পিন করুন'}
              >
                <Pin className={`w-4 h-4 ${post.isPinned ? 'fill-amber-600 text-amber-600' : ''}`} />
              </button>
            )}

            {(isPostAuthor || isAdmin) && (
              <>
                <button
                  onClick={() =>
                    setEditingTarget({
                      type: 'post',
                      targetId: post.id,
                      initialTitle: post.title,
                      initialTopicId: post.topicId,
                      initialBody: post.body,
                      version: post.version || 1,
                    })
                  }
                  className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-lg text-xs"
                  title="পোস্ট সম্পাদনা"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeletePost}
                  className="p-1.5 text-slate-500 hover:text-red-700 hover:bg-slate-100 rounded-lg text-xs"
                  title="পোস্ট মুছে ফেলুন"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        {renderRichText(post.body)}

        {/* Attachments */}
        {renderAttachments(post.attachments)}
      </article>

      {/* Solver / Accepted Answer Highlight Banner */}
      {acceptedComment && (
        <section className="bg-emerald-50/70 border-2 border-emerald-400 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-200 pb-2.5">
            <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 fill-emerald-100" />
              <span>সমাধানকারী উত্তর (Accepted Answer)</span>
            </div>
            {(isPostAuthor || isAdmin) && (
              <button
                onClick={() => handleUnacceptAnswer(acceptedComment.id)}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-medium underline"
              >
                চিহ্ন প্রত্যাহার করুন
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <div className="w-6 h-6 rounded-full bg-emerald-200 text-emerald-900 flex items-center justify-center font-bold text-[11px]">
              {acceptedComment.authorName.charAt(0).toUpperCase()}
            </div>
            <span className="font-semibold text-slate-800">{acceptedComment.authorName}</span>
            <span>•</span>
            <span className="text-[11px] text-slate-400">
              {new Date(acceptedComment.createdAt).toLocaleDateString('bn-BD', {
                timeZone: 'Asia/Dhaka',
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>

          <div className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
            {acceptedComment.body}
          </div>

          {renderAttachments(acceptedComment.attachments)}
        </section>
      )}

      {/* Comments List Section */}
      <section className="space-y-4">
        <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
          <span>মন্তব্য ও আলোচনা</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
            {comments.length}
          </span>
        </h3>

        {comments.length === 0 ? (
          <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center text-slate-500 text-xs">
            এখনও কোনো মন্তব্য করা হয়নি। নিচে আপনার মতামত লিখুন।
          </div>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                postAuthorId={post.authorId}
                currentUser={currentUser}
                onReply={(cid) => {
                  setReplyingToCommentId(cid);
                  commentInputRef.current?.focus();
                }}
                onEdit={(c, isPostAuthorEditing) =>
                  setEditingTarget({
                    type: 'comment',
                    targetId: c.id,
                    initialBody: c.body,
                    version: c.version || 1,
                    isPostAuthorEditingComment: isPostAuthorEditing,
                  })
                }
                onDelete={(cid) => handleDeleteComment(cid)}
                onAcceptAnswer={(cid) => handleAcceptAnswer(cid)}
                onViewRevisions={(cid) => setRevisionsTarget({ type: 'comment', targetId: cid })}
                renderAttachments={renderAttachments}
              />
            ))}
          </div>
        )}
      </section>

      {/* Comment Composer */}
      {post.status === 'closed' ? (
        <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl text-center text-slate-600 text-xs font-medium">
          🔒 এই আলোচনাটি বন্ধ করা হয়েছে। নতুন মন্তব্য করার সুযোগ বন্ধ রয়েছে।
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          {replyingToCommentId && (
            <div className="flex items-center justify-between p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
              <span className="flex items-center gap-1.5 font-medium">
                <CornerDownRight className="w-3.5 h-3.5 text-emerald-600" />
                <span>একটি মন্তব্যের উত্তরে লিখছেন</span>
              </span>
              <button
                onClick={() => setReplyingToCommentId(null)}
                className="text-xs text-slate-500 hover:text-red-700"
              >
                বাতিল
              </button>
            </div>
          )}

          <form onSubmit={handleSubmitComment} className="space-y-3">
            <textarea
              ref={commentInputRef}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="আপনার মতামত বা সমাধান লিখুন... (কাউকে উল্লেখ করতে @ ব্যবহার করুন)"
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-y font-normal"
            />

            {/* Attached files chips */}
            {commentAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {commentAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700"
                  >
                    <Paperclip className="w-3 h-3 text-slate-500" />
                    <span className="truncate max-w-[150px]">{att.fileName}</span>
                    <button
                      type="button"
                      onClick={() => setCommentAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                      className="text-slate-400 hover:text-red-600 ml-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              {/* File Attachment Button */}
              <div>
                <input
                  ref={commentFileRef}
                  type="file"
                  multiple
                  onChange={handleCommentFileUpload}
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                />
                <button
                  type="button"
                  onClick={() => commentFileRef.current?.click()}
                  disabled={uploadingCommentFile}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-colors"
                >
                  {uploadingCommentFile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <UploadCloud className="w-3.5 h-3.5" />
                  )}
                  <span>ফাইল সংযুক্ত করুন</span>
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submittingComment || (!commentText.trim() && commentAttachments.length === 0)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
              >
                {submittingComment ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>মন্তব্য পোস্ট করুন</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingTarget && (
        <ForumEditModal
          targetType={editingTarget.type}
          targetId={editingTarget.targetId}
          postId={postId}
          initialTitle={editingTarget.initialTitle}
          initialTopicId={editingTarget.initialTopicId}
          initialBody={editingTarget.initialBody}
          currentVersion={editingTarget.version}
          isPostAuthorEditingComment={editingTarget.isPostAuthorEditingComment}
          onSuccess={() => loadPostAndComments()}
          onClose={() => setEditingTarget(null)}
        />
      )}

      {/* Revision History Modal */}
      {revisionsTarget && (
        <ForumRevisionsModal
          targetType={revisionsTarget.type}
          targetId={revisionsTarget.targetId}
          onClose={() => setRevisionsTarget(null)}
        />
      )}
    </div>
  );
};

/**
 * Individual Comment & Reply Tree Card
 */
interface CommentCardProps {
  comment: ForumComment;
  postAuthorId: string;
  currentUser: { uid: string; displayName: string; role: 'admin' | 'user' };
  onReply: (commentId: string) => void;
  onEdit: (comment: ForumComment, isPostAuthorEditing: boolean) => void;
  onDelete: (commentId: string) => void;
  onAcceptAnswer: (commentId: string) => void;
  onViewRevisions: (commentId: string) => void;
  renderAttachments: (atts?: ForumAttachment[]) => React.ReactNode;
}

const CommentCard: React.FC<CommentCardProps> = ({
  comment,
  postAuthorId,
  currentUser,
  onReply,
  onEdit,
  onDelete,
  onAcceptAnswer,
  onViewRevisions,
  renderAttachments,
}) => {
  const isCommentAuthor = comment.authorId === currentUser.uid;
  const isPostAuthor = postAuthorId === currentUser.uid;
  const isAdmin = currentUser.role === 'admin';

  // Permission: Can edit if Comment Author, OR POST AUTHOR, or Admin!
  const canEdit = isCommentAuthor || isPostAuthor || isAdmin;
  const canDelete = isCommentAuthor || isPostAuthor || isAdmin;
  const canAccept = (isPostAuthor || isAdmin) && !comment.isAcceptedAnswer && !comment.isDeleted;

  const dateStr = (() => {
    try {
      return new Date(comment.createdAt).toLocaleDateString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return comment.createdAt;
    }
  })();

  return (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
        comment.isAcceptedAnswer
          ? 'bg-emerald-50/40 border-emerald-300'
          : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
            {comment.authorName ? comment.authorName.charAt(0).toUpperCase() : 'U'}
          </div>
          <span className="font-semibold text-slate-800 text-xs">{comment.authorName}</span>
          {comment.authorId === postAuthorId && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 font-semibold">
              পোস্টের লেখক
            </span>
          )}
          {comment.authorRole === 'admin' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 font-semibold">
              অ্যাডমিন
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>{dateStr}</span>
          {comment.isEdited && (
            <button
              onClick={() => onViewRevisions(comment.id)}
              className="text-emerald-700 hover:underline"
              title="সম্পাদনার ইতিহাস দেখুন"
            >
              (সম্পাদিত)
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        className={`text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
          comment.isDeleted ? 'text-slate-400 italic' : 'text-slate-800'
        }`}
      >
        {comment.body}
      </div>

      {/* Attachments */}
      {!comment.isDeleted && renderAttachments(comment.attachments)}

      {/* Action Footer */}
      {!comment.isDeleted && (
        <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onReply(comment.id)}
              className="inline-flex items-center gap-1 hover:text-emerald-700 font-medium"
            >
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>উত্তর দিন</span>
            </button>

            {canAccept && (
              <button
                onClick={() => onAcceptAnswer(comment.id)}
                className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold"
                title="এই মন্তব্যটিকে সমাধানকারী উত্তর হিসেবে চিহ্নিত করুন"
              >
                <Check className="w-3.5 h-3.5" />
                <span>সমাধানকারী উত্তর হিসেবে চিহ্নিত করুন</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                onClick={() => onEdit(comment, isPostAuthor && !isCommentAuthor)}
                className="p-1 hover:text-blue-700 rounded"
                title={
                  isPostAuthor && !isCommentAuthor
                    ? 'পোস্টের লেখক হিসেবে সম্পাদনা'
                    : 'সম্পাদনা'
                }
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}

            {canDelete && (
              <button
                onClick={() => onDelete(comment.id)}
                className="p-1 hover:text-red-700 rounded"
                title="মুছে ফেলুন"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 pl-3 sm:pl-5 border-l-2 border-slate-200 space-y-2.5">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              postAuthorId={postAuthorId}
              currentUser={currentUser}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onAcceptAnswer={onAcceptAnswer}
              onViewRevisions={onViewRevisions}
              renderAttachments={renderAttachments}
            />
          ))}
        </div>
      )}
    </div>
  );
};
