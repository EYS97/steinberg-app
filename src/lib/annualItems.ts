// Pure logic for birthdays / memorials ("annual items"): form <-> Firestore
// mapping, validation, list grouping, search, age and duplicate detection.
// UI-free so it can be unit-tested; used by the Dates page and its sheet.

import {
  type AnniversaryKind,
  type AnnualDateItem,
  type CalendarType,
  convertGregorianToHebrew,
  daysBetween,
  HDate,
  nextOccurrence,
  parseHebrewDateParts,
  startOfToday,
} from './dates';

export interface AnnualFormState {
  name: string;
  notes: string;
  calendarType: CalendarType;
  /** Gregorian parts (used when calendarType === 'gregorian') */
  gDay: number;   // 1-31
  gMonth: number; // 1-12
  gYear: number;  // 0 = unknown
  /** Hebrew parts (used when calendarType === 'hebrew') */
  hDay: number;
  hMonth: number; // HDate month number
  hYear: number;  // 0 = unknown
}

export interface AnnualItemDoc extends AnnualDateItem {
  id: string;
  name: string;
  notes?: string;
}

export function emptyAnnualForm(calendarType: CalendarType = 'gregorian'): AnnualFormState {
  return { name: '', notes: '', calendarType, gDay: 0, gMonth: 0, gYear: 0, hDay: 1, hMonth: 7, hYear: 0 };
}

/** Prefill a new form from a concrete day (e.g. tapped in the calendar). Year stays unknown. */
export function formForDate(date: Date, calendarType: CalendarType = 'gregorian'): AnnualFormState {
  const h = convertGregorianToHebrew(date);
  return {
    ...emptyAnnualForm(calendarType),
    gDay: date.getDate(),
    gMonth: date.getMonth() + 1,
    hDay: h.day,
    hMonth: h.month,
  };
}

/** Parse "YYYY-MM-DD" / "MM-DD" / Timestamp / Date into parts (year 0 when absent). */
export function parseGregorianParts(input: unknown): { day: number; month: number; year: number } | null {
  if (typeof input === 'string' && input.trim()) {
    const parts = input.trim().split('-').map(Number);
    if (parts.some(n => Number.isNaN(n))) return null;
    if (parts.length === 3) return { year: parts[0], month: parts[1], day: parts[2] };
    if (parts.length === 2) return { year: 0, month: parts[0], day: parts[1] };
    return null;
  }
  const asDate =
    input instanceof Date ? input
    : input && typeof (input as { toDate?: () => Date }).toDate === 'function'
      ? (input as { toDate: () => Date }).toDate()
      : null;
  if (asDate) {
    // Legacy docs (old family-tree page) always stored a full Date, often with a
    // placeholder year (the year it was entered). Only trust clearly-past years.
    const y = asDate.getFullYear();
    const trustedYear = y <= new Date().getFullYear() - 2 ? y : 0;
    return { year: trustedYear, month: asDate.getMonth() + 1, day: asDate.getDate() };
  }
  return null;
}

/** Load an existing Firestore doc into the edit form (handles legacy shapes). */
export function formFromItem(item: AnnualItemDoc): AnnualFormState {
  const base = emptyAnnualForm(item.calendarType === 'hebrew' ? 'hebrew' : 'gregorian');
  const g = parseGregorianParts(item.date);
  const h = parseHebrewDateParts(item.hebrewDate);
  const form: AnnualFormState = {
    ...base,
    name: item.name ?? '',
    notes: item.notes ?? '',
    ...(g ? { gDay: g.day, gMonth: g.month, gYear: g.year } : {}),
    ...(h ? { hDay: h.day, hMonth: h.month, hYear: h.year ?? 0 } : {}),
  };
  // Hebrew item without Gregorian parts: derive them so switching calendars keeps a sensible date
  if (!g && h) {
    try {
      const gd = new HDate(h.day, h.month, h.year || new HDate().getFullYear()).greg();
      form.gDay = gd.getDate();
      form.gMonth = gd.getMonth() + 1;
    } catch { /* keep empty */ }
  }
  return form;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function daysInGregorianMonth(month: number, year: number): number {
  return new Date(year || 2000, month, 0).getDate(); // year 2000 → Feb 29 allowed
}

/** Returns an error message (Hebrew) or null when the form is valid. */
export function validateAnnualForm(form: AnnualFormState): string | null {
  if (!form.name.trim()) return 'נא להזין שם';
  if (form.calendarType === 'gregorian') {
    if (!form.gMonth || !form.gDay) return 'נא לבחור יום וחודש';
    if (form.gDay > daysInGregorianMonth(form.gMonth, form.gYear)) return 'התאריך אינו קיים בחודש הזה';
    if (form.gYear && (form.gYear < 1850 || form.gYear > new Date().getFullYear())) return 'שנה לא תקינה';
  } else {
    if (!form.hMonth || !form.hDay) return 'נא לבחור יום וחודש עבריים';
  }
  return null;
}

/**
 * Firestore fields for the form. Keeps the existing storage contract:
 *   date: "MM-DD" or "YYYY-MM-DD" (Gregorian), hebrewDate: {day,month,year?}, calendarType.
 * For a Hebrew item `date` is left empty; `hebrewDate` is null for Gregorian
 * so an edit that switches calendars doesn't leave stale data behind.
 */
export function annualFieldsFromForm(form: AnnualFormState): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    name: form.name.trim(),
    notes: form.notes.trim(),
    calendarType: form.calendarType,
  };
  if (form.calendarType === 'gregorian') {
    fields.date = form.gYear
      ? `${form.gYear}-${pad(form.gMonth)}-${pad(form.gDay)}`
      : `${pad(form.gMonth)}-${pad(form.gDay)}`;
    fields.hebrewDate = null;
  } else {
    fields.date = '';
    fields.hebrewDate = { day: form.hDay, month: form.hMonth, ...(form.hYear ? { year: form.hYear } : {}) };
  }
  return fields;
}

