/**
 * JpMC Synapse — Authentic Mock Event Data & Telegram Messages
 * Jamalpur Medical College (JpMC)
 */

import { EventEntity, TelegramMessageEntity } from '../domain/models';
import { getDhakaNow } from '../domain/constants';

function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const now = getDhakaNow();
export const TODAY_STR = formatDate(now);

const tomorrowDate = new Date(now);
tomorrowDate.setDate(now.getDate() + 1);
export const TOMORROW_STR = formatDate(tomorrowDate);

const inTwoDaysDate = new Date(now);
inTwoDaysDate.setDate(now.getDate() + 2);
export const IN_TWO_DAYS_STR = formatDate(inTwoDaysDate);

const inFourDaysDate = new Date(now);
inFourDaysDate.setDate(now.getDate() + 4);
export const IN_FOUR_DAYS_STR = formatDate(inFourDaysDate);

const nextWeekDate = new Date(now);
nextWeekDate.setDate(now.getDate() + 7);
export const NEXT_WEEK_STR = formatDate(nextWeekDate);

const yesterdayDate = new Date(now);
yesterdayDate.setDate(now.getDate() - 1);
export const YESTERDAY_STR = formatDate(yesterdayDate);

const threeDaysAgoDate = new Date(now);
threeDaysAgoDate.setDate(now.getDate() - 3);
export const THREE_DAYS_AGO_STR = formatDate(threeDaysAgoDate);

const lastWeekDate = new Date(now);
lastWeekDate.setDate(now.getDate() - 7);
export const LAST_WEEK_STR = formatDate(lastWeekDate);

