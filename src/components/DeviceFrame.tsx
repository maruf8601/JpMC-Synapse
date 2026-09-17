import React, { useState } from 'react';
import { Smartphone, Monitor, ShieldCheck, Sparkles } from 'lucide-react';
import { Language } from '../domain/models';

interface DeviceFrameProps {
  children: React.ReactNode;
  language: Language;
}

export const DeviceFrame: React.FC<DeviceFrameProps> = ({ children, language }) => {
  const [isPhoneFrame, setIsPhoneFrame] = useState(false); // Default to full responsive width on desktop, but with option to switch!

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-start p-0 md:p-3 selection:bg-teal-300 selection:text-teal-900">
      {/* Top Desktop Helper Toolbar (hidden on mobile) */}
      <div className="hidden md:flex items-center justify-between w-full max-w-2xl mb-2 px-3 py-1.5 bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700/60 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-bold text-white tracking-tight">JpMC Synapse</span>
          <span className="text-[11px] text-teal-300 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded-full font-mono">
            com.jpmc.synapse (Android 14)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPhoneFrame(!isPhoneFrame)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs transition"
            title="Toggle Device Frame"
          >
            {isPhoneFrame ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-teal-400" />
                <span>{language === 'bn' ? 'রেসপন্সিভ ভিউ' : 'Responsive View'}</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-teal-400" />
                <span>{language === 'bn' ? 'অ্যান্ড্রয়েড ফ্রেম' : 'Android Frame'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div
        className={`w-full transition-all duration-300 bg-[#F6FAF8] relative ${
          isPhoneFrame
            ? 'max-w-[420px] rounded-[42px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] border-[10px] border-slate-800 overflow-hidden my-auto min-h-[850px]'
            : 'max-w-2xl rounded-none md:rounded-3xl shadow-xl min-h-screen md:min-h-[92vh] border-0 md:border border-slate-200/40 overflow-hidden'
        }`}
      >
        {/* Android Punch-hole Camera if in Phone Frame */}
        {isPhoneFrame && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-black z-50 pointer-events-none ring-2 ring-slate-800"></div>
        )}

        <div className="h-full flex flex-col min-h-screen md:min-h-[90vh]">
          {children}
        </div>
      </div>
    </div>
  );
};
