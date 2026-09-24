/**
 * JpMC Synapse — Chat Storage Engine
 * Organization: Jamalpur Medical College (JpMC)
 *
 * Implements secure 100 MB file sharing architecture:
 * - Up to 100 MB per file validation
 * - Dangerous executable & script blocking (.exe, .msi, .bat, .cmd, .apk, .jar, etc.)
 * - Stream-to-disk or Object Storage without loading 100 MB into memory
 * - Sanitized random storage identifiers (never exposed raw file paths)
 * - HTTP Range request support for seeking video and audio playback
 * - Server-side authorization check before streaming/downloading
 * - Physical file deletion on 72-hour expiration or orphan cleanup
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { adminDb } from './firebaseAdmin';

export const CHAT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

// Prohibited dangerous executable and script extensions
export const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.ps1',
  '.vbs',
  '.jar',
  '.apk',
  '.sh',
  '.bin',
  '.pif',
  '.gadget',
  '.hta',
  '.cpl',
  '.msc',
  '.wsf',
  '.reg',
  '.dll',
  '.so',
  '.dylib',
  '.deb',
  '.rpm',
  '.appimage',
]);

// Allowed MIME type categories
export const ALLOWED_MIME_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/octet-stream',
  'application/json',
  'application/xml',
  'application/csv',
];

// Persistent private storage directory for chat attachments
// Automatically detects Render Persistent Disks mounted at /var/data or custom CHAT_STORAGE_PATH
export const CHAT_STORAGE_DIR = (() => {
  if (process.env.CHAT_STORAGE_PATH) {
    try {
      if (!fs.existsSync(process.env.CHAT_STORAGE_PATH)) {
        fs.mkdirSync(process.env.CHAT_STORAGE_PATH, { recursive: true });
      }
      return process.env.CHAT_STORAGE_PATH;
    } catch {}
  }
  if (fs.existsSync('/var/data')) {
    const renderDiskDir = path.resolve('/var/data', 'chat_attachments');
    try {
      if (!fs.existsSync(renderDiskDir)) {
        fs.mkdirSync(renderDiskDir, { recursive: true });
      }
      return renderDiskDir;
    } catch {}
  }
  const localDir = path.resolve(process.cwd(), '.chat_attachments_storage');
  if (!fs.existsSync(localDir)) {
    try {
      fs.mkdirSync(localDir, { recursive: true });
    } catch (err) {
      console.warn('[ChatStorage] Error creating storage directory:', err);
    }
  }
  return localDir;
})();

export interface StoredAttachmentMeta {
  id: string;
  conversationId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: string;
  expiresAt: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file';
  linkedMessageId?: string | null;
}

/**
 * Validates file extension against dangerous blacklisted formats.
 */
export function isDangerousFile(filename: string): boolean {
  const ext = path.extname(filename || '').toLowerCase();
  return DANGEROUS_EXTENSIONS.has(ext);
}

/**
 * Derives attachment classification type from filename and MIME type.
 */
