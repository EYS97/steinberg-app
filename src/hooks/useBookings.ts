import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { Booking } from '@/types';

export function useAllBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'bookings'), (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Booking));
      setLoading(false);
    });
    return unsub;
  }, []);

  return { bookings, loading };
}

export function useBookingsForEvent(eventId: string | null) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) { setBookings([]); setLoading(false); return; }
    const q = query(collection(db, 'bookings'), where('eventId', '==', eventId));
    const unsub = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Booking));
      setLoading(false);
    });
    return unsub;
  }, [eventId]);

  return { bookings, loading };
}

// Sleeping and meals are one registration: when an event is in settings/closedEvents
// it is fully closed. Re-reads the list at write time so stale UI / old links can't bypass.
export async function assertEventOpen(eventId: string, isAdmin = false): Promise<void> {
  if (isAdmin) return;
  const snap = await getDoc(doc(db, 'settings', 'closedEvents'));
  const ids: string[] = snap.exists() ? snap.data().ids || [] : [];
  if (ids.includes(eventId)) {
    throw new Error('ההרשמה לשינה ולסעודות סגורה לאירוע זה');
  }
}

export async function addBooking(
  booking: Omit<Booking, 'id' | 'createdAt'>,
  isAdmin = false
): Promise<void> {
  await assertEventOpen(booking.eventId, isAdmin);
  // Firestore rejects undefined field values; only stamp createdBy when present.
  const { createdBy, ...rest } = booking;
  await addDoc(collection(db, 'bookings'), {
    ...rest,
    ...(createdBy ? { createdBy } : {}),
    createdAt: serverTimestamp(),
  });
}

export async function cancelBooking(id: string): Promise<void> {
  await deleteDoc(doc(db, 'bookings', id));
}

export function useLocks() {
  const [locks, setLocks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'locks'), (snap) => {
      if (snap.exists()) setLocks(snap.data() as Record<string, boolean>);
    });
    return unsub;
  }, []);

  return locks;
}

export function useClosedEvents() {
  const [closedIds, setClosedIds] = useState<string[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'closedEvents'), (snap) => {
      if (snap.exists()) setClosedIds(snap.data().ids || []);
    });
    return unsub;
  }, []);

  return closedIds;
}
