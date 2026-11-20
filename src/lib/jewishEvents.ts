import { Location, Zmanim, isAssurBemlacha } from '@hebcal/core';
import { formatHebrewDate, formatGregorianDate } from './dates';
import type { AppEvent, EventType } from '@/types';

// ── Active / next Jewish event resolver ──────────────────────────────────
// Single source of truth for "which Shabbat or holiday is happening now, or
// is coming up next" — see the feature spec. Every home-screen widget,
// statistic and the WhatsApp report resolves the focus event through here so
// no component independently re-derives "the current Shabbat".
//
// Completion is decided by *halachic* time (Tzeit HaKochavim) in Jerusalem,
// NEVER by midnight or the Gregorian date. All times are computed locally
// with @hebcal/core (NOAA solar algorithm) and returned as absolute Date
// instants, so comparisons against `now` are correct regardless of the
// device timezone.

/** Jerusalem — the app's halachic reference location (Israel schedule). */
export const JERUSALEM: Location =
  Location.lookup('Jerusalem') ??
  new Location(31.778, 35.235, true, 'Asia/Jerusalem', 'Jerusalem', 'IL');

export interface HalachicWindow {
  /** Block onset — sunset on the eve of the FIRST rest day of the block. */
  start: Date;
  /** Conclusion — Tzeit/Havdalah at nightfall of the LAST rest day of the block. */
  end: Date;
  /**
   * Onset of this event's OWN day (sunset on its own eve). Equals `start` for a
   * standalone event, but within a merged multi-day block (e.g. 2-day Rosh
   * Hashana, or Yom Tov adjacent to Shabbat) each sub-event has its own later
   * onset — used to pick the "most current" sub-event to focus.
   */
  ownStart: Date;
}

export interface ResolvedEvent {
  eventId: string;
  type: EventType;
  title: string;
  startDateTime: Date;
  endDateTime: Date;
  /** now is within [start, end] — the event is happening right now. */
  isActiveNow: boolean;
  /** The event has not started yet (start is in the future). */
  isUpcoming: boolean;
  hebrewDate: string;
  gregorianDateRange: string;
  /** The underlying AppEvent (so callers keep the existing eventId/seudot wiring). */
  event: AppEvent;
}

const DAY_MS = 86_400_000;

// ── Zmanim caching ────────────────────────────────────────────────────────
// tzeit/sunset depend only on the civil date, so memoize per "YYYY-MM-DD".
const tzeitCache = new Map<string, Date>();
const sunsetCache = new Map<string, Date>();
const restDayCache = new Map<string, boolean>();

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Nightfall (3 small stars, 8.5°) in Jerusalem on the civil day of `d`. */
function tzeit(d: Date): Date {
  const key = dayKey(d);
  const hit = tzeitCache.get(key);
  if (hit) return hit;
  let result: Date;
  try {
    result = new Zmanim(JERUSALEM, d, false).tzeit();
  } catch {
    // Defensive fallback — never let a zmanim failure crash the home screen.
    result = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 20, 0, 0, 0);
  }
  tzeitCache.set(key, result);
  return result;
}

/** Sunset (shkiah) in Jerusalem on the civil day of `d`. */
function sunset(d: Date): Date {
  const key = dayKey(d);
  const hit = sunsetCache.get(key);
  if (hit) return hit;
  let result: Date;
  try {
    result = new Zmanim(JERUSALEM, d, false).sunset();
  } catch {
    result = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19, 0, 0, 0);
  }
  sunsetCache.set(key, result);
  return result;
}

