/**
 * JpMC Synapse — Cloud Data Layer & Event Repository
 * Hybrid Architecture: Real Firestore Collection Sync + Local Offline Cache
 * Organization: Jamalpur Medical College (JpMC), Jamalpur, Bangladesh
 */

import {
  EventEntity,
  ReviewStatus,
  TelegramMessageEntity,
} from '../domain/models';
import { INITIAL_EVENTS, INITIAL_TELEGRAM_MESSAGES, TODAY_STR } from './mockEvents';
import { getDhakaDateString, isEventInPast } from '../domain/constants';
import { auth, db } from '../services/firebaseClient';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { apiFetch } from '../config/api';

type Listener = () => void;

function sanitizeForFirestore<T extends Record<string, any>>(obj: T): any {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item
        );
      } else if (typeof value === 'object' && value !== null) {
        result[key] = sanitizeForFirestore(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

const IS_DEMO_ENABLED =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env?.VITE_ENABLE_DEMO_DATA === 'true';

class EventRepository {
  private events: EventEntity[] = IS_DEMO_ENABLED ? [...INITIAL_EVENTS] : [];
  private telegramMessages: TelegramMessageEntity[] = IS_DEMO_ENABLED ? [...INITIAL_TELEGRAM_MESSAGES] : [];
  private listeners: Set<Listener> = new Set();
  private isFirestoreConnected: boolean = false;
  private unsubscribeEvents: (() => void) | null = null;
  private unsubscribeTelegram: (() => void) | null = null;

  constructor() {
    // 1. Load cached events from localStorage for instant offline startup if exists
    try {
      const saved = localStorage.getItem('jpmc_synapse_events_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.events = parsed;
        }
      }
      const savedMsgs = localStorage.getItem('jpmc_synapse_telegram_v2');
      if (savedMsgs) {
        const parsedMsgs = JSON.parse(savedMsgs);
        if (Array.isArray(parsedMsgs)) {
          this.telegramMessages = parsedMsgs;
        }
      }
    } catch (e) {
      console.warn('[Repository] Local cache read notice:', e);
    }

    // 2. Initialize Real-Time Firestore Sync
    this.initFirestoreSync();
  }

  private initFirestoreSync() {
    // Immediate fallback fetch from trusted backend API
    this.fetchServerUpdates();

    // Listen to Firebase Auth state
    onAuthStateChanged(auth, (user) => {
      if (user) {
        this.bindFirestoreListeners();
      } else {
        this.unbindFirestoreListeners();
        this.isFirestoreConnected = false;
        this.fetchServerUpdates();
      }
    });

    // Periodic sync from backend API for normal users and offline resilience
    if (typeof window !== 'undefined') {
      window.setInterval(() => {
        if (!auth.currentUser) {
          this.fetchServerUpdates();
        }
      }, 45000);
    }
  }

  private bindFirestoreListeners() {
    this.unbindFirestoreListeners();

    try {
      const eventsCol = collection(db, 'events');
      this.unsubscribeEvents = onSnapshot(
        eventsCol,
        (snapshot) => {
          this.isFirestoreConnected = true;
          if (!snapshot.empty) {
            const remoteEvents: EventEntity[] = [];
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as EventEntity;
              console.log('[Repository] Event subscription received document:', docSnap.id, data?.title?.slice(0, 25));
              remoteEvents.push(data);
            });
            this.events = remoteEvents;
            this.persistLocalCache();
            this.listeners.forEach((l) => l());
          } else {
            // In production, empty database means genuinely empty dashboard
            if (!IS_DEMO_ENABLED) {
              this.events = [];
              this.persistLocalCache();
              this.listeners.forEach((l) => l());
            }
          }
        },
        (err) => {
          this.isFirestoreConnected = false;
          console.warn('[Repository] Firestore events sync running in offline fallback mode:', err?.message);
          this.fetchServerUpdates();
        }
      );

      const msgsCol = collection(db, 'telegramMessages');
      this.unsubscribeTelegram = onSnapshot(
        msgsCol,
        (snapshot) => {
          if (!snapshot.empty) {
            const remoteMsgs: TelegramMessageEntity[] = [];
            snapshot.forEach((docSnap) => {
              remoteMsgs.push(docSnap.data() as TelegramMessageEntity);
            });
            this.telegramMessages = remoteMsgs;
            this.persistLocalCache();
            this.listeners.forEach((l) => l());
          } else {
            if (!IS_DEMO_ENABLED) {
              this.telegramMessages = [];
              this.persistLocalCache();
              this.listeners.forEach((l) => l());
            }
          }
        },
        (err) => {
          console.warn('[Repository] Firestore telegram sync running in offline fallback mode:', err?.message);
        }
      );
    } catch (err) {
      console.warn('[Repository] Firestore sync initialization error:', err);
    }
  }

  private unbindFirestoreListeners() {
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
      this.unsubscribeEvents = null;
    }
    if (this.unsubscribeTelegram) {
      this.unsubscribeTelegram();
      this.unsubscribeTelegram = null;
    }
  }

  /**
   * Fetch updates from server endpoints (/api/events & /api/telegram/messages)
   * Ensures instant sync across sessions and environments
   */
  public async fetchServerUpdates(): Promise<void> {
    try {
      const [eventsRes, msgsRes] = await Promise.all([
        apiFetch('/api/events').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        apiFetch('/api/telegram/messages').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      let hasChanged = false;
      if (eventsRes?.events && Array.isArray(eventsRes.events)) {
        const serverEvents: EventEntity[] = eventsRes.events;
        const mergedMap = new Map<string, EventEntity>();
        // Canonical server events from Firestore
        serverEvents.forEach((ev) => mergedMap.set(ev.id, ev));
        // Preserve any recent local events
        this.events.forEach((ev) => {
          if (!mergedMap.has(ev.id)) {
            mergedMap.set(ev.id, ev);
          }
        });
        this.events = Array.from(mergedMap.values());
        hasChanged = true;
      }
      if (msgsRes?.messages && Array.isArray(msgsRes.messages) && msgsRes.messages.length > 0) {
        this.telegramMessages = msgsRes.messages;
        hasChanged = true;
      }

      if (hasChanged) {
        this.persistLocalCache();
        this.listeners.forEach((l) => l());
      }
    } catch (e) {
      // Offline fallback silent catch
    }
  }

  /**
   * Explicitly load demo dataset for development or evaluation
   */
  public loadDemoData() {
    this.events = [...INITIAL_EVENTS];
    this.telegramMessages = [...INITIAL_TELEGRAM_MESSAGES];
    this.notify();
  }

  private persistLocalCache() {
    try {
      localStorage.setItem('jpmc_synapse_events_v2', JSON.stringify(this.events));
      localStorage.setItem('jpmc_synapse_telegram_v2', JSON.stringify(this.telegramMessages));
    } catch (e) {
      console.warn('[Repository] Local cache save notice:', e);
    }
  }

  private notify() {
    this.persistLocalCache();
    this.listeners.forEach((l) => l());
  }

  public isConnectedToFirestore(): boolean {
    return this.isFirestoreConnected;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getAllEvents(): EventEntity[] {
    return [...this.events].sort((a, b) => {
      const dateA = `${a.eventDate || '9999-99-99'} ${a.startTime || '00:00'}`;
      const dateB = `${b.eventDate || '9999-99-99'} ${b.startTime || '00:00'}`;
      return dateA.localeCompare(dateB);
    });
  }

  public getApprovedEvents(): EventEntity[] {
    return this.getAllEvents().filter(
      (e) => e.reviewStatus === 'auto_approved' && Boolean(e.eventDate) && Boolean(e.startTime)
    );
  }

  public getTodayEvents(): EventEntity[] {
    const today = getDhakaDateString();
    return this.getApprovedEvents().filter((e) => e.eventDate === today);
  }

  public getNextTodayEvent(): EventEntity | null {
    const todayEvents = this.getTodayEvents().filter((e) => !e.isCompleted);
    if (todayEvents.length === 0) return null;
    return todayEvents[0];
  }

  public getPendingReviewEvents(): EventEntity[] {
    return this.events.filter((e) => e.reviewStatus === 'needs_review');
  }

  public getUpcomingEvents(): EventEntity[] {
    const today = getDhakaDateString();
    return this.getApprovedEvents().filter(
      (e) => Boolean(e.eventDate) && e.eventDate! >= today && !isEventInPast(e.eventDate, e.endTime, e.startTime) && !e.isCompleted
    );
  }

  public getPastEvents(): EventEntity[] {
    return this.getApprovedEvents().filter(
      (e) => Boolean(e.eventDate) && (isEventInPast(e.eventDate, e.endTime, e.startTime) || e.isCompleted)
    );
  }

  public getAllHistoryRecords(): EventEntity[] {
    return [...this.getApprovedEvents()].sort((a, b) => {
      const dateA = `${a.eventDate || '9999-99-99'} ${a.startTime || '00:00'}`;
      const dateB = `${b.eventDate || '9999-99-99'} ${b.startTime || '00:00'}`;
      return dateB.localeCompare(dateA);
    });
  }

  public getEventsThisWeek(): EventEntity[] {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(now.getDate() + 7);
    const endStr = in7Days.toISOString().split('T')[0];

    return this.getApprovedEvents().filter(
      (e) => Boolean(e.eventDate) && e.eventDate! >= TODAY_STR && e.eventDate! <= endStr
    );
  }

  public getEventsByDate(dateStr: string): EventEntity[] {
    return this.getApprovedEvents().filter((e) => e.eventDate === dateStr);
  }

  public getEventById(id: string): EventEntity | undefined {
    return this.events.find((e) => e.id === id);
  }

  public async addEvent(newEvent: Omit<EventEntity, 'id' | 'createdAt' | 'updatedAt'>): Promise<EventEntity> {
    const eventId = (newEvent as any).id || `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const created: EventEntity = {
      ...newEvent,
      id: eventId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: newEvent.createdBy || auth.currentUser?.email || 'staff',
      visibility: newEvent.visibility || 'institutional',
      source: newEvent.source || 'Manual',
      reviewStatus: newEvent.reviewStatus || 'auto_approved',
      syncStatus: newEvent.syncStatus || 'synced',
    };

    console.log('[Repository] Quick Add confirmed → Firestore write attempted:', {
      id: created.id,
      title: created.title,
      date: created.eventDate,
      time: created.startTime,
      source: created.source,
    });

    let firestoreWritten = false;
    let writeError: any = null;

    // 1. Direct Firestore write via Client SDK (if user is authenticated)
    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'events', created.id);
        await setDoc(docRef, sanitizeForFirestore(created));
        firestoreWritten = true;
        console.log('[Repository] Direct Firestore write succeeded for doc ID:', created.id);
      } catch (err: any) {
        console.warn('[Repository] Direct Firestore client setDoc encountered issue, attempting server API proxy:', err?.message);
        writeError = err;
      }
    }

    // 2. Canonical Server API write (authoritative write via Firebase Admin SDK)
    try {
      let idToken: string | null = null;
      if (auth.currentUser) {
        try {
          idToken = await auth.currentUser.getIdToken();
        } catch {}
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers,
        body: JSON.stringify({ event: created }),
      });

      if (res.ok) {
        firestoreWritten = true;
        const body = await res.json();
        console.log('[Repository] Server API Firestore write succeeded for doc ID:', body?.event?.id || created.id);
      } else {
        const errText = await res.text();
        console.warn('[Repository] Server API /api/events write response not ok:', res.status, errText);
        if (!firestoreWritten) {
          writeError = new Error(`Server write failed (${res.status}): ${errText}`);
        }
      }
    } catch (apiErr: any) {
      console.warn('[Repository] Server API /api/events write network error:', apiErr?.message);
      if (!firestoreWritten) {
        writeError = apiErr;
      }
    }

    // If both failed and we couldn't write to Firestore, throw real error so UI displays real error and doesn't show false success
    if (!firestoreWritten && writeError) {
      console.error('[Repository] All Firestore persistence channels failed for doc ID:', created.id, writeError);
      throw new Error(`Firestore এ সংরক্ষণ ব্যর্থ হয়েছে: ${writeError?.message || 'নেটওয়ার্ক সংযোগ পরীক্ষা করুন'}`);
    }

    // Update in-memory state and local cache
    const existingIdx = this.events.findIndex((e) => e.id === created.id);
    if (existingIdx >= 0) {
      this.events[existingIdx] = created;
    } else {
      this.events.unshift(created);
    }
    this.persistLocalCache();
    this.notify();

    return created;
  }

  public async updateEvent(updated: EventEntity): Promise<void> {
    const stamped: EventEntity = { ...updated, updatedAt: new Date().toISOString() };
    this.events = this.events.map((e) => (e.id === stamped.id ? stamped : e));
    this.persistLocalCache();
    this.notify();

    // 1. Direct Firestore write if authenticated
    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'events', stamped.id);
        await setDoc(docRef, sanitizeForFirestore(stamped), { merge: true });
      } catch (err: any) {
        console.warn('[Repository] Direct Firestore updateDoc error, falling back to server API:', err?.message);
      }
    }

    // 2. Canonical Server API write
    try {
      let idToken: string | null = null;
      if (auth.currentUser) {
        try {
          idToken = await auth.currentUser.getIdToken();
        } catch {}
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
      await apiFetch(`/api/events/${stamped.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ event: stamped }),
      });
    } catch (e) {
      console.warn('[Repository] Server API update event network error:', e);
    }
  }

  public async deleteEvent(id: string): Promise<void> {
    this.events = this.events.filter((e) => e.id !== id);
    this.persistLocalCache();
    this.notify();

    if (auth.currentUser) {
      try {
        const docRef = doc(db, 'events', id);
        await deleteDoc(docRef);
      } catch (err: any) {
        console.warn('[Repository] Direct Firestore deleteDoc error:', err?.message);
      }
    }

    try {
      await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('[Repository] Server API delete event error:', e);
    }
  }

  public toggleComplete(id: string): void {
    const existing = this.events.find((e) => e.id === id);
    if (!existing) return;
    this.updateEvent({
      ...existing,
      isCompleted: !existing.isCompleted,
    });
  }

  public approveEvent(id: string, overrides?: Partial<EventEntity>): void {
    const existing = this.events.find((e) => e.id === id);
    if (!existing) return;

    const merged = { ...existing, ...overrides };
    if (!merged.eventDate || !merged.startTime) {
      console.warn('[Repository] Cannot approve event without valid eventDate and startTime');
      return;
    }

    this.updateEvent({
      ...merged,
      reviewStatus: 'auto_approved' as ReviewStatus,
      syncStatus: 'synced',
      ambiguities: [],
    });
  }

  public rejectEvent(id: string): void {
    const existing = this.events.find((e) => e.id === id);
    if (!existing) return;

    this.updateEvent({
      ...existing,
      reviewStatus: 'rejected' as ReviewStatus,
    });
  }

  public searchEvents(query: string): EventEntity[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.getApprovedEvents();

    return this.getApprovedEvents().filter((e) => {
      return (
        e.title.toLowerCase().includes(q) ||
        (e.venue && e.venue.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.committee && e.committee.toLowerCase().includes(q)) ||
        (e.participants && e.participants.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q) ||
        (Boolean(e.eventDate) && e.eventDate!.includes(q))
      );
    });
  }

  public getDashboardCounts() {
    const todayCount = this.getTodayEvents().length;
    const upcomingCount = this.getUpcomingEvents().length;
    const reviewCount = this.getPendingReviewEvents().length;
    const thisWeekCount = this.getEventsThisWeek().length;

    return {
      today: todayCount,
      upcoming: upcomingCount,
      review: reviewCount,
      thisWeek: thisWeekCount,
    };
  }

  public getTelegramMessages(): TelegramMessageEntity[] {
    return [...this.telegramMessages];
  }

  public addTelegramMessage(msg: Omit<TelegramMessageEntity, 'id'>): TelegramMessageEntity {
    const created: TelegramMessageEntity = {
      ...msg,
      id: Date.now(),
    };
    this.telegramMessages.unshift(created);
    this.notify();

    // Async write to Firestore
    try {
      const docRef = doc(db, 'telegramMessages', String(created.id));
      setDoc(docRef, sanitizeForFirestore(created)).catch((err) => {
        console.warn('[Repository] Firestore addTelegramMessage deferred:', err?.message);
      });
    } catch (e) {
      console.warn('[Repository] Firestore addTelegramMessage:', e);
    }

    return created;
  }

  public resetToDefaults(): void {
    this.events = [...INITIAL_EVENTS];
    this.telegramMessages = [...INITIAL_TELEGRAM_MESSAGES];
    this.notify();
  }
}

export const eventRepository = new EventRepository();
