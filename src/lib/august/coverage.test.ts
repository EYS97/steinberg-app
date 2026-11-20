import { describe, it, expect } from 'vitest';
import { dayCoverage, coverageByDate, monthStats, suggestResponsibleAdult } from './coverage';
import { detectIssues } from './issues';
import { itemOccurrences } from './plan';
import type { AugustIssue } from './issues';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

const members: AugustMember[] = [
  { id: 'dad', name: 'אלי', role: 'parent' },
  { id: 'mom', name: 'אמונה', role: 'parent' },
  { id: 'adi', name: 'עדי', role: 'child' },
  { id: 'noa', name: 'נועה', role: 'child' },
];
const children = members.filter(m => m.role === 'child');
const plan = { members, coverageStart: '08:00', coverageEnd: '20:00' };

function item(p: Partial<AugustTimelineItem>): AugustTimelineItem {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    planId: 'p', nuclearFamilyId: 'f',
    date: '2026-08-03', personId: 'adi', type: 'קייטנה',
    title: 'קייטנה', startTime: '08:00', endTime: '14:00',
    ...p,
  };
}

function gap(date: string, start: string, end: string, personId = 'adi'): AugustIssue {
  return {
    id: `g_${date}_${start}`, date, severity: 'red', kind: 'coverage_gap',
    personId, window: { start, end }, message: '',
  };
}

describe('dayCoverage', () => {
  it('weekend days are weekend regardless of items', () => {
    const d = dayCoverage('2026-08-01', [item({ date: '2026-08-01' })], [], children, new Set());
    expect(d.status).toBe('weekend');
  });

  it('empty days are unplanned, not failures', () => {
    const d = dayCoverage('2026-08-03', [], [], children, new Set());
    expect(d.status).toBe('unplanned');
    expect(d.uncoveredMinutes).toBe(0);
  });

  it('active day with no gaps is covered', () => {
    const d = dayCoverage('2026-08-03', [item({})], [], children, new Set());
    expect(d.status).toBe('covered');
  });

  it('gaps with some coverage → partial, and minutes are summed', () => {
    const issues = [gap('2026-08-03', '14:00', '20:00', 'adi'), gap('2026-08-03', '14:00', '16:00', 'noa')];
    const d = dayCoverage('2026-08-03', [item({})], issues, children, new Set());
    expect(d.status).toBe('partial');
    expect(d.uncoveredMinutes).toBe(360 + 120);
  });

  it('active day where no child has any covering item → uncovered', () => {
    // Only parent work scheduled; both kids fully exposed.
    const work = item({ personId: 'dad', type: 'עבודה', title: 'עבודה' });
    const issues = [gap('2026-08-03', '08:00', '20:00', 'adi'), gap('2026-08-03', '08:00', '20:00', 'noa')];
    const d = dayCoverage('2026-08-03', [work], issues, children, new Set());
    expect(d.status).toBe('uncovered');
  });

  it('logistics issues are carried separately and never affect status', () => {
    const logistics: AugustIssue = {
      id: 'l1', date: '2026-08-03', severity: 'info', kind: 'missing_pickup', message: '',
    };
    const d = dayCoverage('2026-08-03', [item({})], [logistics], children, new Set());
    expect(d.status).toBe('covered');
    expect(d.logistics).toHaveLength(1);
  });

  it('marks family holiday days', () => {
    const d = dayCoverage('2026-08-03', [item({})], [], children, new Set(['2026-08-03']));
    expect(d.isHoliday).toBe(true);
  });
});