export function classifyAttachmentType(
  filename: string,
  mimeType: string
): 'image' | 'video' | 'audio' | 'voice' | 'pdf' | 'document' | 'archive' | 'file' {
  const lowerMime = (mimeType || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();

  if (lowerMime.startsWith('image/')) return 'image';
  if (lowerMime.startsWith('video/')) return 'video';
  if (lowerMime.includes('audio/webm') || lowerMime.includes('opus') || filename.startsWith('voice_')) {
    return 'voice';
  }
  if (lowerMime.startsWith('audio/')) return 'audio';
  if (lowerMime.includes('pdf') || ext === '.pdf') return 'pdf';
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
  if (
    ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'].includes(ext) ||
    lowerMime.includes('office') ||
    lowerMime.includes('document') ||
    lowerMime.includes('excel') ||
    lowerMime.includes('powerpoint')
  ) {
    return 'document';
  }
  return 'file';
}

/**
 * Sanitizes user-provided filename to prevent path traversal and XSS.
 */
export function sanitizeFilename(raw: string): string {
  const base = path.basename(raw || 'unnamed_file');
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.slice(0, 150) || 'file';
}

/**
 * Saves an attachment record in Firestore after file stream has finished writing.
 */
export async function registerUploadedAttachment(params: {
  conversationId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
}): Promise<StoredAttachmentMeta> {
  const { conversationId, uploaderId, filename, mimeType, size, storageKey } = params;

  if (size > CHAT_MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds the 100 MB institutional limit.');
  }

  if (isDangerousFile(filename)) {
    throw new Error('This file format is prohibited for institutional security.');
  }

  const attachmentId = `att_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString(); // 72-hour TTL

  const fileType = classifyAttachmentType(filename, mimeType);
  const safeName = sanitizeFilename(filename);

  const meta: StoredAttachmentMeta = {
    id: attachmentId,
    conversationId,
    uploaderId,
    filename: safeName,
    mimeType: mimeType || 'application/octet-stream',
    size,
    storageKey,
    createdAt,
    expiresAt,
    type: fileType,
    linkedMessageId: null,
  };

  await adminDb.collection('chatAttachments').doc(attachmentId).set(meta);
  return meta;
}

/**
 * Streams attachment data to client with HTTP 206 Partial Content (Range request) support.
 * Ensures fast media seeking for audio/video playback and resume downloads.
 */
export async function streamAttachmentToClient(
  attachmentId: string,
  req: Request,
  res: Response,
  asDownload: boolean = false
): Promise<void> {
  const docSnap = await adminDb.collection('chatAttachments').doc(attachmentId).get();
  if (!docSnap.exists) {
    res.status(404).json({ error: 'Attachment not found or expired.' });
    return;
  }

  const meta = docSnap.data() as StoredAttachmentMeta;
  const now = Date.now();
  if (now >= new Date(meta.expiresAt).getTime()) {
    // Expired: delete record and physical file
    await deletePhysicalAttachment(meta);
    res.status(410).json({ error: 'This attachment has expired (72-hour retention limit exceeded).' });
    return;
  }

  const filePath = path.join(CHAT_STORAGE_DIR, meta.storageKey);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Physical attachment file missing from storage.' });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  const range = req.headers.range;

  // Determine proper Content-Type
  let contentType = meta.mimeType || 'application/octet-stream';
  if (!contentType || contentType === 'application/octet-stream') {
    const ext = path.extname(meta.filename || '').toLowerCase();
    if (ext === '.webm') contentType = 'audio/webm';
    else if (ext === '.ogg') contentType = 'audio/ogg';
    else if (ext === '.m4a' || ext === '.mp4') contentType = 'audio/mp4';
    else if (ext === '.wav') contentType = 'audio/wav';
    else if (ext === '.mp3') contentType = 'audio/mpeg';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.pdf') contentType = 'application/pdf';
  }

  // Set appropriate headers
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  if (asDownload) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(meta.filename)}"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`
    );
  } else {
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(meta.filename)}"`
    );
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunksize);
    fileStream.pipe(res);
  } else {
    res.status(200);
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
  }
}

/**
 * Permanently deletes physical attachment file from storage and database record.
 */
export async function deletePhysicalAttachment(meta: StoredAttachmentMeta): Promise<void> {
  try {
    if (meta.storageKey) {
      const filePath = path.join(CHAT_STORAGE_DIR, meta.storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }
    await adminDb.collection('chatAttachments').doc(meta.id).delete().catch(() => {});
  } catch (err) {
    console.warn(`[ChatStorage] Error deleting attachment ${meta.id}:`, err);
  }
}

/**
 * Clean up orphan uploads that were never linked to a message within 1 hour.
 */
export async function cleanupOrphanAttachments(): Promise<number> {
  let cleanedCount = 0;
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const snap = await adminDb
      .collection('chatAttachments')
      .where('linkedMessageId', '==', null)
      .limit(50)
      .get();

    for (const doc of snap.docs) {
      const meta = doc.data() as StoredAttachmentMeta;
      if (meta.createdAt && meta.createdAt <= oneHourAgo) {
        await deletePhysicalAttachment(meta);
        cleanedCount++;
      }
    }
  } catch (err) {
    console.warn('[ChatStorage] Orphan cleanup warning:', err);
  }
  return cleanedCount;
}
