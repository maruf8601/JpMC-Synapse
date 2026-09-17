import React, { useState } from 'react';
import { Search, Bell, X, CalendarCheck2, Globe, Smartphone } from 'lucide-react';
import { Language } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';

interface TopAppBarProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  reviewCount: number;
  onOpenReview: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenInstallModal?: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  language,
  onLanguageChange,
  reviewCount,
  onOpenReview,
  searchQuery,
  onSearchChange,
  onOpenInstallModal,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <header
      id="top-app-bar"
      className="bg-[#006A60] text-white px-4 py-3 shadow-md sticky top-0 z-30 transition-all duration-200"
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
                className="p-1 hover:text-white text-teal-200"
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
              className="ml-2 text-xs bg-teal-700/60 hover:bg-teal-700 px-2 py-1 rounded text-teal-100"
            >
              {language === 'bn' ? 'বন্ধ' : 'Close'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/25 border border-teal-300/40 flex items-center justify-center shadow-inner">
                <CalendarCheck2 className="w-5 h-5 text-teal-100" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                    JpMC Synapse
                  </h1>
                  <span className="text-[10px] bg-emerald-700/90 text-emerald-100 font-semibold px-1.5 py-0.2 rounded-full border border-emerald-400/30">
                    Official
                  </span>
                </div>
                <p className="text-[11px] text-teal-100/90 font-medium">
                  {language === 'bn'
                    ? 'জামালপুর মেডিকেল কলেজ • স্মার্ট সূচি'
                    : 'Jamalpur Medical College • Smart Schedule'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                id="open-search-btn"
                onClick={() => setIsSearchOpen(true)}
                className="p-2 rounded-full hover:bg-teal-700/60 text-teal-100 transition"
                title={language === 'bn' ? 'অনুসন্ধান' : 'Search'}
                aria-label="Search"
              >
                <Search className="w-5 h-5" />
              </button>

              <button
                id="notification-bell-btn"
                onClick={onOpenReview}
                className="p-2 rounded-full hover:bg-teal-700/60 text-teal-100 relative transition"
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

              <button
                id="language-switch-btn"
                onClick={() => onLanguageChange(language === 'bn' ? 'en' : 'bn')}
                className="ml-1 text-xs font-semibold bg-teal-800/80 hover:bg-teal-700 border border-teal-500/40 text-teal-100 px-2 py-1 rounded-lg flex items-center gap-1 transition"
                title="Switch Language"
              >
                <Globe className="w-3.5 h-3.5 text-teal-200" />
                <span>{language === 'bn' ? 'EN' : 'বাংলা'}</span>
              </button>

              {onOpenInstallModal && (
                <button
                  id="pwa-install-app-btn"
                  onClick={onOpenInstallModal}
                  className="ml-0.5 text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-900 px-2 py-1 rounded-lg flex items-center gap-1 transition shadow-xs"
                  title={language === 'bn' ? 'অ্যাপ ইনস্টল করুন (Android APK / iPhone / Desktop)' : 'Install App'}
                >
                  <Smartphone className="w-3.5 h-3.5 text-slate-900" />
                  <span className="hidden sm:inline">{language === 'bn' ? 'অ্যাপ' : 'App'}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
};
