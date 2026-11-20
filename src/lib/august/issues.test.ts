import { describe, it, expect } from 'vitest';
import { detectIssues, gapsWithin, dayStatus, summarize } from './issues';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

const members: AugustMember[] = [
  { id: 'dad', name: 'אלי', role: 'parent' },
  { id: 'mom', name: 'אמונה', role: 'parent' },
  { id: 'kid', name: 'עדי', role: 'child' },
];
const plan = { members, coverageStart: '08:00', coverageEnd: '20:00' };

function item(p: Partial<AugustTimelineItem>): AugustTimelineItem {
  return {
    id: Math.random().toString(36).slice(2),
    planId: 'p', nuclearFamilyId: 'f',
    date: '2026-08-03', personId: 'kid', type: 'קייטנה',
    title: 'קייטנה', startTime: '08:00', endTime: '14:00',
    ...p,
  };
}

describe('gapsWithin', () => {
  it('finds the uncovered tail', () => {
    expect(gapsWithin([[480, 840]], 480, 1200)).toEqual([[840, 1200]]);
  });
  it('finds a hole between two blocks', () => {
    expect(gapsWithin([[480, 840], [1020, 1200]], 480, 1200)).toEqual([[840, 1020]]);
  });
  it('returns nothing when fully covered', () => {
    expect(gapsWithin([[480, 1200]], 480, 1200)).toEqual([]);
  });
  it('merges overlapping covers before computing gaps', () => {
    expect(gapsWithin([[480, 900], [840, 1200]], 480, 1200)).toEqual([]);
  });
});

describe('detectIssues — coverage gaps', () => {
  it('flags a child uncovered after camp ends, with dropoff+pickup set', () => {
    const items = [item({ pickUpPersonId: 'mom', dropOffPersonId: 'dad' })]; // camp 08-14
    const issues = detectIssues(plan, items);
    const gap = issues.find(i => i.kind === 'coverage_gap');
    expect(gap).toBeTruthy();
    expect(gap!.message).toContain('עדי');
    expect(gap!.message).toContain('14:00–20:00');
    expect(gap!.window).toEqual({ start: '14:00', end: '20:00' });
  });

  it('no gap when child is covered the whole window', () => {
    const items = [
      item({ startTime: '08:00', endTime: '14:00', pickUpPersonId: 'mom', dropOffPersonId: 'dad' }),
      item({ type: 'סבתא', title: 'סבתא', startTime: '14:00', endTime: '20:00' }),
    ];
    const issues = detectIssues(plan, items).filter(i => i.kind === 'coverage_gap');
    expect(issues).toHaveLength(0);
  });

  it('skips empty days entirely (no items = not a gap)', () => {
    expect(detectIssues(plan, [])).toHaveLength(0);
  });

  it('does NOT flag coverage gaps on weekends (kids are with parents)', () => {
    // 2026-08-01 is a Saturday — a lone camp 08–14 would leave a gap on a weekday
    const items = [item({ date: '2026-08-01', pickUpPersonId: 'mom', dropOffPersonId: 'dad' })];
    expect(detectIssues(plan, items).some(i => i.kind === 'coverage_gap')).toBe(false);
  });

  it('does NOT flag gaps on family-holiday days — the family is together, nobody is "on duty"', () => {
    // Camp only 08–14 would normally leave an afternoon gap, but a family
    // holiday on the same day (even partial-hours) marks the whole day covered.
    const items = [
      item({}),
      item({ type: 'חופשה משפחתית', title: 'צימר', startTime: '10:00', endTime: '12:00' }),
    ];
    expect(detectIssues(plan, items).some(i => i.kind === 'coverage_gap')).toBe(false);
  });

  it('a multi-day family holiday suppresses gaps for every child on each of its days', () => {
    const items = [
      // Only dad's legacy copy exists — the date is still a family-holiday day for all.
      item({
        personId: 'dad', type: 'חופשה משפחתית', title: 'אילת',
        date: '2026-08-03', endDate: '2026-08-05', startTime: '08:00', endTime: '20:00',
      }),
      // A lone morning camp for the kid inside the holiday — no afternoon gap flagged.
      item({ date: '2026-08-04' }),
    ];
    expect(detectIssues(plan, items).some(i => i.kind === 'coverage_gap')).toBe(false);
  });

  it('flags a multi-day camp gap on each weekday it runs', () => {
    // Camp Mon–Wed 08–14, no afternoon cover → a gap each of the 3 weekdays
    const items = [item({
      date: '2026-08-03', endDate: '2026-08-05',
      pickUpPersonId: 'mom', dropOffPersonId: 'dad',
    })];
    const gaps = detectIssues(plan, items).filter(i => i.kind === 'coverage_gap');
    expect(gaps.map(g => g.date)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
  });
});

describe('detectIssues — parent conflict', () => {
  it('flags a parent who works while responsible for a child, as yellow (a decision, not a hole)', () => {
    const items = [
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '09:00', endTime: '17:00' }),
      item({ personId: 'kid', type: 'בית', title: 'בבית', startTime: '15:00', endTime: '17:00', responsiblePersonId: 'dad' }),
    ];
    const conflict = detectIssues(plan, items).find(i => i.kind === 'conflict');
    expect(conflict).toBeTruthy();
    expect(conflict!.severity).toBe('yellow');
    expect(conflict!.message).toContain('אלי');
    expect(conflict!.message).toContain('15:00–17:00');
  });

  it('only coverage gaps are red — red means true uncovered child time', () => {
    const items = [
      item({ pickUpPersonId: 'mom', dropOffPersonId: 'dad' }), // camp 08-14, gap after
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '09:00', endTime: '12:00' }),
      item({ personId: 'dad', type: 'אירוע', title: 'פגישה', startTime: '11:00', endTime: '13:00' }),
    ];
    const reds = detectIssues(plan, items).filter(i => i.severity === 'red');
    expect(reds.length).toBeGreaterThan(0);
    expect(reds.every(i => i.kind === 'coverage_gap')).toBe(true);
  });
});

