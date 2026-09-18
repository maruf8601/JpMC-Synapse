/**
 * JpMC Synapse — Firebase Cloud Messaging (FCM) Service Worker
 * Handles background push notifications when PWA/browser is CLOSED.
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

/* eslint-disable no-undef */
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

  // Initialize Firebase inside the service worker
  firebase.initializeApp({
    projectId: 'sapient-pen-336609',
    appId: '1:103277329126:web:64cb4ba0cfd47a134bd927',
    apiKey: 'AIzaSyBaaFz7VAL2WBx0Sp47trHf_4RkEGkvFa0',
    authDomain: 'sapient-pen-336609.firebaseapp.com',
    storageBucket: 'sapient-pen-336609.firebasestorage.app',
    messagingSenderId: '103277329126',
  });

  const messaging = firebase.messaging();

  /**
   * Handle background FCM notifications
   */
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Background message received:', payload);

    const notificationTitle =
      payload.notification?.title || payload.data?.title || 'JpMC Synapse বিজ্ঞপ্তি';

    const notificationOptions = {
      body:
        payload.notification?.body ||
        payload.data?.body ||
        'জামালপুর মেডিকেল কলেজ অফিশিয়াল সূচি রিমাইন্ডার।',
      icon: '/pwa-192x192.png',
      badge: '/icon.svg',
      tag: payload.data?.deliveryId || payload.data?.eventId || 'jpmc-synapse-alert',
      renotify: true,
      requireInteraction: true,
      data: {
        eventId: payload.data?.eventId,
        eventDate: payload.data?.eventDate,
        startTime: payload.data?.startTime,
        venue: payload.data?.venue,
        reminderType: payload.data?.reminderType,
        url: payload.data?.url || (payload.data?.eventId ? `/?eventId=${payload.data.eventId}` : '/'),
      },
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (fcmInitErr) {
  console.warn('[firebase-messaging-sw.js] Firebase scripts init notice (WebPush fallback active):', fcmInitErr);
}

/**
 * Fallback Push event listener in case of raw WebPush format
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const rawData = event.data.json();
    // If not already handled by onBackgroundMessage
    if (rawData && !rawData.fcmMessageId) {
      const title = rawData.title || rawData.notification?.title || 'JpMC Synapse';
      const body = rawData.body || rawData.notification?.body || 'নতুন কর্মসূচি নির্ধারিত হয়েছে।';
      const options = {
        body,
        icon: '/pwa-192x192.png',
        badge: '/icon.svg',
        data: rawData.data || {},
        tag: rawData.data?.deliveryId || 'jpmc-push',
      };
      event.waitUntil(self.registration.showNotification(title, options));
    }
  } catch (e) {
    // If text push
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('JpMC Synapse', {
        body: text,
        icon: '/pwa-192x192.png',
      })
    );
  }
});

/**
 * Notification Click Handler — Opens JpMC Synapse & Navigates to Event
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';
  const eventId = event.notification.data?.eventId;
  const reminderType = event.notification.data?.reminderType;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a JpMC Synapse tab is already open, focus it and notify client
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NAVIGATE_TO_EVENT',
            eventId,
            reminderType,
            url: targetUrl,
          });
          return client.focus();
        }
      }

      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
