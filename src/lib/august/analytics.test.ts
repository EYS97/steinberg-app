import { describe, it, expect } from 'vitest';
import {
  itemHours, workloadByMember, costRollup, vacationWindows,
  peaceOfMind, peaceForWeek,
} from './analytics';
import { augustWeeks } from './plan';
import type { AugustMember, AugustTimelineItem } from '@/types/august';
import type { AugustIssue } from './issues';

const members: AugustMember[] = [
  { id: 'dad', name: 'אלי', role: 'parent' },
  { id: 'mom', name: 'אמונה', role: 'parent' },
  { id: 'kid', name: 'עדי', role: 'child' },
];

function item(p: Partial<AugustTimelineItem>): AugustTimelineItem {
  return {
    id: Math.random().toString(36).slice(2),
    planId: 'p', nuclearFamilyId: 'f',
    date: '2026-08-03', personId: 'kid', type: 'קייטנה',
    title: 'x', startTime: '08:00', endTime: '14:00',
    ...p,
  };
}

describe('itemHours', () => {
  it('computes duration in hours', () => {
    expect(itemHours({ startTime: '08:00', endTime: '14:00' })).toBe(6);
    expect(itemHours({ startTime: '08:30', endTime: '10:00' })).toBe(1.5);
  });
  it('is 0 for malformed or inverted ranges', () => {
    expect(itemHours({ startTime: '14:00', endTime: '08:00' })).toBe(0);
    expect(itemHours({ startTime: 'x', endTime: '10:00' })).toBe(0);
  });
});

describe('workloadByMember', () => {
  it('sums responsible-carer hours per non-child member, desc', () => {
    const items = [
      item({ responsiblePersonId: 'dad', startTime: '08:00', endTime: '12:00' }), // 4h
      item({ responsiblePersonId: 'mom', startTime: '08:00', endTime: '10:00' }), // 2h
      item({ responsiblePersonId: 'dad', startTime: '14:00', endTime: '16:00' }), // 2h
    ];
    const wl = workloadByMember({ members }, items);
    expect(wl.map(w => [w.member.id, w.careHours])).toEqual([['dad', 6], ['mom', 2]]);
  });
  it('excludes children entirely', () => {
    const wl = workloadByMember({ members }, []);
    expect(wl.some(w => w.member.id === 'kid')).toBe(false);
  });
});

describe('costRollup', () => {
  const weeks = augustWeeks(2026);
  it('totals cost and breaks down by type and week', () => {
    const items = [
      item({ type: 'קייטנה', cost: 500, date: '2026-08-03' }),
      item({ type: 'בייביסיטר', cost: 120, date: '2026-08-03' }),
      item({ type: 'קייטנה', cost: 500, date: '2026-08-10' }),
    ];
    const r = costRollup(items, weeks);
    expect(r.total).toBe(1120);
    expect(r.byType['קייטנה']).toBe(1000);
    expect(r.byType['בייביסיטר']).toBe(120);
    // Aug 3 and Aug 10 fall in different weeks
    const weekTotals = Object.values(r.byWeek).filter(v => v > 0).sort((a, b) => b - a);
    expect(weekTotals).toEqual([620, 500]);
  });
});

describe('vacationWindows', () => {
  it('finds the longest free runs, longest first', () => {
    // Work on Aug 5 and Aug 20 splits the month into runs
    const items = [
      item({ type: 'עבודה', personId: 'dad', title: 'עבודה', date: '2026-08-05' }),
      item({ type: 'עבודה', personId: 'dad', title: 'עבודה', date: '2026-08-20' }),
    ];
    const wins = vacationWindows(2026, items, []);
    expect(wins[0].length).toBeGreaterThanOrEqual(wins[1]?.length ?? 0);
    // Aug 5 and Aug 20 must not appear inside any window
    const allDays = wins.flatMap(w => {
      const out: string[] = [];
      for (let d = Number(w.start.slice(-2)); d <= Number(w.end.slice(-2)); d++) out.push(String(d));
      return out;
    });
    expect(allDays).not.toContain('5');
    expect(allDays).not.toContain('20');
  });
  it('excludes days with a red issue', () => {
    const issues: AugustIssue[] = [
      { id: 'r', date: '2026-08-10', severity: 'red', kind: 'conflict', message: '' },
    ];
    const wins = vacationWindows(2026, [], issues);
    const covers10 = wins.some(w => w.start <= '2026-08-10' && '2026-08-10' <= w.end);
    expect(covers10).toBe(false);
  });
});

describe('peaceOfMind', () => {
  it('is 100 / good with no issues', () => {
    expect(peaceOfMind([])).toEqual({ score: 100, band: 'good' });
  });
  it('penalizes red more than yellow and bands the result', () => {
    const issues: AugustIssue[] = [
      { id: '1', date: 'd', severity: 'red', kind: 'conflict', message: '' },
      { id: '2', date: 'd', severity: 'red', kind: 'coverage_gap', message: '' },
      { id: '3', date: 'd', severity: 'yellow', kind: 'overlap', message: '' },
    ];
    // 100 - 12 - 12 - 5 = 71 → attention
    expect(peaceOfMind(issues)).toEqual({ score: 71, band: 'attention' });
  });
  it('floors at 0', () => {
    const many: AugustIssue[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i), date: 'd', severity: 'red' as const, kind: 'conflict' as const, message: '',
    }));
    expect(peaceOfMind(many).score).toBe(0);
  });
});

describe('peaceForWeek', () => {
  it('only counts issues within the week range', () => {
    const weeks = augustWeeks(2026);
    const w2 = weeks[1];
    const issues: AugustIssue[] = [
      { id: '1', date: w2.start, severity: 'red', kind: 'conflict', message: '' },
      { id: '2', date: '2026-08-31', severity: 'red', kind: 'conflict', message: '' },
    ];
    expect(peaceForWeek(issues, w2).score).toBe(88);
  });
});
