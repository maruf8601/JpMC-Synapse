/**
 * JpMC Synapse — Discussion Forum Server Service
 * Organization: Jamalpur Medical College (JpMC)
 *
 * Implements:
 * - Server-side authorization on every action
 * - Concurrency control (optimistic locking to prevent silent overwrite)
 * - Complete edit history / audit trail (who edited, when in Asia/Dhaka, previous version)
 * - Post author's right to edit other users' comments on their post while keeping original author attribution
 * - Soft-deletion preserving thread structure
 * - Solver answer (“সমাধানকারী উত্তর”) selection
 * - Pinned, solved, closed statuses
 * - Restricted discussion access control
 * - Push notifications for replies and @mentions
 */

import { adminDb, removeUndefinedFields, getActiveDevices } from './firebaseAdmin';
import { sendFcmPushNotification } from './reminderScheduler';
import { FORUM_TOPICS_MAP } from '../domain/forumTopics';
import {
  ForumPost,
  ForumComment,
  ForumRevision,
  ForumPostStatus,
  ForumPostFeedItem,
} from '../domain/forumModels';
import crypto from 'crypto';

/**
 * Format timestamp to Asia/Dhaka time
 */
export function formatDhakaTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return isoString;
  }
}

/**
 * Extract @mentions from rich-text or plain text (e.g. @usr_xxx or @Name)
 */
export function extractMentions(text: string): string[] {
  if (!text) return [];
  const regex = /@([a-zA-Z0-9_\u0980-\u09FF-]+)/g;
  const matches = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return Array.from(matches);
}

/**
 * List discussions feed with filtering, search, and pagination
 */
