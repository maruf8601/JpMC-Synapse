import React, { useState } from 'react';
import {
  CalendarCheck2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  User,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  loginNormalUser,
  loginAdminGoogle,
  UserSessionProfile,
} from '../services/authService';

interface LoginScreenProps {
  onLoginSuccess: (profile?: UserSessionProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
}) => {
  // Normal User state
  const [fullName, setFullName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Admin Login state
  const [isSubmittingAdmin, setIsSubmittingAdmin] = useState(false);

  // Error feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Normal User / Faculty Login
  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      setErrorMessage('অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।');
      return;
    }

    if (!accessCode.trim()) {
      setErrorMessage('অনুগ্রহ করে প্রাতিষ্ঠানিক অ্যাক্সেস কোড লিখুন।');
      return;
    }

    setIsSubmittingUser(true);
    setErrorMessage(null);

    try {
      const profile = await loginNormalUser(fullName, accessCode);
      onLoginSuccess(profile);
    } catch (err: any) {
      console.error('[LoginScreen] Normal user login error:', err);

      setErrorMessage(
        err?.message ||
          'লগইন সম্পন্ন করা সম্ভব হয়নি। তথ্য যাচাই করে আবার চেষ্টা করুন।'
      );
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Handle Admin Google Sign-In
  const handleAdminGoogleLogin = async () => {
    setIsSubmittingAdmin(true);
    setErrorMessage(null);

    try {
      const profile = await loginAdminGoogle();
      onLoginSuccess(profile);
    } catch (err: any) {
      console.error('[LoginScreen] Admin Google login error:', err);

      if (err?.message === 'USER_CANCELLED') {
        setIsSubmittingAdmin(false);
        return;
      }

      if (err?.message === 'POPUP_BLOCKED') {
        setErrorMessage(
          'ব্রাউজার গুগল লগইন পপআপ ব্লক করেছে। অনুগ্রহ করে অ্যাড্রেস বারে পপআপ অনুমোদন করুন।'
        );
      } else if (err?.code === 'auth/network-request-failed') {
        setErrorMessage(
          'ইন্টারনেট সংযোগ পাওয়া যায়নি। দয়া করে আপনার নেটওয়ার্ক যাচাই করুন।'
        );
      } else {
        setErrorMessage(
          err?.message ||
            'এই গুগল অ্যাকাউন্টটি অ্যাডমিনিস্ট্রেটর হিসেবে অনুমোদিত নয়। সাধারণ ব্যবহারকারী হিসেবে আপনার নাম ও অ্যাক্সেস কোড দিয়ে প্রবেশ করুন।'
        );
      }
    } finally {
      setIsSubmittingAdmin(false);
    }
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen bg-slate-50 flex flex-col justify-between items-center p-4 sm:p-6"
    >
      <div className="w-full max-w-md my-auto space-y-5">
        {/* Main Login Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/60 border border-slate-200 space-y-6">

          {/* Institutional Header */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="relative">

                {/* JpMC Logo */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-teal-50 border border-teal-200/80 p-2.5 shadow-inner flex items-center justify-center">
                  <img
                    src="https://jpmc.gov.bd/wp-content/uploads/2024/11/jmcpng.png"
                    alt="Jamalpur Medical College Logo"
                    className="w-full h-full object-contain"
                    loading="eager"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';

                      const fallback =
                        document.getElementById('login-logo-fallback');

                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }}
                  />

                  {/* Logo Fallback */}
                  <div
                    id="login-logo-fallback"
                    className="hidden w-full h-full items-center justify-center text-teal-700"
                  >
                    <CalendarCheck2 className="w-10 h-10" />
                  </div>
                </div>

                {/* Security Badge */}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#006A60] border-2 border-white flex items-center justify-center shadow">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-800 text-[11px] font-bold px-3 py-0.5 rounded-full border border-teal-200/70">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse"></span>
                অফিশিয়াল শিডিউল সিস্টেম
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-['Tiro_Bangla',sans-serif]">
                JpMC Synapse
              </h1>

              <p className="text-sm font-semibold text-teal-800 font-['Tiro_Bangla',sans-serif]">
                জামালপুর মেডিকেল কলেজ
              </p>
            </div>
          </div>

          {/* Error Message Banner */}
          {errorMessage && (
            <div
              id="login-error-banner"
              className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-2xl flex items-start gap-2.5 text-left leading-relaxed animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* =================================================== */}
          {/* SECTION 1: NORMAL USER / FACULTY LOGIN             */}
          {/* =================================================== */}

          <form onSubmit={handleUserLogin} className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#006A60]" />
                <span>শিক্ষক ও কর্মকর্তা প্রবেশ</span>
              </span>

              <span className="text-[10px] font-medium text-slate-400">
                একবার লগইন করলেই চলবে
              </span>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5 text-left">
              <label
                htmlFor="user-full-name-input"
                className="block text-xs font-semibold text-slate-700"
              >
                পূর্ণ নাম <span className="text-rose-500">*</span>
              </label>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>

                <input
                  id="user-full-name-input"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="যেমন: Prof. Dr. Md. Abul Kalam Azad"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 placeholder:text-slate-400 rounded-2xl border border-slate-200 focus:border-[#006A60] focus:ring-2 focus:ring-teal-500/20 text-xs transition outline-none"
                />
              </div>
            </div>

            {/* Institutional Access Code */}
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="user-access-code-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  প্রাতিষ্ঠানিক অ্যাক্সেস কোড{' '}
                  <span className="text-rose-500">*</span>
                </label>
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>

                <input
                  id="user-access-code-input"
                  type={showAccessCode ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  placeholder="অফিশিয়াল অ্যাক্সেস কোড দিন"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/70 focus:bg-white text-slate-900 placeholder:text-slate-400 rounded-2xl border border-slate-200 focus:border-[#006A60] focus:ring-2 focus:ring-teal-500/20 text-xs transition outline-none font-mono"
                />

                <button
                  type="button"
                  onClick={() => setShowAccessCode(!showAccessCode)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showAccessCode ? 'কোড লুকান' : 'কোড দেখুন'}
                >
                  {showAccessCode ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                <span>
                  প্রথমবার লগইনের পর এই ডিভাইসে স্বয়ংক্রিয়ভাবে সেশন চালু থাকবে।
                </span>
              </p>
            </div>

            {/* Normal User Login Button */}
            <button
              id="user-login-submit-btn"
              type="submit"
              disabled={isSubmittingUser || isSubmittingAdmin}
              className="w-full flex items-center justify-center gap-2 bg-[#006A60] hover:bg-[#005B52] active:bg-[#004D40] text-white font-bold text-sm py-3 px-5 rounded-2xl shadow-md shadow-teal-900/10 hover:shadow-lg transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmittingUser ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>যাচাই করা হচ্ছে...</span>
                </>
              ) : (
                <>
                  <span>প্রবেশ করুন</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>

            <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              অথবা
            </span>

            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* =================================================== */}
          {/* SECTION 2: ADMIN GOOGLE LOGIN                       */}
          {/* =================================================== */}

          <div className="space-y-2 pt-1 text-center">
            <div className="text-[11px] text-slate-500 font-medium flex items-center justify-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              <span>প্রশাসনিক নিয়ন্ত্রণ (অ্যাডমিনদের জন্য)</span>
            </div>

            <button
              id="admin-google-signin-btn"
              type="button"
              disabled={isSubmittingUser || isSubmittingAdmin}
              onClick={handleAdminGoogleLogin}
              className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 font-medium px-4 py-2.5 rounded-2xl border border-slate-300 shadow-xs hover:shadow-sm transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed text-xs"
            >
              {isSubmittingAdmin ? (
                <>
                  <Loader2 className="w-4 h-4 text-teal-700 animate-spin" />
                  <span>অ্যাডমিন যাচাই করা হচ্ছে...</span>
                </>
              ) : (
                <>
                  {/* Google G Logo */}
                  <svg
                    className="w-4 h-4 shrink-0"
                    viewBox="0 0 24 24"
                  >
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

                  <span className="font-semibold text-slate-700">
                    Admin Login — Continue with Google
                  </span>
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-400">
              শুধুমাত্র অনুমোদিত প্রাতিষ্ঠানিক কর্মকর্তাদের জন্য
            </p>
          </div>
        </div>
      </div>

      {/* Institutional Copyright Footer */}
      <footer className="w-full max-w-md text-center py-2 text-[11px] text-slate-500 space-y-1.5">
        <p>জামালপুর মেডিকেল কলেজ, জামালপুর • com.jpmc.synapse</p>

        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-slate-400">
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/privacy');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="hover:text-teal-700 hover:underline transition"
          >
            গোপনীয়তা নীতি (Privacy Policy)
          </a>

          <span>•</span>

          <a
            href="/terms"
            onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/terms');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
            className="hover:text-teal-700 hover:underline transition"
          >
            ব্যবহারের শর্তাবলি (Terms of Service)
          </a>
        </div>
      </footer>
    </div>
  );
};