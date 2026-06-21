import { timeToMinutes, minutesToTime, isWeekendDate, itemOccurrences } from './plan';
import {
  COVERING_TYPES, PARENT_BUSY_TYPES,
} from '@/types/august';
import type {
  FamilyAugustPlan, AugustTimelineItem, AugustMember,
} from '@/types/august';

// ── Phase 2 detection engines ──────────────────────────────────────────────
// Pure functions over a plan + its timeline items. They power the "דורש סגירה"
// panel, per-day status badges and the summary tiles. No Firestore, no React.
//
// Design choice — only DAYS WITH ACTIVITY are evaluated. A day with zero items
// is "not yet planned", not a coverage failure; flagging all 31×children empty
// days would bury the real signals. A day counts as active if any member has an
// item on it (so "both parents work, child uncovered" is correctly caught).

export type IssueSeverity = 'red' | 'yellow';
export type IssueKind =
  | 'coverage_gap'
  | 'conflict'
  | 'overlap'
  | 'missing_pickup'
  | 'missing_dropoff';

export interface AugustIssue {
  id: string;
  date: string;
  severity: IssueSeverity;
  kind: IssueKind;
  message: string;
  personId?: string;
  /** For coverage gaps — the uncovered window as "HH:MM" (lets the UI render a clean chip). */
  window?: { start: string; end: string };
}

export type DayStatus = 'green' | 'yellow' | 'red' | 'empty';

/** Camp / sitter items a child is dropped at and collected from. */
const PICKUP_REQUIRED_TYPES = ['קייטנה'] as const;

type Interval = [number, number];

function clampToWindow(items: AugustTimelineItem[], ws: number, we: number): Interval[] {
  return items
    .map(it => [
      Math.max(ws, timeToMinutes(it.startTime)),
      Math.min(we, timeToMinutes(it.endTime)),
    ] as Interval)
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
    else out.push(cur);
  }
  return out;
}

/** Uncovered gaps within [ws,we] given covering intervals. */
export function gapsWithin(intervals: Interval[], ws: number, we: number): Interval[] {
  const merged = mergeIntervals(intervals);
  const gaps: Interval[] = [];
  let cursor = ws;
  for (const [s, e] of merged) {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < we) gaps.push([cursor, we]);
  return gaps;
}

/** Do two items for the same person overlap in time? */
function itemsOverlap(a: AugustTimelineItem, b: AugustTimelineItem): boolean {
  const as = timeToMinutes(a.startTime), ae = timeToMinutes(a.endTime);
  const bs = timeToMinutes(b.startTime), be = timeToMinutes(b.endTime);
  if ([as, ae, bs, be].some(v => Number.isNaN(v))) return false;
  return as < be && bs < ae;
}

/**
 * Expand items onto every day they occur — a multi-day camp lands on each of its
 * days, so per-day coverage/conflict checks see it everywhere it runs.
 */
function expandByDate(items: AugustTimelineItem[]): Map<string, AugustTimelineItem[]> {
  const map = new Map<string, AugustTimelineItem[]>();
  for (const it of items) {
    for (const date of itemOccurrences(it)) {
      const list = map.get(date) ?? [];
      list.push(it);
      map.set(date, list);
    }
  }
  return map;
}

/**
 * All open issues across the plan, sorted by date then severity (red first).
 */
