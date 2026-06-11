import { describe, it, expect } from 'vitest';
import {
  convertGregorianToHebrew,
  convertHebrewToGregorian,
  formatHebrewDate,
  formatHebrewDateShort,
  formatHebrewYear,
  formatHebrewMonthYear,
  formatHebrewDateParts,
  hebrewDayLabel,
  hebrewMonthName,
  hebrewMonthsOfYear,
  getHebrewMonthView,
  adjacentHebrewMonth,
  getRecurringHebrewDateOccurrences,
  getRecurringGregorianOccurrences,
  occurrencesInRange,
  hebrewAnniversaryInYear,
  formatGregorianDate,
  formatDateByMode,
  HDate,
  months,
} from './dates';

const GERESH = '׳';    // ׳
const GERSHAYIM = '״'; // ״

describe('conversion', () => {
  it('converts Gregorian to Hebrew (10 June 2026 = 25 Sivan 5786)', () => {
    const h = convertGregorianToHebrew(new Date(2026, 5, 10));
    expect(h.day).toBe(25);
    expect(h.month).toBe(months.SIVAN);
    expect(h.year).toBe(5786);
    expect(h.monthName).toBe('סיוון');
  });

  it('converts Hebrew to Gregorian (Shavuot: 6 Sivan 5786 = 22 May 2026)', () => {
    const g = convertHebrewToGregorian({ day: 6, month: months.SIVAN, year: 5786 });
    expect(g.getFullYear()).toBe(2026);
    expect(g.getMonth()).toBe(4);
    expect(g.getDate()).toBe(22);
  });

  it('converts Hebrew to Gregorian (Pesach: 15 Nisan 5786 = 2 April 2026)', () => {
    const g = convertHebrewToGregorian({ day: 15, month: months.NISAN, year: 5786 });
    expect(g.getFullYear()).toBe(2026);
    expect(g.getMonth()).toBe(3);
    expect(g.getDate()).toBe(2);
  });

  it('round-trips Gregorian → Hebrew → Gregorian', () => {
    for (const d of [new Date(2026, 0, 1), new Date(2026, 5, 10), new Date(2027, 11, 31)]) {
      const h = convertGregorianToHebrew(d);
      const g = convertHebrewToGregorian(h);
      expect(g.toDateString()).toBe(d.toDateString());
    }
  });

  it('folds Adar II into Adar in non-leap years (Purim 5786 = 3 March 2026)', () => {
    const g = convertHebrewToGregorian({ day: 14, month: months.ADAR_II, year: 5786 });
    expect(g.getFullYear()).toBe(2026);
    expect(g.getMonth()).toBe(2);
    expect(g.getDate()).toBe(3);
  });

  it('clamps day 30 in 29-day months', () => {
    // Adar in non-leap 5786 has 29 days
    const g = convertHebrewToGregorian({ day: 30, month: months.ADAR_I, year: 5786 });
    const h = convertGregorianToHebrew(g);
    expect(h.day).toBe(29);
  });
});

describe('Hebrew formatting (geresh/gershayim)', () => {
  it('formats full Hebrew date like כ״ה בסיוון ה׳תשפ״ו', () => {
    expect(formatHebrewDate(new Date(2026, 5, 10))).toBe(`כ${GERSHAYIM}ה בסיוון ה${GERESH}תשפ${GERSHAYIM}ו`);
  });

  it('formats short Hebrew date without year', () => {
    expect(formatHebrewDateShort(new Date(2026, 5, 10))).toBe(`כ${GERSHAYIM}ה בסיוון`);
  });

  it('formats Hebrew year with ה׳ thousands prefix', () => {
    expect(formatHebrewYear(5786)).toBe(`ה${GERESH}תשפ${GERSHAYIM}ו`);
  });

  it('formats day labels in gematriya', () => {
    expect(hebrewDayLabel(26)).toBe(`כ${GERSHAYIM}ו`);
    expect(hebrewDayLabel(15)).toBe(`ט${GERSHAYIM}ו`); // not יה
    expect(hebrewDayLabel(16)).toBe(`ט${GERSHAYIM}ז`); // not יו
  });

  it('formats month/year header like סיוון ה׳תשפ״ו', () => {
    expect(formatHebrewMonthYear(5786, months.SIVAN)).toBe(`סיוון ה${GERESH}תשפ${GERSHAYIM}ו`);
  });

  it('names Adar correctly in leap vs non-leap years', () => {
    expect(hebrewMonthName(months.ADAR_I, 5786)).toBe('אדר');      // 5786 non-leap
    expect(hebrewMonthName(months.ADAR_I, 5787)).toBe(`אדר א${GERESH}`); // 5787 leap
    expect(hebrewMonthName(months.ADAR_II, 5787)).toBe(`אדר ב${GERESH}`);
  });

  it('formats stored Hebrew date parts (yearless)', () => {
    // single-letter gematriya takes a geresh, not gershayim
    expect(formatHebrewDateParts({ day: 20, month: months.KISLEV })).toBe(`כ${GERESH} בכסלו`);
  });
});

