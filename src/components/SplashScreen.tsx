import React from 'react';
import { CalendarCheck2, ShieldCheck, Loader2 } from 'lucide-react';

interface SplashScreenProps {
  message?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  message = 'যাচাই করা হচ্ছে...',
}) => {
  return (
    <div
      id="splash-screen"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#004D40] via-[#006A60] to-[#003B33] text-white p-6 select-none"
    >
      <div className="flex flex-col items-center max-w-sm text-center">
        {/* Institutional Monogram / Logo */}
        <div className="relative mb-6">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center p-3">
            <img
              src="https://jpmc.gov.bd/wp-content/uploads/2024/11/jmcpng.png"
              alt="Jamalpur Medical College Logo"
              className="w-full h-full object-contain drop-shadow"
              loading="eager"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // Fallback to icon if external logo image fails
                (e.target as HTMLElement).style.display = 'none';
                const fallback = document.getElementById('splash-logo-fallback');
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div
              id="splash-logo-fallback"
              className="hidden w-full h-full items-center justify-center text-teal-200"
            >
              <CalendarCheck2 className="w-12 h-12" />
            </div>
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-md">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Titles */}
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm font-['Tiro_Bangla',sans-serif]">
          জেপিএমসি সিন্যাপস
        </h1>
        <p className="text-base text-teal-100 font-medium mt-1 font-['Tiro_Bangla',sans-serif]">
          জামালপুর মেডিকেল কলেজ
        </p>
        <span className="text-xs text-teal-200/80 tracking-wider uppercase mt-0.5">
          Jamalpur Medical College, Jamalpur
        </span>

        {/* Subtle Indicator */}
        <div className="mt-10 flex flex-col items-center gap-2.5">
          <Loader2 className="w-6 h-6 text-teal-200 animate-spin" />
          <span className="text-xs text-teal-100 font-medium tracking-wide">
            {message}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-center text-[11px] text-teal-200/60 font-mono">
        JpMC Synapse • v1.0.0
      </div>
    </div>
  );
};
