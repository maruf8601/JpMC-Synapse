/**
 * JpMC Synapse — Discussion Forum Client Service
 * Organization: Jamalpur Medical College (JpMC)
 */

import { apiFetch } from '../config/api';
import { getAuthHeader } from './authService';
import {
  ForumPost,
  ForumComment,
  ForumRevision,
  ForumAttachment,
  ForumPostFeedItem,
  ForumPostStatus,
  ForumDriveConfig,
} from '../domain/forumModels';

export interface ForumPostsResponse {
  success: boolean;
  posts: ForumPostFeedItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function fetchForumPosts({
  topic,
  status,
  q,
  sortBy = 'lastActivity',
  page = 1,
  limit = 20,
}: {
  topic?: string;
  status?: string;
  q?: string;
  sortBy?: 'lastActivity' | 'newest';
  page?: number;
  limit?: number;
}): Promise<ForumPostsResponse> {
  const authHeaders = await getAuthHeader();
  const params = new URLSearchParams();
  if (topic && topic !== 'all') params.set('topic', topic);
  if (status && status !== 'all') params.set('status', status);
  if (q && q.trim()) params.set('q', q.trim());
  if (sortBy) params.set('sortBy', sortBy);
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));

  const res = await apiFetch(`/api/forum/posts?${params.toString()}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'আলোচনা লোড করতে ব্যর্থ হয়েছে');
  }

  return res.json();
}

export async function fetchForumPost(postId: string): Promise<{ post: ForumPost; isFollowed?: boolean }> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'আলোচনাটি প্রদর্শনে ব্যর্থ হয়েছে');
  }

  return res.json();
}

export async function createForumPost(payload: {
  title: string;
  body: string;
  topicId: string;
  attachments?: ForumAttachment[];
  isRestricted?: boolean;
  allowedUserIds?: string[];
}): Promise<ForumPost> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/forum/posts', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'নতুন আলোচনা তৈরি ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.post;
}

export async function updateForumPost(
  postId: string,
  payload: {
    title: string;
    body: string;
    topicId: string;
    attachments?: ForumAttachment[];
    expectedVersion?: number;
    changeSummary?: string;
  }
): Promise<ForumPost> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}`, {
    method: 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'আলোচনা আপডেট করতে ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.post;
}

export async function deleteForumPost(postId: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'আলোচনা মুছে ফেলতে ব্যর্থ হয়েছে');
  }
}

export async function setForumPostStatus(postId: string, status: ForumPostStatus): Promise<ForumPost> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/status`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.post;
}

export async function setForumPostPinned(postId: string, isPinned: boolean): Promise<boolean> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/pin`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isPinned }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'পিন পরিবর্তন ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.isPinned;
}

export async function toggleFollowForumPost(postId: string): Promise<boolean> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/follow`, {
    method: 'POST',
    headers: authHeaders,
  });

  if (!res.ok) {
    throw new Error('অনুসরণ স্ট্যাটাস পরিবর্তন ব্যর্থ');
  }

  const data = await res.json();
  return data.isFollowed;
}

export async function fetchForumComments(postId: string): Promise<ForumComment[]> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/comments`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'মন্তব্য লোড করতে ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.comments || [];
}

export async function createForumComment(
  postId: string,
  payload: {
    body: string;
    parentCommentId?: string | null;
    attachments?: ForumAttachment[];
  }
): Promise<ForumComment> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'মন্তব্য প্রকাশে ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.comment;
}

export async function updateForumComment(
  postId: string,
  commentId: string,
  payload: {
    body: string;
    expectedVersion?: number;
    changeSummary?: string;
  }
): Promise<ForumComment> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'মন্তব্য সম্পাদনা ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.comment;
}

export async function deleteForumComment(postId: string, commentId: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'মন্তব্য মুছে ফেলা সম্ভব হয়নি');
  }
}

export async function acceptForumAnswer(postId: string, commentId: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/accept`, {
    method: 'POST',
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'সমাধানকারী উত্তর চিহ্নিত করা যায়নি');
  }
}

export async function unacceptForumAnswer(postId: string, commentId: string): Promise<void> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/unaccept`, {
    method: 'POST',
    headers: authHeaders,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'সমাধানকারী উত্তর প্রত্যাহার করা যায়নি');
  }
}

export async function fetchForumRevisions(targetType: 'post' | 'comment', targetId: string): Promise<ForumRevision[]> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/revisions/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return data.revisions || [];
}

export async function searchUsersForMention(query: string): Promise<Array<{ uid: string; displayName: string; role: string }>> {
  if (!query) return [];
  const authHeaders = await getAuthHeader();
  const res = await apiFetch(`/api/forum/users/mention-search?q=${encodeURIComponent(query)}`, {
    headers: authHeaders,
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.users || [];
}

export async function uploadForumAttachmentFile(
  file: File,
  isRestricted?: boolean
): Promise<ForumAttachment> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('ফাইলের আকার সর্বোচ্চ ১০ মেগাবাইট অনুমোদিত।');
  }

  // Convert to base64
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/forum/attachments/upload', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      base64Data,
      isRestricted: Boolean(isRestricted),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'ফাইল আপলোড ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.attachment;
}

export async function fetchDriveConfig(): Promise<ForumDriveConfig> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/admin/forum/drive-config', {
    headers: authHeaders,
  });

  if (!res.ok) throw new Error('ড্রাইভ কনফিগারেশন পড়তে ব্যর্থ');
  return res.json();
}

export async function saveDriveConfig(payload: {
  folderId?: string;
  folderName?: string;
  accountEmail?: string;
  accessToken?: string;
}): Promise<any> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/admin/forum/drive-config', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error('ড্রাইভ কনফিগারেশন সংরক্ষণ ব্যর্থ');
  return res.json();
}

export async function testDriveConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  const authHeaders = await getAuthHeader();
  const res = await apiFetch('/api/admin/forum/drive-test', {
    method: 'POST',
    headers: authHeaders,
  });

  if (!res.ok) throw new Error('ড্রাইভ সংযোগ পরীক্ষা ব্যর্থ');
  return res.json();
}
