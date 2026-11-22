import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  annualFieldsFromForm,
  emptyAnnualForm,
  findDuplicate,
  formForDate,
  formFromItem,
  groupByUpcomingMonth,
  matchesSearch,
  parseGregorianParts,
  parseIsoDay,
  toIsoDay,
  validateAnnualForm,
  yearsAt,
  countdownLabel,
  draftItem,
  type AnnualItemDoc,
} from './annualItems';
import { nextOccurrence, HDate } from './dates';

const today = new Date(2026, 10, 22); // 22 Nov 2026

describe('parseGregorianParts', () => {
  it('reads MM-DD and YYYY-MM-DD strings', () => {
    expect(parseGregorianParts('03-14')).toEqual({ year: 0, month: 3, day: 14 });
    expect(parseGregorianParts('1985-03-14')).toEqual({ year: 1985, month: 3, day: 14 });
  });
  it('rejects junk', () => {
    expect(parseGregorianParts('')).toBeNull();
    expect(parseGregorianParts('abc')).toBeNull();
    expect(parseGregorianParts(undefined)).toBeNull();
  });
  it('reads legacy Timestamps, ignoring a placeholder (recent) year', () => {
    expect(parseGregorianParts(Timestamp.fromDate(new Date(1980, 4, 2, 12)))).toEqual({ year: 1980, month: 5, day: 2 });
    const recent = new Date(new Date().getFullYear(), 4, 2, 12);
    expect(parseGregorianParts(Timestamp.fromDate(recent))?.year).toBe(0);
  });
});

describe('form <-> fields round trip', () => {
  it('gregorian with year', () => {
    const form = { ...emptyAnnualForm(), name: '  איתן ', gDay: 5, gMonth: 9, gYear: 2015 };
    const f = annualFieldsFromForm(form);
    expect(f).toMatchObject({ name: 'איתן', date: '2015-09-05', calendarType: 'gregorian', hebrewDate: null });
    const back = formFromItem({ id: '1', ...(f as object) } as AnnualItemDoc);
    expect(back).toMatchObject({ name: 'איתן', gDay: 5, gMonth: 9, gYear: 2015, calendarType: 'gregorian' });
  });
  it('gregorian without year stores MM-DD', () => {
    expect(annualFieldsFromForm({ ...emptyAnnualForm(), name: 'x', gDay: 1, gMonth: 12 }).date).toBe('12-01');
  });
  it('hebrew clears the gregorian date and keeps the year only when known', () => {
    const f = annualFieldsFromForm({ ...emptyAnnualForm('hebrew'), name: 'x', hDay: 10, hMonth: 7, hYear: 0 });
    expect(f).toMatchObject({ date: '', calendarType: 'hebrew', hebrewDate: { day: 10, month: 7 } });
    expect((f.hebrewDate as object)).not.toHaveProperty('year');
  });
  it('loads a hebrew item and derives gregorian parts for switching', () => {
    const form = formFromItem({ id: '1', name: 'סבא', calendarType: 'hebrew', hebrewDate: { day: 15, month: 1, year: 5700 } });
    expect(form).toMatchObject({ calendarType: 'hebrew', hDay: 15, hMonth: 1, hYear: 5700 });
    expect(form.gMonth).toBeGreaterThan(0);
  });
});

describe('validateAnnualForm', () => {
  const ok = { ...emptyAnnualForm(), name: 'דנה', gDay: 29, gMonth: 2 };
  it('accepts Feb 29 without a year', () => expect(validateAnnualForm(ok)).toBeNull());
  it('rejects Feb 29 in a non-leap year', () => expect(validateAnnualForm({ ...ok, gYear: 2023 })).not.toBeNull());
  it('requires a name and a date', () => {
    expect(validateAnnualForm({ ...ok, name: ' ' })).not.toBeNull();
    expect(validateAnnualForm({ ...ok, gDay: 0 })).not.toBeNull();
  });
  it('rejects future years', () => expect(validateAnnualForm({ ...ok, gDay: 1, gMonth: 1, gYear: 3000 })).not.toBeNull());
});

describe('formForDate', () => {
  it('prefills both calendars from a tapped day', () => {
    const d = new Date(2026, 11, 25);
    const f = formForDate(d);
    const h = new HDate(d);
    expect(f).toMatchObject({ gDay: 25, gMonth: 12, gYear: 0, hDay: h.getDate(), hMonth: h.getMonth() });
  });
});

