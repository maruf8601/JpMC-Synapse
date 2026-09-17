import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Language } from '../domain/models';
import {
  Smartphone,
  Apple,
  Monitor,
  Github,
  Download,
  CheckCircle2,
  X,
  ExternalLink,
  Layers,
  Sparkles,
  Share,
} from 'lucide-react';

interface PWAInstallGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [activeTab, setActiveTab] = useState<'android' | 'ios' | 'desktop' | 'github'>('android');
  const [installSuccess, setInstallSuccess] = useState(false);

  if (!isOpen) return null;

  const handleNativeInstall = async () => {
    const ok = await install();
    if (ok) {
      setInstallSuccess(true);
      setTimeout(() => {
        setInstallSuccess(false);
        onClose();
      }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#004D40] to-[#006A60] p-5 text-white flex items-start justify-between relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Smartphone className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">
                  {language === 'bn' ? 'অ্যাপ ইনস্টলেশন ও ব্যবহার' : 'App Installation & Deployment'}
                </h3>
                <span className="text-[10px] font-bold bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  PWA / APK
                </span>
              </div>
              <p className="text-xs text-teal-100 mt-0.5">
                {language === 'bn'
                  ? 'অ্যান্ড্রয়েড, আইফোন, ডেস্কটপ ও গিটহাব ডেপ্লয়মেন্ট নির্দেশিকা'
                  : 'Android APK, iPhone, Desktop & GitHub Deployment Guide'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Platform Selection Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-3 pt-2 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('android')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer border-b-2 ${
              activeTab === 'android'
                ? 'bg-white text-[#006A60] border-[#006A60] shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android (APK)</span>
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer border-b-2 ${
              activeTab === 'ios'
                ? 'bg-white text-[#006A60] border-[#006A60] shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Apple className="w-3.5 h-3.5" />
            <span>iPhone / iPad</span>
          </button>
          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer border-b-2 ${
              activeTab === 'desktop'
                ? 'bg-white text-[#006A60] border-[#006A60] shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop</span>
          </button>
          <button
            onClick={() => setActiveTab('github')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-xl transition cursor-pointer border-b-2 ${
              activeTab === 'github'
                ? 'bg-white text-[#006A60] border-[#006A60] shadow-xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Direct Install prompt if available */}
          {isInstallable && !isInstalled && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    {language === 'bn' ? 'তাৎক্ষণিক ব্রাউজার ইনস্টল উপলব্ধ' : 'Instant 1-Click Install Available'}
                  </h4>
                  <p className="text-[11px] text-emerald-800">
                    {language === 'bn'
                      ? 'সরাসরি হোম স্ক্রিনে বা ডেস্কটপে ইনস্টল করুন'
                      : 'Install directly to your device home screen or app drawer'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleNativeInstall}
                className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
              >
                {installSuccess
                  ? language === 'bn'
                    ? 'ইনস্টল হয়েছে!'
                    : 'Installed!'
                  : language === 'bn'
                  ? 'এখনই ইনস্টল করুন'
                  : 'Install Now'}
              </button>
            </div>
          )}

          {isInstalled && (
            <div className="bg-teal-50 border border-teal-200 text-teal-900 rounded-2xl p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="font-semibold text-xs">
                {language === 'bn'
                  ? 'অ্যাপটি ইতোমধ্যে একটি স্বতন্ত্র PWA অ্যাপ্লিকেশন হিসেবে ইনস্টল করা রয়েছে।'
                  : 'App is currently running as an installed standalone PWA.'}
              </span>
            </div>
          )}

          {/* Android / APK Tab */}
          {activeTab === 'android' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-[#006A60] text-white flex items-center justify-center text-[10px]">
                    ১
                  </span>
                  <span>
                    {language === 'bn'
                      ? 'পদ্ধতি ১: ক্রোম থেকে সরাসরি অ্যান্ড্রয়েডে ইনস্টল (সুপারিশকৃত)'
                      : 'Method 1: Direct Android PWA Installation (Recommended)'}
                  </span>
                </h4>
                <p className="text-slate-600 text-[11px]">
                  {language === 'bn'
                    ? 'আপনার অ্যান্ড্রয়েড ফোনের Chrome ব্রাউজারে অ্যাপটি খুলে ডানদিকের ৩-ডট মেন্যু (⋮) চাপুন এবং "Install app" অথবা "Add to Home screen" নির্বাচন করুন। এটি আপনার ফোনে সম্পূর্ণ নেটিভ অ্যাপের মতো আইকনসহ ইনস্টল হয়ে যাবে।'
                    : 'Open in Android Chrome, tap the 3-dot menu (⋮), and select "Install app" or "Add to Home screen". It installs with full offline support and an app icon like a native APK.'}
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px]">
                    ২
                  </span>
                  <span>
                    {language === 'bn'
                      ? 'পদ্ধতি ২: সাইন করা APK ফাইল তৈরি (Package as APK)'
                      : 'Method 2: Export as Standalone Android .APK'}
                  </span>
                </h4>
                <p className="text-slate-600 text-[11px]">
                  {language === 'bn'
                    ? 'আপনি চাইলে বিনামূল্যে এই PWA-কে সরাসরি ইনস্টলেবল APK ফাইলে রূপান্তর করতে পারেন:'
                    : 'You can generate a direct installable .APK file in 1 minute using official tools:'}
                </p>
                <div className="bg-white rounded-xl p-2.5 border border-slate-200 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">PWABuilder (Microsoft):</span>
                    <a
                      href="https://www.pwabuilder.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#006A60] font-bold flex items-center gap-1 hover:underline"
                    >
                      <span>pwabuilder.com</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-slate-500 text-[10px]">
                    {language === 'bn'
                      ? 'অ্যাপের URL দিয়ে "Android APK / AAB Package" ডাউনলোড করে ফোনে সাইডলোড বা প্লে-স্টোরে প্রকাশ করতে পারবেন।'
                      : 'Paste your app URL to generate a signed Android APK for direct sideloading or Play Store.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* iOS Tab */}
          {activeTab === 'ios' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Apple className="w-4 h-4 text-slate-800" />
                  <span>
                    {language === 'bn'
                      ? 'আইফোন ও আইপ্যাডে ইনস্টল করার নিয়ম (Safari)'
                      : 'Install on iPhone & iPad (Safari Guide)'}
                  </span>
                </h4>
                <ol className="space-y-2 text-[11px] text-slate-600 pl-1">
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-[#006A60] bg-teal-50 px-1.5 py-0.5 rounded-sm">১</span>
                    <span>
                      {language === 'bn'
                        ? 'আপনার আইফোনের Safari ব্রাউজারে লিংকটি খুলুন।'
                        : 'Open this website in Safari on your iPhone or iPad.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-[#006A60] bg-teal-50 px-1.5 py-0.5 rounded-sm">২</span>
                    <span>
                      {language === 'bn'
                        ? 'নিচের টুলবারের "Share" (শেয়ার) আইকনটি চাপুন।'
                        : 'Tap the "Share" button in the bottom Safari toolbar.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-[#006A60] bg-teal-50 px-1.5 py-0.5 rounded-sm">৩</span>
                    <span>
                      {language === 'bn'
                        ? 'মেন্যুটি নিচে স্ক্রোল করে "Add to Home Screen" (হোম স্ক্রিনে যোগ করুন) নির্বাচন করুন।'
                        : 'Scroll down and tap "Add to Home Screen".'}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold text-[#006A60] bg-teal-50 px-1.5 py-0.5 rounded-sm">৪</span>
                    <span>
                      {language === 'bn'
                        ? 'উপরে "Add" চাপুন। এবার হোম স্ক্রিন থেকে ফুল-স্ক্রিন অ্যাপ হিসেবে ব্যবহার করুন।'
                        : 'Tap "Add" at the top right. JpMC Synapse will launch full-screen without Safari bars.'}
                    </span>
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Desktop Tab */}
          {activeTab === 'desktop' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Monitor className="w-4 h-4 text-slate-800" />
                  <span>
                    {language === 'bn'
                      ? 'ডেস্কটপে (Windows, Mac, Linux) স্বতন্ত্র অ্যাপ হিসেবে ইনস্টল'
                      : 'Install as Desktop App (Chrome / Edge)'}
                  </span>
                </h4>
                <p className="text-slate-600 text-[11px]">
                  {language === 'bn'
                    ? 'Chrome বা Edge ব্রাউজারের অ্যাড্রেস বারের ডান পাশে থাকা "Install App" (কম্পিউটার আইকন) চাপুন, অথবা মেন্যু থেকে "Install JpMC Synapse" চাপুন। এটি একটি ডেডিকেটেড উইন্ডো অ্যাপ্লিকেশন হিসেবে রান করবে।'
                    : 'Click the "Install App" monitor icon in your Chrome or Edge URL address bar, or from browser menu select "Install JpMC Synapse". It will run in its own dedicated window.'}
                </p>
              </div>
            </div>
          )}

          {/* GitHub Tab */}
          {activeTab === 'github' && (
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Github className="w-4 h-4 text-slate-800" />
                  <span>
                    {language === 'bn'
                      ? 'গিটহাব ডিপ্লয়মেন্ট (Deploy to GitHub Pages)'
                      : 'Deploy to GitHub Pages or GitHub Repo'}
                  </span>
                </h4>
                <p className="text-slate-600 text-[11px]">
                  {language === 'bn'
                    ? 'প্রজেক্টটি GitHub-এ এক্সপোর্ট করে সরাসরি GitHub Pages অথবা Cloud Run-এ হোস্ট করতে পারবেন:'
                    : 'The project is pre-configured with relative base paths (`base: "./"`) for seamless GitHub Pages hosting:'}
                </p>
                <div className="bg-slate-900 text-emerald-300 font-mono text-[10px] p-2.5 rounded-xl space-y-1">
                  <div># 1. Build static production bundle</div>
                  <div>npm run build</div>
                  <div className="mt-1"># 2. Deploy dist folder to gh-pages branch</div>
                  <div>npx gh-pages -d dist</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">JpMC Synapse PWA Core v2.0</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            {language === 'bn' ? 'বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
