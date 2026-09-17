import React, { useState, useEffect } from 'react';
import { Wifi, Battery, ShieldCheck } from 'lucide-react';
import { toBengaliNumber } from '../domain/constants';

interface StatusBarProps {
  language: 'bn' | 'en';
}

export const StatusBar: React.FC<StatusBarProps> = ({ language }) => {
  const [timeStr, setTimeStr] = useState<string>('09:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      // Format in Asia/Dhaka
      const dhakaTime = now.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      setTimeStr(dhakaTime);
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const displayTime = language === 'bn' ? toBengaliNumber(timeStr) : timeStr;

  return (
    <div
      id="android-status-bar"
      className="w-full bg-[#004D40] text-teal-100 text-xs px-4 py-1.5 flex items-center justify-between select-none tracking-tight font-medium border-b border-teal-800/30"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">{displayTime}</span>
        <span className="text-[10px] bg-teal-800/70 text-teal-200 px-1.5 py-0.5 rounded flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-300" />
          <span>JpMC Asia/Dhaka (UTC+6)</span>
        </span>
      </div>

      <div className="flex items-center gap-2 text-teal-200">
        <span className="text-[11px] font-semibold text-white">5G</span>
        <Wifi className="w-3.5 h-3.5" />
        <div className="flex items-center gap-1">
          <span className="text-[10px]">{language === 'bn' ? '৮৮%' : '88%'}</span>
          <Battery className="w-4 h-4 text-emerald-300 fill-emerald-300" />
        </div>
      </div>
    </div>
  );
};