/** Is the civil day of `noon` a rest day (Shabbat / Yom Tov) in Israel? */
function isRestDay(noon: Date): boolean {
  const key = dayKey(noon);
  const hit = restDayCache.get(key);
  if (hit !== undefined) return hit;
  let result: boolean;
  try {
    // noon is unambiguously daytime, so this is true iff the whole day is
    // assur b'melacha (Shabbat or a Yom Tov day) — not erev, not chol hamoed.
    result = isAssurBemlacha(noon, JERUSALEM, false);
  } catch {
    result = false;
  }
  restDayCache.set(key, result);
  return result;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Civil Y/M/D for an event — preferring the date encoded in its id. */
function civilDateOf(event: AppEvent): { y: number; m: number; d: number } {
  // ids look like `shabbat-2026-06-13`, `holiday-2026-06-13`,
  // or recurring `<srcId>__2026-06-13` — the encoded date is authoritative.
  const m = event.id?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  const dt = event.date?.toDate?.();
  if (dt) return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  const n = new Date();
  return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
}

/**
 * Halachic [start, end] window for an event.
 *
 * For a rest day (Shabbat / Yom Tov) the window spans the *entire contiguous
 * block* of rest days — so a multi-day Yom Tov, a 2-day Rosh Hashana, and a
 * Yom Tov adjacent to Shabbat are all treated as one continuous period that
 * stays active until the final day's Tzeit.
 *
 * For a non-rest "holiday" (e.g. Chanukah/Purim) or a manual event, the
 * window is its civil day, rolling over at that night's Tzeit.
 */
export function eventHalachicWindow(event: AppEvent): HalachicWindow {
  const { y, m, d } = civilDateOf(event);
  const baseNoon = new Date(y, m - 1, d, 12, 0, 0, 0);

  if (isRestDay(baseNoon)) {
    let first = baseNoon;
    while (isRestDay(addDays(first, -1))) first = addDays(first, -1);
    let last = baseNoon;
    while (isRestDay(addDays(last, 1))) last = addDays(last, 1);
    return {
      start: sunset(addDays(first, -1)),
      end: tzeit(last),
      ownStart: sunset(addDays(baseNoon, -1)),
    };
  }

  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  return { start: dayStart, end: tzeit(baseNoon), ownStart: dayStart };
}

/** True once `now` has passed the event's halachic conclusion. */
export function hasHalachicallyEnded(event: AppEvent, now: Date): boolean {
  return eventHalachicWindow(event).end.getTime() <= now.getTime();
}

/** True while the event is still active or yet to come (has not ended). */
export function isActiveOrUpcoming(event: AppEvent, now: Date): boolean {
  return !hasHalachicallyEnded(event, now);
}

function gregorianRange(start: Date, end: Date): string {
  // The displayed range is the rest day(s) themselves: the day after the
  // sunset onset through the day of Tzeit.
  const firstDay = addDays(start, 1);
  if (firstDay.toDateString() === end.toDateString()) {
    return formatGregorianDate(end, 'long');
  }
  return `${formatGregorianDate(firstDay, 'short')} – ${formatGregorianDate(end, 'long')}`;
}

function build(event: AppEvent, w: HalachicWindow, isActiveNow: boolean): ResolvedEvent {
  return {
    eventId: event.id,
    type: event.type,
    title: event.title,
    startDateTime: w.start,
    endDateTime: w.end,
    isActiveNow,
    isUpcoming: !isActiveNow,
    hebrewDate: formatHebrewDate(event.date?.toDate?.() ?? w.end),
    gregorianDateRange: gregorianRange(w.start, w.end),
    event,
  };
}

/**
 * The Jewish event to focus the home screen on:
 *   A. an event active right now (within its halachic window), else
 *   B. the chronologically nearest future event.
 *
 * When several events share one continuous block (e.g. Yom Tov → Shabbat),
 * the most "current" sub-event is chosen — the latest one that has already
 * begun — so Saturday shows Shabbat rather than the chag that started Friday.
 *
 * Returns one of the passed events (preserving its existing eventId), or
 * null when there is no Shabbat/holiday in range.
 */
export function getActiveOrNextJewishEvent(
  events: AppEvent[],
  now: Date = new Date()
): ResolvedEvent | null {
  const candidates = events
    .filter(e => e.type === 'shabbat' || e.type === 'holiday')
    .map(e => ({ e, w: eventHalachicWindow(e) }))
    .sort((a, b) => a.w.start.getTime() - b.w.start.getTime());

  const nowMs = now.getTime();

  const active = candidates.filter(
    c => nowMs >= c.w.start.getTime() && nowMs <= c.w.end.getTime()
  );
  if (active.length) {
    // Focus the most current sub-event: the latest one whose OWN day has begun.
    // (In a merged block all sub-events share `start`, so tiebreak on ownStart.)
    const started = active.filter(c => c.w.ownStart.getTime() <= nowMs);
    const pool = started.length ? started : active;
    const chosen = pool.reduce((a, b) =>
      b.w.ownStart.getTime() > a.w.ownStart.getTime() ? b : a
    );
    return build(chosen.e, chosen.w, true);
  }

  const future = candidates
    .filter(c => c.w.start.getTime() > nowMs)
    .sort((a, b) => a.w.start.getTime() - b.w.start.getTime())[0];
  if (future) return build(future.e, future.w, false);

  return null;
}

/** Clear memoized zmanim — only needed in tests that change the clock. */
export function _clearJewishEventCaches(): void {
  tzeitCache.clear();
  sunsetCache.clear();
  restDayCache.clear();
}
