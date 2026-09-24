import React, { useState } from 'react';
import { Search, Plus, MessageSquare, Clock, Building } from 'lucide-react';
import { Conversation, ChatUser } from '../../services/chatClientService';
import { Language } from '../../domain/models';

interface ConversationListProps {
  conversations: Conversation[];
  currentUserId: string;
  selectedConversationId?: string;
  onSelectConversation: (conversation: Conversation) => void;
  onOpenUserDirectory: () => void;
  language: Language;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  onOpenUserDirectory,
  language,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter conversations
  const filtered = conversations.filter((conv) => {
    const partnerId = conv.participantIds.find((id) => id !== currentUserId) || '';
    const partner = conv.participantProfiles?.[partnerId];
    if (!partner) return false;

    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;

    return (
      partner.displayName.toLowerCase().includes(term) ||
      (partner.department && partner.department.toLowerCase().includes(term)) ||
      (partner.designation && partner.designation.toLowerCase().includes(term))
    );
  });

  const formatElapsed = (isoDate?: string) => {
    if (!isoDate) return '';
    try {
      const ms = Date.now() - new Date(isoDate).getTime();
      const mins = Math.floor(ms / (60 * 1000));
      if (mins < 1) return language === 'bn' ? 'এইমাত্র' : 'Just now';
      if (mins < 60) return language === 'bn' ? `${mins} মি.` : `${mins}m`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return language === 'bn' ? `${hours} ঘ.` : `${hours}h`;
      const days = Math.floor(hours / 24);
      return language === 'bn' ? `${days} দিন` : `${days}d`;
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc]">
      {/* Top action & search */}
      <div className="p-3 bg-white border-b border-slate-200 sticky top-0 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                language === 'bn' ? 'কথোপকথন খুঁজুন...' : 'Search conversations...'
              }
              className="w-full pl-9 pr-3 py-1.5 bg-slate-100 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none border border-slate-200 focus:border-[#006A60] focus:bg-white transition-all"
            />
          </div>

          <button
            type="button"
            onClick={onOpenUserDirectory}
            className="p-2 rounded-xl bg-[#006A60] hover:bg-[#00524a] text-white transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 text-xs font-semibold"
            title={language === 'bn' ? 'নতুন চ্যাট শুরু করুন' : 'New chat'}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">
              {language === 'bn' ? 'নতুন চ্যাট' : 'New Chat'}
            </span>
          </button>
        </div>
      </div>

      {/* Conversation rows */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-xs font-bold text-slate-700 mb-1">
              {language === 'bn' ? 'কোনো চ্যাট নেই' : 'No conversations yet'}
            </h4>
            <p className="text-[11px] text-slate-500 max-w-xs mb-3">
              {language === 'bn'
                ? 'সহকর্মীদের সাথে চ্যাট শুরু করতে ব্যবহারকারী ডিরেক্টরিতে খুঁজুন।'
                : 'Search the staff directory to initiate a conversation.'}
            </p>
            <button
              type="button"
              onClick={onOpenUserDirectory}
              className="px-3.5 py-1.5 rounded-xl bg-[#006A60] text-white text-xs font-semibold hover:bg-[#00524a] transition cursor-pointer shadow-xs"
            >
              {language === 'bn' ? 'ব্যবহারকারী খুঁজুন' : 'Find Users'}
            </button>
          </div>
        ) : (
          filtered.map((conv) => {
            const partnerId = conv.participantIds.find((id) => id !== currentUserId) || '';
            const partner: ChatUser = conv.participantProfiles?.[partnerId] || {
              uid: partnerId,
              displayName: 'JpMC Staff',
              role: 'user',
            };

            const unreadCount = conv.participantStates?.[currentUserId]?.unreadCount || 0;
            const isSelected = selectedConversationId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-teal-50/90 border-[#006A60] shadow-xs'
                    : 'bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-teal-100 border border-teal-200 text-[#006A60] flex items-center justify-center font-bold text-sm">
                      {partner.displayName ? partner.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-teal-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Text details */}
                  <div className="overflow-hidden flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        className={`text-xs sm:text-sm font-bold truncate ${
                          unreadCount > 0 ? 'text-slate-900 font-extrabold' : 'text-slate-800'
                        }`}
                      >
                        {partner.displayName}
                      </h4>
                      <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                        {formatElapsed(conv.lastMessageAt || conv.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {partner.department || partner.designation ? (
                        <span className="inline-flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {partner.department || partner.designation}
                          </span>
                        </span>
                      ) : (
                        'JpMC Staff'
                      )}
                    </p>

                    {/* Last message preview */}
                    <p
                      className={`text-xs truncate mt-0.5 ${
                        unreadCount > 0
                          ? 'text-[#006A60] font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {conv.lastMessage?.content || (language === 'bn' ? 'নতুন কথোপকথন' : 'New chat')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
