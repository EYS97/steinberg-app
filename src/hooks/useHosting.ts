import { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { HostingAvailability, HostingRequest, RequestStatus } from '@/types';

export function useHosting() {
  const [availability, setAvailability] = useState<HostingAvailability[]>([]);
  const [requests, setRequests] = useState<HostingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loaded = 0;
    const check = () => { if (++loaded >= 2) setLoading(false); };

    const q1 = query(collection(db, 'hostingAvailability'), orderBy('createdAt', 'desc'));
    const unsub1 = onSnapshot(q1, (snap) => {
      setAvailability(snap.docs.map(d => ({ id: d.id, ...d.data() }) as HostingAvailability));
      check();
    });

    const q2 = query(collection(db, 'hostingRequests'), orderBy('createdAt', 'desc'));
    const unsub2 = onSnapshot(q2, (snap) => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as HostingRequest));
      check();
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  return { availability, requests, loading };
}

export async function createHostingAvailability(
  data: Omit<HostingAvailability, 'id' | 'createdAt' | 'status'>
): Promise<void> {
  await addDoc(collection(db, 'hostingAvailability'), {
    ...data,
    status: 'available',
    createdAt: serverTimestamp(),
  });
}

export async function cancelHostingAvailability(id: string): Promise<void> {
  await updateDoc(doc(db, 'hostingAvailability', id), { status: 'cancelled' });
}

export async function createHostingRequest(
  data: Omit<HostingRequest, 'id' | 'createdAt' | 'status'>
): Promise<void> {
  await addDoc(collection(db, 'hostingRequests'), {
    ...data,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  extra?: Record<string, unknown>
): Promise<void> {
  await updateDoc(doc(db, 'hostingRequests', requestId), {
    status,
    ...extra,
    updatedAt: serverTimestamp(),
  });
}

export async function approveRequestAsHost(requestId: string): Promise<void> {
  await updateRequestStatus(requestId, 'host_approved', { hostApprovedAt: serverTimestamp() });
}

export async function approveRequestAsAdmin(
  requestId: string,
  availabilityId: string,
  capacityMode: string
): Promise<void> {
  await updateRequestStatus(requestId, 'confirmed', { adminApprovedAt: serverTimestamp() });
  if (capacityMode === 'singleFamily') {
    await updateDoc(doc(db, 'hostingAvailability', availabilityId), { status: 'matched' });
  }
}

export async function rejectRequest(
  requestId: string,
  rejectedBy: string,
  reason: string
): Promise<void> {
  await updateRequestStatus(requestId, 'rejected', { rejectedBy, rejectionReason: reason });
}

export async function cancelRequest(requestId: string): Promise<void> {
  await updateRequestStatus(requestId, 'cancelled');
}
