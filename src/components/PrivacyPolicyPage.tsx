import React, { useEffect } from 'react';
import {
  ShieldCheck,
  ArrowLeft,
  Mail,
  Lock,
  UserCheck,
  Database,
  Share2,
  Trash2,
  Clock,
  Building2,
  ExternalLink,
  FileText,
  CheckCircle2,
  KeyRound,
  CalendarX2,
  HardDrive,
} from 'lucide-react';
import jpmcLogo from '../assets/jpmc-logo.png';

interface PrivacyPolicyPageProps {
  onBack?: () => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onBack }) => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Privacy Policy | JpMC Synapse';

    // Scroll to top on mount
    window.scrollTo({ top: 0, behavior: 'instant' });

    return () => {
      document.title = originalTitle;
    };
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      // If opened directly on /privacy, navigate to root
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased selection:bg-teal-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 rounded-xl text-slate-600 hover:text-[#006A60] hover:bg-slate-100 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title="Back to App"
              aria-label="Back to App"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to App</span>
            </button>
            <div className="h-5 w-px bg-slate-200 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <img
                src={jpmcLogo}
                alt="JpMC Logo"
                className="w-8 h-8 object-contain rounded-lg drop-shadow-xs"
              />
              <div>
                <span className="font-bold text-slate-900 text-sm tracking-tight block leading-tight">
                  JpMC Synapse
                </span>
                <span className="text-[11px] text-slate-500 block leading-tight">
                  Jamalpur Medical College
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-teal-50 text-[#006A60] text-xs font-semibold px-2.5 py-1 rounded-full border border-teal-200/70">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Official Policy</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Title Hero */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold border border-teal-200/80">
            <FileText className="w-3.5 h-3.5" />
            Institutional Privacy Statement
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
            This Privacy Policy outlines how <strong>JpMC Synapse</strong>, developed for{' '}
            <strong>Jamalpur Medical College</strong>, handles user authentication, session data, and
            integrations. We are committed to transparency and the responsible management of institutional data.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-700" />
              <span>
                <strong>Effective date:</strong> September 19, 2026
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-700" />
              <span>
                <strong>Last updated:</strong> September 19, 2026
              </span>
            </div>
          </div>
        </div>

        {/* Quick Summary Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#006A60] flex items-center justify-center shrink-0 mt-0.5">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Faculty & Staff Login</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Normal users log in with Name & Institutional Code. No Google account is required or collected.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Admin Google Sign-In</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Google Sign-In is exclusively used by designated institutional administrators.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
              <CalendarX2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Google Calendar Not Used</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                The app uses its own internal schedule engine; it never accesses your Google Calendar.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Google Drive Backup</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Drive access is strictly optional and only used when an admin initiates backup or export.
              </p>
            </div>
          </div>
        </div>

        {/* Policy Sections */}
        <div className="space-y-6">
          {/* Section 1 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h2 className="text-base font-bold text-slate-900">Authentication & Information We Collect</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-3 pl-8.5">
              <p>
                JpMC Synapse utilizes a strict dual-tier authentication architecture:
              </p>
              
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#006A60]" />
                  <span>A. Normal Users (Faculty, Doctors, Staff)</span>
                </h4>
                <p className="text-xs text-slate-600">
                  Normal users authenticate manually the first time by providing their <strong>Full Name</strong> and the <strong>Institutional Secret Access Code</strong>.
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 pl-1">
                  <li><strong>No Google Account Required:</strong> Regular faculty and staff do NOT sign in with Google.</li>
                  <li><strong>Code Protection:</strong> The institutional secret code is checked server-side using cryptographic timing-safe comparisons. The code itself is never stored on your device or in localStorage.</li>
                  <li><strong>Persistent Session:</strong> Upon first validation, a secure, pseudorandom session token is generated and stored locally so you remain logged in across page refreshes and app re-opens.</li>
                </ul>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-700" />
                  <span>B. Institutional Administrators (Google Sign-In)</span>
                </h4>
                <p className="text-xs text-slate-600">
                  Google Sign-In is reserved <strong>exclusively for authorized administrators</strong> who manage schedules, Telegram notices, and system configuration.
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 pl-1">
                  <li>Minimum identity scopes only: <code>openid</code>, <code>email</code>, and <code>profile</code>.</li>
                  <li>After authentication, the email is strictly verified against the authorized administrator whitelist. Unauthorized Google accounts are rejected and signed out immediately.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h2 className="text-base font-bold text-slate-900">Third-Party Google Services: Drive and Calendar</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-3 pl-8.5">
              <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1.5 text-xs text-slate-700">
                <p className="font-bold text-amber-900 flex items-center gap-1.5">
                  <CalendarX2 className="w-4 h-4 text-rose-600" />
                  <span>Google Calendar: Completely Disconnected</span>
                </p>
                <p>
                  JpMC Synapse maintains its own internal Firestore-based calendar and schedule engine. The application does <strong>not</strong> request any Google Calendar OAuth permissions (such as <code>https://www.googleapis.com/auth/calendar</code> or <code>calendar.events</code>) and never interacts with your personal Google Calendar.
                </p>
              </div>

              <div className="p-3.5 bg-teal-50/70 border border-teal-200/80 rounded-xl space-y-1.5 text-xs text-slate-700">
                <p className="font-bold text-teal-900 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-[#006A60]" />
                  <span>Google Drive: Administrator Backup Only</span>
                </p>
                <p>
                  Google Drive authorization (<code>https://www.googleapis.com/auth/drive.file</code>) is <strong>never</strong> requested during initial login. Drive access is requested via incremental authorization <em>only</em> when an authorized administrator explicitly connects or triggers the Google Drive Cloud Backup & Export feature. Drive files created by JpMC Synapse are limited exclusively to backup archives created by the app.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="text-base font-bold text-slate-900">How Information Is Used</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>The information collected is used exclusively for the following purposes:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1 text-xs">
                <li>Authenticating user identity and verifying permission levels (Admin vs Faculty/Staff)</li>
                <li>Displaying institutional schedules, committee meetings, academic events, and notices</li>
                <li>Delivering timely browser and PWA push notifications for upcoming meetings</li>
                <li>Maintaining secure session persistence so faculty do not need to repeatedly enter credentials</li>
                <li>Ensuring security, integrity, and administrative management of JpMC Synapse</li>
              </ul>
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                4
              </span>
              <h2 className="text-base font-bold text-slate-900">Google User Data Protection</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>
                For administrators signing in via Google, user information is used solely to authenticate and manage the institutional system.
              </p>
              <p className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-slate-800 font-medium text-xs">
                JpMC Synapse does not sell Google user data or use it for advertising. We do not use user data for commercial profiling, targeted marketing, or any purpose unrelated to the Jamalpur Medical College schedule management system.
              </p>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                5
              </span>
              <h2 className="text-base font-bold text-slate-900">Data Sharing & Storage</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5 text-xs">
              <p>
                Personal information is <strong>never sold, rented, or shared with commercial third parties</strong>.
              </p>
              <p>
                Meeting and schedule records are stored securely in Google Cloud Firestore within the Jamalpur Medical College project infrastructure. Session tokens are stored as irreversible cryptographic SHA-256 hashes on the server.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                6
              </span>
              <h2 className="text-base font-bold text-slate-900">Data Retention and Deletion</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p className="text-xs">
                Users may request deletion of their session records, device push tokens, or account profile at any time by contacting the technical administrator:
              </p>
              <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2 text-slate-800">
                <Mail className="w-4 h-4 text-[#006A60] shrink-0" />
                <a
                  href="mailto:marufjb@gmail.com?subject=JpMC%20Synapse%20-%20Data%20Deletion%20Request"
                  className="font-mono text-xs sm:text-sm font-semibold text-[#006A60] hover:underline break-all"
                >
                  marufjb@gmail.com
                </a>
              </div>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                7
              </span>
              <h2 className="text-base font-bold text-slate-900">Contact Information</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-3">
              <p className="text-xs">
                If you have questions, concerns, or feedback regarding this Privacy Policy or JpMC Synapse:
              </p>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-1.5">
                <p className="font-bold text-slate-900 text-sm">Abdullah Al Maruf</p>
                <p className="text-xs text-slate-600">Developer & Technical Administrator, JpMC Synapse</p>
                <p className="text-xs text-slate-600">Jamalpur Medical College, Jamalpur</p>
                <div className="pt-2 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-[#006A60]" />
                  <a
                    href="mailto:marufjb@gmail.com"
                    className="text-xs sm:text-sm font-semibold text-[#006A60] hover:underline"
                  >
                    marufjb@gmail.com
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Back to App Bottom Action */}
        <div className="pt-4 pb-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <img src={jpmcLogo} alt="JpMC Logo" className="w-5 h-5 object-contain" />
            <span>© 2026 Jamalpur Medical College. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState(null, '', '/terms');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
              className="w-1/2 sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition text-center"
            >
              Terms of Service
            </a>
            <button
              onClick={handleBack}
              className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl bg-[#006A60] hover:bg-teal-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to JpMC Synapse</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