describe('Hebrew month view', () => {
  it('builds Sivan 5786 with 30 days starting on the right weekday', () => {
    const view = getHebrewMonthView(5786, months.SIVAN);
    expect(view.days).toHaveLength(30);
    expect(view.label).toBe(`סיוון ה${GERESH}תשפ${GERSHAYIM}ו`);
    expect(view.days[0].greg.toDateString()).toBe(new HDate(1, months.SIVAN, 5786).greg().toDateString());
    expect(view.startDow).toBe(view.days[0].greg.getDay());
    // day 6 of the view is Shavuot = 22 May 2026
    expect(view.days[5].greg.getDate()).toBe(22);
  });

  it('includes leap-year months in civil order', () => {
    expect(hebrewMonthsOfYear(5786)).toHaveLength(12);
    expect(hebrewMonthsOfYear(5787)).toHaveLength(13);
  });

  it('navigates across the year boundary (Elul → Tishrei)', () => {
    expect(adjacentHebrewMonth(5786, months.ELUL, 1)).toEqual({ year: 5787, month: months.TISHREI });
    expect(adjacentHebrewMonth(5787, months.TISHREI, -1)).toEqual({ year: 5786, month: months.ELUL });
  });
});

describe('recurrence', () => {
  it('recurs Hebrew dates by the Hebrew calendar across years', () => {
    const occ = getRecurringHebrewDateOccurrences(
      { day: 6, month: months.SIVAN },
      new Date(2025, 0, 1),
      new Date(2027, 0, 1)
    );
    // Shavuot: 1-2 June 2025 and 22 May 2026 — different Gregorian dates
    expect(occ).toHaveLength(2);
    expect(occ[0].getFullYear()).toBe(2025);
    expect(occ[1].toDateString()).toBe(new Date(2026, 4, 22).toDateString());
  });

  it('handles Adar dates in leap years', () => {
    const occ = getRecurringHebrewDateOccurrences(
      { day: 10, month: months.ADAR_I },
      new Date(2026, 0, 1),
      new Date(2028, 0, 1)
    );
    expect(occ.length).toBeGreaterThanOrEqual(2);
    for (const g of occ) {
      const h = convertGregorianToHebrew(g);
      expect(h.day).toBe(10);
      expect([months.ADAR_I, months.ADAR_II]).toContain(h.month);
    }
  });

  it('computes yahrzeit anniversaries with the original year', () => {
    const hd = hebrewAnniversaryInYear({ day: 10, month: months.TEVET, year: 5780 }, 5786, 'yahrzeit');
    expect(hd).toBeDefined();
    expect(hd!.getDate()).toBe(10);
    expect(hd!.getMonth()).toBe(months.TEVET);
    expect(hd!.getFullYear()).toBe(5786);
  });

  it('recurs Gregorian dates by the Gregorian calendar', () => {
    const occ = getRecurringGregorianOccurrences(3, 14, new Date(2026, 0, 1), new Date(2028, 0, 1));
    expect(occ).toHaveLength(2);
    expect(occ[0].toDateString()).toBe(new Date(2026, 2, 14).toDateString());
  });

  it('routes annual items to the right calendar via occurrencesInRange', () => {
    const hebrewItem = { calendarType: 'hebrew' as const, hebrewDate: { day: 6, month: months.SIVAN } };
    const gregItem = { date: '05-22' };
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 11, 31);
    expect(occurrencesInRange(hebrewItem, start, end)[0].toDateString()).toBe(new Date(2026, 4, 22).toDateString());
    expect(occurrencesInRange(gregItem, start, end)[0].toDateString()).toBe(new Date(2026, 4, 22).toDateString());
    // Next year the Hebrew one moves, the Gregorian one doesn't
    const start27 = new Date(2027, 0, 1);
    const end27 = new Date(2027, 11, 31);
    expect(occurrencesInRange(hebrewItem, start27, end27)[0].toDateString())
      .not.toBe(occurrencesInRange(gregItem, start27, end27)[0].toDateString());
  });
});

describe('mode-aware formatting', () => {
  const d = new Date(2026, 5, 10);

  it('returns Gregorian-only, Hebrew-only, or combined', () => {
    expect(formatDateByMode(d, 'gregorian')).toBe(formatGregorianDate(d));
    expect(formatDateByMode(d, 'hebrew')).toBe(formatHebrewDate(d));
    const combined = formatDateByMode(d, 'combined');
    expect(combined).toContain(formatGregorianDate(d));
    expect(combined).toContain(formatHebrewDate(d));
  });
});