export async function listForumPosts({
  topicId,
  status,
  search,
  sortBy = 'lastActivity',
  page = 1,
  limit = 20,
  callerUid,
  callerRole,
}: {
  topicId?: string;
  status?: string;
  search?: string;
  sortBy?: 'lastActivity' | 'newest';
  page?: number;
  limit?: number;
  callerUid?: string;
  callerRole?: string;
}): Promise<{
  posts: ForumPostFeedItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  // Query collection without composite filters to avoid requiring custom composite indexes
  const snapshot = await adminDb.collection('forum_posts').get();
  let allPosts: ForumPost[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data() as ForumPost;
    // Filter soft-deleted in memory
    if (data.isDeleted) return;

    // Filter by topic if specified
    if (topicId && topicId !== 'all' && data.topicId !== topicId) {
      return;
    }

    // Filter by status if specified
    if (status && status !== 'all' && data.status !== status) {
      return;
    }

    allPosts.push({ ...data, id: doc.id });
  });

  // Filter restricted discussions on the server:
  // Post is visible if:
  // 1. isRestricted !== true
  // 2. OR caller is post author
  // 3. OR caller is in allowedUserIds
  // 4. OR caller is admin
  const isCallerAdmin = callerRole === 'admin';
  allPosts = allPosts.filter((post) => {
    if (!post.isRestricted) return true;
    if (isCallerAdmin) return true;
    if (callerUid && post.authorId === callerUid) return true;
    if (callerUid && post.allowedUserIds && post.allowedUserIds.includes(callerUid)) return true;
    return false;
  });

  // Keyword Search across title and body
  if (search && search.trim()) {
    const qLower = search.trim().toLowerCase();
    allPosts = allPosts.filter(
      (p) =>
        (p.title && p.title.toLowerCase().includes(qLower)) ||
        (p.body && p.body.toLowerCase().includes(qLower)) ||
        (p.authorName && p.authorName.toLowerCase().includes(qLower))
    );
  }

  // Sort: Pinned posts always on top, then by selected sort criteria
  allPosts.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    if (sortBy === 'newest') {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    return (b.lastActivityAt || b.createdAt || '').localeCompare(a.lastActivityAt || a.createdAt || '');
  });

  const total = allPosts.length;
  const startIndex = (page - 1) * limit;
  const paginated = allPosts.slice(startIndex, startIndex + limit);

  const feedItems: ForumPostFeedItem[] = paginated.map((p) => {
    const plainText = (p.body || '').replace(/<[^>]*>?/gm, '').trim();
    const previewSnippet = plainText.length > 120 ? plainText.substring(0, 117) + '...' : plainText;

    return {
      id: p.id,
      title: p.title,
      topicId: p.topicId,
      topicLabel: p.topicLabel || FORUM_TOPICS_MAP[p.topicId]?.label || p.topicId,
      authorId: p.authorId,
      authorName: p.authorName,
      authorRole: p.authorRole,
      status: p.status,
      isPinned: Boolean(p.isPinned),
      isRestricted: Boolean(p.isRestricted),
      acceptedAnswerId: p.acceptedAnswerId || null,
      replyCount: p.replyCount || 0,
      createdAt: p.createdAt,
      lastActivityAt: p.lastActivityAt || p.createdAt,
      attachmentCount: p.attachments?.length || 0,
      previewSnippet,
    };
  });

  return {
    posts: feedItems,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Get single post details with restriction validation
 */
export async function getForumPostById(
  postId: string,
  callerUid?: string,
  callerRole?: string
): Promise<{
  post: ForumPost;
  isFollowed?: boolean;
} | null> {
  const docSnap = await adminDb.collection('forum_posts').doc(postId).get();
  if (!docSnap.exists) return null;

  const post = docSnap.data() as ForumPost;
  if (post.isDeleted) return null;

  // Enforce restriction permissions
  if (post.isRestricted) {
    const isCallerAdmin = callerRole === 'admin';
    const isAuthor = callerUid && post.authorId === callerUid;
    const isAllowed = callerUid && post.allowedUserIds && post.allowedUserIds.includes(callerUid);

    if (!isCallerAdmin && !isAuthor && !isAllowed) {
      throw new Error('ACCESS_DENIED_RESTRICTED');
    }
  }

  // Check if caller follows this post
  let isFollowed = false;
  if (callerUid) {
    const followSnap = await adminDb
      .collection('forum_follows')
      .doc(`${postId}_${callerUid}`)
      .get();
    isFollowed = followSnap.exists;
  }

  return {
    post: { ...post, id: docSnap.id },
    isFollowed,
  };
}

/**
 * Create a new discussion post
 */
export async function createForumPost({
  title,
  body,
  topicId,
  attachments = [],
  isRestricted = false,
  allowedUserIds = [],
  callerUser,
}: {
  title: string;
  body: string;
  topicId: string;
  attachments?: any[];
  isRestricted?: boolean;
  allowedUserIds?: string[];
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' };
}): Promise<ForumPost> {
  const trimmedTitle = (title || '').trim();
  const trimmedBody = (body || '').trim();

  if (!trimmedTitle) {
    throw new Error('আলোচনার শিরোনাম দেওয়া আবশ্যক।');
  }
  if (!trimmedBody) {
    throw new Error('আলোচনার মূল বিষয়বস্তু লেখা আবশ্যক।');
  }
  if (!topicId) {
    throw new Error('একটি বিষয় বা বিভাগ নির্বাচন করুন।');
  }

  const topicDef = FORUM_TOPICS_MAP[topicId];
  const topicLabel = topicDef ? topicDef.label : topicId;
  const nowIso = new Date().toISOString();
  const postId = `post_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const postDoc: ForumPost = {
    id: postId,
    title: trimmedTitle,
    body: trimmedBody,
    topicId,
    topicLabel,
    authorId: callerUser.uid,
    authorName: callerUser.displayName || 'Faculty Member',
    authorRole: callerUser.role || 'user',
    status: 'waiting_answer',
    isPinned: false,
    isRestricted: Boolean(isRestricted),
    allowedUserIds: isRestricted ? allowedUserIds : [],
    acceptedAnswerId: null,
    attachments: attachments || [],
    replyCount: 0,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActivityAt: nowIso,
  };

  await adminDb.collection('forum_posts').doc(postId).set(removeUndefinedFields(postDoc));

  // Automatically follow own post
  await adminDb.collection('forum_follows').doc(`${postId}_${callerUser.uid}`).set({
    postId,
    userId: callerUser.uid,
    createdAt: nowIso,
  });

  // Check for @mentions and notify users
  notifyMentionedUsers({
    text: `${trimmedTitle} ${trimmedBody}`,
    sourceTitle: trimmedTitle,
    postId,
    authorName: callerUser.displayName,
    authorUid: callerUser.uid,
  }).catch((err) => console.warn('[Forum] Mention notification warning:', err));

  return postDoc;
}

/**
 * Update discussion post with optimistic locking and revision history
 */
export async function updateForumPost({
  postId,
  title,
  body,
  topicId,
  attachments,
  expectedVersion,
  changeSummary,
  callerUser,
}: {
  postId: string;
  title: string;
  body: string;
  topicId: string;
  attachments?: any[];
  expectedVersion?: number;
  changeSummary?: string;
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' };
}): Promise<ForumPost> {
  const postRef = adminDb.collection('forum_posts').doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) {
    throw new Error('আলোচনাটি খুঁজে পাওয়া যায়নি।');
  }

  const existing = snap.data() as ForumPost;
  const isAdmin = callerUser.role === 'admin';
  const isAuthor = existing.authorId === callerUser.uid;

  if (!isAdmin && !isAuthor) {
    throw new Error('শুধুমাত্র পোস্টের লেখক বা অ্যাডমিনিস্ট্রেটর এই পোস্ট সম্পাদনা করতে পারবেন।');
  }

  if (existing.status === 'closed' && !isAdmin) {
    throw new Error('এই আলোচনাটি বন্ধ করা হয়েছে। নতুন কোনো সম্পাদনা করা সম্ভব নয়।');
  }

  // Concurrency check: prevent silent overwrite
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    throw new Error('CONCURRENCY_CONFLICT: অন্য কেউ এই পোস্টটি ইতোমধ্যে সম্পাদনা করেছেন। পেজটি রিফ্রেশ করে পুনরায় চেষ্টা করুন।');
  }

  const nowIso = new Date().toISOString();

  // Save audit revision record
  const revisionId = `rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const revisionDoc: ForumRevision = {
    id: revisionId,
    targetType: 'post',
    targetId: postId,
    editorId: callerUser.uid,
    editorName: callerUser.displayName,
    editorRole: callerUser.role,
    isPostAuthor: isAuthor,
    editedAt: nowIso,
    previousTitle: existing.title,
    previousContent: existing.body,
    changeSummary: changeSummary || 'পোস্ট সম্পাদনা',
  };
  await adminDb.collection('forum_revisions').doc(revisionId).set(removeUndefinedFields(revisionDoc));

  const topicDef = FORUM_TOPICS_MAP[topicId];
  const topicLabel = topicDef ? topicDef.label : topicId;

  const updatedFields: Partial<ForumPost> = {
    title: (title || '').trim() || existing.title,
    body: (body || '').trim() || existing.body,
    topicId: topicId || existing.topicId,
    topicLabel: topicLabel || existing.topicLabel,
    attachments: attachments !== undefined ? attachments : existing.attachments,
    version: (existing.version || 1) + 1,
    updatedAt: nowIso,
    isEdited: true,
    lastEditedBy: {
      uid: callerUser.uid,
      displayName: callerUser.displayName,
      role: callerUser.role,
      isPostAuthor: isAuthor,
      editedAt: nowIso,
    },
  };

  await postRef.set(removeUndefinedFields(updatedFields), { merge: true });

  return {
    ...existing,
    ...updatedFields,
  };
}

/**
 * Soft delete post
 */
export async function deleteForumPost(
  postId: string,
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' }
): Promise<void> {
  const postRef = adminDb.collection('forum_posts').doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) throw new Error('পোস্টটি পাওয়া যায়নি।');

  const post = snap.data() as ForumPost;
  const isAdmin = callerUser.role === 'admin';
  const isAuthor = post.authorId === callerUser.uid;

  if (!isAdmin && !isAuthor) {
    throw new Error('পোস্ট মুছে ফেলার অনুমতি নেই।');
  }

  await postRef.set(
    {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: callerUser.displayName,
    },
    { merge: true }
  );
}

