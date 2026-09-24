import React from 'react';
import { LayoutDashboard, Calendar, MessageSquare, MessagesSquare, ShieldCheck, Settings } from 'lucide-react';
import { NavigationTab, Language } from '../domain/models';
import { toBengaliNumber } from '../domain/constants';

interface BottomNavBarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  language: Language;
  role?: 'admin' | 'user';
  reviewCount: number;
  unreadChatCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentTab,
  onSelectTab,
  language,
  role = 'user',
  reviewCount,
  unreadChatCount = 0,
}) => {
  const isAdmin = role === 'admin';

  // Navigation items: Dashboard, Calendar, Chat, Forum (আলোচনা), Admin (if admin), Settings
  const baseTabs = [
    {
      id: 'home' as NavigationTab,
      labelBn: 'ড্যাশবোর্ড',
      labelEn: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'calendar' as NavigationTab,
      labelBn: 'ক্যালেন্ডার',
      labelEn: 'Calendar',
      icon: Calendar,
    },
    {
      id: 'chat' as NavigationTab,
      labelBn: 'চ্যাট',
      labelEn: 'Chat',
      icon: MessageSquare,
      badge: unreadChatCount,
    },
    {
      id: 'forum' as NavigationTab,
      labelBn: 'আলোচনা',
      labelEn: 'Forum',
      icon: MessagesSquare,
    },
    ...(isAdmin
      ? [
          {
            id: 'admin' as NavigationTab,
            labelBn: 'অ্যাডমিন',
            labelEn: 'Admin',
            icon: ShieldCheck,
            badge: reviewCount,
          },
        ]
      : []),
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
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 py-1 max-w-lg md:max-w-xl lg:max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-around">
        {baseTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          const label = language === 'bn' ? tab.labelBn : tab.labelEn;

          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center py-1 transition-colors relative cursor-pointer select-none ${
                isActive ? 'text-[#006A60] font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`px-4 py-1 rounded-full transition-all duration-200 flex items-center justify-center relative ${
                  isActive ? 'bg-[#CCE8E2] text-[#004D40]' : 'bg-transparent'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-amber-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center px-1 shadow-xs">
                    {language === 'bn' ? toBengaliNumber(tab.badge) : tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] font-medium mt-0.5 tracking-tight truncate max-w-[70px]">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
