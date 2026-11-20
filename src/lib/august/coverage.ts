import { timeToMinutes, isWeekendDate, occursOn } from './plan';
import { COVERING_TYPES, PARENT_BUSY_TYPES } from '@/types/august';
import { familyHolidayDates } from './holiday';
import type { AugustIssue } from './issues';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

// ── Command-center coverage model ────────────────────────────────────────────
// The single source of truth for "is this day OK?" across the redesigned
// August page: the day rail, the month summary and the actions panel all read
// the same derivations, so the counts always match the visible timeline.
// Everything here is computed FROM detectIssues' coverage_gap windows — the
// same engine that paints the red holes on the child bars — never re-derived
// with different math. Pure functions; no Firestore, no React.

/**
 * Coverage-first day status:
 *   covered   — active weekday, every child-hour has someone responsible
 *   partial   — some coverage exists but red holes remain
 *   uncovered — children have NO coverage at all on an active weekday
 *   weekend   — Fri/Sat, kids are with the parents by definition
 *   unplanned — nothing scheduled yet (a to-do, not a failure)
 */
export type CoverageDayStatus = 'covered' | 'partial' | 'uncovered' | 'weekend' | 'unplanned';

export interface DayCoverage {
  date: string;
  status: CoverageDayStatus;
  /** Red coverage_gap issues on this day. */
  gaps: AugustIssue[];
  /** Total uncovered child-minutes (sum over children). */
  uncoveredMinutes: number;
  /** Info-severity logistics issues dated on this day. */
  logistics: AugustIssue[];
  isHoliday: boolean;
}

function windowMinutes(i: AugustIssue): number {
  if (!i.window) return 0;
  const s = timeToMinutes(i.window.start);
  const e = timeToMinutes(i.window.end);
  return Number.isNaN(s) || Number.isNaN(e) || e <= s ? 0 : e - s;
}

/**
 * Coverage state of one day. `dayItems` are the items occurring on the date,
 * `dateIssues` the issues dated on it (both already expanded per day upstream).
 */
export function dayCoverage(
  date: string,
  dayItems: AugustTimelineItem[],
  dateIssues: AugustIssue[],
  children: AugustMember[],
  holidayDates: Set<string>,
): DayCoverage {
  const gaps = dateIssues.filter(i => i.kind === 'coverage_gap');
  const logistics = dateIssues.filter(i => i.severity === 'info');
  const uncoveredMinutes = gaps.reduce((s, g) => s + windowMinutes(g), 0);
  const isHoliday = holidayDates.has(date);

  let status: CoverageDayStatus;
  if (isWeekendDate(date)) status = 'weekend';
  else if (dayItems.length === 0) status = 'unplanned';
  else if (gaps.length === 0) status = 'covered';
  else {
    // Uncovered = not a single child-hour is covered; partial otherwise.
    const anyChildCovered = children.some(c =>
      dayItems.some(it => it.personId === c.id && COVERING_TYPES.includes(it.type))
    );
    status = anyChildCovered ? 'partial' : 'uncovered';
  }

  return { date, status, gaps, uncoveredMinutes, logistics, isHoliday };
}

/** dayCoverage for every date, keyed by date — one pass for the whole month. */
export function coverageByDate(
  dates: string[],
  itemsByDay: Map<string, AugustTimelineItem[]>,
  issuesByDate: Map<string, AugustIssue[]>,
  members: AugustMember[],
  items: AugustTimelineItem[],
): Map<string, DayCoverage> {
  const children = members.filter(m => m.role === 'child');
  const holidays = familyHolidayDates(items);
  const map = new Map<string, DayCoverage>();
  for (const date of dates) {
    map.set(date, dayCoverage(
      date,
      itemsByDay.get(date) ?? [],
      issuesByDate.get(date) ?? [],
      children,
      holidays,
    ));
  }
  return map;
}

// ── Month rollup — the numbers the summary bar shows ────────────────────────
export interface MonthCoverageStats {
  totalChildren: number;
  totalMembers: number;
  coveredDays: number;
  partialDays: number;
  uncoveredDays: number;
  unplannedDays: number;
  holidayDays: number;
  /** Count of open red coverage_gap issues. */
  unresolvedGaps: number;
  /** Sum of red gap windows, in hours (1 decimal). */
  uncoveredChildHours: number;
  /** Missing optional pickup/dropoff assignments — logistics, counted apart. */
  missingLogistics: number;
}

export function monthStats(
  coverage: Map<string, DayCoverage>,
  members: AugustMember[],
): MonthCoverageStats {
  let coveredDays = 0, partialDays = 0, uncoveredDays = 0, unplannedDays = 0;
  let holidayDays = 0, unresolvedGaps = 0, uncoveredMinutes = 0, missingLogistics = 0;
  for (const day of coverage.values()) {
    switch (day.status) {
      case 'covered':   coveredDays++; break;
      case 'partial':   partialDays++; break;
      case 'uncovered': uncoveredDays++; break;
      case 'unplanned': unplannedDays++; break;
    }
    if (day.isHoliday) holidayDays++;
    unresolvedGaps += day.gaps.length;
    uncoveredMinutes += day.uncoveredMinutes;
    missingLogistics += day.logistics.length;
  }
  return {
    totalChildren: members.filter(m => m.role === 'child').length,
    totalMembers: members.length,
    coveredDays,
    partialDays,
    uncoveredDays,
    unplannedDays,
    holidayDays,
    unresolvedGaps,
    uncoveredChildHours: Math.round((uncoveredMinutes / 60) * 10) / 10,
    missingLogistics,
  };
}

// ── Next action — who should take a gap ─────────────────────────────────────
// Requirement: a parent enters responsibility only when no other valid child
// coverage exists — i.e. exactly when there is a red gap. For each gap we
// suggest the best available adult: not working during the window, not already
// responsible elsewhere in it, least loaded first (fairness), parents before
// grandparents/sitters.

const ADULT_RANK: Record<string, number> = { parent: 0, grandparent: 1, sitter: 2, other: 3 };

export function suggestResponsibleAdult(
  items: AugustTimelineItem[],
  date: string,
  window: { start: string; end: string },
  members: AugustMember[],
): AugustMember | null {
  const ws = timeToMinutes(window.start);
  const we = timeToMinutes(window.end);
  if (Number.isNaN(ws) || Number.isNaN(we) || we <= ws) return null;

  const onDay = items.filter(it => occursOn(it, date));
  const overlapsWindow = (it: AugustTimelineItem): boolean => {
    const s = timeToMinutes(it.startTime);
    const e = timeToMinutes(it.endTime);
    return !Number.isNaN(s) && !Number.isNaN(e) && s < we && ws < e;
  };

  const busy = (adultId: string): boolean =>
    onDay.some(it =>
      overlapsWindow(it) && (
        (it.personId === adultId && PARENT_BUSY_TYPES.includes(it.type)) ||
        (it.responsiblePersonId === adultId && COVERING_TYPES.includes(it.type))
      )
    );

  // Load = how many items this adult is already responsible for this month.
  const load = (adultId: string): number =>
    items.filter(it => it.responsiblePersonId === adultId).length;

  const candidates = members
    .filter(m => m.role !== 'child' && !busy(m.id))
    .sort((a, b) =>
      (ADULT_RANK[a.role] ?? 9) - (ADULT_RANK[b.role] ?? 9) || load(a.id) - load(b.id)
    );
  return candidates[0] ?? null;
}
