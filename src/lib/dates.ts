import { HDate, gematriya, months } from '@hebcal/core';
import { getBirthdayOrAnniversary, getYahrzeit } from '@hebcal/hdate';

// ── Centralized date service ─────────────────────────────────────────────
// All Gregorian + Hebrew date formatting, conversion and recurrence logic
// lives here. Components must not call toLocaleDateString directly.

export type CalendarMode = 'gregorian' | 'hebrew' | 'combined';
export type CalendarType = 'gregorian' | 'hebrew';
export type AnniversaryKind = 'birthday' | 'yahrzeit';

export interface HebrewDateParts {
  day: number;
  /** HDate month number: Nisan=1 … Elul=6, Tishrei=7 … Adar I=12, Adar II=13 */
  month: number;
  /** Original Hebrew year (e.g. 5786). Optional for annual dates like birthdays. */
  year?: number;
}

// ── Hebrew month names (modern full spelling, no nikud) ──────────────────
const HE_MONTH_NAMES: Record<number, string> = {
  [months.NISAN]: 'ניסן',
  [months.IYYAR]: 'אייר',
  [months.SIVAN]: 'סיוון',
  [months.TAMUZ]: 'תמוז',
  [months.AV]: 'אב',
  [months.ELUL]: 'אלול',
  [months.TISHREI]: 'תשרי',
  [months.CHESHVAN]: 'חשוון',
  [months.KISLEV]: 'כסלו',
  [months.TEVET]: 'טבת',
  [months.SHVAT]: 'שבט',
  [months.ADAR_I]: 'אדר',
  [months.ADAR_II]: 'אדר ב׳',
};

export function hebrewMonthName(month: number, year: number): string {
  if (month === months.ADAR_I) return HDate.isLeapYear(year) ? 'אדר א׳' : 'אדר';
  return HE_MONTH_NAMES[month] || '';
}

/** Months of a Hebrew year in civil order (Tishrei first), for selects/navigation */
export function hebrewMonthsOfYear(year: number): { value: number; label: string }[] {
  const order = HDate.isLeapYear(year)
    ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
    : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
  return order.map(m => ({ value: m, label: hebrewMonthName(m, year) }));
}

// ── Gematriya formatting (proper geresh ׳ / gershayim ״) ─────────────────
export function hebrewDayLabel(day: number): string {
  return gematriya(day); // e.g. 26 → כ״ו
}

export function formatHebrewYear(year: number): string {
  // gematriya() drops the thousands; restore the ה׳ prefix for 5xxx years
  if (year >= 5000 && year < 6000) return `ה׳${gematriya(year - 5000)}`;
  return gematriya(year);
}

// ── Conversion ────────────────────────────────────────────────────────────
export function convertGregorianToHebrew(date: Date): HebrewDateParts & { monthName: string } {
  const hd = new HDate(date);
  return {
    day: hd.getDate(),
    month: hd.getMonth(),
    year: hd.getFullYear(),
    monthName: hebrewMonthName(hd.getMonth(), hd.getFullYear()),
  };
}

export function convertHebrewToGregorian(parts: HebrewDateParts): Date {
  const year = parts.year ?? new HDate().getFullYear();
  const month = clampMonthToYear(parts.month, year);
  const day = Math.min(parts.day, HDate.daysInMonth(month, year));
  return new HDate(day, month, year).greg();
}

/** Adar II in a non-leap year folds into Adar */
function clampMonthToYear(month: number, year: number): number {
  if (month === months.ADAR_II && !HDate.isLeapYear(year)) return months.ADAR_I;
  return month;
}

// ── Hebrew formatting ─────────────────────────────────────────────────────
/** Full Hebrew date, e.g. כ״ו בסיוון ה׳תשפ״ו */
export function formatHebrewDate(date: Date | HDate | null | undefined): string {
  if (!date) return '';
  const hd = date instanceof HDate ? date : new HDate(date);
  const month = hebrewMonthName(hd.getMonth(), hd.getFullYear());
  return `${gematriya(hd.getDate())} ב${month} ${formatHebrewYear(hd.getFullYear())}`;
}

/** Hebrew date without year, e.g. כ״ו בסיוון */
export function formatHebrewDateShort(date: Date | HDate | null | undefined): string {
  if (!date) return '';
  const hd = date instanceof HDate ? date : new HDate(date);
  return `${gematriya(hd.getDate())} ב${hebrewMonthName(hd.getMonth(), hd.getFullYear())}`;
}

/** Hebrew month + year header, e.g. סיוון ה׳תשפ״ו */
export function formatHebrewMonthYear(year: number, month: number): string {
  return `${hebrewMonthName(month, year)} ${formatHebrewYear(year)}`;
}

export function formatHebrewDateParts(parts: HebrewDateParts | null | undefined): string {
  if (!parts) return '';
  const refYear = parts.year ?? new HDate().getFullYear();
  const base = `${gematriya(parts.day)} ב${hebrewMonthName(parts.month, refYear)}`;
  return parts.year ? `${base} ${formatHebrewYear(parts.year)}` : base;
}