export function detectIssues(
  plan: Pick<FamilyAugustPlan, 'members' | 'coverageStart' | 'coverageEnd'>,
  items: AugustTimelineItem[],
): AugustIssue[] {
  const ws = timeToMinutes(plan.coverageStart || '08:00');
  const we = timeToMinutes(plan.coverageEnd || '20:00');
  const members = plan.members ?? [];
  const children = members.filter(m => m.role === 'child');
  const parents = members.filter(m => m.role === 'parent');
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name ?? '—';

  const byDate = expandByDate(items);
  const issues: AugustIssue[] = [];

  for (const [date, dayItems] of byDate) {
    // ── Coverage gaps per child (weekdays only) ──────────────────────────
    // On Fri/Sat the kids are with the parents, so no coverage is required.
    if (!isWeekendDate(date)) {
      for (const child of children) {
        const covering = dayItems.filter(
          it => it.personId === child.id && COVERING_TYPES.includes(it.type)
        );
        const gaps = gapsWithin(clampToWindow(covering, ws, we), ws, we);
        for (const [s, e] of gaps) {
          issues.push({
            id: `gap_${child.id}_${date}_${s}`,
            date,
            severity: 'red',
            kind: 'coverage_gap',
            personId: child.id,
            window: { start: minutesToTime(s), end: minutesToTime(e) },
            message: `${child.name} ללא כיסוי בין ${minutesToTime(s)}–${minutesToTime(e)}`,
          });
        }
      }
    }

    // ── Parent conflict: work overlapping a care responsibility ──────────
    for (const parent of parents) {
      const work = dayItems.filter(
        it => it.personId === parent.id && PARENT_BUSY_TYPES.includes(it.type)
      );
      const care = dayItems.filter(it => it.responsiblePersonId === parent.id);
      for (const w of work) {
        for (const c of care) {
          if (itemsOverlap(w, c)) {
            const s = Math.max(timeToMinutes(w.startTime), timeToMinutes(c.startTime));
            const e = Math.min(timeToMinutes(w.endTime), timeToMinutes(c.endTime));
            issues.push({
              id: `conflict_${parent.id}_${date}_${c.id}`,
              date,
              severity: 'red',
              kind: 'conflict',
              personId: parent.id,
              message: `${parent.name} משובץ/ת לעבודה ולשמירה על ${nameOf(c.personId)} בין ${minutesToTime(s)}–${minutesToTime(e)}`,
            });
          }
        }
      }
    }

    // ── Same-person double-booking (impossible schedule) ─────────────────
    const byPerson = new Map<string, AugustTimelineItem[]>();
    for (const it of dayItems) {
      const l = byPerson.get(it.personId) ?? [];
      l.push(it);
      byPerson.set(it.personId, l);
    }
    for (const [pid, list] of byPerson) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (itemsOverlap(list[i], list[j])) {
            issues.push({
              id: `overlap_${pid}_${date}_${list[i].id}_${list[j].id}`,
              date,
              severity: 'yellow',
              kind: 'overlap',
              personId: pid,
              message: `${nameOf(pid)}: חפיפה בין "${list[i].title}" ל"${list[j].title}"`,
            });
          }
        }
      }
    }

  }

  // ── Missing pickup / drop-off on camps (once per camp, not per day) ─────
  for (const it of items) {
    if (!PICKUP_REQUIRED_TYPES.includes(it.type as typeof PICKUP_REQUIRED_TYPES[number])) continue;
    if (!it.dropOffPersonId) {
      issues.push({
        id: `dropoff_${it.id}`,
        date: it.date,
        severity: 'yellow',
        kind: 'missing_dropoff',
        personId: it.personId,
        message: `חסרה הורדה ל"${it.title}" (${nameOf(it.personId)})`,
      });
    }
    if (!it.pickUpPersonId) {
      issues.push({
        id: `pickup_${it.id}`,
        date: it.date,
        severity: 'yellow',
        kind: 'missing_pickup',
        personId: it.personId,
        message: `חסר איסוף מ"${it.title}" (${nameOf(it.personId)})`,
      });
    }
  }

  const rank = (s: IssueSeverity) => (s === 'red' ? 0 : 1);
  return issues.sort((a, b) => a.date.localeCompare(b.date) || rank(a.severity) - rank(b.severity));
}

/** Status for one day given its issues and whether it has any items. */
export function dayStatus(dateIssues: AugustIssue[], hasItems: boolean): DayStatus {
  if (dateIssues.some(i => i.severity === 'red')) return 'red';
  if (dateIssues.some(i => i.severity === 'yellow')) return 'yellow';
  return hasItems ? 'green' : 'empty';
}

export interface AugustSummary {
  covered: number;   // active days, no issues
  attention: number; // days with only yellow issues
  gaps: number;      // days with a red issue
  openIssues: number;
}

/** Roll issues up to day-level counts for the summary tiles. */
export function summarize(
  issues: AugustIssue[],
  datesWithItems: Set<string>,
): AugustSummary {
  const redDays = new Set(issues.filter(i => i.severity === 'red').map(i => i.date));
  const yellowDays = new Set(
    issues.filter(i => i.severity === 'yellow').map(i => i.date)
  );
  let covered = 0, attention = 0, gaps = 0;
  for (const date of datesWithItems) {
    if (redDays.has(date)) gaps++;
    else if (yellowDays.has(date)) attention++;
    else covered++;
  }
  return { covered, attention, gaps, openIssues: issues.length };
}
