import React, { useState } from 'react';
import { X, Globe, Phone, Mail, Award, CalendarCheck2, ShieldCheck, Facebook, User } from 'lucide-react';
import { Language } from '../domain/models';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  isFirstLogin?: boolean;
  onGetStarted?: () => void;
  isSavingPreference?: boolean;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  language,
  isFirstLogin = false,
  onGetStarted,
  isSavingPreference = false,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      id="about-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={isFirstLogin ? undefined : onClose}
    >
      <div
        id="about-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#006A60] to-[#004D40] text-white p-6 text-center relative shrink-0">
          {!isFirstLogin && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-teal-700/60 text-teal-100 transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Official College Logo with Fallback */}
          <div className="flex justify-center mb-3">
            {!logoFailed ? (
              <img
                src="https://jpmc.gov.bd/wp-content/uploads/2024/11/jmcpng.png"
                alt="Jamalpur Medical College Logo"
                className="w-18 h-18 sm:w-20 sm:h-20 object-contain drop-shadow-md rounded-xl"
                loading="eager"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-inner">
                <CalendarCheck2 className="w-9 h-9 text-teal-100" />
              </div>
            )}
          </div>

          <h2 className="text-xl font-bold tracking-tight text-white">JpMC Synapse</h2>
          <p className="text-xs text-teal-200 font-medium mt-0.5">
            Smart Schedule & Reminder System
          </p>
          <div className="inline-flex items-center gap-1 mt-2 text-[11px] bg-teal-800/80 px-2.5 py-0.5 rounded-full text-teal-100 border border-teal-600/40">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span>Jamalpur Medical College, Jamalpur</span>
          </div>
        </div>

        {/* Developer & System Information */}
        <div className="p-6 space-y-4 text-xs text-slate-700 overflow-y-auto">
          {/* Developer Card: Left Information, Right Photo */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between gap-3">
              {/* Left Side: Developer Info */}
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                  <Award className="w-4 h-4 text-teal-700 shrink-0" />
                  <span className="truncate">Developed by: Abdullah Al Maruf</span>
                </div>

                <div className="space-y-1.5 text-slate-600 pt-0.5">
                  <div className="flex items-center gap-2.5">
                    <Globe className="w-4 h-4 text-teal-600 shrink-0" />
                    <a
                      href="https://www.alberunee.me"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 hover:underline font-medium truncate"
                    >
                      www.alberunee.me
                    </a>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-teal-600 shrink-0" />
                    <a
                      href="tel:+8801770578663"
                      className="hover:text-teal-700 font-medium text-slate-700 transition"
                    >
                      +8801770578663
                    </a>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-teal-600 shrink-0" />
                    <a
                      href="mailto:maruf@jpmc.gov.bd"
                      className="text-teal-700 hover:underline transition truncate"
                    >
                      maruf@jpmc.gov.bd
                    </a>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Facebook className="w-4 h-4 text-teal-600 shrink-0" />
                    <a
                      href="https://facebook.com/AAbdullahAlMaruf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 hover:underline font-medium truncate"
                    >
                      Abdullah Al Maruf
                    </a>
                  </div>
                </div>
              </div>

              {/* Right Side: Developer Photo */}
              <div className="shrink-0 flex items-center justify-center self-center pl-2">
                {!photoFailed ? (
                  <img
                    src="https://jpmc.gov.bd/wp-content/uploads/2026/04/IMG_01082024.png"
                    alt="Abdullah Al Maruf"
                    className="w-20 h-24 sm:w-24 sm:h-28 object-cover rounded-2xl border border-slate-200/90 shadow-sm bg-slate-100"
                    loading="lazy"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-2xl bg-teal-50 border border-teal-200 flex flex-col items-center justify-center text-teal-700 shadow-xs">
                    <User className="w-7 h-7" />
                    <span className="text-[9px] font-semibold mt-1">Maruf</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Technical Specs Card */}
          <div className="bg-teal-50/50 p-3.5 rounded-xl border border-teal-200/70 text-[11px] space-y-1 text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-500">App Version:</span>
              <span className="font-semibold text-slate-800">v1.0.0 (Build 34 - Android 14)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Package Name:</span>
              <span className="font-mono text-slate-800">com.jpmc.synapse</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Primary Timezone:</span>
              <span className="font-semibold text-slate-800">Asia/Dhaka (UTC+6)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Design System:</span>
              <span className="font-semibold text-teal-800">Material Design 3 (M3)</span>
            </div>
          </div>

          {isFirstLogin ? (
            <button
              id="about-modal-get-started-btn"
              onClick={onGetStarted || onClose}
              disabled={isSavingPreference}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#006A60] to-[#004D40] hover:from-teal-700 hover:to-teal-900 active:scale-98 text-white font-bold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <span>{language === 'bn' ? 'শুরু করুন' : 'Get Started'}</span>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[#006A60] hover:bg-teal-700 text-white font-bold transition shadow-sm cursor-pointer"
            >
              {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
