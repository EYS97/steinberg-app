import {
  ROOMS,
  HOUSEHOLD_RESIDENTS,
  PERMANENT_GUESTS,
  AUTO_ATTENDEES_COUNT,
} from '@/types';
import type {
  AppEvent,
  Booking,
  Family,
  Seudah,
  SeudahRegistration,
  Birthday,
  Memorial,
} from '@/types';
import {
  computeCandleStats,
  computeMealStats,
  computeRoomStats,
  type CandleStats,
  type MealStats,
  type RoomStats,
} from './eventState';
import {
  formatHebrewDate,
  formatGregorianDate,
} from './dates';
import { buildFamilyEvents, type FamilyEvent } from './familyEvents';

// ── Shabbat / Holiday summary report ──────────────────────────────────────
// One centralized, fully-testable builder for the host ("דוח שבת/חג"). It does
// not fetch anything and holds no React — the page wires the live collections
// in and renders the returned model. Every number is derived from the existing
// shared selectors in eventState (candles, meals, rooms) so the report can never
// disagree with the Seudot / Rooms / Home screens.

/** Text shown wherever a field has no data yet. */
export const NOT_ENTERED = 'לא הוזן';

/**
 * The household's fixed location. Room bookings are sleeping at the mother's
 * house, which is in Karmiel — the same fact the candle rule encodes ("only
 * families sleeping in Karmiel light candles"). Treated as a household default,
 * alongside the 10 base candles and the permanent attendees.
 */
export const HOST_CITY = 'כרמיאל';

export interface ReportHeader {
  /** Event title — e.g. "שבת בהעלותך" or a holiday name. */
  title: string;
  isHoliday: boolean;
  /** "שבת" / "חג" descriptor. */
  kindLabel: string;
  /** Full Hebrew date, e.g. כ״ו בסיוון ה׳תשפ״ו. */
  hebrewDate: string;
  /** Parasha name (no "פרשת" prefix), when known. */
  parasha?: string;
  /** Gregorian date, formatted long with weekday. */
  gregorianDate: string;
  /** Host city — where the hosting (and candle-lighting) takes place. */
  hostCity: string;
}

export interface SummaryCards {
  /** סה"כ נרות שבת */
  totalCandles: number;
  /** סה"כ לנים */
  totalSleepers: number;
  /** שיא סועדים בסעודה */
  peakDiners: number;
  /** סה"כ התחייבויות להביא משהו */
  totalCommitments: number;
}

export interface CandleRow {
  /** De-dup key — familyId, `ext:<bookingId>`, or 'base'. */
  key: string;
  familyName: string;
  /** Every candle row here is a family sleeping in Karmiel (room bookings only). */
  sleepsInKarmiel: boolean;
  /** Number of people (parents + children); null for the fixed household base. */
  people: number | null;
  candles: number;
  /** True for the mother-of-the-house baseline row. */
  isBase: boolean;
}

export interface CandleSection {
  rows: CandleRow[];
  total: number;
}

export interface Commitment {
  key: string;
  /** Family / guest name. */
  name: string;
  /** What they are bringing. */
  bringing: string;
  /** Which seudah it is for, when the commitment is tied to one. */
  seudahType?: string;
}

export interface SleeperRow {
  key: string;
  familyName: string;
  city: string;
  adults: number;
  children: number;
  total: number;
  /** Assigned room name, or NOT_ENTERED. */
  roomName: string;
  isExternal: boolean;
}

export interface SummaryReport {
  header: ReportHeader;
  cards: SummaryCards;
  candles: CandleSection;
  /** Full meal model from the shared selector — rendered per-seudah by the page. */
  meals: MealStats;
  /** The automatic base of every seudah, surfaced for display. */
  autoAttendees: {
    residents: string[];
    permanentGuests: string[];
    count: number;
  };
  commitments: Commitment[];
  rooms: RoomStats;
  sleepers: SleeperRow[];
  /** Total people sleeping over (matches rooms.sleepingGuests). */
  totalSleepers: number;
  /** Optional upcoming birthdays / yahrzeits around the event (may be empty). */
  familyEvents: FamilyEvent[];
}

export interface BuildSummaryReportInput {
  event: AppEvent;
  families: Family[];
  /** Room bookings for this event only (sleeping). */
  bookings: Booking[];
  /** All seudot + registrations (filtered to the event internally). */
  seudot: Seudah[];
  registrations: SeudahRegistration[];
  locks: Record<string, boolean>;
  isClosed: boolean;
  birthdays?: Birthday[];
  memorials?: Memorial[];
}

const ROOM_NAME = new Map(ROOMS.map(r => [r.id, r.name]));

function eventDate(event: AppEvent): Date | null {
  return event.date?.toDate?.() ?? null;
}