describe('yearsAt / draftItem', () => {
  it('computes gregorian age at the next occurrence', () => {
    expect(yearsAt({ date: '2015-09-05' }, new Date(2027, 8, 5))).toBe(12);
    expect(yearsAt({ date: '09-05' }, new Date(2027, 8, 5))).toBeUndefined();
  });
  it('computes hebrew age', () => {
    const occ = new HDate(1, 7, 5787).greg();
    expect(yearsAt({ calendarType: 'hebrew', hebrewDate: { day: 1, month: 7, year: 5777 } }, occ)).toBe(10);
  });
  it('draftItem gives a previewable item even before a name is typed', () => {
    const item = draftItem({ ...emptyAnnualForm(), gDay: 1, gMonth: 1 });
    expect(item && nextOccurrence(item)).toBeInstanceOf(Date);
    expect(draftItem(emptyAnnualForm())).toBeNull();
  });
});

describe('groupByUpcomingMonth', () => {
  const items: AnnualItemDoc[] = [
    { id: 'a', name: 'ינואר', date: '01-10' },
    { id: 'b', name: 'דצמבר', date: '12-05' },
    { id: 'c', name: 'נובמבר-מחר', date: '11-23' },
    { id: 'd', name: 'שבור', date: 'bad' },
    { id: 'e', name: 'עוד דצמבר', date: '12-01' },
  ];
  it('lists everything (no 60-day cut-off), soonest first, grouped by month', () => {
    // nextOccurrence uses the real clock; assert relative structure only
    const groups = groupByUpcomingMonth(items, 'birthday');
    const flat = groups.flatMap(g => g.items.map(i => i.item.id));
    expect(flat).toHaveLength(5);
    expect(flat[flat.length - 1]).toBe('d'); // invalid date last
    expect(groups[groups.length - 1].key).toBe('unknown');
    const days = groups.flatMap(g => g.items.map(i => i.days));
    expect([...days].sort((a, b) => a - b)).toEqual(days); // ascending by next occurrence
    for (const g of groups) if (g.key !== 'unknown') {
      expect(new Set(g.items.map(i => `${i.next!.getFullYear()}-${i.next!.getMonth()}`)).size).toBe(1);
    }
  });
  it('tolerates docs without a name', () => {
    expect(() => groupByUpcomingMonth([{ id: 'x', date: '01-01' } as AnnualItemDoc, ...items], 'birthday', today)).not.toThrow();
  });
});

describe('search & duplicates', () => {
  const list: AnnualItemDoc[] = [{ id: '1', name: 'יונתן שטיינברג', notes: 'הבכור' }, { id: '2', name: "צ'רלי" }];
  it('matches name and notes, ignoring geresh and case', () => {
    expect(matchesSearch(list[0], 'יונתן')).toBe(true);
    expect(matchesSearch(list[0], 'בכור')).toBe(true);
    expect(matchesSearch(list[1], 'צרלי')).toBe(true);
    expect(matchesSearch(list[0], 'רות')).toBe(false);
    expect(matchesSearch(list[0], '')).toBe(true);
  });
  it('finds same-name duplicates but not the item being edited', () => {
    expect(findDuplicate(list, ' יונתן  שטיינברג ')?.id).toBe('1');
    expect(findDuplicate(list, 'יונתן שטיינברג', '1')).toBeUndefined();
    expect(findDuplicate(list, '')).toBeUndefined();
  });
});

describe('misc', () => {
  it('ISO day round trip and validation', () => {
    expect(toIsoDay(parseIsoDay('2026-02-28')!)).toBe('2026-02-28');
    expect(parseIsoDay('2026-02-30')).toBeNull();
    expect(parseIsoDay('nope')).toBeNull();
  });
  it('countdown labels', () => {
    expect(countdownLabel(0, 'birthday')).toContain('היום');
    expect(countdownLabel(1, 'birthday')).toBe('מחר');
    expect(countdownLabel(9, 'yahrzeit')).toBe('בעוד 9 ימים');
    expect(countdownLabel(Infinity, 'birthday')).toBe('');
  });
});
