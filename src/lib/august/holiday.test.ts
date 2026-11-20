import { describe, it, expect } from 'vitest';
import {
  holidayGroupKey, holidayGroup, familyHolidayDates, holidayOnDate, isFamilyHoliday,
} from './holiday';
import type { AugustTimelineItem } from '@/types/august';

function item(p: Partial<AugustTimelineItem>): AugustTimelineItem {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    planId: 'p', nuclearFamilyId: 'f',
    date: '2026-08-10', personId: 'kid', type: 'חופשה משפחתית',
    title: 'צימר בצפון', startTime: '08:00', endTime: '20:00',
    ...p,
  };
}

describe('holidayGroupKey', () => {
  it('uses the explicit groupId when present', () => {
    expect(holidayGroupKey(item({ groupId: 'abc' }))).toBe('g:abc');
  });
  it('falls back to the legacy tuple for old copies', () => {
    expect(holidayGroupKey(item({ endDate: '2026-08-12' })))
      .toBe('legacy:צימר בצפון|2026-08-10|2026-08-12');
  });
  it('is null for non-holiday items', () => {
    expect(holidayGroupKey(item({ type: 'קייטנה' }))).toBeNull();
  });
});

describe('holidayGroup', () => {
  it('collects every copy sharing a groupId', () => {
    const a = item({ groupId: 'g1', personId: 'dad' });
    const b = item({ groupId: 'g1', personId: 'kid' });
    const other = item({ groupId: 'g2', personId: 'kid', title: 'אחר' });
    expect(holidayGroup([a, b, other], a).map(i => i.personId)).toEqual(['dad', 'kid']);
  });

  it('groups legacy copies by identical title+dates (old fan-out shape)', () => {
    const a = item({ personId: 'dad', endDate: '2026-08-12' });
    const b = item({ personId: 'mom', endDate: '2026-08-12' });
    const different = item({ personId: 'kid', date: '2026-08-20', endDate: '2026-08-21' });
    expect(holidayGroup([a, b, different], a)).toHaveLength(2);
  });

  it('does NOT mix legacy copies with groupId copies of the same title', () => {
    const legacy = item({ personId: 'dad' });
    const tagged = item({ personId: 'mom', groupId: 'g9' });
    expect(holidayGroup([legacy, tagged], legacy)).toHaveLength(1);
  });

  it('returns only the item itself for non-holiday types', () => {
    const camp = item({ type: 'קייטנה', title: 'קייטנה' });
    const twin = item({ type: 'קייטנה', title: 'קייטנה' });
    expect(holidayGroup([camp, twin], camp)).toEqual([camp]);
  });
});

describe('familyHolidayDates', () => {
  it('expands a multi-day holiday onto each of its dates, once per group', () => {
    const a = item({ groupId: 'g1', personId: 'dad', endDate: '2026-08-12' });
    const b = item({ groupId: 'g1', personId: 'kid', endDate: '2026-08-12' });
    expect([...familyHolidayDates([a, b])].sort())
      .toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });
  it('ignores non-holiday items', () => {
    expect(familyHolidayDates([item({ type: 'קייטנה' })]).size).toBe(0);
  });
});

describe('holidayOnDate', () => {
  it('finds the holiday covering a mid-range date', () => {
    const h = item({ endDate: '2026-08-12' });
    expect(holidayOnDate([h], '2026-08-11')?.title).toBe('צימר בצפון');
    expect(holidayOnDate([h], '2026-08-13')).toBeUndefined();
  });
});

describe('isFamilyHoliday', () => {
  it('matches only the family holiday type', () => {
    expect(isFamilyHoliday({ type: 'חופשה משפחתית' })).toBe(true);
    expect(isFamilyHoliday({ type: 'נסיעה' })).toBe(false);
  });
});
