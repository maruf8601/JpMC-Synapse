import React from 'react';
import { LayoutDashboard, Calendar, History, Plus, Inbox, Settings } from 'lucide-react';
import { NavigationTab, Language } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';

interface BottomNavBarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  language: Language;
  onOpenQuickAdd: () => void;
  reviewCount: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentTab,
  onSelectTab,
  language,
  onOpenQuickAdd,
  reviewCount,
}) => {
  const tabs = [
    {
      id: 'home' as NavigationTab,
      labelBn: 'হোম',
      labelEn: 'Home',
      icon: LayoutDashboard,
    },
    {
      id: 'calendar' as NavigationTab,
      labelBn: 'ক্যালেন্ডার',
      labelEn: 'Calendar',
      icon: Calendar,
    },
    {
      id: 'history' as NavigationTab,
      labelBn: 'ইতিহাস',
      labelEn: 'History',
      icon: History,
    },
    {
      id: 'add' as NavigationTab,
      labelBn: 'যোগ',
      labelEn: 'Add',
      isCenterAction: true,
      icon: Plus,
    },
    {
      id: 'inbox' as NavigationTab,
      labelBn: 'ইনবক্স',
      labelEn: 'Inbox',
      icon: Inbox,
      badge: reviewCount,
    },
    {
      id: 'settings' as NavigationTab,
      labelBn: 'সেটিংস',
      labelEn: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-2 py-1 max-w-lg md:max-w-xl lg:max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          const label = language === 'bn' ? tab.labelBn : tab.labelEn;

          if (tab.isCenterAction) {
            const handleAddTrigger = (e: React.MouseEvent | React.TouchEvent) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenQuickAdd();
              onSelectTab('add');
            };

            return (
              <div
                key={tab.id}
                id="nav-tab-add-wrapper"
                onClick={handleAddTrigger}
                className="flex-1 flex flex-col items-center justify-center relative -top-3.5 cursor-pointer select-none group touch-manipulation z-50 pointer-events-auto"
              >
                <button
                  type="button"
                  id="bottom-nav-fab-add"
                  onClick={handleAddTrigger}
                  aria-label="Add event"
                  title={language === 'bn' ? 'কর্মসূচি যোগ করুন' : 'Add event'}
                  className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-[#006A60] to-[#00897B] text-white flex items-center justify-center shadow-lg shadow-teal-900/30 group-hover:shadow-xl group-hover:scale-105 active:scale-95 transition-all duration-150 border-2 border-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 cursor-pointer pointer-events-auto"
                >
                  <Plus className="w-7 h-7 stroke-[2.5] pointer-events-none" />
                </button>
                <button
                  type="button"
                  id="nav-tab-add"
                  onClick={handleAddTrigger}
                  aria-label="Add event"
                  className="text-[10px] font-semibold text-[#006A60] mt-0.5 group-hover:text-[#004D40] transition-colors bg-transparent border-0 p-0 cursor-pointer focus:outline-none"
                >
                  {label}
                </button>
              </div>
            );
          }

          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center py-1 transition-colors relative ${
                isActive ? 'text-[#006A60] font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`px-4 py-0.5 rounded-full transition-all duration-200 flex items-center justify-center relative ${
                  isActive ? 'bg-[#CCE8E2] text-[#004D40]' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.3]' : 'stroke-[1.8]'}`} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-amber-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center px-1">
                    {language === 'bn' ? toBengaliNumber(tab.badge) : tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight truncate max-w-[64px]">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
