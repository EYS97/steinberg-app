import { timeToMinutes, minutesToTime, occursOn } from './plan';
import { COVERING_TYPES, PARENT_BUSY_TYPES } from '@/types/august';
import type { AugustIssue } from './issues';
import type { AugustItemType, AugustMember, AugustTimelineItem } from '@/types/august';

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

// ── Child coverage bar ──────────────────────────────────────────────────────
// The hero of the people-first day card: one horizontal handoff timeline per
// child answering "who has this child, hour by hour?" — camp → grandma → parent
// → and, crucially, RED holes rendered in place where no one covers. Built on
// the same window-clamping the coverage engine uses, so the bar's gaps line up
// exactly with the red issues in `detectIssues`.

/** Parent-care covering types — labelled by the responsible adult, not the type. */
const PARENT_CARE_TYPES: AugustItemType[] = ['הורה', 'בית', 'חופשה משפחתית'];

export interface CoverageSegment {
  start: string;        // HH:MM
  end: string;          // HH:MM
  leftPct: number;
  widthPct: number;
  covered: boolean;
  type?: AugustItemType; // present when covered
  label: string;         // ready-to-render (entity name, e.g. "קייטנה" / "סבתא" / "אלכס")
  responsiblePersonId?: string;
}

/**
 * Ordered coverage segments for one child across [winStart,winEnd]. Covered
 * stretches carry the source item; the holes between them are `covered:false`
 * gap segments. A child with no covering items yields a single full-window gap.
 * Overlapping covers collapse to the first one's label (the bar shows continuity,
 * not double-booking — that's the timeline's job).
 */
export function coverageSegments(
  items: AugustTimelineItem[],
  date: string,
  childId: string,
  members: AugustMember[],
  winStart = '08:00',
  winEnd = '20:00',
): CoverageSegment[] {
  const ws = timeToMinutes(winStart);
  const we = timeToMinutes(winEnd);
  if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) return [];
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name ?? '—';

  const covering = itemsOnDate(items, date)
    .filter(it => it.personId === childId && COVERING_TYPES.includes(it.type))
    .map(it => ({
      s: Math.max(ws, timeToMinutes(it.startTime)),
      e: Math.min(we, timeToMinutes(it.endTime)),
      it,
    }))
    .filter(b => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s)
    .sort((a, b) => a.s - b.s);

  const span = we - ws;
  const seg = (s: number, e: number, src?: AugustTimelineItem): CoverageSegment => {
    const label = src
      ? (PARENT_CARE_TYPES.includes(src.type) && src.responsiblePersonId
          ? nameOf(src.responsiblePersonId)
          : src.title || src.type)
      : '';
    return {
      start: minutesToTime(s),
      end: minutesToTime(e),
      leftPct: ((s - ws) / span) * 100,
      widthPct: ((e - s) / span) * 100,
      covered: !!src,
      type: src?.type,
      label,
      responsiblePersonId: src?.responsiblePersonId,
    };
  };

  const out: CoverageSegment[] = [];
  let cursor = ws;
  for (const { s, e, it } of covering) {
    if (e <= cursor) continue;            // fully inside an earlier cover
    const start = Math.max(s, cursor);
    if (start > cursor) out.push(seg(cursor, start));      // gap before this cover
    out.push(seg(start, e, it));
    cursor = e;
  }
  if (cursor < we) out.push(seg(cursor, we));               // trailing gap
  return out;
}

// ── Parent work / responsibility timeline ─────────────────────────────────────
// People-first weighting: a parent's WORK is rendered muted, their family
// RESPONSIBILITY prominent. Responsibility is explicit only — a parent is "with
// the kids" when they author a care item (הורה/בית/חופשה משפחתית) or are the
// responsible adult on a child's cover. A merely-not-working parent is NOT
// auto-responsible, so real coverage gaps stay visible.

export interface ParentBlock {
  start: string;
  end: string;
  leftPct: number;
  widthPct: number;
}

export interface ParentTimeline {
  work: ParentBlock[];
  responsibility: ParentBlock[];
}

function mergeMinutes(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [[...sorted[0]] as [number, number]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/**
 * A parent's day split into muted work blocks and prominent responsibility
 * blocks, each merged and positioned on the [winStart,winEnd] track.
 */
export function parentTimeline(
  items: AugustTimelineItem[],
  date: string,
  parentId: string,
  winStart = '08:00',
  winEnd = '20:00',
): ParentTimeline {
  const ws = timeToMinutes(winStart);
  const we = timeToMinutes(winEnd);
  if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) return { work: [], responsibility: [] };
  const span = we - ws;
  const onDay = itemsOnDate(items, date);

  const clamp = (it: AugustTimelineItem): [number, number] | null => {
    const s = Math.max(ws, timeToMinutes(it.startTime));
    const e = Math.min(we, timeToMinutes(it.endTime));
    return Number.isFinite(s) && Number.isFinite(e) && e > s ? [s, e] : null;
  };

  const work: Array<[number, number]> = [];
  const resp: Array<[number, number]> = [];
  for (const it of onDay) {
    if (it.personId === parentId && PARENT_BUSY_TYPES.includes(it.type)) {
      const iv = clamp(it); if (iv) work.push(iv);
    }
    const isSelfCare = it.personId === parentId && PARENT_CARE_TYPES.includes(it.type);
    const isResponsible = it.responsiblePersonId === parentId && COVERING_TYPES.includes(it.type);
    if (isSelfCare || isResponsible) {
      const iv = clamp(it); if (iv) resp.push(iv);
    }
  }

  const toBlocks = (ivs: Array<[number, number]>): ParentBlock[] =>
    mergeMinutes(ivs).map(([s, e]) => ({
      start: minutesToTime(s),
      end: minutesToTime(e),
      leftPct: ((s - ws) / span) * 100,
      widthPct: ((e - s) / span) * 100,
    }));

  return { work: toBlocks(work), responsibility: toBlocks(resp) };
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
