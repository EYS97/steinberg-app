import { describe, it, expect } from 'vitest';
import { buildFamilyEvents, buildFromSources } from './familyEvents';
import type { Birthday, Memorial } from '@/types';

// Fixed reference day so "days remaining" is deterministic.
const TODAY = new Date(2026, 5, 16); // 16 June 2026 (local midnight)

function birthday(p: Partial<Birthday> & Pick<Birthday, 'id' | 'name'>): Birthday {
  return { date: '01-01', ...p };
}
function memorial(p: Partial<Memorial> & Pick<Memorial, 'id' | 'name'>): Memorial {
  return { date: '01-01', calendarType: 'hebrew', ...p };
}

describe('buildFamilyEvents', () => {
  it('returns upcoming events sorted by days remaining', () => {
    const events = buildFamilyEvents(
      [
        birthday({ id: 'a', name: 'יהודה', date: '2008-06-19' }), // +3 days
        birthday({ id: 'b', name: 'דנה', date: '2000-07-01' }),   // +15 days
      ],
      [],
      { today: TODAY }
    );
    expect(events.map(e => e.name)).toEqual(['יהודה', 'דנה']);
    expect(events[0].days).toBe(3);
    expect(events[1].days).toBe(15);
  });

  it('computes age for a Gregorian birthday with a birth year', () => {
    const [e] = buildFamilyEvents(
      [birthday({ id: 'a', name: 'יהודה', date: '2008-06-19' })],
      [],
      { today: TODAY }
    );
    expect(e.kind).toBe('birthday');
    expect(e.count).toBe(18); // turns 18 on 19 June 2026
  });

  it('omits the age when no birth year is recorded (MM-DD)', () => {
    const [e] = buildFamilyEvents(
      [birthday({ id: 'a', name: 'יהודה', date: '06-19' })],
      [],
      { today: TODAY }
    );
    expect(e.count).toBeUndefined();
  });

  it('does not attach an ordinal count to yahrzeits', () => {
    const events = buildFamilyEvents(
      [],
      [memorial({ id: 'm', name: 'חיים', hebrewDate: { day: 5, month: 4, year: 5780 } })],
      { today: TODAY, horizonDays: 400 }
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('yahrzeit');
    expect(events[0].count).toBeUndefined();
  });

  it('excludes events beyond the horizon', () => {
    const events = buildFamilyEvents(
      [birthday({ id: 'a', name: 'רחוק', date: '2000-12-31' })], // ~6 months out
      [],
      { today: TODAY, horizonDays: 30 }
    );
    expect(events).toHaveLength(0);
  });

  it('includes an event happening today (0 days)', () => {
    const [e] = buildFamilyEvents(
      [birthday({ id: 'a', name: 'היום', date: '2010-06-16' })],
      [],
      { today: TODAY }
    );
    expect(e.days).toBe(0);
  });

  it('respects the limit', () => {
    const many: Birthday[] = Array.from({ length: 10 }, (_, i) =>
      birthday({ id: `b${i}`, name: `n${i}`, date: `2000-06-${17 + i}` })
    );
    expect(buildFamilyEvents(many, [], { today: TODAY, limit: 4 })).toHaveLength(4);
  });

  it('merges and interleaves birthdays and yahrzeits chronologically', () => {
    const events = buildFamilyEvents(
      [birthday({ id: 'b', name: 'גיל', date: '2000-06-25' })],
      [memorial({ id: 'm', name: 'חיים', hebrewDate: { day: 5, month: 4, year: 5780 } })],
      { today: TODAY, horizonDays: 400 }
    );
    // sorted ascending by days; both kinds present
    const kinds = new Set(events.map(e => e.kind));
    expect(kinds.has('birthday')).toBe(true);
    expect(kinds.has('yahrzeit')).toBe(true);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].days).toBeGreaterThanOrEqual(events[i - 1].days);
    }
  });

  it('buildFromSources supports arbitrary future event kinds', () => {
    const events = buildFromSources(
      [
        {
          kind: 'anniversary',
          recur: 'birthday',
          withCount: true,
          items: [{ id: 'an', name: 'יעקב ותמר', date: '2002-06-20' }],
        },
      ],
      { today: TODAY }
    );
    expect(events[0].kind).toBe('anniversary');
    expect(events[0].count).toBe(24); // 24th anniversary in 2026
  });
});
