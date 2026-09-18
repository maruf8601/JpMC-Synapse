/**
 * JpMC Synapse — Admin Announcement Manager Component
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 * Timezone: Asia/Dhaka (UTC+6)
 */

import React, { useState, useEffect } from 'react';
import { AnnouncementEntity } from '../domain/models';
import {
  fetchAdminAnnouncements,
  createAdminAnnouncement,
  updateAdminAnnouncement,
  deleteAdminAnnouncement,
  publishAdminAnnouncement,
  unpublishAdminAnnouncement,
  sendAdminAnnouncementPush,
} from '../services/announcementService';
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  Radio,
  Eye,
  CheckCheck,
  RefreshCw,
  X,
  AlertTriangle,
  Users,
  Shield,
  Calendar,
} from 'lucide-react';

export const AnnouncementManagerView: React.FC = () => {
  const [announcements, setAnnouncements] = useState<AnnouncementEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AnnouncementEntity | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form fields
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    priority: 'normal' as 'normal' | 'important' | 'urgent',
    displayMode: 'show_once' as 'show_once' | 'show_every_open' | 'require_acknowledgement',
    targetAudience: 'everyone' as 'everyone' | 'admins_only' | 'users_only',
    status: 'published' as 'published' | 'draft',
    startAt: '',
    expiresAt: '',
    sendPush: true,
  });

  const loadAnnouncements = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminAnnouncements();
      setAnnouncements(data);
    } catch (err: any) {
      setError(err?.message || 'বিজ্ঞপ্তি তালিকা লোড করতে ব্যর্থ হয়েছে।');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const openCreateModal = () => {
    setEditingItem(null);
    const now = new Date();
    const expiry = new Date(Date.now() + 7 * 86400000); // 7 days default
    setFormData({
      title: '',
      message: '',
      priority: 'normal',
      displayMode: 'show_once',
      targetAudience: 'everyone',
      status: 'published',
      startAt: now.toISOString().slice(0, 16),
      expiresAt: expiry.toISOString().slice(0, 16),
      sendPush: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: AnnouncementEntity) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      message: item.message,
      priority: item.priority,
      displayMode: item.displayMode,
      targetAudience: item.targetAudience,
      status: item.status === 'expired' ? 'draft' : item.status,
      startAt: new Date(item.startAt).toISOString().slice(0, 16),
      expiresAt: new Date(item.expiresAt).toISOString().slice(0, 16),
      sendPush: item.sendPush,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.message.trim()) {
      setError('বিজ্ঞপ্তির শিরোনাম এবং বিস্তারিত বার্তা আবশ্যক।');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payload = {
        title: formData.title.trim(),
        message: formData.message.trim(),
        priority: formData.priority,
        displayMode: formData.displayMode,
        targetAudience: formData.targetAudience,
        status: formData.status,
        active: formData.status === 'published',
        startAt: new Date(formData.startAt).toISOString(),
        expiresAt: new Date(formData.expiresAt).toISOString(),
        sendPush: formData.sendPush,
      };

      if (editingItem) {
        await updateAdminAnnouncement(editingItem.id, payload);
        setSuccessMessage('বিজ্ঞপ্তি সফলভাবে আপডেট করা হয়েছে।');
      } else {
        await createAdminAnnouncement(payload);
        setSuccessMessage('বিজ্ঞপ্তি সফলভাবে তৈরি ও সংরক্ষিত হয়েছে।');
      }

      setIsModalOpen(false);
      await loadAnnouncements();
    } catch (err: any) {
      setError(err?.message || 'বিজ্ঞপ্তি সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`আপনি কি নিশ্চিত যে "${title}" বিজ্ঞপ্তিটি স্থায়ীভাবে মুছে ফেলতে চান?`)) {
      return;
    }
    try {
      await deleteAdminAnnouncement(id);
      setSuccessMessage('বিজ্ঞপ্তি মুছে ফেলা হয়েছে।');
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      setError(err?.message || 'মুছে ফেলতে ব্যর্থ হয়েছে।');
    }
  };

  const handleTogglePublish = async (item: AnnouncementEntity) => {
    try {
      if (item.status === 'published') {
        await unpublishAdminAnnouncement(item.id);
        setSuccessMessage(`"${item.title}" খসড়া (Draft) হিসেবে রূপান্তরিত হয়েছে।`);
      } else {
        await publishAdminAnnouncement(item.id);
        setSuccessMessage(`"${item.title}" সফলভাবে প্রকাশিত হয়েছে।`);
      }
      await loadAnnouncements();
    } catch (err: any) {
      setError(err?.message || 'স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  const handleSendPush = async (item: AnnouncementEntity) => {
    const confirmMsg = item.pushSentAt
      ? `"${item.title}" বিজ্ঞপ্তির পুশ নোটিফিকেশন ইতিমধ্যে পাঠানো হয়েছিল। আপনি কি পুনরায় ব্রডকাস্ট করতে চান?`
      : `আপনি কি "${item.title}" বিজ্ঞপ্তির পুশ নোটিফিকেশন সকল উদ্দিষ্ট ডিভাইসে ব্রডকাস্ট করতে চান?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await sendAdminAnnouncementPush(item.id, true);
      setSuccessMessage(`পুশ নোটিফিকেশন সফলভাবে ${res.deviceCount} টি ডিভাইসে পাঠানো হয়েছে।`);
      await loadAnnouncements();
    } catch (err: any) {
      setError(err?.message || 'পুশ নোটিফিকেশন পাঠাতে ব্যর্থ হয়েছে।');
    }
  };

  const formatDhakaDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div id="announcement-manager-container" className="space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-bengali">
              পপআপ নোটিশ ও বিজ্ঞপ্তি ব্যবস্থাপনা
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              জামালপুর মেডিকেল কলেজের চিকিৎসক ও স্টাফদের জন্য ইন-অ্যাপ পপআপ এবং পুশ ব্রডকাস্ট
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-announcements-btn"
            onClick={loadAnnouncements}
            disabled={isLoading}
            className="p-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            title="রিফ্রেশ করুন"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
          <button
            id="create-announcement-btn"
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bengali">নতুন বিজ্ঞপ্তি জারি</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Announcements List */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
        {isLoading && announcements.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-3 text-indigo-500" />
            <p className="text-sm font-bengali">বিজ্ঞপ্তিসমূহ লোড হচ্ছে...</p>
          </div>
        ) : announcements.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-base font-semibold text-slate-600 dark:text-slate-300 font-bengali">
              বর্তমানে কোনো বিজ্ঞপ্তি নেই
            </p>
            <p className="text-xs text-slate-400 mt-1 font-bengali">
              জরুরি কোনো নোটিশ জারি করতে উপরের "নতুন বিজ্ঞপ্তি জারি" বাটনে ক্লিক করুন।
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {announcements.map((item) => {
              const isExpired = new Date(item.expiresAt).getTime() < Date.now();
              const isEffective = item.status === 'published' && item.active && !isExpired;

              return (
                <div
                  key={item.id}
                  id={`announcement-row-${item.id}`}
                  className="p-5 hover:bg-slate-50/70 dark:hover:bg-slate-750 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Info & Badges */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Badge */}
                        {isEffective ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                            <Radio className="w-3 h-3 animate-pulse" />
                            সক্রিয় ও দৃশ্যমান
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                            <Clock className="w-3 h-3" />
                            মেয়াদ উত্তীর্ণ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                            খসড়া (অপ্রকাশিত)
                          </span>
                        )}

                        {/* Priority Badge */}
                        {item.priority === 'urgent' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                            জরুরি
                          </span>
                        )}
                        {item.priority === 'important' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                            গুরুত্বপূর্ণ
                          </span>
                        )}
                        {item.priority === 'normal' && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            সাধারণ
                          </span>
                        )}

                        {/* Display Mode */}
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          {item.displayMode === 'show_once' && <Eye className="w-3 h-3" />}
                          {item.displayMode === 'show_every_open' && <RefreshCw className="w-3 h-3" />}
                          {item.displayMode === 'require_acknowledgement' && <CheckCheck className="w-3.5 h-3.5 text-indigo-500" />}
                          {item.displayMode === 'show_once'
                            ? 'একবার দেখাবে'
                            : item.displayMode === 'show_every_open'
                            ? 'প্রতি অ্যাপ ওপেনে'
                            : 'স্বীকৃতি আবশ্যক'}
                        </span>

                        {/* Target Audience */}
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {item.targetAudience === 'everyone'
                            ? 'সকলের জন্য'
                            : item.targetAudience === 'admins_only'
                            ? 'শুধুমাত্র অ্যাডমিন'
                            : 'ব্যবহারকারীগণ'}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white font-bengali">
                        {item.title}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 font-bengali">
                        {item.message}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 dark:text-slate-500 pt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          শুরু: {formatDhakaDate(item.startAt)}
                        </span>
                        <span>•</span>
                        <span>মেয়াদ শেষ: {formatDhakaDate(item.expiresAt)}</span>
                        {item.pushSentAt && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              পুশ নোটিফিকেশন সম্পন্ন
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                      {/* Push Notification Button */}
                      <button
                        id={`btn-push-${item.id}`}
                        onClick={() => handleSendPush(item)}
                        className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors ${
                          item.pushSentAt
                            ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                            : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                        }`}
                        title="FCM পুশ নোটিফিকেশন ব্রডকাস্ট করুন"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">পুশ পাঠান</span>
                      </button>

                      {/* Publish / Unpublish Toggle */}
                      <button
                        id={`btn-toggle-publish-${item.id}`}
                        onClick={() => handleTogglePublish(item)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                          item.status === 'published'
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                        }`}
                      >
                        {item.status === 'published' ? 'খসড়া করুন' : 'প্রকাশ করুন'}
                      </button>

                      {/* Edit Button */}
                      <button
                        id={`btn-edit-${item.id}`}
                        onClick={() => openEditModal(item)}
                        className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                        title="সম্পাদনা করুন"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        id={`btn-delete-${item.id}`}
                        onClick={() => handleDelete(item.id, item.title)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-lg font-bengali">
                <Megaphone className="w-5 h-5 text-indigo-600" />
                <span>{editingItem ? 'বিজ্ঞপ্তি সম্পাদনা' : 'নতুন প্রাতিষ্ঠানিক বিজ্ঞপ্তি প্রকাশ'}</span>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                  বিজ্ঞপ্তির শিরোনাম *
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: জরুরি সভা সংক্রান্ত বিজ্ঞপ্তি"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 font-bengali"
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                  বিস্তারিত বার্তা / নোটিশের বিষয়বস্তু *
                </label>
                <textarea
                  required
                  rows={5}
                  placeholder="বিজ্ঞপ্তির পূর্ণ বিবরণ লিখুন..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 font-bengali leading-relaxed"
                />
              </div>

              {/* Priority & Display Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                    গুরুত্ব (Priority)
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bengali"
                  >
                    <option value="normal">সাধারণ (Normal)</option>
                    <option value="important">গুরুত্বপূর্ণ (Important)</option>
                    <option value="urgent">জরুরি (Urgent)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                    প্রদর্শনের ধরন (Display Mode)
                  </label>
                  <select
                    value={formData.displayMode}
                    onChange={(e) => setFormData({ ...formData, displayMode: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bengali"
                  >
                    <option value="show_once">একবার দেখাবে (Show Once)</option>
                    <option value="show_every_open">প্রতি ওপেনে (Show Every Open)</option>
                    <option value="require_acknowledgement">স্বীকৃতি আবশ্যক (Require Acknowledgement)</option>
                  </select>
                </div>
              </div>

              {/* Target Audience & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                    উদ্দিষ্ট অডিয়েন্স (Target Audience)
                  </label>
                  <select
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bengali"
                  >
                    <option value="everyone">সকল স্টাফ ও ব্যবহারকারী (Everyone)</option>
                    <option value="admins_only">শুধুমাত্র অ্যাডমিনিস্ট্রেটর (Admins Only)</option>
                    <option value="users_only">শুধুমাত্র সাধারণ ব্যবহারকারী (Users Only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                    প্রাথমিক স্ট্যাটাস
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bengali"
                  >
                    <option value="published">সরাসরি প্রকাশ করুন (Published)</option>
                    <option value="draft">খসড়া সংরক্ষণ (Draft)</option>
                  </select>
                </div>
              </div>

              {/* Timing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                    শুরুর সময় (Asia/Dhaka)
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.startAt}
                    onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 font-bengali">
                    মেয়াদ সমাপ্তির সময় (Asia/Dhaka)
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                  />
                </div>
              </div>

              {/* Push notification option */}
              <div className="pt-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.sendPush}
                    onChange={(e) => setFormData({ ...formData, sendPush: e.target.checked })}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 font-bengali">
                    প্রকাশের সাথে সাথে স্বয়ংক্রিয় ব্যাকগ্রাউন্ড পুশ নোটিফিকেশন পাঠান
                  </span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-md disabled:opacity-50 font-bengali cursor-pointer"
                >
                  {isSaving ? 'সংরক্ষণ হচ্ছে...' : editingItem ? 'আপডেট সম্পন্ন করুন' : 'বিজ্ঞপ্তি প্রকাশ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
