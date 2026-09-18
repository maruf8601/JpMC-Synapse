import React, { useState } from 'react';
import { CalendarCheck2, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { googleSignIn } from '../services/googleAuth';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await googleSignIn();
      if (res && res.user) {
        onLoginSuccess();
      } else {
        // User closed the popup window
        setLoading(false);
      }
    } catch (err: any) {
      setLoading(false);
      console.error('[LoginScreen] Sign-in error:', err);
      if (err?.message === 'POPUP_BLOCKED') {
        setErrorMessage('ব্রাউজার গুগল লগইন পপআপ ব্লক করেছে। অনুগ্রহ করে অ্যাড্রেস বারে পপআপ অনুমোদন করুন।');
      } else if (err?.code === 'auth/network-request-failed') {
        setErrorMessage('ইন্টারনেট সংযোগ পাওয়া যায়নি। দয়া করে আপনার নেটওয়ার্ক যাচাই করুন।');
      } else {
        setErrorMessage(err?.message || 'গুগল সাইন-ইন সম্পন্ন করা সম্ভব হয়নি। আবার চেষ্টা করুন।');
      }
    }
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen bg-slate-50 flex flex-col justify-between items-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md my-auto space-y-6">
        {/* Institutional Header Card */}
        <div className="bg-white rounded-3xl p-7 sm:p-8 shadow-xl shadow-slate-200/60 border border-slate-200 text-center space-y-5">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-teal-50 border border-teal-200/80 p-3 shadow-inner flex items-center justify-center">
                <img
                  src="https://jpmc.gov.bd/wp-content/uploads/2024/11/jmcpng.png"
                  alt="Jamalpur Medical College Logo"
                  className="w-full h-full object-contain"
                  loading="eager"
                  crossOrigin="anonymous"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                    const fallback = document.getElementById('login-logo-fallback');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div
                  id="login-logo-fallback"
                  className="hidden w-full h-full items-center justify-center text-teal-700"
                >
                  <CalendarCheck2 className="w-10 h-10" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center shadow">
                <ShieldCheck className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          {/* Titles */}
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-800 text-xs font-semibold px-3 py-1 rounded-full border border-teal-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
              অফিশিয়াল সিস্টেম
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-['Tiro_Bangla',sans-serif]">
              জেপিএমসি সিন্যাপস
            </h1>
            <p className="text-sm font-semibold text-teal-800 font-['Tiro_Bangla',sans-serif]">
              জামালপুর মেডিকেল কলেজ
            </p>
            <p className="text-xs text-slate-500 font-medium">
              অফিশিয়াল শিডিউল ও নোটিশ অটোমেশন সিস্টেম
            </p>
          </div>

          {/* Institutional Note */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-xs text-slate-600 text-left space-y-1.5">
            <p className="font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
              <span>নিরাপদ স্টাফ লগইন</span>
            </p>
            <p className="leading-relaxed">
              কলেজের সকল শিক্ষক, কর্মকর্তা ও কর্মচারীদের কর্মসূচির তথ্য দেখতে এবং নোটিশ আপডেট পেতে প্রাতিষ্ঠানিক গুগল একাউন্টে সাইন-ইন করুন।
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-2xl flex items-start gap-2.5 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Sign In Button */}
          <div className="pt-2">
            <button
              id="google-signin-btn"
              type="button"
              disabled={loading}
              onClick={handleSignIn}
              className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-semibold px-5 py-3.5 rounded-2xl border-2 border-slate-300 shadow-sm hover:shadow transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 text-teal-700 animate-spin" />
                  <span className="text-sm text-slate-700">সাইন ইন করা হচ্ছে...</span>
                </>
              ) : (
                <>
                  {/* Official Google G Logo SVG */}
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="text-sm font-semibold tracking-tight text-slate-800">
                    গুগল দিয়ে সাইন ইন করুন
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Institutional Copyright Footer */}
      <footer className="w-full max-w-md text-center py-2 text-[11px] text-slate-500 space-y-1.5">
        <p>জামালপুর মেডিকেল কলেজ, জামালপুর • com.jpmc.synapse</p>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-slate-400">
          <a
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState(null, '', '/terms');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-teal-700 hover:text-teal-800 hover:underline font-medium"
          >
            Terms of Service (শর্তাবলী)
          </a>
          <span>•</span>
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState(null, '', '/privacy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="text-teal-700 hover:text-teal-800 hover:underline font-medium"
          >
            Privacy Policy (গোপনীয়তা নীতি)
          </a>
        </div>
        <p className="text-slate-400">Powered by JpMC Synapse AI Automation Engine</p>
      </footer>
    </div>
  );
};
