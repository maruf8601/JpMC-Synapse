/**
 * JpMC Synapse — Forum Revisions History Modal
 * Organization: Jamalpur Medical College (JpMC)
 */

import React, { useEffect, useState } from 'react';
import { History, X, Clock, User, ShieldCheck, Loader2 } from 'lucide-react';
import { ForumRevision } from '../../domain/forumModels';
import { fetchForumRevisions } from '../../services/forumService';

interface ForumRevisionsModalProps {
  targetType: 'post' | 'comment';
  targetId: string;
  onClose: () => void;
}

export const ForumRevisionsModal: React.FC<ForumRevisionsModalProps> = ({
  targetType,
  targetId,
  onClose,
}) => {
  const [revisions, setRevisions] = useState<ForumRevision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchForumRevisions(targetType, targetId)
      .then((data) => {
        if (isMounted) {
          setRevisions(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [targetType, targetId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-slate-900 text-base">সম্পাদনার ইতিহাস (Edit History)</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span>ইতিহাস লোড হচ্ছে...</span>
            </div>
          ) : revisions.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              কোনো পূর্ববর্তী সম্পাদনার ইতিহাস পাওয়া যায়নি।
            </div>
          ) : (
            revisions.map((rev, idx) => {
              const editDate = (() => {
                try {
                  return new Date(rev.editedAt).toLocaleString('bn-BD', {
                    timeZone: 'Asia/Dhaka',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });
                } catch {
                  return rev.editedAt;
                }
              })();

              return (
                <div
                  key={rev.id || idx}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between flex-wrap gap-1 border-b border-slate-200 pb-2">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rev.editorName}</span>
                      {rev.isPostAuthor && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800 font-semibold">
                          পোস্টের মূল লেখক
                        </span>
                      )}
                      {rev.editorRole === 'admin' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 font-semibold flex items-center gap-0.5">
                          <ShieldCheck className="w-3 h-3" />
                          অ্যাডমিন
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                      <Clock className="w-3 h-3" />
                      <span>{editDate}</span>
                    </div>
                  </div>

                  {rev.previousTitle && (
                    <div>
                      <span className="font-semibold text-slate-600">পূর্বের শিরোনাম: </span>
                      <span className="text-slate-800">{rev.previousTitle}</span>
                    </div>
                  )}

                  <div>
                    <span className="font-semibold text-slate-600 block mb-1">পূর্বের বিষয়বস্তু:</span>
                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-slate-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto font-mono text-[11px]">
                      {rev.previousContent}
                    </div>
                  </div>

                  {rev.changeSummary && (
                    <div className="text-[11px] text-slate-500 italic">
                      কারণ / বিবরণ: {rev.changeSummary}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold rounded-lg transition-colors"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};
