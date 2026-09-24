/**
 * JpMC Synapse — Discussion Forum Post Composer
 * Organization: Jamalpur Medical College (JpMC)
 */

import React, { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Paperclip,
  X,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Lock,
  AlertCircle,
  Loader2,
  Send,
} from 'lucide-react';
import { FORUM_TOPICS_LIST } from '../../domain/forumTopics';
import { ForumAttachment } from '../../domain/forumModels';
import { uploadForumAttachmentFile, searchUsersForMention } from '../../services/forumService';

interface ForumPostComposerProps {
  onSuccess: (post: any) => void;
  onCancel: () => void;
  isAdmin?: boolean;
}

export const ForumPostComposer: React.FC<ForumPostComposerProps> = ({
  onSuccess,
  onCancel,
  isAdmin = false,
}) => {
  const [title, setTitle] = useState('');
  const [topicId, setTopicId] = useState('');
  const [body, setBody] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [attachments, setAttachments] = useState<ForumAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mention suggestions
  const [mentionSuggestions, setMentionSuggestions] = useState<Array<{ uid: string; displayName: string }>>([]);
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group topics for select dropdown
  const generalTopics = FORUM_TOPICS_LIST.filter((t) => t.group === 'general');
  const deptTopics = FORUM_TOPICS_LIST.filter((t) => t.group === 'department');

  // Insert markdown/formatting tags into textarea
  const insertFormatting = (prefix: string, suffix: string = '') => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end);
    const replacement = prefix + (selected || 'টেক্সট') + suffix;

    const newText = text.substring(0, start) + replacement + text.substring(end);
    setBody(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selected ? selected.length : 6));
    }, 0);
  };

  // Handle @mentions while typing
  const handleBodyChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBody(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@([a-zA-Z0-9_\u0980-\u09FF]*)$/);

    if (match) {
      const q = match[1];
      try {
        const users = await searchUsersForMention(q);
        setMentionSuggestions(users);
        setShowMentions(users.length > 0);
      } catch {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  const selectMention = (user: { uid: string; displayName: string }) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const cursorPos = el.selectionStart;
    const textBeforeCursor = el.value.slice(0, cursorPos);
    const textAfterCursor = el.value.slice(cursorPos);

    const match = textBeforeCursor.match(/@([a-zA-Z0-9_\u0980-\u09FF]*)$/);
    if (!match) return;

    const replaced = textBeforeCursor.slice(0, match.index) + `@${user.displayName.replace(/\s+/g, '_')} `;
    setBody(replaced + textAfterCursor);
    setShowMentions(false);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(replaced.length, replaced.length);
    }, 0);
  };

  // Handle file uploads (Google Drive via server)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? (Array.from(e.target.files) as File[]) : [];
    if (files.length === 0) return;

    setError(null);

    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`"${file.name}" ফাইলটির আকার ১০ মেগাবাইটের বেশি। সর্বোচ্চ ১০ মেগাবাইট অনুমোদিত।`);
        continue;
      }

      setUploadingFiles((prev) => [...prev, { name: file.name, progress: 30 }]);

      try {
        const att = await uploadForumAttachmentFile(file, isRestricted);
        setAttachments((prev) => [...prev, att]);
      } catch (err: any) {
        setError(`"${file.name}" আপলোড ব্যর্থ: ${err?.message || 'সমস্যা হয়েছে'}`);
      } finally {
        setUploadingFiles((prev) => prev.filter((f) => f.name !== file.name));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Submit Post
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('অনুগ্রহ করে আলোচনার শিরোনাম দিন।');
      return;
    }
    if (!topicId) {
      setError('অনুগ্রহ করে একটি বিষয় বা বিভাগ নির্বাচন করুন।');
      return;
    }
    if (!body.trim()) {
      setError('আলোচনার বিষয়বস্তু লেখা আবশ্যক।');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { createForumPost } = await import('../../services/forumService');
      const post = await createForumPost({
        title: title.trim(),
        topicId,
        body: body.trim(),
        attachments,
        isRestricted,
      });

      onSuccess(post);
    } catch (err: any) {
      setError(err?.message || 'পোস্ট প্রকাশ করতে ব্যর্থ হয়েছে');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 transition-all">
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900">নতুন আলোচনা শুরু করুন</h2>
          <p className="text-xs text-slate-500">জামালপুর মেডিকেল কলেজ একাডেমিক ও প্রাতিষ্ঠানিক ফোরাম</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          title="বাতিল"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            আলোচনার শিরোনাম <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="যেমন: ৩য় পেশাগত এমবিবিএস পরীক্ষার তারিখ ও রুটিন সম্পর্কিত নোটিশ..."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
            maxLength={180}
            required
          />
        </div>

        {/* Topic Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            বিষয় বা বিভাগ নির্বাচন করুন <span className="text-red-500">*</span>
          </label>
          <select
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
            required
          >
            <option value="">-- বিষয় বা বিভাগ বাছাই করুন --</option>
            <optgroup label="সাধারণ বিষয়">
              {generalTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="বিভাগ (Clinical & Academic)">
              {deptTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Formatting Toolbar */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
          <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-100 border-b border-slate-200 text-slate-600 text-xs">
            <button
              type="button"
              onClick={() => insertFormatting('**', '**')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded font-bold"
              title="বোল্ড (Bold)"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded italic"
              title="ইটালিক (Italic)"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('### ')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded"
              title="শিরোনাম (Heading)"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <span className="w-px h-4 bg-slate-300 mx-1" />
            <button
              type="button"
              onClick={() => insertFormatting('- ')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded"
              title="বুলেট তালিকা"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('1. ')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded"
              title="সংখ্যাতালিকা"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('> ')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded"
              title="উদ্ধৃতি (Quote)"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('[লিংকের নাম](', ')')}
              className="p-1.5 hover:bg-white hover:text-slate-900 rounded"
              title="লিংক যোগ করুন"
            >
              <LinkIcon className="w-4 h-4" />
            </button>

            <span className="ml-auto text-[11px] text-slate-500 font-normal hidden sm:inline">
              কাউকে মেনশন করতে @ লিখুন
            </span>
          </div>

          <div className="relative">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={handleBodyChange}
              placeholder="আলোচনার বিস্তারিত বিবরণ বাংলায় বা ইংরেজিতে লিখুন... (বোল্ড, লিস্ট, লিংক ইত্যাদি ফরম্যাটিং সমর্থন করে)"
              rows={7}
              className="w-full p-3.5 bg-white text-slate-900 placeholder-slate-400 text-sm focus:outline-none resize-y leading-relaxed font-normal"
              required
            />

            {/* Mention Suggestions Dropdown */}
            {showMentions && mentionSuggestions.length > 0 && (
              <div className="absolute left-4 bottom-3 z-20 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1">
                <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-500">
                  উল্লেখ করতে বেছে নিন (@mention)
                </div>
                {mentionSuggestions.map((u) => (
                  <button
                    key={u.uid}
                    type="button"
                    onClick={() => selectMention(u)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-800 hover:bg-emerald-50 hover:text-emerald-900 flex items-center justify-between"
                  >
                    <span className="font-medium">{u.displayName}</span>
                    <span className="text-[10px] text-slate-400">{u.uid.slice(0, 8)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Attachments Section (Google Drive) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              <span>ফাইল বা ছবি সংযুক্তি (গুগল ড্রাইভে সংরক্ষিত, প্রতি ফাইল সর্বোচ্চ ১০ MB)</span>
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-medium hover:underline"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>ফাইল যোগ করুন</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          />

          {/* Uploading Status */}
          {uploadingFiles.length > 0 && (
            <div className="space-y-1.5 mb-2.5">
              {uploadingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
                  <span className="truncate flex-1 font-medium">{f.name} (গুগল ড্রাইভে আপলোড হচ্ছে...)</span>
                </div>
              ))}
            </div>
          )}

          {/* Uploaded Attachments List */}
          {attachments.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {attachments.map((att) => {
                const isImg = att.mimeType.startsWith('image/');
                const sizeKb = (att.fileSize / 1024).toFixed(0);
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isImg ? (
                        <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      )}
                      <div className="truncate">
                        <p className="font-medium text-slate-800 truncate">{att.fileName}</p>
                        <p className="text-[10px] text-slate-500">{sizeKb} KB • Google Drive</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                      title="মুছে ফেলুন"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-emerald-300 rounded-xl p-4 text-center cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-all"
            >
              <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1" />
              <p className="text-xs font-medium text-slate-600">
                ছবি, পিডিএফ বা ডকুমেন্টস ফাইল আপলোড করতে এখানে ক্লিক করুন
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">জেপিইজি, পিএনজি, পিডিএফ, ডকএক্স (সর্বোচ্চ ১০ মেগাবাইট)</p>
            </div>
          )}
        </div>

        {/* Restricted Discussion Toggle */}
        <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl flex items-start gap-3">
          <div className="mt-0.5">
            <input
              id="restricted-toggle"
              type="checkbox"
              checked={isRestricted}
              onChange={(e) => setIsRestricted(e.target.checked)}
              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-300"
            />
          </div>
          <label htmlFor="restricted-toggle" className="cursor-pointer select-none">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-900">
              <Lock className="w-3.5 h-3.5 text-purple-700" />
              <span>সীমাবদ্ধ বা সংবেদনশীল আলোচনা (Restricted Discussion)</span>
            </div>
            <p className="text-[11px] text-purple-700 mt-0.5 leading-relaxed">
              পরীক্ষার প্রশ্ন সংক্রান্ত বা নির্দিষ্ট গোপনীয় আলোচনার জন্য এটি সক্রিয় করুন। সাধারণ ফিডে এটি সর্বজনীন থাকবে না।
            </p>
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
          >
            বাতিল
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>প্রকাশ হচ্ছে...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>আলোচনা প্রকাশ করুন</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
