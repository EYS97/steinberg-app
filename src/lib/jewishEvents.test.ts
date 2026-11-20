import { describe, it, expect, beforeEach } from 'vitest';
import { isAssurBemlacha } from '@hebcal/core';
import {
  JERUSALEM,
  eventHalachicWindow,
  getActiveOrNextJewishEvent,
  hasHalachicallyEnded,
  isActiveOrUpcoming,
  _clearJewishEventCaches,
} from './jewishEvents';
import type { AppEvent } from '@/types';

// ── Test helpers ──────────────────────────────────────────────────────────
function ts(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { toDate: () => d } as AppEvent['date'];
}
function shabbat(dateStr: string): AppEvent {
  return { id: `shabbat-${dateStr}`, title: 'שבת', type: 'shabbat', date: ts(dateStr), notes: '' };
}
function holiday(dateStr: string, title = 'חג'): AppEvent {
  return { id: `holiday-${dateStr}`, title, type: 'holiday', date: ts(dateStr), notes: '' };
}
function noon(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
function isRest(d: Date): boolean {
  return isAssurBemlacha(d, JERUSALEM, false);
}
function jslHour(d: Date): number {
  return Number(d.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Jerusalem' }));
}
function jslWeekday(d: Date): number {
  // 0 = Sunday … 6 = Saturday, in Jerusalem
  const wd = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Jerusalem' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/** Scan forward for two consecutive civil rest days (RH / chag+Shabbat). */
function findAdjacentRestDays(): { first: Date; second: Date } {
  const cur = noon(2026, 9, 1);
  for (let i = 0; i < 420; i++) {
    const next = new Date(cur);
    next.setDate(next.getDate() + 1);
    if (isRest(cur) && isRest(next)) return { first: new Date(cur), second: next };
    cur.setDate(cur.getDate() + 1);
  }
  throw new Error('no adjacent rest days found in range');
}

/** Scan forward for a standalone single rest day (neighbors not rest days). */
function findStandaloneRestDay(): Date {
  const cur = noon(2026, 5, 1);
  for (let i = 0; i < 420; i++) {
    const prev = new Date(cur); prev.setDate(prev.getDate() - 1);
    const next = new Date(cur); next.setDate(next.getDate() + 1);
    if (isRest(cur) && !isRest(prev) && !isRest(next)) return new Date(cur);
    cur.setDate(cur.getDate() + 1);
  }
  throw new Error('no standalone rest day found in range');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

beforeEach(() => _clearJewishEventCaches());

describe('eventHalachicWindow — Shabbat', () => {
  // A plain Shabbat with no adjacent Yom Tov. 2026-06-13 is a Saturday.
  const sat = shabbat('2026-06-13');

  it('starts Friday evening and ends Saturday night in Jerusalem', () => {
    const w = eventHalachicWindow(sat);
    expect(w.end.getTime()).toBeGreaterThan(w.start.getTime());
    expect(jslWeekday(w.start)).toBe(5); // Friday onset
    expect(jslWeekday(w.end)).toBe(6);   // Saturday nightfall
    // Sunset onset late afternoon, Tzeit after dark — sanity ranges (summer).
    expect(jslHour(w.start)).toBeGreaterThanOrEqual(17);
    expect(jslHour(w.end)).toBeGreaterThanOrEqual(19);
    expect(jslHour(w.end)).toBeLessThanOrEqual(22);
  });
});

describe('getActiveOrNextJewishEvent — Shabbat edge cases', () => {
  const events = [shabbat('2026-06-13'), shabbat('2026-06-20')];
  const w = eventHalachicWindow(events[0]);

  it('Case 1 — Friday before candle-lighting: shows upcoming Shabbat', () => {
    const now = new Date(w.start.getTime() - 3 * 3600_000);
    const r = getActiveOrNextJewishEvent(events, now)!;
    expect(r.eventId).toBe('shabbat-2026-06-13');
    expect(r.isActiveNow).toBe(false);
    expect(r.isUpcoming).toBe(true);
  });

  it('Cases 2/3 — Shabbat day before Tzeit: shows current Shabbat as active', () => {
    const now = new Date(w.end.getTime() - 2 * 3600_000); // Saturday afternoon
    const r = getActiveOrNextJewishEvent(events, now)!;
    expect(r.eventId).toBe('shabbat-2026-06-13');
    expect(r.isActiveNow).toBe(true);
  });

  it('Case 4 — Saturday after Tzeit: switches to next event', () => {
    const now = new Date(w.end.getTime() + 60_000); // one minute after Havdalah
    const r = getActiveOrNextJewishEvent(events, now)!;
    expect(r.eventId).toBe('shabbat-2026-06-20');
    expect(r.isUpcoming).toBe(true);
  });

  it('Case 9 — opening right after Havdalah never shows the ended Shabbat', () => {
    const now = new Date(w.end.getTime() + 60_000);
    expect(hasHalachicallyEnded(events[0], now)).toBe(true);
    expect(isActiveOrUpcoming(events[0], now)).toBe(false);
  });
});

describe('eventHalachicWindow — single-day holiday (Case 5)', () => {
  it('stays active until its own Tzeit, then ends', () => {
    const day = findStandaloneRestDay();
    const ev = holiday(ymd(day));
    const w = eventHalachicWindow(ev);
    expect(jslWeekday(w.end)).toBe(jslWeekday(day));
    const duringDay = new Date(w.end.getTime() - 2 * 3600_000);
    const afterNight = new Date(w.end.getTime() + 60_000);
    expect(getActiveOrNextJewishEvent([ev], duringDay)?.isActiveNow).toBe(true);
    expect(hasHalachicallyEnded(ev, afterNight)).toBe(true);
  });
});

describe('multi-day / continuation blocks (Cases 6/7/8)', () => {
  it('merges two adjacent rest days into one continuous window', () => {
    const { first, second } = findAdjacentRestDays();
    const evFirst = holiday(ymd(first), 'יום א׳');
    const evSecond = isRest(new Date(second)) && jslWeekday(second) === 6
      ? shabbat(ymd(second))
      : holiday(ymd(second), 'יום ב׳');

    const wFirst = eventHalachicWindow(evFirst);
    const wSecond = eventHalachicWindow(evSecond);

    // Both days share the same continuous block: identical onset and conclusion.
    expect(wFirst.end.getTime()).toBe(wSecond.end.getTime());
    expect(wFirst.start.getTime()).toBe(wSecond.start.getTime());

    // Midday of the first day: still active, and the block end is the SECOND night.
    const midFirst = noon(first.getFullYear(), first.getMonth() + 1, first.getDate());
    expect(isActiveOrUpcoming(evFirst, midFirst)).toBe(true);
    expect(wFirst.end.getTime()).toBeGreaterThan(second.getTime());

    // During the second day the resolver focuses the second (most current) sub-event.
    const midSecond = new Date(wSecond.end.getTime() - 2 * 3600_000);
    const r = getActiveOrNextJewishEvent([evFirst, evSecond], midSecond)!;
    expect(r.eventId).toBe(evSecond.id);
    expect(r.isActiveNow).toBe(true);
  });
});

describe('resolver returns existing event ids', () => {
  it('never invents an id — always one of the passed events', () => {
    const events = [shabbat('2026-06-13'), holiday('2026-06-13', 'חג שבועות')];
    const r = getActiveOrNextJewishEvent(events, new Date('2026-06-10T09:00:00'))!;
    expect(events.some(e => e.id === r.eventId)).toBe(true);
  });
});
