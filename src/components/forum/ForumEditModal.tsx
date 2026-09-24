/**
 * JpMC Synapse — Forum Content Edit Modal
 * Organization: Jamalpur Medical College (JpMC)
 * Supports editing post or comment with concurrency protection and change reason.
 */

import React, { useState } from 'react';
import { Edit3, X, AlertCircle, Loader2, Save } from 'lucide-react';
import { FORUM_TOPICS_LIST } from '../../domain/forumTopics';
import { updateForumPost, updateForumComment } from '../../services/forumService';

interface ForumEditModalProps {
  targetType: 'post' | 'comment';
  targetId: string;
  postId: string; // parent post ID
  initialTitle?: string;
  initialTopicId?: string;
  initialBody: string;
  currentVersion: number;
  isPostAuthorEditingComment?: boolean;
  onSuccess: (updated: any) => void;
  onClose: () => void;
}

export const ForumEditModal: React.FC<ForumEditModalProps> = ({
  targetType,
  targetId,
  postId,
  initialTitle = '',
  initialTopicId = '',
  initialBody,
  currentVersion,
  isPostAuthorEditingComment = false,
  onSuccess,
  onClose,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [topicId, setTopicId] = useState(initialTopicId);
  const [body, setBody] = useState(initialBody);
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (targetType === 'post' && !title.trim()) {
      setError('শিরোনাম খালি রাখা যাবে না।');
      return;
    }
    if (!body.trim()) {
      setError('বিষয়বস্তু খালি রাখা যাবে না।');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (targetType === 'post') {
        const updatedPost = await updateForumPost(targetId, {
          title: title.trim(),
          topicId,
          body: body.trim(),
          expectedVersion: currentVersion,
          changeSummary: changeSummary.trim() || undefined,
        });
        onSuccess(updatedPost);
      } else {
        const updatedComment = await updateForumComment(postId, targetId, {
          body: body.trim(),
          expectedVersion: currentVersion,
          changeSummary: changeSummary.trim() || (isPostAuthorEditingComment ? 'পোস্টের লেখক কর্তৃক পরিমার্জিত' : undefined),
        });
        onSuccess(updatedComment);
      }
      onClose();
    } catch (err: any) {
      if (err?.message?.includes('CONCURRENCY_CONFLICT')) {
        setError('কনফ্লিক্ট সতর্কতা: অন্য কেউ এটি ইতোমধ্যে পরিবর্তন করেছেন। অনুগ্রহ করে পেজ রিফ্রেশ করে পুনরায় চেষ্টা করুন।');
      } else {
        setError(err?.message || 'সম্পাদনা সংরক্ষণ করতে ব্যর্থ হয়েছে।');
      }
    } finally {
      setSaving(false);
    }
  };

  const generalTopics = FORUM_TOPICS_LIST.filter((t) => t.group === 'general');
  const deptTopics = FORUM_TOPICS_LIST.filter((t) => t.group === 'department');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {targetType === 'post' ? 'পোস্ট সম্পাদনা' : 'মন্তব্য সম্পাদনা'}
              </h3>
              {isPostAuthorEditingComment && (
                <p className="text-[11px] text-blue-700 font-medium">
                  পোস্টের মূল লেখক হিসেবে মন্তব্যটি পরিমার্জন করছেন
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {targetType === 'post' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  শিরোনাম <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  বিষয় / বিভাগ <span className="text-red-500">*</span>
                </label>
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  required
                >
                  <optgroup label="সাধারণ বিষয়">
                    {generalTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="বিভাগ">
                    {deptTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              মূল বিষয়বস্তু <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-y leading-relaxed font-normal"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              সম্পাদনার কারণ বা নোট (ঐচ্ছিক)
            </label>
            <input
              type="text"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="যেমন: তারিখ সংশোধন, অতিরিক্ত তথ্য সংযোজন..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>সংরক্ষণ হচ্ছে...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>সংরক্ষণ করুন</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