describe('coverageByDate + monthStats — counts match the issue engine', () => {
  it('rolls the whole month up consistently with detectIssues', () => {
    // Mon 3rd: camp 08-14 for both kids (afternoon gap each = 6h × 2).
    // Tue 4th: full-day grandma for both kids (covered).
    // Holiday Wed 5th-Thu 6th for the whole family (covered, holiday).
    const items: AugustTimelineItem[] = [
      item({ personId: 'adi' }), item({ personId: 'noa' }),
      item({ personId: 'adi', date: '2026-08-04', type: 'סבתא', title: 'סבתא', startTime: '08:00', endTime: '20:00' }),
      item({ personId: 'noa', date: '2026-08-04', type: 'סבתא', title: 'סבתא', startTime: '08:00', endTime: '20:00' }),
      ...members.map(m => item({
        personId: m.id, type: 'חופשה משפחתית', title: 'צימר', groupId: 'g1',
        date: '2026-08-05', endDate: '2026-08-06', startTime: '08:00', endTime: '20:00',
      })),
    ];
    const issues = detectIssues(plan, items);
    const itemsByDay = new Map<string, AugustTimelineItem[]>();
    for (const it of items) {
      for (const d of itemOccurrences(it)) {
        itemsByDay.set(d, [...(itemsByDay.get(d) ?? []), it]);
      }
    }
    const issuesByDate = new Map<string, AugustIssue[]>();
    for (const i of issues) issuesByDate.set(i.date, [...(issuesByDate.get(i.date) ?? []), i]);

    const dates = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
    const cov = coverageByDate(dates, itemsByDay, issuesByDate, members, items);
    const stats = monthStats(cov, members);

    expect(stats.totalChildren).toBe(2);
    expect(stats.totalMembers).toBe(4);
    expect(stats.coveredDays).toBe(3);        // 4th, 5th, 6th
    expect(stats.partialDays).toBe(1);        // 3rd
    expect(stats.uncoveredDays).toBe(0);
    expect(stats.holidayDays).toBe(2);        // 5th–6th
    expect(stats.unresolvedGaps).toBe(2);     // one afternoon gap per child
    expect(stats.uncoveredChildHours).toBe(12); // 6h × 2 kids
    // Camps missing both drivers: 2 camps × 2 legs (multi-day camp counts once).
    expect(stats.missingLogistics).toBe(4);
    // The rollup must agree with the raw issue list — counts match the timeline.
    expect(stats.unresolvedGaps).toBe(issues.filter(i => i.kind === 'coverage_gap').length);
  });
});

describe('suggestResponsibleAdult', () => {
  const window = { start: '14:00', end: '20:00' };

  it('suggests a free parent for the gap window', () => {
    const items = [item({})];
    expect(suggestResponsibleAdult(items, '2026-08-03', window, members)?.role).toBe('parent');
  });

  it('skips a parent who works during the window', () => {
    const items = [
      item({}),
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '08:00', endTime: '18:00' }),
    ];
    expect(suggestResponsibleAdult(items, '2026-08-03', window, members)?.id).toBe('mom');
  });

  it('skips an adult already responsible for another child in the window', () => {
    const items = [
      item({}),
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '08:00', endTime: '18:00' }),
      item({ personId: 'noa', type: 'הורה', title: 'עם אמא', startTime: '14:00', endTime: '20:00', responsiblePersonId: 'mom' }),
    ];
    expect(suggestResponsibleAdult(items, '2026-08-03', window, members)).toBeNull();
  });

  it('prefers the less-loaded parent', () => {
    const items = [
      item({ personId: 'adi', type: 'בית', title: 'בית', startTime: '08:00', endTime: '10:00', responsiblePersonId: 'dad' }),
    ];
    expect(suggestResponsibleAdult(items, '2026-08-03', window, members)?.id).toBe('mom');
  });

  it('falls back to grandparent/sitter when parents are busy', () => {
    const withGrandma = [...members, { id: 'sav', name: 'סבתא רות', role: 'grandparent' as const }];
    const items = [
      item({ personId: 'dad', type: 'עבודה', title: 'עבודה', startTime: '08:00', endTime: '20:00' }),
      item({ personId: 'mom', type: 'עבודה', title: 'עבודה', startTime: '08:00', endTime: '20:00' }),
    ];
    expect(suggestResponsibleAdult(items, '2026-08-03', window, withGrandma)?.id).toBe('sav');
  });
});
