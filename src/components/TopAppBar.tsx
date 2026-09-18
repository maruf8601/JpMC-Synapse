import React, { useState } from 'react';
import { Search, Bell, X, CalendarCheck2 } from 'lucide-react';
import { Language } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';

interface TopAppBarProps {
  language: Language;
  onLanguageChange?: (lang: Language) => void;
  reviewCount: number;
  onOpenReview: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenInstallModal?: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  language,
  reviewCount,
  onOpenReview,
  searchQuery,
  onSearchChange,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <header
      id="top-app-bar"
      className="bg-[#006A60] text-white px-4 pt-[max(0.75rem,calc(env(safe-area-inset-top)+0.5rem))] pb-3 shadow-md sticky top-0 z-30 transition-all duration-200"
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {isSearchOpen ? (
          <div className="flex-1 flex items-center bg-teal-800/80 rounded-full px-3 py-1.5 transition-all">
            <Search className="w-4 h-4 text-teal-200 mr-2 shrink-0" />
            <input
              id="search-input"
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={
                language === 'bn'
                  ? 'কর্মসূচি, ভেন্যু বা কমিটি খুঁজুন (বাংলা/English)...'
                  : 'Search events, venues, committees...'
              }
              className="bg-transparent text-white placeholder-teal-200 text-sm focus:outline-none w-full"
            />
            {searchQuery && (
              <button
                id="clear-search-btn"
                onClick={() => onSearchChange('')}
                className="p-1 hover:text-white text-teal-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              id="close-search-btn"
              onClick={() => {
                setIsSearchOpen(false);
                onSearchChange('');
              }}
              className="ml-2 text-xs bg-teal-700/60 hover:bg-teal-700 px-2.5 py-1 rounded-lg text-teal-100 cursor-pointer"
            >
              {language === 'bn' ? 'বন্ধ' : 'Close'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/25 border border-teal-300/40 flex items-center justify-center shadow-inner shrink-0">
                <CalendarCheck2 className="w-5 h-5 text-teal-100" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                  JpMC Synapse
                </h1>
                <p className="text-[11px] text-teal-100/90 font-medium">
                  {language === 'bn' ? 'জামালপুর মেডিকেল কলেজ' : 'Jamalpur Medical College'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                id="open-search-btn"
                onClick={() => setIsSearchOpen(true)}
                className="p-2 rounded-full hover:bg-teal-700/60 text-teal-100 transition cursor-pointer"
                title={language === 'bn' ? 'অনুসন্ধান' : 'Search'}
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>

              <button
                id="notification-bell-btn"
                onClick={onOpenReview}
                className="p-2 rounded-full hover:bg-teal-700/60 text-teal-100 relative transition cursor-pointer"
                title={language === 'bn' ? 'নোটিফিকেশন ও যাচাই' : 'Notifications & Review'}
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {reviewCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] bg-amber-400 text-slate-900 font-bold text-[10px] rounded-full flex items-center justify-center px-1 shadow">
                    {language === 'bn' ? toBengaliNumber(reviewCount) : reviewCount}
                  </span>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
