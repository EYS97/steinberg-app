import { AUGUST_MONTH } from '@/types/august';

// ── Pure helpers for the August planner ────────────────────────────────────
// No Firestore, no React — everything here is unit-tested. Dates are handled
// as local "YYYY-MM-DD" strings to avoid timezone drift; the planner is a
// wall-clock tool, not an instant-in-time tool.

/** Deterministic plan doc id so a family's plan can be fetched directly. */
export function planDocId(familyId: string, year: number): string {
  return `${familyId}_${year}_${String(AUGUST_MONTH).padStart(2, '0')}`;
}

/** Zero-padded local date string for a Date. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Build the local Date for a given day of August in `year`. */
export function augustDate(year: number, day: number): Date {
  return new Date(year, AUGUST_MONTH - 1, day);
}

// Israeli week starts on Sunday (getDay() === 0).
const HE_WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const HE_WEEKDAY_LONG = [
  'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת',
];

export function weekdayShort(d: Date): string {
  return HE_WEEKDAY_SHORT[d.getDay()];
}

export function weekdayLong(d: Date): string {
  return HE_WEEKDAY_LONG[d.getDay()];
}

/** "ב׳ 03/08" — short weekday + dd/mm. */
export function formatDayLabel(dateStr: string): string {
  const d = parseDateStr(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekdayShort(d)} ${dd}/${mm}`;
}

/** "שלישי, 3 באוגוסט" — full label for the day editor. */
export function formatDayLong(dateStr: string): string {
  const d = parseDateStr(dateStr);
  return `${weekdayLong(d)}, ${d.getDate()} באוגוסט`;
}

export function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface AugustDay {
  date: string;       // YYYY-MM-DD
  dayOfMonth: number; // 1..31
  isWeekend: boolean; // Fri/Sat
}

export interface AugustWeek {
  index: number;      // 1-based
  label: string;      // "שבוע 1"
  start: string;      // YYYY-MM-DD
  end: string;        // YYYY-MM-DD
  rangeLabel: string; // "1–8 באוגוסט"
  days: AugustDay[];
}

function makeDay(d: Date): AugustDay {
  const dow = d.getDay();
  return {
    date: toDateStr(d),
    dayOfMonth: d.getDate(),
    isWeekend: dow === 5 || dow === 6, // Friday + Saturday
  };
}

/**
 * Split August into Sunday-started weeks. The first week may be a partial
 * week (Aug 1 through the first Saturday); each Sunday opens a new week.
 * Always covers all 31 days, with no gaps or overlaps.
 */
export function augustWeeks(year: number): AugustWeek[] {
  const weeks: AugustWeek[] = [];
  let current: AugustDay[] = [];

  for (let day = 1; day <= 31; day++) {
    const d = augustDate(year, day);
    if (current.length > 0 && d.getDay() === 0) {
      weeks.push(finalizeWeek(weeks.length + 1, current));
      current = [];
    }
    current.push(makeDay(d));
  }
  if (current.length > 0) weeks.push(finalizeWeek(weeks.length + 1, current));
  return weeks;
}

function finalizeWeek(index: number, days: AugustDay[]): AugustWeek {
  const start = days[0];
  const end = days[days.length - 1];
  return {
    index,
    label: `שבוע ${index}`,
    start: start.date,
    end: end.date,
    rangeLabel: `${start.dayOfMonth}–${end.dayOfMonth} באוגוסט`,
    days,
  };
}

/** Friday or Saturday — kids are with the parents, so no coverage is required. */
export function isWeekendDate(dateStr: string): boolean {
  const dow = parseDateStr(dateStr).getDay();
  return dow === 5 || dow === 6;
}

/** Minimal shape an item needs to resolve which days it spans. */
export interface DateSpan {
  date: string;          // start (YYYY-MM-DD)
  endDate?: string;      // inclusive end; absent → single day
  daysOfWeek?: number[]; // 0=Sun..6=Sat; absent/empty → every day in range
}

/** Does a (possibly multi-day) item occur on `dateStr`? */
export function occursOn(span: DateSpan, dateStr: string): boolean {
  const end = span.endDate && span.endDate >= span.date ? span.endDate : span.date;
  if (dateStr < span.date || dateStr > end) return false; // YYYY-MM-DD sorts lexically
  if (span.daysOfWeek && span.daysOfWeek.length > 0) {
    return span.daysOfWeek.includes(parseDateStr(dateStr).getDay());
  }
  return true;
}

/** Every date a (possibly multi-day) item occurs on, walking start→end inclusive. */
export function itemOccurrences(span: DateSpan): string[] {
  const end = span.endDate && span.endDate >= span.date ? span.endDate : span.date;
  const out: string[] = [];
  let cur = parseDateStr(span.date);
  const endDate = parseDateStr(end);
  while (cur <= endDate) {
    const ds = toDateStr(cur);
    if (occursOn(span, ds)) out.push(ds);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

// ── Time helpers (HH:MM ↔ minutes) ─────────────────────────────────────────
/** "08:30" → 510. Returns NaN for malformed input. */
export function timeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** 510 → "08:30". Clamps nothing; assumes 0..1439. */
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when [aStart,aEnd) overlaps [bStart,bEnd). Times as "HH:MM". */
export function rangesOverlap(
  aStart: string, aEnd: string, bStart: string, bEnd: string
): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if ([as, ae, bs, be].some(Number.isNaN)) return false;
  return as < be && bs < ae;
}
