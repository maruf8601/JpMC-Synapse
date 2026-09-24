import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Search,
  MessageSquare,
  Clock,
  AlertCircle,
  FileText,
  Download,
  ArrowLeft,
  Loader2,
  Building,
  CheckCircle2,
} from 'lucide-react';
import {
  AdminChatOversightItem,
  ChatMessage,
  ChatUser,
  fetchAdminChatOversight,
  fetchAdminOversightMessages,
  fetchChatAttachment,
} from '../../services/chatClientService';
import { Language } from '../../domain/models';

interface ChatOversightViewProps {
  language: Language;
}

export const ChatOversightView: React.FC<ChatOversightViewProps> = ({ language }) => {
  const [oversightList, setOversightList] = useState<AdminChatOversightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConversationItem, setSelectedConversationItem] = useState<AdminChatOversightItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const loadOversightList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminChatOversight();
      setOversightList(data);
    } catch (err: any) {
      console.warn('[ChatOversight] Failed to load list:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOversightList();
  }, [loadOversightList]);

  const handleSelectConversation = async (item: AdminChatOversightItem) => {
    setSelectedConversationItem(item);
    setLoadingMessages(true);
    try {
      const msgs = await fetchAdminOversightMessages(item.conversation.id);
      setMessages(msgs);
    } catch (err: any) {
      alert(err?.message || 'Failed to load conversation oversight messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    try {
      window.open(`/api/chat/attachments/${encodeURIComponent(attachmentId)}/download`, '_blank');
    } catch {
      alert('Attachment download failed.');
    }
  };

  const filtered = oversightList.filter((item) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;

    const profiles = Object.values(item.conversation.participantProfiles || {}) as ChatUser[];
    return profiles.some((p) =>
      p.displayName?.toLowerCase().includes(term) ||
      p.department?.toLowerCase().includes(term)
    );
  });

  const getRemainingHours = (expiresAt: string) => {
    try {
      const ms = new Date(expiresAt).getTime() - Date.now();
      return Math.max(0, Math.round(ms / (3600 * 1000)));
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-4">
      {/* Oversight Header & Institutional Retention Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-amber-900">
              {language === 'bn'
                ? 'প্রাতিষ্ঠানিক চ্যাট নজরদারি ও নিরীক্ষা (Chat Oversight)'
                : 'Institutional Chat Oversight & Audit'}
            </h3>
            <p className="text-xs text-amber-800/90 leading-relaxed">
              {language === 'bn'
                ? 'এই প্যানেলটি শুধুমাত্র প্রাতিষ্ঠানিক জবাবদিহিতা ও জরুরি প্রশাসনিক সমন্বয়ের জন্য। মূল ৭২ ঘণ্টার ধারণ সময়ের মধ্যে ব্যবহারকারী কর্তৃক মুছে ফেলা বার্তাসমূহও এখানে স্পষ্টভাবে প্রদর্শিত হয়। সৃষ্টির ৭২ ঘণ্টা পূর্ণ হওয়ার পর সার্ভার থেকে স্থায়ী ও অপ্রত্যাবর্তনযোগ্যভাবে মুছে যায়। প্রতিটি নজরদারি সেশন সার্ভারে অডিট লগ হিসেবে নথিভুক্ত হচ্ছে।'
                : 'This panel is strictly for administrative compliance, safety, and accountability. Messages deleted by users remain visible here only until their original 72-hour window expires, after which they are permanently and irrevocably wiped. Every oversight action is recorded in the server audit trail.'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content: List or Conversation Detail */}
      {!selectedConversationItem ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Search bar */}
          <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  language === 'bn'
                    ? 'অংশগ্রহণকারী বা বিভাগ দিয়ে কথোপকথন খুঁজুন...'
                    : 'Search conversations by participant or department...'
                }
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none border border-slate-200 focus:border-[#006A60] focus:bg-white transition-all"
              />
            </div>

            <button
              type="button"
              onClick={loadOversightList}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer shrink-0"
            >
              {language === 'bn' ? 'রিফ্রেশ' : 'Refresh'}
            </button>
          </div>

          {/* List */}
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-xs text-slate-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#006A60]" />
                <span>Loading chat oversight data...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {language === 'bn'
                  ? 'বর্তমানে ৭২ ঘণ্টার ধারণ সীমার মধ্যে কোনো সক্রিয় কথোপকথন নেই।'
                  : 'No active conversations in the 72-hour retention window.'}
              </div>
            ) : (
              filtered.map((item) => {
                const participants = (Object.values(item.conversation.participantProfiles || {}) as ChatUser[]);
                return (
                  <div
                    key={item.conversation.id}
                    onClick={() => handleSelectConversation(item)}
                    className="p-4 hover:bg-slate-50/80 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MessageSquare className="w-4 h-4 text-[#006A60]" />
                        <span className="text-xs sm:text-sm font-bold text-slate-800">
                          {participants.map((p) => p.displayName).join(' ↔ ')}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                        {participants.map((p) => (
                          <span key={p.uid} className="inline-flex items-center gap-1">
                            <Building className="w-3 h-3 text-slate-400" />
                            <span>{p.displayName}: {p.department || 'JpMC Staff'}</span>
                          </span>
                        ))}
                      </div>

                      {item.conversation.lastMessage?.content && (
                        <p className="text-xs text-slate-500 truncate max-w-md mt-1">
                          সর্বশেষ: {item.conversation.lastMessage.content}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* 72h Active Message Count */}
                      <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-200">
                        {item.totalMessagesIn72h} {language === 'bn' ? 'বার্তা' : 'msgs'}
                      </span>

                      {/* User Deleted Badge */}
                      {item.userDeletedMessagesCount > 0 ? (
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2.5 py-1 rounded-lg border border-amber-300 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-amber-600" />
                          <span>
                            {item.userDeletedMessagesCount} {language === 'bn' ? 'ইউজার-মুছেছেন' : 'user-deleted'}
                          </span>
                        </span>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 text-[11px] font-medium px-2 py-1 rounded-lg border border-emerald-200">
                          ০ মোছা
                        </span>
                      )}

                      <span className="text-xs font-semibold text-[#006A60] hover:underline ml-1">
                        {language === 'bn' ? 'পরিদর্শন →' : 'Inspect →'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Conversation Inspection View */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedConversationItem(null)}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 transition cursor-pointer"
                title="Back to list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-800">
                  {(Object.values(selectedConversationItem.conversation.participantProfiles || {}) as ChatUser[])
                    .map((p) => p.displayName)
                    .join(' ↔ ')}
                </h3>
                <p className="text-[10px] text-slate-500 font-mono">
                  Conversation ID: {selectedConversationItem.conversation.id}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleSelectConversation(selectedConversationItem)}
              className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              Refresh
            </button>
          </div>

          {/* Messages */}
          <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto bg-slate-50/50">
            {loadingMessages ? (
              <div className="flex items-center justify-center p-8 text-xs text-slate-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#006A60]" />
                <span>Loading messages...</span>
              </div>
            ) : messages.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No retained messages in this conversation.
              </div>
            ) : (
              messages.map((m) => {
                const senderProfile =
                  selectedConversationItem.conversation.participantProfiles?.[m.senderId];
                const senderName = senderProfile?.displayName || m.senderId;
                const hoursLeft = getRemainingHours(m.expiresAt);

                return (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      m.deletedByUser
                        ? 'bg-amber-50/90 border-amber-300 shadow-2xs'
                        : 'bg-white border-slate-200 shadow-2xs'
                    }`}
                  >
                    {/* Top status bar of message */}
                    <div className="flex items-center justify-between gap-2 border-b border-black/5 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{senderName}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(m.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {m.deletedByUser && (
                          <span className="bg-amber-200 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-md flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-amber-700" />
                            <span>ব্যবহারকারী কর্তৃক মোছা হয়েছে (Deleted by user)</span>
                          </span>
                        )}

                        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>মেয়াদ বাকি: {hoursLeft}h</span>
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    {m.content && (
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {m.content}
                      </p>
                    )}

                    {/* Attachment preview */}
                    {m.attachment && (
                      <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 border border-slate-200">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                          <span className="truncate text-xs font-medium text-slate-700">
                            {m.attachment.name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            ({(m.attachment.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(m.attachment!.id)}
                          className="px-2 py-1 rounded bg-[#006A60] text-white text-[11px] font-semibold hover:bg-[#00524a] transition cursor-pointer flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
