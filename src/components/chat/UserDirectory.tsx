import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, Link2, Check, User, Building, Award, Loader2 } from 'lucide-react';
import { ChatUser, searchSynapseUsers, copyShareableChatLink } from '../../services/chatClientService';
import { Language } from '../../domain/models';

interface UserDirectoryProps {
  onSelectUser: (user: ChatUser) => void;
  language: Language;
}

export const UserDirectory: React.FC<UserDirectoryProps> = ({ onSelectUser, language }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Search with debounce
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchSynapseUsers(searchTerm);
        if (active) {
          setUsers(results);
        }
      } catch (err) {
        console.warn('[UserDirectory] search error:', err);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handleCopyLink = async (e: React.MouseEvent, user: ChatUser) => {
    e.stopPropagation();
    const success = await copyShareableChatLink(user.uid);
    if (success) {
      setCopiedUid(user.uid);
      setTimeout(() => setCopiedUid(null), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc]">
      {/* Search Input Box */}
      <div className="p-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              language === 'bn'
                ? 'নাম, বিভাগ বা পদবী দিয়ে খুঁজুন...'
                : 'Search by name, department, or designation...'
            }
            className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 outline-none border border-slate-200 focus:border-[#006A60] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* User list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-xs text-slate-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#006A60]" />
            <span>{language === 'bn' ? 'ব্যবহারকারী খোঁজা হচ্ছে...' : 'Searching users...'}</span>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
              <User className="w-6 h-6" />
            </div>
            <h4 className="text-xs font-bold text-slate-700 mb-1">
              {language === 'bn' ? 'কোনো ব্যবহারকারী পাওয়া যায়নি' : 'No users found'}
            </h4>
            <p className="text-[11px] text-slate-500">
              {language === 'bn'
                ? 'অন্য নাম বা বিভাগ দিয়ে চেষ্টা করুন।'
                : 'Try searching with another name or department.'}
            </p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.uid}
              onClick={() => onSelectUser(user)}
              className="bg-white rounded-xl border border-slate-200/90 p-3 hover:border-[#006A60] hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-teal-100 border border-teal-200 text-[#006A60] flex items-center justify-center font-bold text-sm shrink-0">
                  {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                </div>

                {/* Info */}
                <div className="overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800 truncate group-hover:text-[#006A60] transition">
                      {user.displayName}
                    </h4>
                    {user.role === 'admin' && (
                      <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.2 rounded-sm shrink-0">
                        Admin
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                    {user.department && (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Building className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[140px]">{user.department}</span>
                      </span>
                    )}
                    {user.designation && (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Award className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[140px]">{user.designation}</span>
                      </span>
                    )}
                    {!user.department && !user.designation && (
                      <span className="text-slate-400">JpMC Staff</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handleCopyLink(e, user)}
                  className="p-2 rounded-lg text-slate-400 hover:text-[#006A60] hover:bg-teal-50 transition cursor-pointer"
                  title={language === 'bn' ? 'চ্যাট লিংক কপি' : 'Copy chat link'}
                >
                  {copiedUid === user.uid ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onSelectUser(user)}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 text-[#006A60] hover:bg-[#006A60] hover:text-white transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {language === 'bn' ? 'বার্তা' : 'Message'}
                  </span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
