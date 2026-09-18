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
            <strong>Jamalpur Medical College</strong>, handles information when you use the
            application. We are committed to transparency and the responsible management of your data.
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#006A60] flex items-center justify-center shrink-0 mt-0.5">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Google Sign-In</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Used solely to authenticate authorized college staff and faculty members.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">No Data Selling</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                We never sell or rent user data, nor do we use it for advertising.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Institutional Purpose</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Operated strictly for institutional schedules and academic notifications.
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
              <h2 className="text-base font-bold text-slate-900">Information We Collect</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>
                JpMC Synapse may receive basic Google Account information when a user chooses to sign in
                using Google Sign-In. This information includes:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                <li>Your full name</li>
                <li>Your email address</li>
                <li>Your profile picture URL</li>
                <li>Your unique Google account identifier</li>
              </ul>
              <p>
                This information is gathered strictly as necessary to authenticate your identity and
                determine authorized administrative or faculty roles within the application.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h2 className="text-base font-bold text-slate-900">How Information Is Used</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>The information collected is used exclusively for the following purposes:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                <li>Authenticating user identity and verifying permission levels</li>
                <li>Identifying authorized users and distinguishing administrative from standard accounts</li>
                <li>Providing core application functionality (schedule viewing, calendar synchronization, and push notifications)</li>
                <li>Maintaining secure account and session state across user devices</li>
                <li>Ensuring security, integrity, and administrative management of JpMC Synapse</li>
              </ul>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="text-base font-bold text-slate-900">Google User Data</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>
                Google user information obtained through Google Sign-In is used only to provide
                authentication and application functionality.
              </p>
              <p className="p-3.5 bg-teal-50/70 border border-teal-200/80 rounded-xl text-slate-800 font-medium">
                JpMC Synapse does not sell Google user data or use it for advertising. We do not use Google user data for commercial profiling, targeted marketing, or any purpose unrelated to the institutional schedule management system.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                4
              </span>
              <h2 className="text-base font-bold text-slate-900">Data Sharing</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>
                Personal information is <strong>not sold or rented to third parties</strong>.
              </p>
              <p>
                Information may only be processed by underlying infrastructure and service providers
                strictly necessary to operate the application (such as Google Cloud / Firebase hosting and
                authentication services), or when disclosure is required by applicable law, regulation, or
                official legal process.
              </p>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                5
              </span>
              <h2 className="text-base font-bold text-slate-900">Data Security</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>
                Reasonable technical and organizational measures are used to protect application and user
                information against unauthorized access, loss, misuse, or alteration. Access to administrative
                controls and configuration is restricted to designated institutional administrators.
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
              <p>
                Information is retained only as long as necessary for application operation and legitimate
                administrative purposes of Jamalpur Medical College.
              </p>
              <p>
                Users who wish to request deletion of their account, device registration, or associated
                personal information may contact the technical administrator directly by emailing:
              </p>
              <div className="p-3.5 bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-2 text-slate-800">
                <Mail className="w-4 h-4 text-[#006A60] shrink-0" />
                <a
                  href="mailto:marufjb@gmail.com?subject=JpMC%20Synapse%20-%20Data%20Deletion%20Request"
                  className="font-mono text-xs sm:text-sm font-semibold text-[#006A60] hover:underline break-all"
                >
                  marufjb@gmail.com
                </a>
              </div>
              <p className="text-xs text-slate-500">
                Upon receiving a verified request, the administrator will review and remove the corresponding user records and device tokens in accordance with operational procedures.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                7
              </span>
              <h2 className="text-base font-bold text-slate-900">Third-Party Authentication</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-2 pl-8.5">
              <p>
                Google Sign-In is provided by Google LLC. When you choose to authenticate using Google, your
                interaction with Google services is subject to Google&apos;s applicable privacy policies and terms:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition"
                >
                  <span>Google Privacy Policy</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
                <a
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition"
                >
                  <span>Google Terms of Service</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                8
              </span>
              <h2 className="text-base font-bold text-slate-900">Children&apos;s Privacy</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5">
              <p>
                JpMC Synapse is an institutional scheduling and notification system intended specifically for
                faculty, medical officers, administrative staff, and authorized personnel of Jamalpur Medical
                College. The application is not directed toward children, and it does not knowingly collect
                personal information from children under the age of 13 (or the applicable age of digital consent in your jurisdiction).
              </p>
            </div>
          </section>

          {/* Section 9 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                9
              </span>
              <h2 className="text-base font-bold text-slate-900">Changes to This Privacy Policy</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5">
              <p>
                This Privacy Policy may be updated periodically to reflect changes in institutional operations
                or regulatory requirements. Any material changes will be published directly on this page with an
                updated &quot;Last updated&quot; date. Users are encouraged to review this page periodically.
              </p>
            </div>
          </section>

          {/* Section 10 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                10
              </span>
              <h2 className="text-base font-bold text-slate-900">Contact Information</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-3">
              <p>
                If you have questions, concerns, or requests regarding this Privacy Policy or your personal
                information, please contact:
              </p>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-1.5">
                <p className="font-bold text-slate-900 text-sm">Abdullah Al Maruf</p>
                <p className="text-xs text-slate-600">Developer / Technical Contact, JpMC Synapse</p>
                <p className="text-xs text-slate-600">Jamalpur Medical College</p>
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
