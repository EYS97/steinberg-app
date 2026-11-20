import { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { EventMealConfig, Family, SeudahRegistration } from '@/types';
import { isPendingReg } from '@/lib/familyLimit';
import { useSeudahRegistrations } from './useSeudot';

/** Live per-event meal config (guest-family limits). null = no doc yet — all
 *  limits fall back to the default of 2 at runtime. */
export function useEventMealConfig(eventId: string | null): EventMealConfig | null {
  const [config, setConfig] = useState<EventMealConfig | null>(null);

  useEffect(() => {
    if (!eventId) { setConfig(null); return; }
    const unsub = onSnapshot(
      doc(db, 'eventMealConfig', eventId),
      snap => setConfig(snap.exists() ? ({ id: snap.id, ...snap.data() } as EventMealConfig) : null),
      () => setConfig(null)
    );
    return unsub;
  }, [eventId]);

  return config;
}

/** All meal configs — for the admin requests screen (small collection). */
export function useAllEventMealConfigs(): Record<string, EventMealConfig> {
  const [configs, setConfigs] = useState<Record<string, EventMealConfig>>({});

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'eventMealConfig'),
      snap => {
        const out: Record<string, EventMealConfig> = {};
        snap.docs.forEach(d => { out[d.id] = { id: d.id, ...d.data() } as EventMealConfig; });
        setConfigs(out);
      },
      () => setConfigs({})
    );
    return unsub;
  }, []);

  return configs;
}

/** Pending hosting requests across all events — powers the admin badge + screen. */
export function usePendingMealRequests(): SeudahRegistration[] {
  const { data: registrations } = useSeudahRegistrations();
  return useMemo(() => registrations.filter(isPendingReg), [registrations]);
}

/**
 * Is the current user a host of this event? The household (admins) hosts by
 * default; when a hostFamilyId is configured, either parent of that nuclear
 * family (matched by the family record's email) is a host too.
 */
export function isEventHost(
  config: EventMealConfig | null,
  families: Family[],
  userEmail: string | null | undefined,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (!config?.hostFamilyId || !userEmail) return false;
  const hostFamily = families.find(f => f.id === config.hostFamilyId);
  return !!hostFamily?.email && hostFamily.email.trim().toLowerCase() === userEmail.trim().toLowerCase();
}