/**
 * Change discussion status: waiting_answer, solved, closed
 */
export async function setForumPostStatus(
  postId: string,
  status: ForumPostStatus,
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' }
): Promise<ForumPost> {
  const postRef = adminDb.collection('forum_posts').doc(postId);
  const snap = await postRef.get();
  if (!snap.exists) throw new Error('পোস্ট পাওয়া যায়নি।');

  const post = snap.data() as ForumPost;
  const isAdmin = callerUser.role === 'admin';
  const isAuthor = post.authorId === callerUser.uid;

  if (!isAdmin && !isAuthor) {
    throw new Error('আলোচনার স্ট্যাটাস পরিবর্তন করার অনুমতি নেই।');
  }

  const nowIso = new Date().toISOString();
  await postRef.set(
    {
      status,
      updatedAt: nowIso,
      lastActivityAt: nowIso,
    },
    { merge: true }
  );

  return { ...post, status, updatedAt: nowIso };
}

/**
 * Pin or unpin post (Admin only)
 */
export async function setForumPostPinned(
  postId: string,
  isPinned: boolean,
  callerUser: { uid: string; role: 'admin' | 'user' }
): Promise<void> {
  if (callerUser.role !== 'admin') {
    throw new Error('শুধুমাত্র অ্যাডমিনিস্ট্রেটর পোস্ট পিন বা আনপিন করতে পারেন।');
  }

  await adminDb.collection('forum_posts').doc(postId).set(
    {
      isPinned: Boolean(isPinned),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

/**
 * List comments and replies for a discussion
 */
export async function getForumComments(
  postId: string,
  callerUid?: string,
  callerRole?: string
): Promise<ForumComment[]> {
  // Check post restriction first
  const postSnap = await adminDb.collection('forum_posts').doc(postId).get();
  if (!postSnap.exists) return [];
  const post = postSnap.data() as ForumPost;

  if (post.isRestricted) {
    const isCallerAdmin = callerRole === 'admin';
    const isAuthor = callerUid && post.authorId === callerUid;
    const isAllowed = callerUid && post.allowedUserIds && post.allowedUserIds.includes(callerUid);
    if (!isCallerAdmin && !isAuthor && !isAllowed) {
      throw new Error('ACCESS_DENIED_RESTRICTED');
    }
  }

  const snap = await adminDb
    .collection('forum_comments')
    .where('postId', '==', postId)
    .get();

  const comments: ForumComment[] = [];
  snap.forEach((doc) => {
    comments.push({ ...(doc.data() as ForumComment), id: doc.id });
  });

  // Sort chronologically
  comments.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  // Build threaded tree: root comments and child replies
  const commentMap = new Map<string, ForumComment>();
  const rootComments: ForumComment[] = [];

  comments.forEach((c) => {
    c.replies = [];
    commentMap.set(c.id, c);
  });

  comments.forEach((c) => {
    if (c.parentCommentId && commentMap.has(c.parentCommentId)) {
      commentMap.get(c.parentCommentId)!.replies!.push(c);
    } else {
      rootComments.push(c);
    }
  });

  return rootComments;
}

/**
 * Create comment or reply
 */
export async function createForumComment({
  postId,
  parentCommentId,
  body,
  attachments = [],
  callerUser,
}: {
  postId: string;
  parentCommentId?: string | null;
  body: string;
  attachments?: any[];
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' };
}): Promise<ForumComment> {
  const postRef = adminDb.collection('forum_posts').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new Error('আলোচনাটি পাওয়া যায়নি।');

  const post = postSnap.data() as ForumPost;

  if (post.status === 'closed' && callerUser.role !== 'admin') {
    throw new Error('আলোচনাটি বন্ধ থাকায় নতুন মন্তব্য যোগ করা সম্ভব নয়।');
  }

  const trimmedBody = (body || '').trim();
  if (!trimmedBody && (!attachments || attachments.length === 0)) {
    throw new Error('মন্তব্য লিখুন অথবা ফাইল সংযুক্ত করুন।');
  }

  const nowIso = new Date().toISOString();
  const commentId = `cmt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const commentDoc: ForumComment = {
    id: commentId,
    postId,
    parentCommentId: parentCommentId || null,
    authorId: callerUser.uid,
    authorName: callerUser.displayName || 'Faculty Member',
    authorRole: callerUser.role || 'user',
    body: trimmedBody,
    attachments: attachments || [],
    isAcceptedAnswer: false,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  };

  await adminDb.collection('forum_comments').doc(commentId).set(removeUndefinedFields(commentDoc));

  // Update post reply count & last activity
  const newReplyCount = (post.replyCount || 0) + 1;
  await postRef.set(
    {
      replyCount: newReplyCount,
      lastActivityAt: nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  // Notify post author and parent comment author
  notifyCommentParticipants({
    post,
    commentDoc,
    callerUser,
  }).catch((err) => console.warn('[Forum] Comment notification warning:', err));

  return commentDoc;
}

/**
 * Update comment
 * CRITICAL RULE:
 * 1. Comment author can edit.
 * 2. POST AUTHOR can ALSO edit any user's comment on that post!
 * 3. Admins can edit/moderate.
 * Original author attribution remains intact.
 */
export async function updateForumComment({
  postId,
  commentId,
  body,
  expectedVersion,
  changeSummary,
  callerUser,
}: {
  postId: string;
  commentId: string;
  body: string;
  expectedVersion?: number;
  changeSummary?: string;
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' };
}): Promise<ForumComment> {
  const commentRef = adminDb.collection('forum_comments').doc(commentId);
  const snap = await commentRef.get();
  if (!snap.exists) throw new Error('মন্তব্যটি খুঁজে পাওয়া যায়নি।');

  const comment = snap.data() as ForumComment;

  // Retrieve post to check if caller is the post author
  const postSnap = await adminDb.collection('forum_posts').doc(postId).get();
  if (!postSnap.exists) throw new Error('পোস্ট পাওয়া যায়নি।');
  const post = postSnap.data() as ForumPost;

  const isAdmin = callerUser.role === 'admin';
  const isCommentAuthor = comment.authorId === callerUser.uid;
  const isPostAuthor = post.authorId === callerUser.uid;

  if (!isAdmin && !isCommentAuthor && !isPostAuthor) {
    throw new Error('শুধুমাত্র মন্তব্যের লেখক, পোস্টের লেখক বা অ্যাডমিনিস্ট্রেটর এই মন্তব্য সম্পাদনা করতে পারবেন।');
  }

  // Concurrency check
  if (expectedVersion !== undefined && comment.version !== expectedVersion) {
    throw new Error('CONCURRENCY_CONFLICT: অন্য কেউ এই মন্তব্যটি ইতোমধ্যে সম্পাদনা করেছেন। পেজটি রিফ্রেশ করুন।');
  }

  const nowIso = new Date().toISOString();

  // Save audit revision
  const revisionId = `rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const revisionDoc: ForumRevision = {
    id: revisionId,
    targetType: 'comment',
    targetId: commentId,
    editorId: callerUser.uid,
    editorName: callerUser.displayName,
    editorRole: callerUser.role,
    isPostAuthor,
    editedAt: nowIso,
    previousContent: comment.body,
    changeSummary: isPostAuthor && !isCommentAuthor
      ? `পোস্টের লেখক (${callerUser.displayName}) কর্তৃক সম্পাদিত`
      : changeSummary || 'মন্তব্য সম্পাদনা',
  };
  await adminDb.collection('forum_revisions').doc(revisionId).set(removeUndefinedFields(revisionDoc));

  const updatedFields: Partial<ForumComment> = {
    body: (body || '').trim(),
    version: (comment.version || 1) + 1,
    updatedAt: nowIso,
    isEdited: true,
    lastEditedBy: {
      uid: callerUser.uid,
      displayName: callerUser.displayName,
      role: callerUser.role,
      isPostAuthor,
      editedAt: nowIso,
    },
  };

  await commentRef.set(removeUndefinedFields(updatedFields), { merge: true });

  return {
    ...comment,
    ...updatedFields,
  };
}

/**
 * Delete comment (Preserves replies tree via soft-deletion placeholder)
 */
export async function deleteForumComment(
  postId: string,
  commentId: string,
  callerUser: { uid: string; displayName: string; role: 'admin' | 'user' }
): Promise<void> {
  const commentRef = adminDb.collection('forum_comments').doc(commentId);
  const snap = await commentRef.get();
  if (!snap.exists) throw new Error('মন্তব্যটি পাওয়া যায়নি।');

  const comment = snap.data() as ForumComment;

  const postSnap = await adminDb.collection('forum_posts').doc(postId).get();
  const post = postSnap.exists ? (postSnap.data() as ForumPost) : null;

  const isAdmin = callerUser.role === 'admin';
  const isCommentAuthor = comment.authorId === callerUser.uid;
  const isPostAuthor = post ? post.authorId === callerUser.uid : false;

  if (!isAdmin && !isCommentAuthor && !isPostAuthor) {
    throw new Error('মন্তব্য মুছে ফেলার অনুমতি নেই।');
  }

  // Soft-delete to preserve replies hierarchy
  await commentRef.set(
    {
      isDeleted: true,
      body: '[এই মন্তব্যটি লেখক বা মডারেটর কর্তৃক মুছে ফেলা হয়েছে]',
      deletedAt: new Date().toISOString(),
      deletedBy: callerUser.displayName,
    },
    { merge: true }
  );
}

/**
 * Mark comment as solver answer (“সমাধানকারী উত্তর”)
 * Post author or admin only
 */
export async function acceptForumAnswer(
  postId: string,
  commentId: string,
  callerUser: { uid: string; role: 'admin' | 'user' }
): Promise<void> {
  const postRef = adminDb.collection('forum_posts').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new Error('পোস্ট পাওয়া যায়নি।');
  const post = postSnap.data() as ForumPost;

  const isAdmin = callerUser.role === 'admin';
  const isAuthor = post.authorId === callerUser.uid;

  if (!isAdmin && !isAuthor) {
    throw new Error('শুধুমাত্র পোস্টের লেখক বা অ্যাডমিনিস্ট্রেটর সমাধানকারী উত্তর নির্ধারণ করতে পারবেন।');
  }

  const commentRef = adminDb.collection('forum_comments').doc(commentId);
  const commentSnap = await commentRef.get();
  if (!commentSnap.exists) throw new Error('মন্তব্যটি পাওয়া যায়নি।');

  // Clear previous accepted answer on other comments in this post
  const allComments = await adminDb.collection('forum_comments').where('postId', '==', postId).get();
  const batch = adminDb.batch();

  allComments.forEach((doc) => {
    if (doc.id === commentId) {
      batch.update(doc.ref, { isAcceptedAnswer: true });
    } else if (doc.data().isAcceptedAnswer) {
      batch.update(doc.ref, { isAcceptedAnswer: false });
    }
  });

  // Update post
  batch.update(postRef, {
    acceptedAnswerId: commentId,
    status: 'solved',
    updatedAt: new Date().toISOString(),
  });

  await batch.commit();
}

/**
 * Unmark solver answer
 */
export async function unacceptForumAnswer(
  postId: string,
  commentId: string,
  callerUser: { uid: string; role: 'admin' | 'user' }
): Promise<void> {
  const postRef = adminDb.collection('forum_posts').doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) throw new Error('পোস্ট পাওয়া যায়নি।');
  const post = postSnap.data() as ForumPost;

  const isAdmin = callerUser.role === 'admin';
  const isAuthor = post.authorId === callerUser.uid;

  if (!isAdmin && !isAuthor) {
    throw new Error('অনুমতি নেই।');
  }

  const commentRef = adminDb.collection('forum_comments').doc(commentId);
  await commentRef.set({ isAcceptedAnswer: false }, { merge: true });
  await postRef.set({ acceptedAnswerId: null, status: 'waiting_answer' }, { merge: true });
}

/**
 * Get revision history for post or comment
 */
export async function getForumRevisions(
  targetType: 'post' | 'comment',
  targetId: string
): Promise<ForumRevision[]> {
  const snap = await adminDb
    .collection('forum_revisions')
    .where('targetId', '==', targetId)
    .get();

  const revs: ForumRevision[] = [];
  snap.forEach((doc) => {
    const data = doc.data() as ForumRevision;
    if (data.targetType === targetType) {
      revs.push({ ...data, id: doc.id });
    }
  });

  revs.sort((a, b) => (b.editedAt || '').localeCompare(a.editedAt || ''));
  return revs;
}

/**
 * Toggle follow/bookmark discussion
 */
export async function toggleFollowForumPost(postId: string, userId: string): Promise<boolean> {
  const docRef = adminDb.collection('forum_follows').doc(`${postId}_${userId}`);
  const snap = await docRef.get();

  if (snap.exists) {
    await docRef.delete();
    return false;
  } else {
    await docRef.set({
      postId,
      userId,
      createdAt: new Date().toISOString(),
    });
    return true;
  }
}

/**
 * Search users for @mention auto-complete
 */
export async function searchUsersForMention(queryStr: string): Promise<Array<{ uid: string; displayName: string; role: string }>> {
  const q = (queryStr || '').trim().toLowerCase();
  const snap = await adminDb.collection('authorizedUsers').limit(100).get();
  const list: Array<{ uid: string; displayName: string; role: string }> = [];

  snap.forEach((doc) => {
    const data = doc.data();
    const name = data.displayName || data.email || 'User';
    if (!q || name.toLowerCase().includes(q) || (data.uid && data.uid.toLowerCase().includes(q))) {
      list.push({
        uid: doc.id,
        displayName: name,
        role: data.role || 'user',
      });
    }
  });

  return list.slice(0, 8);
}

/**
 * Send push notification to @mentioned users
 */
async function notifyMentionedUsers({
  text,
  sourceTitle,
  postId,
  authorName,
  authorUid,
}: {
  text: string;
  sourceTitle: string;
  postId: string;
  authorName: string;
  authorUid: string;
}) {
  const mentions = extractMentions(text);
  if (mentions.length === 0) return;

  const devices = await getActiveDevices();

  for (const mention of mentions) {
    // Find matching user by uid or name
    for (const dev of devices) {
      if (dev.userId && dev.userId !== authorUid && dev.fcmToken) {
        if (dev.userId === mention || dev.userId.toLowerCase().includes(mention.toLowerCase())) {
          await sendFcmPushNotification({
            device: dev,
            title: `💬 JpMC আলোচনা — ${authorName} আপনাকে উল্লেখ করেছেন`,
            body: `"${sourceTitle}" আলোচনায় আপনাকে উল্লেখ করা হয়েছে।`,
            deliveryId: `forum_mention_${postId}_${dev.deviceId}_${Date.now()}`,
            type: 'forum_mention',
            url: `/?tab=forum&post=${postId}`,
          }).catch(() => {});
        }
      }
    }
  }
}

/**
 * Send push notifications for new comment/reply
 */
async function notifyCommentParticipants({
  post,
  commentDoc,
  callerUser,
}: {
  post: ForumPost;
  commentDoc: ForumComment;
  callerUser: { uid: string; displayName: string };
}) {
  const devices = await getActiveDevices();
  const targets = new Set<string>();

  // Post author
  if (post.authorId && post.authorId !== callerUser.uid) {
    targets.add(post.authorId);
  }

  // Followed users
  const followsSnap = await adminDb.collection('forum_follows').where('postId', '==', post.id).get();
  followsSnap.forEach((doc) => {
    const uid = doc.data().userId;
    if (uid && uid !== callerUser.uid) {
      targets.add(uid);
    }
  });

  for (const targetUid of targets) {
    const userDevices = devices.filter((d) => d.userId === targetUid && d.fcmToken);
    for (const dev of userDevices) {
      await sendFcmPushNotification({
        device: dev,
        title: `💬 JpMC আলোচনা — নতুন মন্তব্য`,
        body: `${callerUser.displayName} "${post.title}" আলোচনায় একটি মন্তব্য করেছেন।`,
        deliveryId: `forum_reply_${commentDoc.id}_${dev.deviceId}_${Date.now()}`,
        type: 'forum_reply',
        url: `/?tab=forum&post=${post.id}`,
      }).catch(() => {});
    }
  }
}
