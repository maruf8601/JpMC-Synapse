/**
 * JpMC Synapse — Client Push Notification & FCM Token Service
 * Manages Service Worker registration, FCM token acquisition, and device registration in Firestore
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app, auth, db } from './firebaseClient';
import { doc, setDoc } from 'firebase/firestore';

const DEVICE_ID_KEY = 'jpmc_synapse_device_id_v2';
const FCM_TOKEN_KEY = 'jpmc_synapse_fcm_token_v2';

export interface DevicePushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  hasToken: boolean;
  token: string | null;
  deviceId: string;
  isRegisteredOnServer: boolean;
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

  return {
    isSupported: supported,
    permission,
    hasToken: Boolean(token),
    token,
    deviceId: getOrCreateDeviceId(),
    isRegisteredOnServer: Boolean(token && permission === 'granted'),
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
    // 1. Request Browser Permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'বিজ্ঞপ্তির অনুমতি দেওয়া হয়নি (Permission denied).' };
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

    const messagingSupported = await isSupported();
    if (!messagingSupported) {
      return {
        success: true,
        error: 'Web Notifications active (Standard Web Notification mode)',
      };
    }

    // 3. Acquire FCM Token
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
    }).catch(async (tokenErr) => {
      console.warn('[Push] First getToken attempt note:', tokenErr?.message);
      // Fallback without sw registration parameter
      return await getToken(messaging);
    });

    if (token) {
      localStorage.setItem(FCM_TOKEN_KEY, token);
      const deviceId = getOrCreateDeviceId();
      const userId = auth.currentUser?.uid || 'guest_user';

      const devicePayload = {
        deviceId,
        userId,
        fcmToken: token,
        platform: 'web' as const,
        userAgent: navigator.userAgent,
        notificationsEnabled: true,
        updatedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };

      // 4. Save to Firestore (Both Client SDK and Server API for redundancy)
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

      // Also register on Server API
      await fetch('/api/notifications/register-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(devicePayload),
      }).catch((apiErr) => {
        console.warn('[Push] Server device register API notice:', apiErr);
      });

      return { success: true, token };
    } else {
      return { success: false, error: 'Could not obtain FCM token from Firebase.' };
    }
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
    if (!status.token) {
      // Try enabling first
      const enableResult = await enablePushNotifications();
      if (!enableResult.success || !enableResult.token) {
        return {
          success: false,
          message: 'পুশ নোটিফিকেশন টোকেন সক্রিয় করা সম্ভব হয়নি। ব্রাউজার পারমিশন নিশ্চিত করুন।',
        };
      }
    }

    const res = await fetch('/api/notifications/test-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: status.deviceId,
        fcmToken: status.token,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, message: 'টেস্ট নোটিফিকেশন সফলভাবে পাঠানো হয়েছে।' };
    } else {
      return {
        success: false,
        message: data.error || 'টেস্ট নোটিফিকেশন পাঠানো যায়নি।',
      };
    }
  } catch (err: any) {
    return { success: false, message: err?.message || 'Network error sending test push.' };
  }
}
