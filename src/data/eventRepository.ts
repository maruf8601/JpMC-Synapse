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
import { db } from '../services/firebaseClient';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';

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
    try {
      const eventsCol = collection(db, 'events');
      onSnapshot(
        eventsCol,
        (snapshot) => {
          this.isFirestoreConnected = true;
          if (!snapshot.empty) {
            const remoteEvents: EventEntity[] = [];
            snapshot.forEach((docSnap) => {
              remoteEvents.push(docSnap.data() as EventEntity);
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
          console.warn('[Repository] Firestore events sync running in offline fallback mode:', err?.message);
        }
      );

      const msgsCol = collection(db, 'telegramMessages');
      onSnapshot(
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

    // Call server endpoints as immediate sync fallback
    this.fetchServerUpdates();
  }

  /**
   * Fetch updates from server endpoints (/api/events & /api/telegram/messages)
   * Ensures instant sync across sessions and environments
   */
  public async fetchServerUpdates(): Promise<void> {
    try {
      const [eventsRes, msgsRes] = await Promise.all([
        fetch('/api/events').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/telegram/messages').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      let hasChanged = false;
      if (eventsRes?.events && Array.isArray(eventsRes.events) && eventsRes.events.length > 0) {
        this.events = eventsRes.events;
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
    return this.getApprovedEvents().filter((e) => e.eventDate === TODAY_STR);
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
    return this.getApprovedEvents().filter((e) => Boolean(e.eventDate) && e.eventDate! >= TODAY_STR);
  }

  public getPastEvents(): EventEntity[] {
    return this.getApprovedEvents().filter(
      (e) => Boolean(e.eventDate) && (e.eventDate! < TODAY_STR || e.isCompleted)
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

  public addEvent(newEvent: Omit<EventEntity, 'id' | 'createdAt' | 'updatedAt'>): EventEntity {
    const created: EventEntity = {
      ...newEvent,
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.events.unshift(created);
    this.notify();

    // Async write to Firestore
    try {
      const docRef = doc(db, 'events', created.id);
      setDoc(docRef, sanitizeForFirestore(created)).catch((err) => {
        console.warn('[Repository] Firestore addEvent deferred to local cache:', err?.message);
      });
    } catch (e) {
      console.warn('[Repository] Firestore sync addEvent:', e);
    }

    return created;
  }

  public updateEvent(updated: EventEntity): void {
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    this.events = this.events.map((e) => (e.id === stamped.id ? stamped : e));
    this.notify();

    // Async write to Firestore
    try {
      const docRef = doc(db, 'events', stamped.id);
      setDoc(docRef, sanitizeForFirestore(stamped), { merge: true }).catch((err) => {
        console.warn('[Repository] Firestore updateEvent deferred to local cache:', err?.message);
      });
    } catch (e) {
      console.warn('[Repository] Firestore sync updateEvent:', e);
    }
  }

  public deleteEvent(id: string): void {
    this.events = this.events.filter((e) => e.id !== id);
    this.notify();

    // Async delete from Firestore
    try {
      const docRef = doc(db, 'events', id);
      deleteDoc(docRef).catch((err) => {
        console.warn('[Repository] Firestore deleteEvent deferred to local cache:', err?.message);
      });
    } catch (e) {
      console.warn('[Repository] Firestore sync deleteEvent:', e);
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
