/**
 * JpMC Synapse — Google Drive & Forum Configuration Modal (Admin Only)
 * Organization: Jamalpur Medical College (JpMC)
 */

import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Folder,
  ShieldAlert,
  Save,
} from 'lucide-react';
import { fetchDriveConfig, saveDriveConfig, testDriveConnection } from '../../services/forumService';
import { ForumDriveConfig } from '../../domain/forumModels';

interface ForumAdminSettingsModalProps {
  onClose: () => void;
}

export const ForumAdminSettingsModal: React.FC<ForumAdminSettingsModalProps> = ({ onClose }) => {
  const [config, setConfig] = useState<ForumDriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [folderId, setFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await fetchDriveConfig();
      setConfig(data);
      setFolderId(data.folderId || 'jpmc_synapse_forum_attachments');
      setFolderName(data.folderName || 'JpMC Synapse Forum Attachments');
      setAccountEmail(data.accountEmail || 'admin@jpmc.gov.bd');
    } catch (err: any) {
      console.warn('Failed to load drive config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveDriveConfig({
        folderId: folderId.trim(),
        folderName: folderName.trim(),
        accountEmail: accountEmail.trim(),
        ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      });
      setMessage('গুগল ড্রাইভ কনফিগারেশন সফলভাবে সংরক্ষিত হয়েছে।');
      setAccessToken('');
      await loadConfig();
    } catch (err: any) {
      setMessage(`সংরক্ষণ ব্যর্থ: ${err?.message || 'সমস্যা হয়েছে'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testDriveConnection();
      setTestResult(res);
      await loadConfig();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'সংযোগ পরীক্ষা করতে ব্যর্থ হয়েছে',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-slate-900 text-base">ফোরাম ফাইল স্টোরেজ (Google Drive)</h3>
              <p className="text-[11px] text-slate-500">অ্যাডমিনিস্ট্রেটর-অনুমোদিত ড্রাইভ কনফিগারেশন</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span>কনফিগারেশন লোড হচ্ছে...</span>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  config?.configured
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {config?.configured ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-semibold text-xs">
                    {config?.configured ? 'গুগল ড্রাইভ সক্রিয় রয়েছে' : 'ড্রাইভ সেটআপ অপেক্ষমাণ (Zero-Loss Cache সক্রিয়)'}
                  </h4>
                  <p className="text-[11px] mt-0.5 leading-relaxed opacity-90">
                    {config?.configured
                      ? `অ্যাটাচমেন্ট ফাইলসমূহ স্বয়ংক্রিয়ভাবে গুগল ড্রাইভে সংরক্ষিত হচ্ছে (${config.accountEmail})। কোনো ফাইল ফায়ারস্টোর ডাটাবেসে বেস৬৪ হিসেবে জমা হয় না।`
                      : 'ড্রাইভ টোকেন সেটআপ সম্পন্ন না হওয়া পর্যন্ত আপলোডকৃত ফাইল সুরক্ষিত সার্ভার ক্যাশে সংরক্ষিত থাকছে, যা ড্রাইভ সংযোগের পর স্বয়ংক্রিয়ভাবে সিঙ্ক হবে।'}
                  </p>
                </div>
              </div>

              {message && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs">
                  {message}
                </div>
              )}

              {testResult && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 font-medium">{testResult.message}</div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSave} className="space-y-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    অনুমোদিত গুগল ড্রাইভ অ্যাকাউন্ট ইমেইল
                  </label>
                  <input
                    type="email"
                    value={accountEmail}
                    onChange={(e) => setAccountEmail(e.target.value)}
                    placeholder="e.g. jpmc.synapse.storage@gmail.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Folder className="w-3.5 h-3.5 text-slate-500" />
                    <span>নির্ধারিত ফোল্ডারের নাম</span>
                  </label>
                  <input
                    type="text"
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    গুগল ড্রাইভ ফোল্ডার আইডি (Google Drive Folder ID)
                  </label>
                  <input
                    type="text"
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    placeholder="e.g. 1BxiMVs0XRA5nFMdKvBHK... বা ডিফল্ট নাম"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ড্রাইভ অনুমোদন অ্যাক্সেস টোকেন (OAuth Access Token / Refresh Token)
                  </label>
                  <input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={config?.configured ? '•••••••••••••••• (টোকেন আপডেট করতে নতুন টোকেন পেস্ট করুন)' : 'ড্রাইভ OAuth Bearer Token পেস্ট করুন'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    টোকেন সার্ভারে সুরক্ষিত থাকে এবং কোনো ব্যবহারকারী বা ব্রাউজারে কখনো দৃশ্যমান হয় না।
                  </p>
                </div>

                {/* Test & Save buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    {testing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>সংযোগ পরীক্ষা করুন</span>
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-xs transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>কনফিগারেশন সংরক্ষণ</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
