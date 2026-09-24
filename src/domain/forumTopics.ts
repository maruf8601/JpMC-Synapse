/**
 * JpMC Synapse — Discussion Forum Topics Registry
 * Organization: Jamalpur Medical College (JpMC)
 *
 * Distinct categories:
 * 1. সাধারণ বিষয় (General Topics)
 * 2. বিভাগ (Clinical & Academic Departments)
 */

export interface ForumTopicDefinition {
  id: string;
  label: string;
  group: 'general' | 'department';
  groupLabel: string;
  color?: string;
  badgeBg?: string;
  badgeText?: string;
}

export const FORUM_TOPICS_LIST: ForumTopicDefinition[] = [
  // সাধারণ বিষয়
  { id: 'general_exam', label: 'পরীক্ষা', group: 'general', groupLabel: 'সাধারণ বিষয়', badgeBg: 'bg-amber-100', badgeText: 'text-amber-800' },
  { id: 'general_academic', label: 'একাডেমিক', group: 'general', groupLabel: 'সাধারণ বিষয়', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800' },
  { id: 'general_admin', label: 'প্রশাসন', group: 'general', groupLabel: 'সাধারণ বিষয়', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800' },
  { id: 'general_meu', label: 'MEU', group: 'general', groupLabel: 'সাধারণ বিষয়', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-800' },
  { id: 'general_qas', label: 'QAS', group: 'general', groupLabel: 'সাধারণ বিষয়', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800' },
  { id: 'general_others', label: 'Others', group: 'general', groupLabel: 'সাধারণ বিষয়', badgeBg: 'bg-slate-100', badgeText: 'text-slate-800' },

  // বিভাগ
  { id: 'dept_anatomy', label: 'অ্যানাটমি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-rose-100', badgeText: 'text-rose-800' },
  { id: 'dept_anesthesiology', label: 'অ্যানেসথেসিওলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-teal-100', badgeText: 'text-teal-800' },
  { id: 'dept_biochemistry', label: 'বায়োকেমিস্ট্রি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-cyan-100', badgeText: 'text-cyan-800' },
  { id: 'dept_cardiology', label: 'কার্ডিওলজী', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-red-100', badgeText: 'text-red-800' },
  { id: 'dept_community_medicine', label: 'কমিউনিটি মেডিসিন', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-lime-100', badgeText: 'text-lime-800' },
  { id: 'dept_dermatology', label: 'ডার্মাটোলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-fuchsia-100', badgeText: 'text-fuchsia-800' },
  { id: 'dept_ent', label: 'ইএনটি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-orange-100', badgeText: 'text-orange-800' },
  { id: 'dept_forensic_medicine', label: 'ফরেন্সিক মেডিসিন', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-stone-100', badgeText: 'text-stone-800' },
  { id: 'dept_gynae_obs', label: 'গাইনী এন্ড অবস্‌', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-pink-100', badgeText: 'text-pink-800' },
  { id: 'dept_medicine', label: 'মেডিসিন', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-sky-100', badgeText: 'text-sky-800' },
  { id: 'dept_microbiology', label: 'মাইক্রোবায়োলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-teal-100', badgeText: 'text-teal-800' },
  { id: 'dept_nephrology', label: 'নেফ্রোলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-800' },
  { id: 'dept_ophthalmology', label: 'চক্ষু', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-violet-100', badgeText: 'text-violet-800' },
  { id: 'dept_oral_maxillofacial_surgery', label: 'ওরাল এন্ড ম্যাক্সিলোফেসিয়াল সার্জারী', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800' },
  { id: 'dept_orthopedic_surgery', label: 'অর্থোপেডিক সার্জারী', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-amber-100', badgeText: 'text-amber-800' },
  { id: 'dept_pathology', label: 'প্যাথলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-rose-100', badgeText: 'text-rose-800' },
  { id: 'dept_pediatrics', label: 'শিশু', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-800' },
  { id: 'dept_pediatric_gastroenterology', label: 'শিশু গ্যাস্ট্রোএন্টারোলজি এন্ড নিউট্রিশন', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-green-100', badgeText: 'text-green-800' },
  { id: 'dept_pharmacology', label: 'ফার্মাকোলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-yellow-100', badgeText: 'text-yellow-800' },
  { id: 'dept_physiology', label: 'ফিজিওলজি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-teal-100', badgeText: 'text-teal-800' },
  { id: 'dept_psychiatry', label: 'সাইকিয়াট্রি', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-purple-100', badgeText: 'text-purple-800' },
  { id: 'dept_radiology_imaging', label: 'রেডিওলজী এন্ড ইমেজিং', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-cyan-100', badgeText: 'text-cyan-800' },
  { id: 'dept_respiratory_medicine', label: 'রেসপিরেটরী মেডিসিন', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-blue-100', badgeText: 'text-blue-800' },
  { id: 'dept_surgery', label: 'সার্জারী', group: 'department', groupLabel: 'বিভাগ', badgeBg: 'bg-red-100', badgeText: 'text-red-800' },
];

export const FORUM_TOPICS_MAP: Record<string, ForumTopicDefinition> = Object.fromEntries(
  FORUM_TOPICS_LIST.map((t) => [t.id, t])
);

export function getForumTopic(topicId: string, customLabels?: Record<string, string>): ForumTopicDefinition {
  const base = FORUM_TOPICS_MAP[topicId] || {
    id: topicId,
    label: topicId,
    group: 'general',
    groupLabel: 'অন্যান্য',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
  };

  if (customLabels && customLabels[topicId]) {
    return {
      ...base,
      label: customLabels[topicId],
    };
  }
  return base;
}
