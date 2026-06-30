import { describe, it, expect } from 'vitest';
import {
  itemsOnDate, blockGeometry, axisTicks, orderedMembers,
  transportationForDay, dayBadge, coverageSegments, parentTimeline,
} from './dayView';
import type { AugustMember, AugustTimelineItem } from '@/types/august';
import type { AugustIssue } from './issues';

const members: AugustMember[] = [
  { id: 'dad', name: 'אלי', role: 'parent' },
  { id: 'mom', name: 'אמונה', role: 'parent' },
  { id: 'adi', name: 'עדי', role: 'child' },
];

function item(p: Partial<AugustTimelineItem>): AugustTimelineItem {
  return {
    id: Math.random().toString(36).slice(2),
    planId: 'p', nuclearFamilyId: 'f',
    date: '2026-08-12', personId: 'adi', type: 'קייטנה',
    title: 'קייטנה', startTime: '08:00', endTime: '14:00',
    ...p,
  };
}

describe('itemsOnDate', () => {
  it('includes a multi-day item on a day inside its range, sorted by start', () => {
    const items = [
      item({ startTime: '14:00', endTime: '17:00', title: 'סבתא' }),
      item({ date: '2026-08-10', endDate: '2026-08-14', startTime: '08:00', endTime: '13:00', title: 'מחנה' }),
    ];
    const on12 = itemsOnDate(items, '2026-08-12');
    expect(on12.map(i => i.title)).toEqual(['מחנה', 'סבתא']);
  });
  it('excludes items not occurring that day', () => {
    expect(itemsOnDate([item({ date: '2026-08-11' })], '2026-08-12')).toHaveLength(0);
  });
});

describe('blockGeometry', () => {
  it('positions a block within the window (LTR)', () => {
    // 08–20 window; 14:00–17:00 → left 50%, width 25%
    expect(blockGeometry('14:00', '17:00')).toEqual({ leftPct: 50, widthPct: 25 });
  });
  it('clamps out-of-window blocks', () => {
    const g = blockGeometry('06:00', '22:00')!;
    expect(g.leftPct).toBe(0);
    expect(g.widthPct).toBe(100);
  });
  it('returns null for inverted/invalid ranges', () => {
    expect(blockGeometry('17:00', '14:00')).toBeNull();
    expect(blockGeometry('x', '14:00')).toBeNull();
  });
});

describe('axisTicks', () => {
  it('yields inclusive hour ticks at the step', () => {
    expect(axisTicks('08:00', '20:00', 2)).toEqual([8, 10, 12, 14, 16, 18, 20]);
  });
});

describe('orderedMembers', () => {
  it('puts children before parents', () => {
    expect(orderedMembers(members).map(m => m.id)).toEqual(['adi', 'dad', 'mom']);
  });
});

describe('transportationForDay', () => {
  it('derives drop-offs (at start) and pickups (at end), chronologically', () => {
    const items = [
      item({ startTime: '08:00', endTime: '14:00', dropOffPersonId: 'mom', pickUpPersonId: 'dad' }),
    ];
    const legs = transportationForDay(items, '2026-08-12', members);
    expect(legs.map(l => [l.time, l.kind, l.personId])).toEqual([
      ['08:00', 'dropoff', 'mom'],
      ['14:00', 'pickup', 'dad'],
    ]);
    expect(legs[0].text).toContain('אמונה');
    expect(legs[0].text).toContain('עדי');
  });
  it('omits legs with no assigned driver', () => {
    expect(transportationForDay([item({})], '2026-08-12', members)).toHaveLength(0);
  });
});

describe('coverageSegments', () => {
  it('builds a handoff timeline with a trailing gap', () => {
    // camp 08–14, grandma 14–17 → covered 08–17, gap 17–20
    const items = [
      item({ startTime: '08:00', endTime: '14:00', title: 'קייטנה' }),
      item({ type: 'סבתא', title: 'סבתא', startTime: '14:00', endTime: '17:00' }),
    ];
    const segs = coverageSegments(items, '2026-08-12', 'adi', members, '08:00', '20:00');
    expect(segs.map(s => [s.start, s.end, s.covered])).toEqual([
      ['08:00', '14:00', true],
      ['14:00', '17:00', true],
      ['17:00', '20:00', false],
    ]);
    // gap geometry: starts at 75% of a 12h window, spans the final 25%
    const gap = segs[2];
    expect(gap.leftPct).toBeCloseTo(75);
    expect(gap.widthPct).toBeCloseTo(25);
  });

  it('labels a parent-care slot by the responsible adult, camp by its title', () => {
    const items = [
      item({ startTime: '08:00', endTime: '14:00', title: 'קייטנת ים' }),
      item({ type: 'בית', title: 'בבית', startTime: '14:00', endTime: '20:00', responsiblePersonId: 'dad' }),
    ];
    const segs = coverageSegments(items, '2026-08-12', 'adi', members, '08:00', '20:00');
    expect(segs[0].label).toBe('קייטנת ים');
    expect(segs[1].label).toBe('אלי'); // dad's name, not "בבית"
  });

  it('yields a single full-window gap when nothing covers the child', () => {
    const segs = coverageSegments([], '2026-08-12', 'adi', members);
    expect(segs).toEqual([
      expect.objectContaining({ start: '08:00', end: '20:00', covered: false, leftPct: 0, widthPct: 100 }),
    ]);
  });

  it('ignores work (a parent-occupying type never covers a child)', () => {
    const items = [item({ type: 'עבודה', title: 'עבודה', startTime: '08:00', endTime: '20:00' })];
    const segs = coverageSegments(items, '2026-08-12', 'adi', members);
    expect(segs.every(s => !s.covered)).toBe(true);
  });
});

describe('parentTimeline', () => {
  it('splits a parent day into muted work and prominent responsibility', () => {
    const items = [
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '08:00', endTime: '17:00' }),
      item({ personId: 'adi', type: 'בית', title: 'בבית', startTime: '17:00', endTime: '20:00', responsiblePersonId: 'dad' }),
    ];
    const tl = parentTimeline(items, '2026-08-12', 'dad', '08:00', '20:00');
    expect(tl.work.map(b => [b.start, b.end])).toEqual([['08:00', '17:00']]);
    expect(tl.responsibility.map(b => [b.start, b.end])).toEqual([['17:00', '20:00']]);
  });

  it('does not mark a merely-not-working parent as responsible', () => {
    const items = [item({ personId: 'dad', type: 'חופש מהעבודה', title: 'חופש', startTime: '08:00', endTime: '20:00' })];
    const tl = parentTimeline(items, '2026-08-12', 'dad', '08:00', '20:00');
    expect(tl.work).toHaveLength(0);
    expect(tl.responsibility).toHaveLength(0);
  });
});

describe('dayBadge', () => {
  const gap: AugustIssue = { id: '1', date: 'd', severity: 'red', kind: 'coverage_gap', message: '' };
  const conflict: AugustIssue = { id: '2', date: 'd', severity: 'red', kind: 'conflict', message: '' };
  const yellow: AugustIssue = { id: '3', date: 'd', severity: 'yellow', kind: 'overlap', message: '' };
  it('ranks conflict above a plain coverage gap', () => {
    expect(dayBadge([gap, conflict], true)).toBe('conflict');
    expect(dayBadge([gap], true)).toBe('uncovered');
    expect(dayBadge([yellow], true)).toBe('attention');
    expect(dayBadge([], true)).toBe('covered');
    expect(dayBadge([], false)).toBe('empty');
  });
});
