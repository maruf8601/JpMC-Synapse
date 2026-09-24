import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Users, ShieldAlert, X, Info } from 'lucide-react';
import {
  Conversation,
  ChatUser,
  getUserConversations,
  getOrCreateConversation,
} from '../../services/chatClientService';
import { ConversationList } from './ConversationList';
import { UserDirectory } from './UserDirectory';
import { ConversationView } from './ConversationView';
import { Language } from '../../domain/models';

interface ChatViewProps {
  currentUserId: string;
  language: Language;
  initialTargetUserId?: string | null;
  onUnreadCountChanged?: (count: number) => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentUserId,
  language,
  initialTargetUserId,
  onUnreadCountChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'chats' | 'users'>('chats');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(() => {
    return localStorage.getItem('jpmc_chat_privacy_notice_dismissed') !== 'true';
  });

  const loadConversations = useCallback(async () => {
    try {
      const list = await getUserConversations();
      setConversations(list);

      // Compute total unread count across all conversations
      const totalUnread = list.reduce((sum, c) => {
        return sum + (c.participantStates?.[currentUserId]?.unreadCount || 0);
      }, 0);
      onUnreadCountChanged?.(totalUnread);
    } catch (err) {
      console.warn('[ChatView] Load conversations error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUserId, onUnreadCountChanged]);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  // Deep-link handling: if initialTargetUserId is passed, start/open conversation
  useEffect(() => {
    if (initialTargetUserId && initialTargetUserId !== currentUserId) {
      (async () => {
        try {
          const conv = await getOrCreateConversation(initialTargetUserId);
          setSelectedConversation(conv);
          setActiveTab('chats');
          loadConversations();
        } catch (e) {
          console.warn('[ChatView] Failed opening target chat from deep link:', e);
        }
      })();
    }
  }, [initialTargetUserId, currentUserId, loadConversations]);

  const handleSelectUser = async (user: ChatUser) => {
    try {
      const conv = await getOrCreateConversation(user.uid);
      setSelectedConversation(conv);
      setActiveTab('chats');
      loadConversations();
    } catch (err: any) {
      alert(err?.message || 'কথোপকথন শুরু করতে ব্যর্থ হয়েছে।');
    }
  };

  const handleDismissNotice = () => {
    setShowPrivacyNotice(false);
    localStorage.setItem('jpmc_chat_privacy_notice_dismissed', 'true');
  };

  const totalUnread = conversations.reduce((sum, c) => {
    return sum + (c.participantStates?.[currentUserId]?.unreadCount || 0);
  }, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] sm:h-[calc(100vh-72px)] bg-slate-100 overflow-hidden">
      {/* Institutional Privacy & 72-Hour Retention Notice Banner */}
      {showPrivacyNotice && (
        <div className="bg-amber-50/95 border-b border-amber-200 px-3 py-2 flex items-start justify-between gap-2.5 text-xs text-amber-900 shrink-0 shadow-2xs">
          <div className="flex items-start gap-2 overflow-hidden">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 leading-snug">
              <p className="font-bold text-[11px] sm:text-xs">
                {language === 'bn'
                  ? 'প্রাতিষ্ঠানিক যোগাযোগ ও ৭২ ঘণ্টা ধারণ নীতি (Institutional 72h Retention)'
                  : 'Institutional Communication & 72-Hour Retention Policy'}
              </p>
              <p className="text-[10px] sm:text-[11px] text-amber-800/90 leading-tight">
                {language === 'bn'
                  ? 'জেপিএমসি সাইন্যাপস চ্যাটের সকল বার্তা ও ফাইল সর্বোচ্চ ৭২ ঘণ্টা পর্যন্ত সংরক্ষিত থাকে। ব্যবহারকারী কোনো বার্তা মুছে ফেললে আর দেখার সুযোগ নাই এবং না ডিলিট করলেও ৭২ ঘণ্টা পূর্ণ হওয়ার পর সার্ভার থেকে স্থায়ীভাবে স্বয়ংক্রিয়ভাবে মুছে যাবে।'
                  : 'All chat messages and attachments are retained for a maximum of 72 hours. User-deleted messages remain accessible to authorized administrators for oversight until the 72-hour window expires, after which content is permanently purged.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismissNotice}
            className="p-1 text-amber-700 hover:text-amber-950 rounded-full cursor-pointer shrink-0"
            title={language === 'bn' ? 'বন্ধ করুন' : 'Dismiss'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Chats & User Directory (Desktop split, Mobile switch) */}
        <div
          className={`w-full md:w-80 lg:w-96 flex flex-col bg-white border-r border-slate-200 shrink-0 ${
            selectedConversation ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header & Segmented Tab Switcher */}
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#006A60]" />
                <span>{language === 'bn' ? 'ইন্টারডিপার্টমেন্টাল চ্যাট' : 'Interdepartmental Chat'}</span>
              </h1>
            </div>

            {/* Segmented Control Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('chats')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'chats'
                    ? 'bg-white text-[#006A60] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'চ্যাটসমূহ' : 'Chats'}</span>
                {totalUnread > 0 && (
                  <span className="bg-[#006A60] text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                    {totalUnread}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'users'
                    ? 'bg-white text-[#006A60] shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{language === 'bn' ? 'ব্যবহারকারী' : 'Users'}</span>
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'chats' ? (
              <ConversationList
                conversations={conversations}
                currentUserId={currentUserId}
                selectedConversationId={selectedConversation?.id}
                onSelectConversation={(conv) => setSelectedConversation(conv)}
                onOpenUserDirectory={() => setActiveTab('users')}
                language={language}
              />
            ) : (
              <UserDirectory onSelectUser={handleSelectUser} language={language} />
            )}
          </div>
        </div>

        {/* Right Column: Active Conversation (Desktop right panel, Mobile full view) */}
        <div
          className={`flex-1 flex flex-col bg-[#f8fafc] overflow-hidden ${
            !selectedConversation ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedConversation ? (
            <ConversationView
              key={selectedConversation.id}
              conversation={selectedConversation}
              currentUserId={currentUserId}
              language={language}
              onBack={() => setSelectedConversation(null)}
              onConversationUpdated={loadConversations}
            />
          ) : (
            <div className="flex-1 hidden md:flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-3xl bg-teal-50 border border-teal-100 text-[#006A60] flex items-center justify-center mb-4 shadow-xs">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                {language === 'bn' ? 'একটি কথোপকথন নির্বাচন করুন' : 'Select a conversation'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-4">
                {language === 'bn'
                  ? 'বামপাশের তালিকা থেকে কোনো চ্যাট বেছে নিন অথবা নতুন কোনো সহকর্মীকে বার্তা পাঠাতে ব্যবহারকারী ডিরেক্টরিতে খুঁজুন।'
                  : 'Choose a conversation from the left or search the user directory to start messaging a colleague.'}
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className="px-4 py-2 rounded-xl bg-[#006A60] hover:bg-[#00524a] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                {language === 'bn' ? 'সহকর্মী খুঁজুন' : 'Find Colleagues'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
