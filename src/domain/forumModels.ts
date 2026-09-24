/**
 * JpMC Synapse — Discussion Forum Domain Models
 * Organization: Jamalpur Medical College (JpMC)
 */

export type ForumPostStatus = 'waiting_answer' | 'solved' | 'closed';

export interface ForumAttachment {
  id: string;
  driveFileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploaderId: string;
  uploaderName: string;
  isRestricted?: boolean;
  uploadedAt: string;
  downloadUrl?: string;
  previewUrl?: string;
}

export interface ForumRevision {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  editorId: string;
  editorName: string;
  editorRole: 'admin' | 'user';
  isPostAuthor?: boolean;
  editedAt: string;
  previousContent: string;
  previousTitle?: string;
  changeSummary?: string;
}

export interface ForumPost {
  id: string;
  title: string;
  body: string;
  topicId: string;
  topicLabel: string;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'user';
  authorDepartment?: string;
  status: ForumPostStatus;
  isPinned: boolean;
  isRestricted: boolean;
  allowedUserIds?: string[];
  acceptedAnswerId?: string | null;
  attachments?: ForumAttachment[];
  replyCount: number;
  version: number; // Concurrency control
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  isEdited?: boolean;
  lastEditedBy?: {
    uid: string;
    displayName: string;
    role: 'admin' | 'user';
    isPostAuthor?: boolean;
    editedAt: string;
  };
  isDeleted?: boolean;
}

export interface ForumComment {
  id: string;
  postId: string;
  parentCommentId?: string | null;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'user';
  authorDepartment?: string;
  body: string;
  attachments?: ForumAttachment[];
  isAcceptedAnswer?: boolean;
  version: number; // Concurrency control
  createdAt: string;
  updatedAt: string;
  isEdited?: boolean;
  lastEditedBy?: {
    uid: string;
    displayName: string;
    role: 'admin' | 'user';
    isPostAuthor?: boolean;
    editedAt: string;
  };
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  replies?: ForumComment[]; // Client-computed nested tree
}

export interface ForumPostFeedItem {
  id: string;
  title: string;
  topicId: string;
  topicLabel: string;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'user';
  status: ForumPostStatus;
  isPinned: boolean;
  isRestricted: boolean;
  acceptedAnswerId?: string | null;
  replyCount: number;
  createdAt: string;
  lastActivityAt: string;
  attachmentCount?: number;
  previewSnippet: string;
}

export interface ForumDriveConfig {
  configured: boolean;
  accountEmail?: string;
  folderId?: string;
  folderName?: string;
  storageMode: 'google_drive' | 'pending_setup';
  lastTestedAt?: string;
  testSuccess?: boolean;
}
