import React from 'react';
import { X, Globe, Phone, Mail, Award, CalendarCheck2, ShieldCheck } from 'lucide-react';
import { Language } from '../domain/models';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="about-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="about-modal"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[#006A60] to-[#004D40] text-white p-6 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-teal-700/60 text-teal-100 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mb-3 shadow-inner">
            <CalendarCheck2 className="w-9 h-9 text-teal-100" />
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
        <div className="p-6 space-y-4 text-xs text-slate-700">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Award className="w-4 h-4 text-teal-700" />
              <span>Developed by: Abdullah Al Maruf</span>
            </div>

            <div className="space-y-1.5 text-slate-600 pt-1">
              <div className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-teal-600 shrink-0" />
                <a
                  href="https://www.alberunee.me"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-700 hover:underline font-medium"
                >
                  www.alberunee.me
                </a>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-teal-600 shrink-0" />
                <span>+8801770578663</span>
              </div>

              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-teal-600 shrink-0" />
                <span>email: maruf@jpmc.gov.bd</span>
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

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#006A60] hover:bg-teal-700 text-white font-bold transition shadow-sm"
          >
            {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