// ── Gregorian formatting ──────────────────────────────────────────────────
export type GregorianStyle = 'long' | 'short' | 'full' | 'numeric';

const GREGORIAN_OPTS: Record<GregorianStyle, Intl.DateTimeFormatOptions> = {
  long:    { day: 'numeric', month: 'long', year: 'numeric' },
  short:   { day: 'numeric', month: 'short' },
  full:    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  numeric: { day: 'numeric', month: 'numeric', year: 'numeric' },
};

export function formatGregorianDate(
  date: Date | null | undefined,
  style: GregorianStyle = 'long',
  locale = 'he-IL'
): string {
  if (!date) return '';
  return date.toLocaleDateString(locale, GREGORIAN_OPTS[style]);
}

// ── Mode-aware formatting ─────────────────────────────────────────────────
/**
 * Format a date according to the active calendar mode.
 * Combined mode: Gregorian primary with Hebrew secondary, separated by " · ".
 * ‏ (RLM) keeps mixed Hebrew/digit text from breaking RTL layout.
 */
export function formatDateByMode(
  date: Date | null | undefined,
  mode: CalendarMode,
  style: GregorianStyle = 'long'
): string {
  if (!date) return '';
  switch (mode) {
    case 'gregorian': return formatGregorianDate(date, style);
    case 'hebrew':    return style === 'short' ? formatHebrewDateShort(date) : formatHebrewDate(date);
    case 'combined':  return `${formatGregorianDate(date, style)} ‏· ${style === 'short' ? formatHebrewDateShort(date) : formatHebrewDate(date)}`;
  }
}

// ── Hebrew month view (for the calendar grid) ─────────────────────────────
export interface HebrewMonthDay {
  /** Hebrew day of month, 1-30 */
  hday: number;
  /** Gematriya label, e.g. כ״ו */
  label: string;
  /** Gregorian date of this Hebrew day (noon-agnostic civil date) */
  greg: Date;
}

export interface HebrewMonthView {
  year: number;
  month: number;
  /** e.g. סיוון ה׳תשפ״ו */
  label: string;
  /** Day-of-week (0=Sunday) of the 1st of the month */
  startDow: number;
  days: HebrewMonthDay[];
}

export function getHebrewMonthView(year: number, month: number): HebrewMonthView {
  const m = clampMonthToYear(month, year);
  const len = HDate.daysInMonth(m, year);
  const days: HebrewMonthDay[] = [];
  for (let d = 1; d <= len; d++) {
    days.push({ hday: d, label: gematriya(d), greg: new HDate(d, m, year).greg() });
  }
  return { year, month: m, label: formatHebrewMonthYear(year, m), startDow: days[0].greg.getDay(), days };
}

/** Civil-order month navigation (Tishrei→Elul, crossing year boundaries) */
export function adjacentHebrewMonth(year: number, month: number, delta: 1 | -1): { year: number; month: number } {
  const order = hebrewMonthsOfYear(year).map(o => o.value);
  const idx = order.indexOf(clampMonthToYear(month, year));
  const next = idx + delta;
  if (next < 0) {
    return { year: year - 1, month: months.ELUL };
  }
  if (next >= order.length) {
    return { year: year + 1, month: months.TISHREI };
  }
  return { year, month: order[next] };
}

/** Hebrew month span label for a Gregorian month header, e.g. סיוון–תמוז ה׳תשפ״ו */
export function hebrewSpanLabel(start: Date, end: Date): string {
  const a = new HDate(start);
  const b = new HDate(end);
  const aName = hebrewMonthName(a.getMonth(), a.getFullYear());
  const bName = hebrewMonthName(b.getMonth(), b.getFullYear());
  if (a.getFullYear() !== b.getFullYear()) {
    return `${aName} ${formatHebrewYear(a.getFullYear())} – ${bName} ${formatHebrewYear(b.getFullYear())}`;
  }
  if (a.getMonth() === b.getMonth()) return formatHebrewMonthYear(a.getFullYear(), a.getMonth());
  return `${aName}–${bName} ${formatHebrewYear(a.getFullYear())}`;
}

// ── Recurrence ────────────────────────────────────────────────────────────
/**
 * The observed Hebrew anniversary of `parts` in Hebrew year `targetYear`.
 * When the original year is known, uses halachically-correct rules
 * (getYahrzeit / getBirthdayOrAnniversary — Cheshvan 30, Kislev 30, Adar).
 */
export function hebrewAnniversaryInYear(
  parts: HebrewDateParts,
  targetYear: number,
  kind: AnniversaryKind = 'birthday'
): HDate | undefined {
  if (parts.year && parts.year < targetYear) {
    const original = new HDate(
      Math.min(parts.day, HDate.daysInMonth(clampMonthToYear(parts.month, parts.year), parts.year)),
      clampMonthToYear(parts.month, parts.year),
      parts.year
    ).greg();
    // These return a JS Date (or undefined when targetYear precedes the original)
    const g = kind === 'yahrzeit'
      ? getYahrzeit(targetYear, original)
      : getBirthdayOrAnniversary(targetYear, original);
    if (g) return new HDate(g);
  }
  const m = clampMonthToYear(parts.month, targetYear);
  const day = Math.min(parts.day, HDate.daysInMonth(m, targetYear));
  return new HDate(day, m, targetYear);
}

