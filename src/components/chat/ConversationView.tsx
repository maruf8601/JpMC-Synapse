import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  MoreVertical,
  Link2,
  Trash2,
  Clock,
  Check,
  ShieldAlert,
  Phone,
  Video,
  AlertCircle,
} from 'lucide-react';
import {
  ChatMessage,
  Conversation,
  ChatUser,
  getConversationMessages,
  sendChatMessage,
  clearConversationHistory,
  markConversationAsRead,
  copyShareableChatLink,
} from '../../services/chatClientService';
import { chatSocket } from '../../services/chatSocketClient';
import { MessageBubble } from './MessageBubble';
import { MessageComposer } from './MessageComposer';
import { WebRtcCallModal, ActiveCallState } from './WebRtcCallModal';
import { Language } from '../../domain/models';

interface ConversationViewProps {
  conversation: Conversation;
  currentUserId: string;
  language: Language;
  onBack?: () => void;
  onConversationUpdated?: () => void;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  conversation,
  currentUserId,
  language,
  onBack,
  onConversationUpdated,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);

  // WebRTC Audio/Video Call State
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Partner user details
  const partnerId = conversation.participantIds.find((id) => id !== currentUserId) || '';
  const partnerProfile: ChatUser = conversation.participantProfiles?.[partnerId] || {
    uid: partnerId,
    displayName: 'JpMC Staff',
    role: 'user',
  };

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const loadMessages = useCallback(async (isPolling = false) => {
    try {
      const fetched = await getConversationMessages(conversation.id);
      setMessages(fetched);
      if (!isPolling) {
        scrollToBottom(false);
      }
      // Send read acknowledgment via API and Socket
      await markConversationAsRead(conversation.id);
      chatSocket.sendReadAck(conversation.id);
      onConversationUpdated?.();
    } catch (err) {
      console.warn('[ConversationView] loadMessages error:', err);
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [conversation.id, onConversationUpdated, scrollToBottom]);

  // Initial load and Real-time Socket.IO subscriptions
  useEffect(() => {
    setLoading(true);
    loadMessages(false);

    // Join Socket Room
    chatSocket.connect().then(() => {
      chatSocket.joinConversation(conversation.id);
    });

    // 1. Listen for new messages
    const unsubMsg = chatSocket.on('chat:message', (newMsg: ChatMessage) => {
      if (newMsg.conversationId === conversation.id) {
        setMessages((prev) => {
          // If temporary optimistic message exists, replace it
          if (newMsg.clientMsgId && prev.some((m) => m.id === newMsg.clientMsgId)) {
            return prev.map((m) => (m.id === newMsg.clientMsgId ? newMsg : m));
          }
          // Avoid duplicate
          if (prev.some((m) => m.id === newMsg.id)) {
            return prev;
          }
          return [...prev, newMsg];
        });
        scrollToBottom(true);

        // Acknowledge read if message is from partner
        if (newMsg.senderId !== currentUserId) {
          markConversationAsRead(conversation.id).catch(() => {});
          chatSocket.sendReadAck(conversation.id);
        }
        onConversationUpdated?.();
      }
    });

    // 2. Listen for message deletions
    const unsubDel = chatSocket.on('chat:message_deleted', (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversation.id) {
        setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        onConversationUpdated?.();
      }
    });

    // 3. Listen for history cleared
    const unsubClear = chatSocket.on('chat:history_cleared', (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === conversation.id && data.userId === currentUserId) {
        setMessages([]);
        onConversationUpdated?.();
      }
    });

    // 4. Listen for read receipts
    const unsubRead = chatSocket.on('chat:read_receipt', (data: { conversationId: string; readBy: string; readAt: string }) => {
      if (data.conversationId === conversation.id && data.readBy !== currentUserId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === currentUserId && !m.readAt ? { ...m, readAt: data.readAt } : m
          )
        );
      }
    });

    // 5. Listen for typing indicators
    const unsubTyping = chatSocket.on('chat:typing_status', (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (data.conversationId === conversation.id && data.userId === partnerId) {
        setIsPartnerTyping(Boolean(data.isTyping));
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        if (data.isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsPartnerTyping(false);
          }, 3500);
        }
      }
    });

    // 6. Listen for incoming calls
    const unsubIncomingCall = chatSocket.on('call:incoming', (data: any) => {
      if (data.callerId === partnerId || data.conversationId === conversation.id) {
        setActiveCall({
          callId: data.callId,
          conversationId: conversation.id,
          targetUserId: data.callerId,
          targetUserName: data.callerName || partnerProfile.displayName || 'Faculty Member',
          type: data.type || 'audio',
          isIncoming: true,
          status: 'ringing',
        });
      }
    });

    return () => {
      chatSocket.leaveConversation(conversation.id);
      unsubMsg();
      unsubDel();
      unsubClear();
      unsubRead();
      unsubTyping();
      unsubIncomingCall();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversation.id, currentUserId, partnerId, loadMessages, onConversationUpdated, scrollToBottom]);

  const handleSendMessage = async (content: string, type?: any, attachment?: any) => {
    // Optimistic message append
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: conversation.id,
      senderId: currentUserId,
      receiverId: partnerId,
      content,
      type: type || 'text',
      attachment: attachment || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      sending: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    scrollToBottom(true);

    try {
      const realMsg = await sendChatMessage({
        conversationId: conversation.id,
        content,
        type,
        attachment,
        clientMsgId: tempId,
      });

      // Replace optimistic message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...realMsg, sending: false } : m))
      );
      onConversationUpdated?.();
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, sending: false, failed: true } : m))
      );
      throw err;
    }
  };

  const handleRetrySend = async (failedMsg: ChatMessage) => {
    try {
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...m, sending: true, failed: false } : m))
      );
      const realMsg = await sendChatMessage({
        conversationId: conversation.id,
        content: failedMsg.content,
        type: failedMsg.type,
        attachment: failedMsg.attachment,
        clientMsgId: failedMsg.id,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...realMsg, sending: false } : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? { ...m, sending: false, failed: true } : m))
      );
    }
  };

  const handleMessageDeleted = (deletedId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== deletedId));
    onConversationUpdated?.();
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await clearConversationHistory(conversation.id);
      setShowClearConfirm(false);
      setShowMenu(false);
      setMessages([]);
      onConversationUpdated?.();
    } catch (err: any) {
      alert(err?.message || (language === 'bn' ? 'হিস্ট্রি মুছতে সমস্যা হয়েছে।' : 'Failed to clear history.'));
    } finally {
      setIsClearing(false);
    }
  };

  const handleCopyChatLink = async () => {
    const success = await copyShareableChatLink(partnerId);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
    setShowMenu(false);
  };

  // Start outgoing call
  const startCall = (callType: 'audio' | 'video') => {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveCall({
      callId,
      conversationId: conversation.id,
      targetUserId: partnerId,
      targetUserName: partnerProfile.displayName || 'Faculty Member',
      type: callType,
      isIncoming: false,
      status: 'ringing',
    });
  };

  // Group messages with date separators
  const getDateLabel = (isoDate: string) => {
    try {
      const msgDate = new Date(isoDate);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (msgDate.toDateString() === today.toDateString()) {
        return language === 'bn' ? 'আজ' : 'Today';
      }
      if (msgDate.toDateString() === yesterday.toDateString()) {
        return language === 'bn' ? 'গতকাল' : 'Yesterday';
      }
      return msgDate.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] relative">
      {/* Active WebRTC Call Modal / Window */}
      {activeCall && (
        <WebRtcCallModal
          call={activeCall}
          currentUserId={currentUserId}
          language={language}
          onClose={() => setActiveCall(null)}
        />
      )}

      {/* Conversation Top Header: ← Avatar User Name 📞 🎥 ⋮ */}
      <header className="bg-white border-b border-slate-200 px-3 py-2.5 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1 text-slate-600 hover:text-[#006A60] hover:bg-slate-100 rounded-full transition cursor-pointer md:hidden"
              title={language === 'bn' ? 'ফিরে যান' : 'Back'}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Partner Avatar */}
          <div className="w-10 h-10 rounded-full bg-teal-100 border border-teal-200 text-[#006A60] flex items-center justify-center font-bold text-sm shrink-0">
            {partnerProfile.displayName ? partnerProfile.displayName.charAt(0).toUpperCase() : 'U'}
          </div>

          {/* Partner Info */}
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold text-slate-800 leading-tight truncate">
              {partnerProfile.displayName}
            </h2>
            <p className="text-[11px] text-slate-500 truncate">
              {isPartnerTyping ? (
                <span className="text-[#006A60] font-semibold animate-pulse">
                  {language === 'bn' ? 'টাইপ করছেন...' : 'typing...'}
                </span>
              ) : partnerProfile.designation || partnerProfile.department ? (
                `${partnerProfile.designation || ''}${partnerProfile.designation && partnerProfile.department ? ', ' : ''}${partnerProfile.department || ''}`
              ) : (
                language === 'bn' ? 'জামালপুর মেডিকেল কলেজ' : 'Jamalpur Medical College'
              )}
            </p>
          </div>
        </div>

        {/* Action icons: 📞  🎥  ⋮ */}
        <div className="flex items-center gap-1 shrink-0 relative">
          {/* Audio Call 📞 */}
          <button
            type="button"
            onClick={() => startCall('audio')}
            className="p-2 rounded-full text-slate-600 hover:text-[#006A60] hover:bg-teal-50 transition cursor-pointer"
            title={language === 'bn' ? 'অডিও কল' : 'Audio Call'}
          >
            <Phone className="w-4 h-4" />
          </button>

          {/* Video Call 🎥 */}
          <button
            type="button"
            onClick={() => startCall('video')}
            className="p-2 rounded-full text-slate-600 hover:text-[#006A60] hover:bg-teal-50 transition cursor-pointer"
            title={language === 'bn' ? 'ভিডিও কল' : 'Video Call'}
          >
            <Video className="w-4 h-4" />
          </button>

          {/* Copy Chat Link */}
          <button
            type="button"
            onClick={handleCopyChatLink}
            className="p-2 rounded-full text-slate-500 hover:text-[#006A60] hover:bg-slate-100 transition cursor-pointer"
            title={language === 'bn' ? 'চ্যাট লিংক কপি করুন' : 'Copy chat link'}
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
          </button>

          {/* More Menu ⋮ */}
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            className="p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title={language === 'bn' ? 'মেনু' : 'Menu'}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {/* Menu Dropdown */}
          {showMenu && (
            <div className="absolute right-0 top-10 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95">
              <button
                type="button"
                onClick={handleCopyChatLink}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
              >
                <Link2 className="w-4 h-4 text-slate-400" />
                <span>{language === 'bn' ? 'চ্যাট লিংক কপি করুন' : 'Copy Chat Link'}</span>
              </button>

              <div className="my-1 border-t border-slate-100" />

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowClearConfirm(true);
                }}
                className="w-full px-3.5 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
                <span>{language === 'bn' ? 'চ্যাট হিস্ট্রি মুছুন' : 'Clear Chat History'}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col space-y-1">
        {/* Strict 72h Retention Warning Notice */}
        <div className="mx-auto max-w-md my-2 px-3 py-2 bg-teal-50/80 border border-teal-200/90 rounded-xl text-center flex items-center justify-center gap-2 text-[11px] text-teal-800 shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-[#006A60] shrink-0" />
          <span>
            {language === 'bn'
              ? 'নিরাপত্তা ও প্রাতিষ্ঠানিক নীতি: সকল বার্তা প্রেরণের ৭২ ঘণ্টা পর স্বয়ংক্রিয়ভাবে স্থায়ী ধ্বংস হয়।'
              : 'Institutional privacy policy: All chat messages permanently self-delete after 72 hours.'}
          </span>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="flex flex-col gap-3 py-6 items-center justify-center text-slate-400 text-xs">
            <span className="inline-block w-6 h-6 border-2 border-[#006A60] border-t-transparent rounded-full animate-spin" />
            <span>{language === 'bn' ? 'বার্তা লোড হচ্ছে...' : 'Loading messages...'}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
              <ShieldAlert className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-xs font-medium text-slate-500">
              {language === 'bn' ? 'কোনো বার্তা নেই' : 'No messages yet'}
            </p>
            <p className="text-[11px] text-slate-400 max-w-xs mt-1">
              {language === 'bn'
                ? 'বার্তা, ভয়েস নোট বা সর্বোচ্চ ১০০ মেগাবাইট ফাইল আদান-প্রদান করতে নিচের কম্পোজার ব্যবহার করুন।'
                : 'Send text, voice notes, or files up to 100 MB using the composer below.'}
            </p>
          </div>
        )}

        {/* Messages List with Date Separators */}
        {!loading &&
          messages.map((msg, index) => {
            const isCurrentUser = msg.senderId === currentUserId;
            const senderName = isCurrentUser
              ? language === 'bn' ? 'আপনি' : 'You'
              : partnerProfile.displayName;

            // Date separator check
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateSeparator =
              !prevMsg ||
              new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <div className="flex items-center justify-center my-3">
                    <span className="bg-slate-200/80 text-slate-600 text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      {getDateLabel(msg.createdAt)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isCurrentUser={isCurrentUser}
                  senderName={senderName}
                  language={language}
                  onMessageDeleted={handleMessageDeleted}
                  onRetrySend={handleRetrySend}
                />
              </React.Fragment>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Composer (Bottom Fixed) */}
      <MessageComposer
        conversationId={conversation.id}
        onSendMessage={handleSendMessage}
        language={language}
        disabled={loading}
      />

      {/* Confirmation Modal for Clearing Chat History */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-800 mb-2">
              {language === 'bn' ? 'চ্যাট হিস্ট্রি মুছবেন?' : 'Clear Chat History?'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              {language === 'bn'
                ? 'এই কথোপকথনের সকল বার্তা আপনার চ্যাট ভিউ থেকে অবিলম্বে মুছে যাবে। তবে প্রাতিষ্ঠানিক জবাবদিহিতার জন্য মূল ৭২ ঘণ্টার অবশিষ্ট সময় পর্যন্ত অনুমোদিত অ্যাডমিন নজরদারিতে সংরক্ষিত থাকবে।'
                : 'This will clear all messages from your chat screen. Per institutional policy, messages remain in Admin oversight until their original 72-hour TTL expires, after which they are permanently purged.'}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                {language === 'bn' ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={isClearing}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isClearing ? (
                  <span>{language === 'bn' ? 'মুছে ফেলা হচ্ছে...' : 'Clearing...'}</span>
                ) : (
                  <span>{language === 'bn' ? 'হিস্ট্রি মুছুন' : 'Clear History'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
