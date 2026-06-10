import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
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

export async function addBooking(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'bookings'), {
    ...booking,
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