/** All occurrences of a recurring Hebrew date within a Gregorian range */
export function getRecurringHebrewDateOccurrences(
  parts: HebrewDateParts,
  rangeStart: Date,
  rangeEnd: Date,
  kind: AnniversaryKind = 'birthday'
): Date[] {
  const startYear = new HDate(rangeStart).getFullYear();
  const endYear = new HDate(rangeEnd).getFullYear();
  const out: Date[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const hd = hebrewAnniversaryInYear(parts, y, kind);
    if (!hd) continue;
    const g = hd.greg();
    if (g >= rangeStart && g <= rangeEnd) out.push(g);
  }
  return out;
}

/** All occurrences of a recurring Gregorian month/day within a range */
export function getRecurringGregorianOccurrences(
  month: number, // 1-12
  day: number,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  const out: Date[] = [];
  for (let y = rangeStart.getFullYear(); y <= rangeEnd.getFullYear(); y++) {
    const g = new Date(y, month - 1, day);
    if (g >= rangeStart && g <= rangeEnd) out.push(g);
  }
  return out;
}

export function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// ── Annual items (birthdays / memorials) ──────────────────────────────────
export interface AnnualDateItem {
  /** Gregorian date: "MM-DD", "YYYY-MM-DD", Firestore Timestamp or Date */
  date?: unknown;
  calendarType?: CalendarType;
  hebrewDate?: HebrewDateParts | string | null;
}

export function parseHebrewDateParts(value: unknown): HebrewDateParts | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const day = Number(v.day);
  const month = Number(v.month);
  if (!day || !month || month < 1 || month > 13 || day < 1 || day > 30) return null;
  const year = Number(v.year) || undefined;
  return { day, month, year };
}

function parseGregorianMonthDay(input: unknown): { month: number; day: number } | null {
  if (typeof input === 'string') {
    const parts = input.split('-').map(Number);
    const m = parts[parts.length - 2];
    const d = parts[parts.length - 1];
    return m && d ? { month: m, day: d } : null;
  }
  if (input && typeof (input as { toDate?: () => Date }).toDate === 'function') {
    const dt = (input as { toDate: () => Date }).toDate();
    return { month: dt.getMonth() + 1, day: dt.getDate() };
  }
  if (input instanceof Date) return { month: input.getMonth() + 1, day: input.getDate() };
  return null;
}

/** Next occurrence (today or later) of a birthday/memorial, per its calendar */
export function nextOccurrence(item: AnnualDateItem, kind: AnniversaryKind = 'birthday'): Date | null {
  const today = startOfToday();
  const horizon = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());
  return occurrencesInRange(item, today, horizon, kind)[0] ?? null;
}

/** Occurrences of a birthday/memorial within a Gregorian range, per its calendar */
export function occurrencesInRange(
  item: AnnualDateItem,
  rangeStart: Date,
  rangeEnd: Date,
  kind: AnniversaryKind = 'birthday'
): Date[] {
  const hebrew = parseHebrewDateParts(item.hebrewDate);
  if (item.calendarType === 'hebrew' && hebrew) {
    return getRecurringHebrewDateOccurrences(hebrew, rangeStart, rangeEnd, kind);
  }
  const md = parseGregorianMonthDay(item.date);
  if (!md) return [];
  return getRecurringGregorianOccurrences(md.month, md.day, rangeStart, rangeEnd);
}

/** Days from today until the next occurrence (999 when unknown) */
export function daysUntilOccurrence(item: AnnualDateItem, kind: AnniversaryKind = 'birthday'): number {
  const next = nextOccurrence(item, kind);
  return next ? daysBetween(startOfToday(), next) : 999;
}

/** The original/source date of an annual item formatted per its own calendar */
export function formatAnnualItemDate(item: AnnualDateItem): string {
  const hebrew = parseHebrewDateParts(item.hebrewDate);
  if (item.calendarType === 'hebrew' && hebrew) return formatHebrewDateParts(hebrew);
  if (typeof item.hebrewDate === 'string' && item.hebrewDate) return item.hebrewDate; // legacy free-text
  const md = parseGregorianMonthDay(item.date);
  if (!md) return '';
  return new Date(2000, md.month - 1, md.day).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
}

// ── Hebrew date entry helpers (for forms) ─────────────────────────────────
export function currentHebrewYear(): number {
  return new HDate().getFullYear();
}

export function hebrewYearOptions(from: number, to: number): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let y = to; y >= from; y--) out.push({ value: y, label: formatHebrewYear(y) });
  return out;
}

export function hebrewDayOptions(month: number, year: number): { value: number; label: string }[] {
  const len = HDate.daysInMonth(clampMonthToYear(month, year), year);
  const out: { value: number; label: string }[] = [];
  for (let d = 1; d <= len; d++) out.push({ value: d, label: gematriya(d) });
  return out;
}

export { HDate, months };
