import { useMemo } from 'react';
import { useEvents } from './useEvents';
import { useNow } from './useNow';
import { getActiveOrNextJewishEvent, type ResolvedEvent } from '@/lib/jewishEvents';
import type { AppEvent } from '@/types';

export interface UseActiveEventResult {
  /** The active-or-next Shabbat/holiday, resolved by halachic time. */
  resolved: ResolvedEvent | null;
  /** The full (merged) events list, for callers that also need siblings. */
  events: AppEvent[];
  /** Live "now" — ticks so the focus rolls over without a manual refresh. */
  now: Date;
  loading: boolean;
  error: unknown;
}

/**
 * The home screen's single source of truth for the current Jewish event.
 * Combines the generated/merged events with a live clock and the halachic
 * resolver, so the focus advances to the next event automatically the moment
 * the current one ends (Tzeit in Jerusalem).
 */
export function useActiveEvent(): UseActiveEventResult {
  const { data: events, loading, error } = useEvents();
  const now = useNow();

  const resolved = useMemo(
    () => getActiveOrNextJewishEvent(events, now),
    [events, now]
  );

  return { resolved, events, now, loading, error };
}