export const INITIAL_EVENTS: EventEntity[] = [
  // Past Event 1 (Yesterday)
  {
    id: 'evt-past-001',
    title: 'মেডিকেল এডুকেশন ইউনিট (MEU) সমন্বয় সভা',
    description: 'কারিকুলাম বাস্তবায়ন এবং ফেকাল্টি ডেভেলপমেন্ট ওয়ার্কশপ মূল্যায়ন বিষয়ক পূর্বনির্ধারিত সভা।',
    eventDate: YESTERDAY_STR,
    startTime: '10:00',
    endTime: '12:00',
    venue: 'MEU কনফারেন্স রুম, প্রশাসনিক ভবন',
    category: 'প্রশাসনিক',
    priority: 'normal',
    source: 'Telegram',
    telegramMessageId: 1015,
    confidence: 0.99,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'মেডিকেল এডুকেশন ইউনিট (MEU)',
    participants: 'MEU কমিটির সদস্যবৃন্দ ও বিভাগীয় সমন্বয়কগণ',
    isCompleted: true,
    reminders: [],
    createdAt: new Date(Date.now() - 180000000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  // Past Event 2 (3 Days Ago)
  {
    id: 'evt-past-002',
    title: 'হাসপাতাল সংক্রমণ প্রতিরোধ ও নিয়ন্ত্রণ (IPC) কমিটির জরুরি সভা',
    description: 'ইনপেশেন্ট ওয়ার্ড ও ওটিতে সংক্রমণ বিস্তার প্রতিরোধে জীবাণুমুক্তকরণ ব্যবস্থা তদারকি ও অ্যান্টিবায়োটিক স্টুয়ার্ডশিপ পর্যালোচনা।',
    eventDate: THREE_DAYS_AGO_STR,
    startTime: '11:30',
    endTime: '13:00',
    venue: 'অধ্যক্ষের সভা কক্ষ',
    category: 'সভা',
    priority: 'urgent',
    source: 'Google Calendar',
    confidence: 0.98,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'ইনফেকশন কন্ট্রোল কমিটি (ICC)',
    participants: 'উপ-পরিচালক (হাসপাতাল), আরএমও, সার্জারি ও আইসিইউ প্রধান',
    isCompleted: true,
    reminders: [],
    createdAt: new Date(Date.now() - 300000000).toISOString(),
    updatedAt: new Date(Date.now() - 250000000).toISOString(),
  },
  // Past Event 3 (Last Week)
  {
    id: 'evt-past-003',
    title: '৪র্থ বর্ষ এমবিবিএস ক্লিনিক্যাল ব্যাচ ওরিয়েন্টেশন ও সেফটি ব্রিফিং',
    description: 'ওয়ার্ড পোস্টিং শুরুর প্রাক্কালে হাসপাতাল পরিবেশ, রোগী পর্যবেক্ষণ শিষ্টাচার ও ব্যক্তিগত সুরক্ষা বিষয়ক দিকনির্দেশনামূলক সেশন।',
    eventDate: LAST_WEEK_STR,
    startTime: '09:00',
    endTime: '11:00',
    venue: 'লেকচার গ্যালারি-২',
    category: 'একাডেমিক',
    priority: 'important',
    source: 'Manual',
    confidence: 1.0,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'ফেজ-৩ একাডেমিক সমন্বয় সেল',
    participants: '৪র্থ বর্ষের সকল শিক্ষার্থী ও ক্লিনিক্যাল শিক্ষকবৃন্দ',
    isCompleted: true,
    reminders: [],
    createdAt: new Date(Date.now() - 650000000).toISOString(),
    updatedAt: new Date(Date.now() - 600000000).toISOString(),
  },
  // Today Event 1 (as requested in prompt)
  {
    id: 'evt-001',
    title: 'ইন্টার্ন ইনডাকশন কমিটির সভা',
    description: '২০২৬-২০২৭ সেশনের নতুন ইন্টার্ন চিকিৎসকদের ইনডাকশন ওরিয়েন্টেশন ও ডিউটি রোস্টার বণ্টন বিষয়ক জরুরি সভা।',
    eventDate: TODAY_STR,
    startTime: '09:30',
    endTime: '11:00',
    venue: 'শিক্ষক কক্ষ, অধ্যক্ষের কার্যালয়',
    category: 'সভা',
    priority: 'important',
    source: 'Telegram',
    telegramMessageId: 1042,
    telegramChatId: '-1001849204128',
    originalText: 'আগামীকাল সকাল ৯:৩০ ঘটিকায় অধ্যক্ষের কার্যালয়ের শিক্ষক কক্ষে ইন্টার্ন ইনডাকশন কমিটির সভা অনুষ্ঠিত হবে। সংশ্লিষ্ট সকল সম্মানিত সদস্যবৃন্দকে যথাসময়ে উপস্থিত থাকার জন্য অনুরোধ করা হলো।',
    confidence: 0.98,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'ইন্টার্ন ইনডাকশন কমিটি',
    participants: 'অধ্যক্ষ, উপাধ্যক্ষ, সকল বিভাগীয় প্রধান, আরপি এবং ইন্টার্ন কো-অর্ডিনেটর',
    reminders: [
      { id: 'rem-1', eventId: 'evt-001', reminderType: 'notification', minutesBefore: 120, scheduledAt: '', enabled: true },
      { id: 'rem-2', eventId: 'evt-001', reminderType: 'notification', minutesBefore: 30, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  // Today Event 2 (as requested in prompt)
  {
    id: 'evt-002',
    title: 'একাডেমিক কার্যক্রম বিষয়ক সভা',
    description: '৫ম বর্ষের ক্লিনিক্যাল পোস্টিং, কার্ড ফাইনাল ও টার্ম পরীক্ষার শিডিউল পর্যালোচনা সংক্রান্ত একাডেমিক কাউন্সিল কমিটির বৈঠক।',
    eventDate: TODAY_STR,
    startTime: '11:30',
    endTime: '13:00',
    venue: 'Lecture Gallery-1',
    category: 'একাডেমিক',
    priority: 'normal',
    source: 'Manual',
    confidence: 1.0,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'একাডেমিক কাউন্সিল',
    participants: 'সকল শিক্ষক ও ফেকাল্টি মেম্বারগণ',
    reminders: [
      { id: 'rem-3', eventId: 'evt-002', reminderType: 'notification', minutesBefore: 120, scheduledAt: '', enabled: true },
      { id: 'rem-4', eventId: 'evt-002', reminderType: 'notification', minutesBefore: 30, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  // Today Event 3 (as requested in prompt)
  {
    id: 'evt-003',
    title: 'Scientific Seminar: Emerging Infectious Diseases',
    description: 'Clinical presentation and protocol discussion on viral hemorrhagic fevers and antimicrobial resistance patterns in North Bengal.',
    eventDate: TODAY_STR,
    startTime: '14:30',
    endTime: '16:00',
    venue: 'Gallery-2',
    category: 'সেমিনার',
    priority: 'important',
    source: 'Google Calendar',
    googleCalendarEventId: 'gcal_8943729857924375',
    confidence: 0.95,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'মেডিসিন ও মাইক্রোবায়োলজি বিভাগ',
    participants: 'সকল ক্লিনিক্যাল ফেকাল্টি, আরএমও, মেডিকেল অফিসার এবং ইন্টার্ন চিকিৎসকবৃন্দ',
    reminders: [
      { id: 'rem-5', eventId: 'evt-003', reminderType: 'notification', minutesBefore: 30, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 72000000).toISOString(),
    updatedAt: new Date(Date.now() - 72000000).toISOString(),
  },
  // Review Required Event 1 (as requested in prompt: Review Required — ১)
  {
    id: 'evt-004-rev',
    title: 'জরুরি প্রশাসনিক পর্যালোচনা সভা',
    description: 'টেলিগ্রাম নোটিশ থেকে নিষ্কাশিত কর্মসূচি। নোটিশে সুনির্দিষ্ট ভেন্যু ও বিস্তারিত এজেন্ডা অনুপস্থিত থাকায় মানুষের যাচাই প্রয়োজন।',
    eventDate: TOMORROW_STR,
    startTime: '10:00',
    endTime: null,
    venue: 'অধ্যক্ষের কার্যালয় (অনুমিত)',
    category: 'সভা',
    priority: 'urgent',
    source: 'AI Extracted',
    telegramMessageId: 1048,
    telegramChatId: '-1001849204128',
    originalText: 'আগামী রবিবার সকাল ১০টায় জরুরি সভা অনুষ্ঠিত হবে। সংশ্লিষ্ট কর্মকর্তাদের উপস্থিত থাকার নির্দেশ প্রদান করা হলো।',
    confidence: 0.82,
    reviewStatus: 'needs_review',
    syncStatus: 'pending',
    ambiguities: [
      'ভেন্যু সুনির্দিষ্টভাবে উল্লেখ করা হয়নি (অধ্যক্ষের কার্যালয় হিসেবে প্রস্তাবিত)',
      'সভার আলোচ্যসূচি উল্লেখ নেই'
    ],
    reminders: [],
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    updatedAt: new Date(Date.now() - 10800000).toISOString(),
  },
  // Upcoming Event 1 (Tomorrow)
  {
    id: 'evt-005',
    title: 'ফার্মাকোলজি ১ম টার্ম ভাইভা ও প্র্যাকটিক্যাল পরীক্ষা',
    description: '২০২৩-২৪ শিক্ষাবর্ষের এমবিবিএস শিক্ষার্থীদের ফার্মাকোলজি ও থেরাপিউটিক্স ১ম টার্ম ব্যবহারিক ও মৌখিক পরীক্ষা।',
    eventDate: TOMORROW_STR,
    startTime: '09:00',
    endTime: '13:00',
    venue: 'ফার্মাকোলজি ডিপার্টমেন্টাল ল্যাব ও ভাইভা রুম',
    category: 'পরীক্ষা',
    priority: 'important',
    source: 'Telegram',
    telegramMessageId: 1039,
    confidence: 0.94,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'পরীক্ষা কমিটি, ফার্মাকোলজি বিভাগ',
    reminders: [
      { id: 'rem-6', eventId: 'evt-005', reminderType: 'notification', minutesBefore: 1440, scheduledAt: '', enabled: true },
      { id: 'rem-7', eventId: 'evt-005', reminderType: 'notification', minutesBefore: 120, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 120000000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  // Upcoming Event 2 (This Week)
  {
    id: 'evt-006',
    title: 'স্বাস্থ্য শিক্ষা অধিদপ্তর ও ডিজিএইচএস পরিদর্শক দলের অফিশিয়াল ভিজিট',
    description: 'হাসপাতালের সম্প্রসারিত আইসিইউ, সেন্ট্রাল অক্সিজেন প্ল্যান্ট এবং একাডেমিক লাইব্রেরির আধুনিকায়ন অগ্রগতি পরিদর্শন।',
    eventDate: IN_TWO_DAYS_STR,
    startTime: '10:30',
    endTime: '14:30',
    venue: 'কনফারেন্স রুম ও হাসপাতাল ক্যাম্পাস',
    category: 'প্রশাসনিক',
    priority: 'urgent',
    source: 'Telegram',
    telegramMessageId: 1035,
    originalText: 'স্বাস্থ্য শিক্ষা অধিদপ্তরের উচ্চপর্যায়ের প্রতিনিধি দল জামালপুর মেডিকেল কলেজ ও সংলগ্ন ৫০০ শয্যা হাসপাতাল পরিদর্শনে আগমন করবেন। সকল বিভাগীয় প্রধানদের সংশ্লিষ্ট নথিপত্র প্রস্তুত রাখার অনুরোধ রইল।',
    confidence: 0.96,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'ভিজিট প্রস্তুতি ও লজিস্টিক কমিটি',
    reminders: [
      { id: 'rem-8', eventId: 'evt-006', reminderType: 'notification', minutesBefore: 1440, scheduledAt: '', enabled: true },
      { id: 'rem-9', eventId: 'evt-006', reminderType: 'notification', minutesBefore: 120, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 150000000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  // Upcoming Event 3 (This Week)
  {
    id: 'evt-007',
    title: 'হাসপাতাল ওষুধ ও রি-এজেন্ট ক্রয় সংক্রান্ত দরপত্র উন্মুক্তকরণ (Tender Opening)',
    description: '২০২৬-২০২৭ অর্থবছরের প্যাথলজি ল্যাব কিটস এবং এসেনশিয়াল ড্রাগস সাপ্লাই এর জন্য প্রাপ্ত দরপত্রসমূহ উন্মুক্তকরণ সভা।',
    eventDate: IN_FOUR_DAYS_STR,
    startTime: '12:00',
    endTime: '14:00',
    venue: 'অধ্যক্ষের সভা কক্ষ (Conference Room)',
    category: 'ক্রয়/টেন্ডার',
    priority: 'normal',
    source: 'Manual',
    confidence: 1.0,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'দরপত্র মূল্যায়ন কমিটি (Tender Evaluation Committee)',
    reminders: [
      { id: 'rem-10', eventId: 'evt-007', reminderType: 'notification', minutesBefore: 120, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 170000000).toISOString(),
    updatedAt: new Date(Date.now() - 170000000).toISOString(),
  },
  // Upcoming Event 4 (Next Week)
  {
    id: 'evt-008',
    title: 'কার্ডিওপালমোনারি রিসাসিটেশন (CPR) ও ইমার্জেন্সি লাইফ সাপোর্ট হ্যান্ডস-অন কর্মশালা',
    description: 'ট্রেইনি ডক্টর ও ইন্টার্ন চিকিৎসকদের জন্য ৩ দিনব্যাপী জরুরি রিসাসিটেশন ও ডিফিব্রিলেটর ব্যবহারের হ্যান্ডস-অন সেশন।',
    eventDate: NEXT_WEEK_STR,
    startTime: '09:00',
    endTime: '15:00',
    venue: 'স্কিল ল্যাব ও এনেস্থেসিওলজি অডিটোরিয়াম',
    category: 'ওয়ার্কশপ',
    priority: 'important',
    source: 'Telegram',
    telegramMessageId: 1022,
    confidence: 0.97,
    reviewStatus: 'auto_approved',
    syncStatus: 'synced',
    committee: 'মেডিকেল স্কিল ডেভেলপমেন্ট সেল',
    reminders: [
      { id: 'rem-11', eventId: 'evt-008', reminderType: 'notification', minutesBefore: 1440, scheduledAt: '', enabled: true }
    ],
    createdAt: new Date(Date.now() - 200000000).toISOString(),
    updatedAt: new Date(Date.now() - 200000000).toISOString(),
  }
];

export const INITIAL_TELEGRAM_MESSAGES: TelegramMessageEntity[] = [
  {
    id: 1048,
    chatId: '-1001849204128',
    senderName: 'অধ্যক্ষ মহোদয়ের ব্যক্তিগত সহকারী (PA to Principal)',
    senderRole: 'Administrative Staff',
    timestamp: 'আজ সকাল ০৮:১৫',
    rawText: 'আগামী রবিবার সকাল ১০টায় জরুরি সভা অনুষ্ঠিত হবে। সংশ্লিষ্ট কর্মকর্তাদের উপস্থিত থাকার নির্দেশ প্রদান করা হলো।',
    hasDocument: false,
    status: 'Needs Review',
    extractedEventIds: ['evt-004-rev'],
    confidence: 0.82
  },
  {
    id: 1042,
    chatId: '-1001849204128',
    senderName: 'ডাঃ মোহাঃ রফিকুল ইসলাম',
    senderRole: 'Secretary, Academic Council',
    timestamp: 'গতকাল রাত ০৯:৪০',
    rawText: 'আগামীকাল সকাল ৯:৩০ ঘটিকায় অধ্যক্ষের কার্যালয়ের শিক্ষক কক্ষে ইন্টার্ন ইনডাকশন কমিটির সভা অনুষ্ঠিত হবে। সংশ্লিষ্ট সকল সম্মানিত সদস্যবৃন্দকে যথাসময়ে উপস্থিত থাকার জন্য অনুরোধ করা হলো।',
    hasDocument: true,
    documentType: 'pdf',
    documentName: 'Notice_Intern_Induction_2026.pdf',
    status: 'Schedule Created',
    extractedEventIds: ['evt-001'],
    confidence: 0.98
  },
  {
    id: 1035,
    chatId: '-1001849204128',
    senderName: 'প্রশাসনিক কর্মকর্তা (AO)',
    senderRole: 'Administration',
    timestamp: '১৫ সেপ্টেম্বর ২০২৬',
    rawText: 'স্বাস্থ্য শিক্ষা অধিদপ্তরের উচ্চপর্যায়ের প্রতিনিধি দল জামালপুর মেডিকেল কলেজ ও সংলগ্ন ৫০০ শয্যা হাসপাতাল পরিদর্শনে আগমন করবেন। সকল বিভাগীয় প্রধানদের সংশ্লিষ্ট নথিপত্র প্রস্তুত রাখার অনুরোধ রইল।',
    hasDocument: true,
    documentType: 'image',
    documentName: 'Office_Order_DGME_Visit.jpg',
    status: 'Schedule Created',
    extractedEventIds: ['evt-006'],
    confidence: 0.96
  },
  {
    id: 1029,
    chatId: '-1001849204128',
    senderName: 'হিসাব শাখা',
    senderRole: 'Accounts Officer',
    timestamp: '১৪ সেপ্টেম্বর ২০২৬',
    rawText: 'অত্র কলেজের সকল কর্মকর্তা-কর্মচারীদের মাসিক বেতন বিল দাখিলের শেষ তারিখ আগামী ২০ তারিখ।',
    hasDocument: false,
    status: 'Not a Schedule',
    extractedEventIds: [],
    confidence: 0.35
  }
];
