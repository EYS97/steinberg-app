import { describe, it, expect } from 'vitest';
import {
  planDocId,
  toDateStr,
  augustDate,
  formatDayLabel,
  parseDateStr,
  augustWeeks,
  timeToMinutes,
  rangesOverlap,
  isWeekendDate,
  occursOn,
  itemOccurrences,
} from './plan';

describe('planDocId', () => {
  it('builds a deterministic id with zero-padded month', () => {
    expect(planDocId('famA', 2026)).toBe('famA_2026_08');
  });
});

describe('toDateStr / parseDateStr', () => {
  it('round-trips a local date without timezone drift', () => {
    const d = augustDate(2026, 3);
    expect(toDateStr(d)).toBe('2026-08-03');
    expect(toDateStr(parseDateStr('2026-08-03'))).toBe('2026-08-03');
  });
});

describe('formatDayLabel', () => {
  it('renders Hebrew weekday + dd/mm', () => {
    // 2026-08-03 is a Monday → "ב׳"
    expect(formatDayLabel('2026-08-03')).toBe('ב׳ 03/08');
  });
});

describe('augustWeeks', () => {
  const weeks = augustWeeks(2026);

  it('covers all 31 days exactly once, in order', () => {
    const all = weeks.flatMap(w => w.days.map(d => d.dayOfMonth));
    expect(all).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it('starts every week (after the first) on a Sunday', () => {
    weeks.slice(1).forEach(w => {
      expect(parseDateStr(w.start).getDay()).toBe(0);
    });
  });

  it('labels weeks sequentially from 1', () => {
    expect(weeks.map(w => w.index)).toEqual(
      Array.from({ length: weeks.length }, (_, i) => i + 1)
    );
    expect(weeks[0].label).toBe('שבוע 1');
  });

  it('marks Friday and Saturday as weekend', () => {
    // 2026-08-01 is a Saturday
    const aug1 = weeks[0].days.find(d => d.dayOfMonth === 1)!;
    expect(aug1.isWeekend).toBe(true);
    // 2026-08-03 is a Monday
    const aug3 = weeks.flatMap(w => w.days).find(d => d.dayOfMonth === 3)!;
    expect(aug3.isWeekend).toBe(false);
  });
});

describe('timeToMinutes', () => {
  it('parses valid times', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('08:30')).toBe(510);
    expect(timeToMinutes('00:00')).toBe(0);
  });
  it('returns NaN for malformed input', () => {
    expect(timeToMinutes('25:00')).toBeNaN();
    expect(timeToMinutes('abc')).toBeNaN();
    expect(timeToMinutes('8')).toBeNaN();
  });
});

describe('isWeekendDate', () => {
  it('flags Friday and Saturday only', () => {
    expect(isWeekendDate('2026-08-01')).toBe(true);  // Sat
    expect(isWeekendDate('2026-08-07')).toBe(true);  // Fri
    expect(isWeekendDate('2026-08-03')).toBe(false); // Mon
    expect(isWeekendDate('2026-08-02')).toBe(false); // Sun
  });
});

describe('occursOn / itemOccurrences', () => {
  it('single-day item occurs only on its date', () => {
    const span = { date: '2026-08-10' };
    expect(occursOn(span, '2026-08-10')).toBe(true);
    expect(occursOn(span, '2026-08-11')).toBe(false);
    expect(itemOccurrences(span)).toEqual(['2026-08-10']);
  });

  it('multi-day range includes every day by default', () => {
    const span = { date: '2026-08-10', endDate: '2026-08-12' };
    expect(itemOccurrences(span)).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
  });

  it('honors daysOfWeek (e.g. a Sun–Thu camp skips Fri/Sat)', () => {
    // Aug 9 (Sun) – Aug 15 (Sat), weekdays Sun..Thu = [0,1,2,3,4]
    const span = { date: '2026-08-09', endDate: '2026-08-15', daysOfWeek: [0, 1, 2, 3, 4] };
    const occ = itemOccurrences(span);
    expect(occ).toEqual(['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13']);
    expect(occ).not.toContain('2026-08-14'); // Fri
    expect(occ).not.toContain('2026-08-15'); // Sat
  });
});

describe('rangesOverlap', () => {
  it('detects overlap', () => {
    expect(rangesOverlap('08:00', '12:00', '11:00', '14:00')).toBe(true);
  });
  it('treats adjacent ranges as non-overlapping', () => {
    expect(rangesOverlap('08:00', '12:00', '12:00', '14:00')).toBe(false);
  });
  it('detects disjoint ranges', () => {
    expect(rangesOverlap('08:00', '10:00', '11:00', '14:00')).toBe(false);
  });
  it('is safe on malformed times', () => {
    expect(rangesOverlap('xx', '10:00', '11:00', '14:00')).toBe(false);
  });
});
