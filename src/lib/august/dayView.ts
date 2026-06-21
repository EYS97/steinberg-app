import { timeToMinutes, occursOn } from './plan';
import type { AugustIssue } from './issues';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

// ── Pure derivations for the people-first Day View ──────────────────────────
// Transportation list, timeline-block geometry, member ordering and the header
// badge — all computed from the plan's items. No Firestore, no React.

/** Items (single- or multi-day) that occur on `date`, sorted by start time. */
export function itemsOnDate(items: AugustTimelineItem[], date: string): AugustTimelineItem[] {
  return items
    .filter(it => occursOn(it, date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

// ── Timeline geometry ───────────────────────────────────────────────────────
export interface BlockGeometry {
  leftPct: number;  // distance from window start (LTR track: 0% = coverageStart)
  widthPct: number;
}

/**
 * Position a time block on an LTR track spanning [winStart,winEnd]. Rendering
 * the track LTR keeps the clock flowing 08→20 naturally even on an RTL page.
 * Clamps to the window so out-of-range blocks stay visible.
 */
export function blockGeometry(
  startTime: string, endTime: string, winStart = '08:00', winEnd = '20:00',
): BlockGeometry | null {
  const ws = timeToMinutes(winStart);
  const we = timeToMinutes(winEnd);
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if ([ws, we, s, e].some(Number.isNaN) || we <= ws) return null;
  const clampedStart = Math.max(ws, Math.min(s, we));
  const clampedEnd = Math.max(ws, Math.min(e, we));
  if (clampedEnd <= clampedStart) return null;
  const span = we - ws;
  return {
    leftPct: ((clampedStart - ws) / span) * 100,
    widthPct: ((clampedEnd - clampedStart) / span) * 100,
  };
}

/** Hour ticks (inclusive) for the timeline axis, e.g. [8,10,…,20]. */
export function axisTicks(winStart = '08:00', winEnd = '20:00', step = 2): number[] {
  const ws = Math.floor(timeToMinutes(winStart) / 60);
  const we = Math.floor(timeToMinutes(winEnd) / 60);
  const out: number[] = [];
  for (let h = ws; h <= we; h += step) out.push(h);
  return out;
}

// ── Member ordering ─────────────────────────────────────────────────────────
const ROLE_RANK: Record<string, number> = { child: 0, parent: 1, grandparent: 2, sitter: 3, other: 4 };

/** Children first (the day's anxiety), then parents, then everyone else. */
export function orderedMembers(members: AugustMember[]): AugustMember[] {
  return [...members].sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9));
}

// ── Transportation ──────────────────────────────────────────────────────────
export interface TransportLeg {
  id: string;
  time: string;            // HH:MM
  kind: 'dropoff' | 'pickup';
  personId: string;
  text: string;            // ready-to-render Hebrew sentence
}

/**
 * Derive the day's drop-offs (at item start) and pickups (at item end) from
 * every item that has a responsible driver assigned, sorted chronologically.
 */
export function transportationForDay(
  items: AugustTimelineItem[],
  date: string,
  members: AugustMember[],
): TransportLeg[] {
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name ?? '—';
  const legs: TransportLeg[] = [];
  for (const it of itemsOnDate(items, date)) {
    if (it.dropOffPersonId) {
      legs.push({
        id: `${it.id}_drop`,
        time: it.startTime,
        kind: 'dropoff',
        personId: it.dropOffPersonId,
        text: `${nameOf(it.dropOffPersonId)} מוריד/ה את ${nameOf(it.personId)} ל${it.title}`,
      });
    }
    if (it.pickUpPersonId) {
      legs.push({
        id: `${it.id}_pick`,
        time: it.endTime,
        kind: 'pickup',
        personId: it.pickUpPersonId,
        text: `${nameOf(it.pickUpPersonId)} אוסף/ת את ${nameOf(it.personId)} מ${it.title}`,
      });
    }
  }
  return legs.sort((a, b) => a.time.localeCompare(b.time));
}

// ── Header badge ──────────────────────────────────────────────────────────────
export type DayBadge = 'covered' | 'attention' | 'uncovered' | 'conflict' | 'empty';

export const DAY_BADGE_LABEL: Record<DayBadge, string> = {
  covered:   '🟢 מכוסה',
  attention: '🟡 דורש החלטה',
  uncovered: '🔴 חוסר כיסוי',
  conflict:  '❌ התנגשות',
  empty:     '⚪ לא מתוכנן',
};

/** Header status for the day — conflict outranks a plain coverage gap. */
export function dayBadge(dateIssues: AugustIssue[], hasItems: boolean): DayBadge {
  if (dateIssues.some(i => i.kind === 'conflict')) return 'conflict';
  if (dateIssues.some(i => i.kind === 'coverage_gap')) return 'uncovered';
  if (dateIssues.some(i => i.severity === 'yellow')) return 'attention';
  return hasItems ? 'covered' : 'empty';
}
