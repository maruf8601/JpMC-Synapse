/**
 * JpMC Synapse — Android Native Companion Architecture Specification
 * Note: The web PWA operates via Web Push API, Background Service Worker, FCM, and Cloud Scheduler.
 * This document defines the Kotlin/Compose companion specification for future native APK packaging.
 * Package: com.jpmc.synapse
 * Target: Android 14+ (API 34), Material 3, Clean Architecture
 */

export const ANDROID_ARCHITECTURE_SPEC = {
  appName: "JpMC Synapse",
  subtitle: "Smart Schedule & Reminder System",
  organization: "Jamalpur Medical College (JpMC), Jamalpur, Bangladesh",
  packageName: "com.jpmc.synapse",
  timezone: "Asia/Dhaka (UTC+6)",
  primaryLanguage: "bn (Bangla Unicode)",

  layers: {
    presentation: {
      framework: "Jetpack Compose + Material 3 (androidx.compose.material3)",
      navigation: "Jetpack Compose Navigation with Type-Safe Routes",
      stateManagement: "MVVM with StateFlow & SharedFlow (androidx.lifecycle.viewmodel.compose)",
      screens: [
        "DashboardScreen (শুভ সকাল, আজকের কর্মসূচি, Upcoming cards, Review alerts)",
        "TodayTimelineScreen (Vertical timeline with dynamic countdown)",
        "UpcomingScreen (Tabs: আজ, আগামীকাল, এই সপ্তাহ, পরবর্তী সপ্তাহ, ৩০ দিন)",
        "CalendarScreen (Month/Week/Day M3 Calendar with indicators)",
        "ReviewCenterScreen (যাচাই প্রয়োজন, original notice diff, approval)",
        "TelegramInboxScreen (Message history, document OCR status, reprocess)",
        "QuickAddDialog (Natural language Bengali input + Form preview)",
        "SettingsScreen (Google Calendar OAuth, Telegram Bot Webhook, Briefing time, About)"
      ]
    },

    domain: {
      useCases: [
        "GetTodayScheduleUseCase",
        "GetNextEventCountdownUseCase",
        "ParseBengaliNoticeWithGeminiUseCase",
        "ResolveBangladeshDateTimeUseCase",
        "DetectDuplicateScheduleUseCase",
        "ApproveScheduleUseCase",
        "ScheduleExactAlarmReminderUseCase",
        "TriggerMorningBriefingNotificationUseCase",
        "SyncGoogleCalendarUseCase"
      ],
      models: [
        "Event (id, title, date, startTime, endTime, venue, category, priority, source, confidence, reviewStatus)",
        "Reminder (id, eventId, reminderType, minutesBefore, scheduledAt, isEnabled)",
        "TelegramNotice (id, messageId, rawNotice, documentUrl, parsedEvents, status)"
      ]
    },

    data: {
      localDatabase: "Room Database (SynapseDatabase.kt) with SQLite WAL mode and offline cache",
      daos: ["EventDao", "ReminderDao", "TelegramNoticeDao"],
      remoteApi: "Ktor / Retrofit2 + OkHttp3 communicating with JpMC Synapse Cloud Run / Firebase backend",
      repository: "EventRepositoryImpl with Offline-First caching & NetworkBoundResource"
    },

    notificationsAndReminders: {
      alarmManager: "AlarmManager.setExactAndAllowWhileIdle() for 2h & 30m exact reminders",
      workManager: "PeriodicWorkRequest (7:30 AM Daily Morning Briefing + periodic Telegram sync)",
      broadcastReceivers: [
        "BootReceiver (ACTION_BOOT_COMPLETED to re-schedule alarms after phone restart)",
        "ReminderAlarmReceiver (Triggers high-priority NotificationCompat.Builder with Bengali sound)",
        "TimezoneChangeReceiver (ACTION_TIMEZONE_CHANGED / ACTION_TIME_CHANGED to re-validate Dhaka schedules)"
      ],
      notificationChannels: [
        { id: "jpmc_urgent_channel", name: "জরুরি কর্মসূচি অ্যালার্ম", importance: "HIGH" },
        { id: "jpmc_briefing_channel", name: "দৈনিক সকালের ব্রিফিং (07:30 AM)", importance: "DEFAULT" },
        { id: "jpmc_review_channel", name: "নতুন নোটিশ যাচাই প্রয়োজন", importance: "LOW" }
      ]
    },

    aiBackend: {
      engine: "Gemini 2.5 / 3.8 Flash via server-side Node.js / Express proxy",
      promptStrategy: "Few-shot Bengali medical administrative notice extraction with strict JSON schema",
      confidenceThresholds: {
        autoApproved: ">= 0.90",
        needsReview: "0.70 - 0.89",
        discardOrAlert: "< 0.70"
      },
      timezoneAnchor: "Asia/Dhaka (UTC+6)"
    }
  }
};