describe('detectIssues — pickup / drop-off', () => {
  it('flags a camp missing both pickup and dropoff as info-only logistics', () => {
    const issues = detectIssues(plan, [item({})]);
    const pickup = issues.find(i => i.kind === 'missing_pickup');
    const dropoff = issues.find(i => i.kind === 'missing_dropoff');
    expect(pickup?.severity).toBe('info');
    expect(dropoff?.severity).toBe('info');
  });

  it('missing pickup/dropoff never marks the day uncovered', () => {
    // Fully covered day (camp 08-14 + grandma 14-20) with no drivers assigned.
    const items = [
      item({ startTime: '08:00', endTime: '14:00' }),
      item({ type: 'סבתא', title: 'סבתא', startTime: '14:00', endTime: '20:00' }),
    ];
    const issues = detectIssues(plan, items);
    expect(dayStatus(issues, true)).toBe('green');
  });
  it('does not flag when both are set', () => {
    const issues = detectIssues(plan, [item({ pickUpPersonId: 'mom', dropOffPersonId: 'dad', endTime: '20:00' })]);
    expect(issues.some(i => i.kind === 'missing_pickup' || i.kind === 'missing_dropoff')).toBe(false);
  });
});

describe('detectIssues — double-booking', () => {
  it('flags two overlapping items for the same person', () => {
    const items = [
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '09:00', endTime: '12:00' }),
      item({ personId: 'dad', type: 'אירוע', title: 'פגישה', startTime: '11:00', endTime: '13:00' }),
    ];
    expect(detectIssues(plan, items).some(i => i.kind === 'overlap')).toBe(true);
  });
});

describe('dayStatus & summarize', () => {
  it('escalates red over yellow over green; info never colors the day', () => {
    expect(dayStatus([{ id: '1', date: 'd', severity: 'red', kind: 'coverage_gap', message: '' }], true)).toBe('red');
    expect(dayStatus([{ id: '1', date: 'd', severity: 'yellow', kind: 'overlap', message: '' }], true)).toBe('yellow');
    expect(dayStatus([{ id: '1', date: 'd', severity: 'info', kind: 'missing_pickup', message: '' }], true)).toBe('green');
    expect(dayStatus([], true)).toBe('green');
    expect(dayStatus([], false)).toBe('empty');
  });

  it('counts days by worst severity, excluding logistics from open issues', () => {
    const issues = [
      { id: '1', date: '2026-08-03', severity: 'red' as const, kind: 'coverage_gap' as const, message: '' },
      { id: '2', date: '2026-08-04', severity: 'yellow' as const, kind: 'overlap' as const, message: '' },
      { id: '3', date: '2026-08-05', severity: 'info' as const, kind: 'missing_pickup' as const, message: '' },
    ];
    const s = summarize(issues, new Set(['2026-08-03', '2026-08-04', '2026-08-05']));
    expect(s).toEqual({ covered: 1, attention: 1, gaps: 1, openIssues: 2 });
  });
});
