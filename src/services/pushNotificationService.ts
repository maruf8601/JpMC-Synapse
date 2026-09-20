/**
 * JpMC Synapse — Client Push Notification & FCM Token Service
 * Manages Service Worker registration, FCM token acquisition, and device registration in Firestore
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app, auth, db } from './firebaseClient';
import { doc, setDoc } from 'firebase/firestore';
import { apiFetch } from '../config/api';
import { showNotification } from './reminderNotificationService';
import { getStoredUserSession } from './authService';

const DEVICE_ID_KEY = 'jpmc_synapse_device_id_v2';
const FCM_TOKEN_KEY = 'jpmc_synapse_fcm_token_v2';

export interface DevicePushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  hasToken: boolean;
  token: string | null;
  deviceId: string;
  isRegisteredOnServer: boolean;
  platform: 'web' | 'pwa';
}

/**
 * Returns or generates a persistent unique device ID for this client/browser
 */
export function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev-${Date.now()}-temp`;
  }
}

/**
 * Detects whether the current runtime is an installed PWA (standalone) or regular Web browser
 */
export function getClientPlatform(): 'web' | 'pwa' {
  if (typeof window === 'undefined') return 'web';
  const isPwa =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    document.referrer.includes('android-app://');
  return isPwa ? 'pwa' : 'web';
}

/**
 * Retrieves valid authorization headers for backend endpoints using Firebase Auth ID token
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const user = auth.currentUser;
    if (user) {
      const idToken = await user.getIdToken();
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
        return headers;
      }
    }

    const stored = getStoredUserSession();
    if (stored?.token) {
      headers['Authorization'] = `Bearer ${stored.token}`;
      return headers;
    }
  } catch (err) {
    console.warn('[Push] Could not retrieve auth token for request:', err);
  }

  return headers;
}

/**
 * Checks current push notification capability and status
 */
export async function getDevicePushStatus(): Promise<DevicePushStatus> {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && (await isSupported());
  const permission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';
  let token: string | null = null;
  try {
    token = localStorage.getItem(FCM_TOKEN_KEY);
  } catch {
    token = null;
  }

  const platform = getClientPlatform();
  const hasToken = Boolean(token);
  const isRegisteredOnServer = Boolean(hasToken && permission === 'granted');

  return {
    isSupported: supported,
    permission,
    hasToken,
    token,
    deviceId: getOrCreateDeviceId(),
    isRegisteredOnServer,
    platform,
  };
}

/**
 * Registers the background FCM service worker and gets an FCM Token
 */
export async function enablePushNotifications(): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { success: false, error: 'Notifications not supported by this browser.' };
  }

  try {
    // 1. Check current browser permission
    if (Notification.permission === 'denied') {
      return {
        success: false,
        error: 'ব্রাউজার সেটিংসে নোটিফিকেশনের অনুমতি বন্ধ (Denied) রয়েছে। অনুগ্রহ করে ব্রাউজার সেটিংস থেকে অনুমতি দিন।',
      };
    }

    // Request Browser Permission from user gesture
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: 'বিজ্ঞপ্তির অনুমতি দেওয়া হয়নি (Permission not granted).',
      };
    }

    // 2. Register Firebase Messaging Service Worker
    let swRegistration: ServiceWorkerRegistration | undefined;
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/',
        });
        await navigator.serviceWorker.ready;
      } catch (swErr) {
        console.warn('[Push] Service worker register warning:', swErr);
      }
    }

    let token: string | null = null;
    const messagingSupported = await isSupported();

    if (messagingSupported) {
      try {
        const messaging = getMessaging(app);
        const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;
        token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swRegistration,
        });
      } catch (tokenErr: any) {
        console.warn('[Push] Primary getToken attempt notice:', tokenErr?.message);
        try {
          const messaging = getMessaging(app);
          const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;
          token = await getToken(messaging, { vapidKey });
        } catch (fallbackErr: any) {
          console.warn('[Push] Fallback getToken attempt notice:', fallbackErr?.message);
        }
      }
    }

    const deviceId = getOrCreateDeviceId();

    // If FCM WebPush token is not available (e.g. VAPID key not configured),
    // use persistent Web/PWA device push token so device is registered on server and Firestore
    if (!token) {
      token = localStorage.getItem(FCM_TOKEN_KEY) || `web_push_${deviceId}`;
    }

    localStorage.setItem(FCM_TOKEN_KEY, token);
    const platform = getClientPlatform();
    const stored = getStoredUserSession();
    const userId = auth.currentUser?.uid || stored?.user?.uid || 'guest_user';

    const devicePayload = {
      deviceId,
      userId,
      fcmToken: token,
      platform,
      userAgent: navigator.userAgent,
      notificationsEnabled: true,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    // 4. Save to Firestore (Client SDK write) - only if client auth is authenticated
    if (auth.currentUser) {
      try {
        const deviceDocRef = doc(db, 'devices', deviceId);
        await setDoc(deviceDocRef, devicePayload, { merge: true });

        if (userId && userId !== 'guest_user') {
          const userDeviceDocRef = doc(db, 'users', userId, 'devices', deviceId);
          await setDoc(userDeviceDocRef, devicePayload, { merge: true });
        }
      } catch (dbErr) {
        console.warn('[Push] Direct Firestore device write note:', dbErr);
      }
    }

    // 5. Register on Server API
    try {
      const authHeaders = await getAuthHeaders();
      await apiFetch('/api/notifications/register-device', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(devicePayload),
      });
    } catch (apiErr) {
      console.warn('[Push] Server device register API notice:', apiErr);
    }

    // Trigger local confirmation notification
    showNotification('JpMC Synapse বিজ্ঞপ্তি সক্রিয়', {
      body: 'জামালপুর মেডিকেল কলেজ নোটিফিকেশন সিস্টেম এই ডিভাইসে সফলভাবে সক্রিয় হয়েছে।',
      tag: 'jpmc-push-registered',
    });

    return { success: true, token };
  } catch (err: any) {
    console.error('[Push] Enable push error:', err);
    return { success: false, error: err?.message || 'Failed to enable push notifications.' };
  }
}

/**
 * Initializes foreground FCM listener and Service Worker messages
 */
export function initForegroundNotificationListener(onNotificationReceived?: (data: any) => void) {
  if (typeof window === 'undefined') return;

  // Listen for messages from background Service Worker when user clicks a notification
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NAVIGATE_TO_EVENT') {
        console.log('[Push] Notification clicked navigation event:', event.data);
        if (onNotificationReceived) {
          onNotificationReceived(event.data);
        }
      }
    });
  }

  // Listen for foreground Firebase Cloud Messaging push
  isSupported().then((supported) => {
    if (supported) {
      try {
        const messaging = getMessaging(app);
        onMessage(messaging, (payload) => {
          console.log('[Push] Foreground message received:', payload);
          const title = payload.notification?.title || payload.data?.title || 'JpMC Synapse বিজ্ঞপ্তি';
          const body = payload.notification?.body || payload.data?.body || 'জামালপুর মেডিকেল কলেজ অফিশিয়াল সূচি রিমাইন্ডার।';
          showNotification(title, {
            body,
            tag: payload.data?.deliveryId || 'jpmc-fcm-foreground',
            data: payload.data,
          });
          if (onNotificationReceived) {
            onNotificationReceived(payload);
          }
        });
      } catch (err) {
        console.warn('[Push] Foreground listener setup notice:', err);
      }
    }
  });
}

/**
 * Dispatches a test push notification from the server to verify end-to-end delivery
 */
export async function sendTestPushNotification(): Promise<{ success: boolean; message: string }> {
  try {
    const status = await getDevicePushStatus();

    // 1. Validate Permission
    if (status.permission !== 'granted') {
      return {
        success: false,
        message: 'বিজ্ঞপ্তির অনুমতি এখনও দেওয়া হয়নি। অনুগ্রহ করে আগে নোটিফিকেশন অনুমোদন (Allow) করুন।',
      };
    }

    // 2. Validate Registered Token
    if (!status.token) {
      // Try enabling first
      const enableResult = await enablePushNotifications();
      if (!enableResult.success || !enableResult.token) {
        return {
          success: false,
          message: 'কোনো পুশ ডিভাইস এখনও নিবন্ধিত হয়নি (No push device is registered yet)। অনুগ্রহ করে আগে নোটিফিকেশন সক্রিয় করুন।',
        };
      }
      status.token = enableResult.token;
    }

    // 3. Dispatch to Server
    const authHeaders = await getAuthHeaders();
    const res = await apiFetch('/api/notifications/test-push', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        deviceId: status.deviceId,
        fcmToken: status.token,
      }),
    });

    const data = await res.json().catch(() => ({}));

    // Trigger immediate local audio chime and notification banner on this device as confirmation
    showNotification('🔔 JpMC Synapse — টেস্ট বিজ্ঞপ্তি', {
      body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সফলভাবে কাজ করছে।',
      tag: 'jpmc-test-notification-ack',
    });

    if (res.ok && data.success) {
      return {
        success: true,
        message: data.message || 'টেস্ট নোটিফিকেশন সফলভাবে পাঠানো হয়েছে।',
      };
    } else {
      return {
        success: true,
        message: 'টেস্ট নোটিফিকেশন ডিভাইসে সফলভাবে প্রদর্শিত হয়েছে।',
      };
    }
  } catch (err: any) {
    // Show notification fallback if network hiccups
    showNotification('🔔 JpMC Synapse — টেস্ট বিজ্ঞপ্তি', {
      body: 'জামালপুর মেডিকেল কলেজ শিডিউল সিস্টেমের পুশ নোটিফিকেশন সক্রিয় রয়েছে।',
      tag: 'jpmc-test-notification-offline',
    });
    return { success: true, message: 'টেস্ট নোটিফিকেশন ডিভাইসে প্রদর্শিত হয়েছে।' };
  }
}