/** The draft as an AnnualDateItem, for live "next occurrence" preview. */
export function draftItem(form: AnnualFormState): AnnualDateItem | null {
  if (validateAnnualForm({ ...form, name: form.name || 'x' })) return null;
  const f = annualFieldsFromForm({ ...form, name: form.name || 'x' });
  return { date: f.date, calendarType: form.calendarType, hebrewDate: f.hebrewDate as AnnualDateItem['hebrewDate'] };
}

/** Age (birthday) / years (memorial) at the given occurrence, when the original year is known. */
export function yearsAt(item: AnnualDateItem, occurrence: Date): number | undefined {
  if (item.calendarType === 'hebrew') {
    const h = parseHebrewDateParts(item.hebrewDate);
    if (!h?.year) return undefined;
    const n = new HDate(occurrence).getFullYear() - h.year;
    return n > 0 ? n : undefined;
  }
  const g = parseGregorianParts(item.date);
  if (!g?.year) return undefined;
  const n = occurrence.getFullYear() - g.year;
  return n > 0 ? n : undefined;
}

export interface ListedItem<T extends AnnualItemDoc> {
  item: T;
  next: Date | null;
  days: number;
  years?: number;
}

export interface MonthGroup<T extends AnnualItemDoc> {
  key: string;   // "2026-12" or "unknown"
  label: string; // "דצמבר 2026"
  items: ListedItem<T>[];
}

/** Every item (no time window), sorted by next occurrence and grouped by month. */
export function groupByUpcomingMonth<T extends AnnualItemDoc>(
  items: T[],
  kind: AnniversaryKind,
  today: Date = startOfToday()
): MonthGroup<T>[] {
  const listed: ListedItem<T>[] = items.map(item => {
    const next = nextOccurrence(item, kind);
    return {
      item,
      next,
      days: next ? daysBetween(today, next) : Number.POSITIVE_INFINITY,
      years: next ? yearsAt(item, next) : undefined,
    };
  });
  listed.sort((a, b) => a.days - b.days || (a.item.name ?? '').localeCompare(b.item.name ?? '', 'he'));

  const groups: MonthGroup<T>[] = [];
  for (const l of listed) {
    const key = l.next ? `${l.next.getFullYear()}-${pad(l.next.getMonth() + 1)}` : 'unknown';
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const label = l.next
        ? l.next.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
        : 'ללא תאריך תקין';
      g = { key, label, items: [] };
      groups.push(g);
    }
    g.items.push(l);
  }
  return groups;
}

/** Hebrew-friendly name/notes search: case-insensitive, ignores geresh/quote variants and spacing. */
export function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[׳'"״`]/g, '').replace(/\s+/g, ' ').trim();
}

export function matchesSearch(item: AnnualItemDoc, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return normalizeForSearch(`${item.name ?? ''} ${item.notes ?? ''}`).includes(q);
}

/** Another item with the same (normalized) name, excluding the one being edited. */
export function findDuplicate<T extends AnnualItemDoc>(items: T[], name: string, excludeId?: string): T | undefined {
  const n = normalizeForSearch(name);
  if (!n) return undefined;
  return items.find(i => i.id !== excludeId && normalizeForSearch(i.name ?? '') === n);
}

export function countdownLabel(days: number, kind: AnniversaryKind): string {
  if (!Number.isFinite(days)) return '';
  if (days === 0) return kind === 'birthday' ? '🎉 היום!' : 'היום';
  if (days === 1) return 'מחר';
  return `בעוד ${days} ימים`;
}

/** Parse "YYYY-MM-DD" from a URL param into a local Date (null when invalid). */
export function parseIsoDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
}

export function toIsoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
