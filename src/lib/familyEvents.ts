import { HDate } from '@hebcal/core';
import {
  daysBetween,
  occurrencesInRange,
  parseHebrewDateParts,
  type AnnualDateItem,
  type AnniversaryKind,
} from './dates';
import type { Birthday, Memorial } from '@/types';

// ── Family events hub model ───────────────────────────────────────────────
// A single, chronologically-sorted feed of upcoming family milestones for the
// homepage. The kinds below are deliberately open-ended: adding a new event
// type (births, b'nei mitzvah, graduations, …) is a one-line `FamilyEventSource`
// plus an entry in the component's visual registry — no UI redesign needed.

export type FamilyEventKind =
  | 'birthday'
  | 'anniversary'
  | 'yahrzeit'
  | 'milestone'
  | 'birth'
  | 'bar_mitzvah'
  | 'graduation'
  | 'celebration';

export interface FamilyEvent {
  /** Stable unique key (kind + source id + occurrence) */
  id: string;
  kind: FamilyEventKind;
  /** The person or couple the event concerns */
  name: string;
  /** Next upcoming occurrence (today or later), at local midnight */
  date: Date;
  /** Whole days from `today` until the occurrence (0 = today) */
  days: number;
  /** Ordinal when derivable: age for birthdays, years for anniversaries. */
  count?: number;
  /** Originating Firestore doc id, for navigation / dedup */
  sourceId: string;
  notes?: string;
}

/** One collection feeding the hub. New event types plug in here. */
export interface FamilyEventSource {
  kind: FamilyEventKind;
  /** How the annual date recurs in the date engine */
  recur: AnniversaryKind;
  /** Whether to derive an ordinal count (age / years) when a source year exists */
  withCount: boolean;
  items: AnnualEntry[];
}

/** Minimum shape the hub needs from any annual record */
export type AnnualEntry = AnnualDateItem & {
  id: string;
  name: string;
  notes?: string;
};

export interface BuildOptions {
  /** Reference "today" (defaults to the real today at local midnight) */
  today?: Date;
  /** How many days ahead to include (default 60) */
  horizonDays?: number;
  /** Max events returned (default 6) */
  limit?: number;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** The original year of an annual record, per its own calendar (if recorded). */
function sourceYear(item: AnnualDateItem): number | undefined {
  const hebrew = parseHebrewDateParts(item.hebrewDate);
  if (item.calendarType === 'hebrew' && hebrew?.year) return hebrew.year;

  // Gregorian: a 4-digit year from "YYYY-MM-DD", a Timestamp, or a Date.
  const d = item.date;
  if (typeof d === 'string') {
    const parts = d.split('-');
    if (parts.length >= 3) {
      const y = Number(parts[0]);
      if (y >= 1000) return y;
    }
  } else if (d && typeof (d as { toDate?: () => Date }).toDate === 'function') {
    return (d as { toDate: () => Date }).toDate().getFullYear();
  } else if (d instanceof Date) {
    return d.getFullYear();
  }
  return undefined;
}

/** Age / years-since for a given occurrence, in the record's own calendar. */
function ordinalCount(item: AnnualDateItem, occurrence: Date): number | undefined {
  const sy = sourceYear(item);
  if (sy === undefined) return undefined;
  const occYear =
    item.calendarType === 'hebrew'
      ? new HDate(occurrence).getFullYear()
      : occurrence.getFullYear();
  const n = occYear - sy;
  return n > 0 ? n : undefined;
}

/** Merge any number of annual sources into one sorted upcoming-events feed. */
export function buildFromSources(
  sources: FamilyEventSource[],
  opts: BuildOptions = {}
): FamilyEvent[] {
  const today = startOfDay(opts.today ?? new Date());
  const horizonDays = opts.horizonDays ?? 60;
  const limit = opts.limit ?? 6;
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + horizonDays);

  const out: FamilyEvent[] = [];
  for (const src of sources) {
    for (const item of src.items) {
      if (!item.name) continue;
      const occ = occurrencesInRange(item, today, horizon, src.recur)[0];
      if (!occ) continue;
      const date = startOfDay(occ);
      out.push({
        id: `${src.kind}:${item.id}:${date.getTime()}`,
        kind: src.kind,
        name: item.name,
        date,
        days: daysBetween(today, date),
        count: src.withCount ? ordinalCount(item, date) : undefined,
        sourceId: item.id,
        notes: item.notes,
      });
    }
  }

  return out
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'he'))
    .slice(0, limit);
}

/**
 * Build the homepage family-events feed from the existing birthdays + memorials
 * collections, plus any wedding anniversaries derived from family-lifecycle
 * records. Births / graduations etc. can be folded in later by adding their own
 * `FamilyEventSource` here.
 */
export function buildFamilyEvents(
  birthdays: Birthday[],
  memorials: Memorial[],
  opts: BuildOptions = {},
  anniversaries: AnnualEntry[] = []
): FamilyEvent[] {
  return buildFromSources(
    [
      { kind: 'birthday', recur: 'birthday', withCount: true, items: birthdays },
      { kind: 'yahrzeit', recur: 'yahrzeit', withCount: false, items: memorials },
      { kind: 'anniversary', recur: 'birthday', withCount: true, items: anniversaries },
    ],
    opts
  );
}
