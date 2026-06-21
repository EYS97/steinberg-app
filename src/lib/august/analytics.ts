import { timeToMinutes, parseDateStr, itemOccurrences } from './plan';
import type { AugustWeek } from './plan';
import type { AugustIssue } from './issues';
import type {
  FamilyAugustPlan, AugustTimelineItem, AugustMember, AugustItemType,
} from '@/types/august';

// ── Phase 3 analytics ───────────────────────────────────────────────────────
// Parent/carer workload, cost rollups, vacation-window detection and the
// peace-of-mind score. All pure; powers the analytics cards + summary tiles.

/** Duration of one item in hours (0 if malformed). */
export function itemHours(it: Pick<AugustTimelineItem, 'startTime' | 'endTime'>): number {
  const s = timeToMinutes(it.startTime);
  const e = timeToMinutes(it.endTime);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
  return (e - s) / 60;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Workload ────────────────────────────────────────────────────────────────
export interface MemberWorkload {
  member: AugustMember;
  careHours: number; // hours this member is the responsible carer
}

/**
 * Care hours per non-child member — summed from items where they are the
 * responsiblePersonId. Shows who carries the family's childcare load.
 * Sorted by hours desc; members with zero are kept (so the bar shows everyone).
 */
export function workloadByMember(
  plan: Pick<FamilyAugustPlan, 'members'>,
  items: AugustTimelineItem[],
): MemberWorkload[] {
  const carers = (plan.members ?? []).filter(m => m.role !== 'child');
  const hours = new Map<string, number>();
  for (const it of items) {
    if (!it.responsiblePersonId) continue;
    // Multi-day items accrue their hours on every day they run.
    const days = itemOccurrences(it).length;
    hours.set(it.responsiblePersonId, (hours.get(it.responsiblePersonId) ?? 0) + itemHours(it) * days);
  }
  return carers
    .map(member => ({ member, careHours: round1(hours.get(member.id) ?? 0) }))
    .sort((a, b) => b.careHours - a.careHours);
}

// ── Cost ──────────────────────────────────────────────────────────────────
export interface CostRollup {
  total: number;
  byType: Partial<Record<AugustItemType, number>>;
  byWeek: Record<number, number>; // week.index → total
}

export function costRollup(
  items: AugustTimelineItem[],
  weeks: AugustWeek[],
): CostRollup {
  const byType: Partial<Record<AugustItemType, number>> = {};
  let total = 0;
  for (const it of items) {
    const c = typeof it.cost === 'number' && !Number.isNaN(it.cost) ? it.cost : 0;
    if (c <= 0) continue;
    total += c;
    byType[it.type] = (byType[it.type] ?? 0) + c;
  }
  const byWeek: Record<number, number> = {};
  for (const w of weeks) {
    const days = new Set(w.days.map(d => d.date));
    byWeek[w.index] = items.reduce(
      (s, it) => s + (days.has(it.date) && typeof it.cost === 'number' ? it.cost : 0),
      0
    );
  }
  return { total, byType, byWeek };
}

// ── Vacation windows ────────────────────────────────────────────────────────
export interface VacationWindow {
  start: string;
  end: string;
  length: number;
}

const WORK_TYPES: AugustItemType[] = ['עבודה'];

/**
 * Maximal runs (≥ minLength) of consecutive August days where no parent works
 * and there are no red issues — i.e. the family could travel. Empty days count
 * as free, so windows naturally shrink as work gets scheduled. Longest first.
 */
export function vacationWindows(
  year: number,
  items: AugustTimelineItem[],
  issues: AugustIssue[],
  minLength = 2,
): VacationWindow[] {
  const workDays = new Set<string>();
  for (const it of items) {
    if (WORK_TYPES.includes(it.type)) for (const d of itemOccurrences(it)) workDays.add(d);
  }
  const redDays = new Set(issues.filter(i => i.severity === 'red').map(i => i.date));

  const windows: VacationWindow[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= minLength) {
      windows.push({ start: run[0], end: run[run.length - 1], length: run.length });
    }
    run = [];
  };

  for (let day = 1; day <= 31; day++) {
    const date = `${year}-08-${String(day).padStart(2, '0')}`;
    const free = !workDays.has(date) && !redDays.has(date);
    if (free) run.push(date);
    else flush();
  }
  flush();

  return windows.sort((a, b) => b.length - a.length);
}

// ── Peace of mind ────────────────────────────────────────────────────────────
export type PeaceBand = 'good' | 'attention' | 'problem';

export interface PeaceScore {
  score: number; // 0..100
  band: PeaceBand;
}

const RED_PENALTY = 12;
const YELLOW_PENALTY = 5;

/** 100 minus weighted penalties for open issues. Banded green/yellow/red. */
export function peaceOfMind(issues: AugustIssue[]): PeaceScore {
  const penalty = issues.reduce(
    (p, i) => p + (i.severity === 'red' ? RED_PENALTY : YELLOW_PENALTY),
    0
  );
  const score = Math.max(0, 100 - penalty);
  const band: PeaceBand = score >= 80 ? 'good' : score >= 50 ? 'attention' : 'problem';
  return { score, band };
}

/** Peace score for a single week (issues filtered to the week's date range). */
export function peaceForWeek(issues: AugustIssue[], week: AugustWeek): PeaceScore {
  const start = parseDateStr(week.start).getTime();
  const end = parseDateStr(week.end).getTime();
  const inWeek = issues.filter(i => {
    const t = parseDateStr(i.date).getTime();
    return t >= start && t <= end;
  });
  return peaceOfMind(inWeek);
}

export const PEACE_LABEL: Record<PeaceBand, string> = {
  good:      'רגוע 🟢',
  attention: 'דורש תשומת לב 🟡',
  problem:   'בעייתי 🔴',
};

export const PEACE_EMOJI: Record<PeaceBand, string> = {
  good: '😌', attention: '😬', problem: '😰',
};
