import React, { useEffect } from 'react';
import {
  FileText,
  ArrowLeft,
  Mail,
  Scale,
  Building2,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import jpmcLogo from '../assets/jpmc-logo.png';

interface TermsOfServicePageProps {
  onBack?: () => void;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({ onBack }) => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Terms of Service | JpMC Synapse';

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
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/';
      }
    }
  };

  const navigateToPrivacy = (e: React.MouseEvent) => {
    e.preventDefault();
    window.history.pushState(null, '', '/privacy');
    window.dispatchEvent(new PopStateEvent('popstate'));
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
              <Scale className="w-3.5 h-3.5" />
              <span>Institutional Terms</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Title Hero */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold border border-teal-200/80">
            <BookOpen className="w-3.5 h-3.5" />
            Institutional User Agreement
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
            These Terms of Service govern the use of <strong>JpMC Synapse</strong>, the institutional
            scheduling, notification, and administrative workflow application developed for{' '}
            <strong>Jamalpur Medical College</strong>.
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

        {/* Quick Highlights Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-[#006A60] flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Institutional Purpose</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Supports academic schedules, official meetings, and faculty notifications for JpMC.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Authorized Personnel</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Access and features correspond to assigned institutional roles and permissions.
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Official Precedence</h3>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Official signed notices and college administrative orders always prevail.
              </p>
            </div>
          </div>
        </div>

        {/* Terms Sections */}
        <div className="space-y-6">
          {/* Section 1 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h2 className="text-base font-bold text-slate-900">Acceptance of Terms</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                By accessing, browsing, installing, or using the <strong>JpMC Synapse</strong> application
                on the web or as an Android application, you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please discontinue use of the application.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h2 className="text-base font-bold text-slate-900">Purpose of the Application</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                JpMC Synapse is designed and maintained exclusively to support the institutional,
                administrative, academic, scheduling, and related authorized operational activities of{' '}
                <strong>Jamalpur Medical College</strong>. It provides academic calendars, official event
                reminders, institutional notices, administrative workflows, and meeting coordination.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h2 className="text-base font-bold text-slate-900">User Accounts and Google Sign-In</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                Authorized staff, faculty members, and personnel may authenticate into JpMC Synapse using
                Google Sign-In. Users are responsible for:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                <li>Maintaining the confidentiality and security of their Google Account credentials</li>
                <li>Ensuring device security when accessing institutional information</li>
                <li>All actions, schedule submissions, and activities performed through their authenticated account</li>
              </ul>
              <p>
                Users must notify the technical administrator immediately if they suspect unauthorized access to their account.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                4
              </span>
              <h2 className="text-base font-bold text-slate-900">Authorized Use</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                Access to specific application functions (such as event creation, administrative approvals,
                announcement publishing, and system configuration) depends strictly on the user&apos;s assigned
                institutional role or authorization.
              </p>
              <p>Users must not:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1">
                <li>Attempt to gain unauthorized access to administrative controls, restricted databases, or other accounts</li>
                <li>Interfere with or disrupt the normal operation, integrity, or network infrastructure of the service</li>
                <li>Misuse, falsify, or tamper with institutional information, notices, or schedules</li>
                <li>Use the application for any unlawful, commercial, or unauthorized purpose</li>
              </ul>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                5
              </span>
              <h2 className="text-base font-bold text-slate-900">Institutional and Administrative Information</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                Information displayed through JpMC Synapse is intended to assist authorized users in managing
                their daily academic schedules, institutional commitments, and administrative duties.
              </p>
              <p className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl text-slate-800 font-medium">
                Where an official institutional order, gazette notice, printed circular, signed administrative
                minute, or official college record conflicts with information displayed in the application,
                the applicable official institutional document or record shall prevail.
              </p>
            </div>
          </section>

          {/* Section 6 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                6
              </span>
              <h2 className="text-base font-bold text-slate-900">Interdepartmental Chat & Communication Rules</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2.5 text-xs">
              <p>
                The Interdepartmental Chat module provides internal coordination for Jamalpur Medical College departments. Use of this module is subject to the following binding conditions:
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-slate-700 pl-1">
                <li>
                  <strong>Strict 72-Hour Automatic Deletion:</strong> All chat records, messages, and uploaded files expire 72 hours after initial transmission. They are permanently and irrevocably destroyed by automated server tasks.
                </li>
                <li>
                  <strong>Administrative Oversight & Soft Deletion:</strong> When a user deletes a message, it is hidden from ordinary user displays. However, in accordance with public medical institution governance, records remain available for administrative audit throughout the remainder of their original 72-hour lifespan.
                </li>
                <li>
                  <strong>No End-to-End Encryption (E2EE):</strong> Transport is encrypted using HTTPS/TLS and stored securely in Firestore, but communication is not end-to-end encrypted because institutional auditing is maintained.
                </li>
                <li>
                  <strong>Patient Confidentiality:</strong> Users must never transmit unredacted, identifiable patient health records or diagnostic data that violate medical ethics or healthcare confidentiality standards.
                </li>
              </ul>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                7
              </span>
              <h2 className="text-base font-bold text-slate-900">Availability and Changes</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                Jamalpur Medical College reserves the right to modify, update, upgrade, suspend, or discontinue
                any feature, module, or portion of JpMC Synapse when necessary for scheduled maintenance, security
                enhancements, infrastructure updates, operational adjustments, or institutional policy changes.
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                7
              </span>
              <h2 className="text-base font-bold text-slate-900">Third-Party Services</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                JpMC Synapse utilizes certain third-party infrastructure and services to deliver its capabilities,
                including Google Sign-In, Firebase hosting, and Google Cloud platform services. The use of these
                external services is subject to their respective terms of service and operating policies.
              </p>
            </div>
          </section>

          {/* Section 8 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                8
              </span>
              <h2 className="text-base font-bold text-slate-900">Privacy</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-3">
              <p>
                The handling, processing, and protection of personal information within JpMC Synapse are governed
                by our Privacy Policy. For detailed information on data collection, Google Sign-In user data,
                retention, and deletion procedures, please review the complete policy:
              </p>
              <div>
                <a
                  href="/privacy"
                  onClick={navigateToPrivacy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-[#006A60] font-bold text-xs sm:text-sm border border-teal-200 transition"
                >
                  <FileText className="w-4 h-4" />
                  <span>View JpMC Synapse Privacy Policy (/privacy)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                9
              </span>
              <h2 className="text-base font-bold text-slate-900">Disclaimer</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                JpMC Synapse is provided to support authorized institutional operations and academic scheduling
                at Jamalpur Medical College. While reasonable efforts are taken to maintain the timeliness and
                accuracy of the service, the application is provided on an &quot;as-is&quot; and &quot;as-available&quot;
                basis without express or implied warranties beyond what is supported by the institution.
              </p>
            </div>
          </section>

          {/* Section 10 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                10
              </span>
              <h2 className="text-base font-bold text-slate-900">Limitation of Responsibility</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                To the fullest extent permitted by applicable law, Jamalpur Medical College and its administrative
                personnel shall not be held liable for indirect, incidental, or consequential disruptions arising from
                temporary network outages, scheduled maintenance, transmission delays, or reliance solely on the
                software without reference to official signed institutional records. Nothing in these Terms shall
                limit or exclude liability where doing so is prohibited by law.
              </p>
            </div>
          </section>

          {/* Section 11 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                11
              </span>
              <h2 className="text-base font-bold text-slate-900">Termination or Restriction of Access</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                Access to JpMC Synapse or specific administrative functions may be suspended, restricted, or revoked
                at any time if a user is no longer affiliated with or authorized by Jamalpur Medical College, in the
                event of a breach of these Terms, or when deemed necessary for institutional security and administration.
              </p>
            </div>
          </section>

          {/* Section 12 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                12
              </span>
              <h2 className="text-base font-bold text-slate-900">Changes to Terms</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-2">
              <p>
                These Terms of Service may be updated from time to time to accommodate new application functionality,
                institutional guidelines, or regulatory standards. Material updates will be published directly on this
                page with an updated &quot;Last updated&quot; date. Continued use of the application following the posting
                of revised Terms constitutes acceptance of those changes.
              </p>
            </div>
          </section>

          {/* Section 13 */}
          <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-teal-50 text-[#006A60] text-xs font-bold flex items-center justify-center">
                13
              </span>
              <h2 className="text-base font-bold text-slate-900">Contact Information</h2>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed pl-8.5 space-y-3">
              <p>
                For questions, clarifications, or administrative inquiries regarding these Terms of Service, please contact:
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
              href="/privacy"
              onClick={navigateToPrivacy}
              className="w-1/2 sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition text-center"
            >
              Privacy Policy
            </a>
            <button
              onClick={handleBack}
              className="w-1/2 sm:w-auto px-5 py-2.5 rounded-xl bg-[#006A60] hover:bg-teal-700 text-white font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