function buildHeader(event: AppEvent): ReportHeader {
  const date = eventDate(event);
  const isHoliday = event.type === 'holiday' || event.isHoliday === true;
  return {
    title: event.title || (isHoliday ? 'חג' : 'שבת'),
    isHoliday,
    kindLabel: isHoliday ? 'חג' : 'שבת',
    hebrewDate: date ? formatHebrewDate(date) : NOT_ENTERED,
    parasha: event.parasha || undefined,
    gregorianDate: date ? formatGregorianDate(date, 'full') : NOT_ENTERED,
    hostCity: HOST_CITY,
  };
}

/**
 * Candle table rows: a fixed mother-of-the-house base row, then one row per
 * sleeping married nuclear family (exactly the parties {@link computeCandleStats}
 * counts). Every row sleeps in Karmiel because the source is room bookings.
 */
function buildCandleSection(candleStats: CandleStats): CandleSection {
  const rows: CandleRow[] = [
    {
      key: 'base',
      familyName: 'בית אמא',
      sleepsInKarmiel: true,
      people: null,
      candles: candleStats.base,
      isBase: true,
    },
    ...candleStats.families.map(f => ({
      key: f.key,
      familyName: `משפחת ${f.familyName}`,
      sleepsInKarmiel: true,
      people: f.parents + f.children,
      candles: f.candles,
      isBase: false,
    })),
  ];
  return { rows, total: candleStats.total };
}

/** Commitments come from seudah registrations that recorded a "bringing" note. */
function buildCommitments(
  eventRegistrations: SeudahRegistration[],
  seudahTypeById: Map<string, string>
): Commitment[] {
  return eventRegistrations
    .filter(r => (r.bringing || '').trim().length > 0)
    .map(r => ({
      key: r.id,
      name: `משפחת ${r.familyName}`,
      bringing: r.bringing!.trim(),
      seudahType: seudahTypeById.get(r.seudahId),
    }));
}

/** One row per room booking, resolving the family's city and assigned room. */
function buildSleepers(bookings: Booking[], families: Family[]): SleeperRow[] {
  const cityByFamily = new Map(families.map(f => [f.id, f.city]));
  return bookings
    .map(b => {
      const adults = b.adults || 0;
      const children = b.kids || 0;
      const city = b.isExternalGuest
        ? NOT_ENTERED
        : cityByFamily.get(b.familyId) || NOT_ENTERED;
      return {
        key: b.id,
        familyName: b.isExternalGuest ? b.familyName : `משפחת ${b.familyName}`,
        city,
        adults,
        children,
        total: adults + children,
        roomName: ROOM_NAME.get(b.roomId) || NOT_ENTERED,
        isExternal: !!b.isExternalGuest,
      };
    })
    .sort((a, b) => a.familyName.localeCompare(b.familyName, 'he'));
}

/**
 * Assemble the complete host report for one Shabbat/holiday. Pure and
 * deterministic: same inputs → same model, with all arithmetic delegated to the
 * shared eventState selectors so it stays in lock-step with the live screens.
 */
export function buildSummaryReport(input: BuildSummaryReportInput): SummaryReport {
  const { event, families, bookings, seudot, registrations, locks, isClosed } = input;

  const eventRegistrations = registrations.filter(r => r.eventId === event.id);

  const candleStats = computeCandleStats(bookings);
  const meals = computeMealStats(event, seudot, eventRegistrations, bookings);
  const rooms = computeRoomStats(bookings, locks, isClosed);

  const seudahTypeById = new Map(meals.eventSeudot.map(s => [s.id, s.type as string]));
  const commitments = buildCommitments(eventRegistrations, seudahTypeById);
  const sleepers = buildSleepers(bookings, families);

  const eventDt = eventDate(event);
  const familyEvents =
    input.birthdays || input.memorials
      ? buildFamilyEvents(input.birthdays ?? [], input.memorials ?? [], {
          today: eventDt ?? undefined,
          horizonDays: 30,
          limit: 8,
        })
      : [];

  return {
    header: buildHeader(event),
    cards: {
      totalCandles: candleStats.total,
      totalSleepers: rooms.sleepingGuests,
      peakDiners: meals.peakLoad,
      totalCommitments: commitments.length,
    },
    candles: buildCandleSection(candleStats),
    meals,
    autoAttendees: {
      residents: HOUSEHOLD_RESIDENTS.map(p => p.name),
      permanentGuests: PERMANENT_GUESTS.map(p => p.name),
      count: AUTO_ATTENDEES_COUNT,
    },
    commitments,
    rooms,
    sleepers,
    totalSleepers: rooms.sleepingGuests,
    familyEvents,
  };
}
