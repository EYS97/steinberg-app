import {
  ROOMS,
  AUTO_ATTENDEES_COUNT,
  seudotForEvent,
} from '@/types';
import type { AppEvent, Booking, Seudah, SeudahRegistration } from '@/types';
import { getActiveOrNextJewishEvent, isActiveOrUpcoming } from './jewishEvents';
import { isApprovedReg, isPendingReg } from './familyLimit';

// ── Shared event-state selectors ──────────────────────────────────────────
// Single source of truth for everything the Home, Rooms and Seudot pages show
// about the active Shabbat/holiday. These pages used to each re-derive "which
// event is current", "is this room free" and "how many diners" independently,
// which let the homepage drift out of sync with Rooms/Meals (different default
// event, capacity-vs-booking room logic, meal counts that ignored room guests).
// Every page now resolves through here so the numbers cannot disagree.

/**
 * The id of the event a page should default to: the active-or-next
 * Shabbat/holiday resolved by halachic time (Jerusalem Tzeit). Returns '' when
 * there is no Shabbat/holiday in range. This is the same resolution the home
 * screen's focus card uses, so Rooms/Seudot default to the same event Home shows.
 */
export function resolveDefaultEventId(events: AppEvent[], now: Date): string {
  return getActiveOrNextJewishEvent(events, now)?.eventId ?? '';
}

/**
 * Events still selectable for booking/registration — anything that has not yet
 * halachically ended. `shabbatHolidayOnly` restricts to Shabbat/holiday (Seudot
 * and the Home "upcoming" list); Rooms passes all types since a room can be
 * booked for any event. Order follows the incoming (date-sorted) order.
 */
export function upcomingEventsFrom(
  events: AppEvent[],
  now: Date,
  opts: { shabbatHolidayOnly?: boolean } = {}
): AppEvent[] {
  return events.filter(e => {
    if (opts.shabbatHolidayOnly && e.type !== 'shabbat' && e.type !== 'holiday') {
      return false;
    }
    return isActiveOrUpcoming(e, now);
  });
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export type RoomStatus = 'locked' | 'booked' | 'closed' | 'available';

export interface RoomState {
  room: (typeof ROOMS)[number];
  bookings: Booking[];
  /** A room is taken as soon as a single booking exists — matching the Rooms
   *  page, which blocks a second booking and never shows a booked room as free. */
  booked: boolean;
  locked: boolean;
  /** Guests sleeping in the room (adults + kids across its bookings). */
  guests: number;
  /** Adults booked, clamped to capacity — for the occupancy bar. */
  occupiedAdults: number;
  /** Families/guests assigned to the room, for tooltips. */
  assigned: string[];
  status: RoomStatus;
  /** Free to book right now: not booked, not locked, registration open. */
  available: boolean;
}

export interface RoomStats {
  perRoom: RoomState[];
  /** Rooms free to book right now (the Rooms page's "פנוי"). */
  freeRooms: number;
  /** Rooms that already have a booking (the Rooms page's "booked"). */
  bookedRooms: number;
  /** True when no room is free to book. */
  allFull: boolean;
  /** Beds still bookable — full capacity of every available room (residents do
   *  not occupy bookable rooms, so all capacity is for guests). */
  availableBeds: number;
  /** Total guests sleeping over this event. */
  sleepingGuests: number;
}

/**
 * Per-room and aggregate sleeping state, using the exact "booked = a booking
 * exists" semantics of the Rooms page so the homepage can never show a room as
 * free that the Rooms page shows as taken. A room is bookable only when it has
 * no booking, is not locked, and registration is open.
 */
export function computeRoomStats(
  eventBookings: Booking[],
  locks: Record<string, boolean>,
  isClosed: boolean
): RoomStats {
  const perRoom: RoomState[] = ROOMS.map(room => {
    const bookings = eventBookings.filter(b => b.roomId === room.id);
    const booked = bookings.length > 0;
    const locked = !!locks[room.id];
    const guests = bookings.reduce((s, b) => s + (b.adults || 0) + (b.kids || 0), 0);
    const occupiedAdults = Math.min(
      room.maxAdults,
      bookings.reduce((s, b) => s + (b.adults || 0), 0)
    );
    const available = !booked && !locked && !isClosed;
    const status: RoomStatus = locked
      ? 'locked'
      : booked
        ? 'booked'
        : isClosed
          ? 'closed'
          : 'available';
    return {
      room,
      bookings,
      booked,
      locked,
      guests,
      occupiedAdults,
      assigned: bookings.map(b => `משפחת ${b.familyName}`),
      status,
      available,
    };
  });

  const freeRooms = perRoom.filter(r => r.available).length;
  const bookedRooms = perRoom.filter(r => r.booked).length;
  const availableBeds = perRoom
    .filter(r => r.available)
    .reduce((s, r) => s + r.room.maxAdults, 0);
  const sleepingGuests = perRoom.reduce((s, r) => s + r.guests, 0);

  return {
    perRoom,
    freeRooms,
    bookedRooms,
    allFull: freeRooms === 0,
    availableBeds,
    sleepingGuests,
  };
}

// ── Meals (seudot) ────────────────────────────────────────────────────────

export interface SeudahState {
  seudah: Seudah;
  /** Approved registrations only — pending/rejected requests never reach any
   *  diner, chair, dish or report count. Legacy docs (no status) are approved. */
  registrations: SeudahRegistration[];
  /** Requests waiting for admin approval (guest-family limit). Shown only to
   *  the requesting family, the host and admins — never in public counts. */
  pendingRegistrations: SeudahRegistration[];
  /** Room bookings counted toward this seudah (opted into the meal, not already
   *  registered directly), matching the Seudot page. */
  roomGuests: Booking[];
  /** Total diners = household/permanent base + registrations + room guests. */
  diners: number;
  /** Registered families + room-guest parties (excludes the automatic base). */
  partyCount: number;
}

export interface MealStats {
  eventSeudot: Seudah[];
  perSeudah: SeudahState[];
  bySeudahId: Record<string, SeudahState>;
  /** Sum of diners across every seudah (the Seudot page's "סועדים סה״כ"). */
  totalDiners: number;
  /** Distinct families/parties attending any seudah (the Seudot page's "משפחות"). */
  totalFamilies: number;
  /** Highest single-seudah diner count — drives the homepage load badge. */
  peakLoad: number;
}

const bookingDiners = (b: Booking) => (b.adults || 0) + (b.kids || 0);

/**
 * Diner and family counts for every seudah of an event, replicating the Seudot
 * page exactly: every seudah includes the permanent household + guest base,
 * direct family registrations, and room bookings that opted into that meal
 * (de-duplicated against families already registered directly).
 */
export function computeMealStats(
  event: AppEvent | undefined | null,
  allSeudot: Seudah[],
  allRegistrations: SeudahRegistration[],
  eventBookings: Booking[]
): MealStats {
  const eventSeudot = seudotForEvent(event, allSeudot);
  const eventRegs = event
    ? allRegistrations.filter(r => r.eventId === event.id)
    : [];

  // Only approved registrations feed counts; pending requests (guest-family
  // limit) surface separately and never affect diners/chairs/reports.
  const regsBySeudah: Record<string, SeudahRegistration[]> = {};
  const pendingBySeudah: Record<string, SeudahRegistration[]> = {};
  eventRegs.forEach(r => {
    if (isApprovedReg(r)) (regsBySeudah[r.seudahId] ??= []).push(r);
    else if (isPendingReg(r)) (pendingBySeudah[r.seudahId] ??= []).push(r);
  });

  const bookingsForSeudah = (s: Seudah): Booking[] => {
    const direct = new Set((regsBySeudah[s.id] || []).map(r => r.familyId));
    return eventBookings.filter(
      b =>
        Array.isArray(b.mealParticipation) &&
        b.mealParticipation.includes(s.type) &&
        (b.isExternalGuest || !direct.has(b.familyId))
    );
  };

  const perSeudah: SeudahState[] = eventSeudot.map(seudah => {
    const registrations = regsBySeudah[seudah.id] || [];
    const roomGuests = bookingsForSeudah(seudah);
    const diners =
      AUTO_ATTENDEES_COUNT +
      registrations.reduce((sum, r) => sum + (r.diners || 0), 0) +
      roomGuests.reduce((sum, b) => sum + bookingDiners(b), 0);
    return {
      seudah,
      registrations,
      pendingRegistrations: pendingBySeudah[seudah.id] || [],
      roomGuests,
      diners,
      partyCount: registrations.length + roomGuests.length,
    };
  });

  const bySeudahId: Record<string, SeudahState> = {};
  perSeudah.forEach(s => { bySeudahId[s.seudah.id] = s; });

  const totalDiners = perSeudah.reduce((sum, s) => sum + s.diners, 0);
  const peakLoad = perSeudah.reduce((m, s) => Math.max(m, s.diners), 0);

  const familyKeys = new Set<string>();
  eventRegs.forEach(r => { if (isApprovedReg(r)) familyKeys.add(r.familyId); });
  perSeudah.forEach(s =>
    s.roomGuests.forEach(b =>
      familyKeys.add(b.isExternalGuest ? `ext:${b.id}` : b.familyId)
    )
  );

  return {
    eventSeudot,
    perSeudah,
    bySeudahId,
    totalDiners,
    totalFamilies: familyKeys.size,
    peakLoad,
  };
}

// ── Shabbat candles ──────────────────────────────────────────────────────────
// Operational prep for lighting Shabbat candles in Karmiel. The mother of the
// house always lights a fixed baseline; every *sleeping* married nuclear family
// adds candles for its own members. Sleeping is determined by room bookings
// (the `bookings` collection) — meal-only guests live in seudahRegistrations and
// so never count here, which is exactly the rule we want.

/** Candles the mother of the house always lights, independent of any guests. */
export const BASE_CANDLES = 10;

export interface CandleFamily {
  /** De-dup key — familyId, or `ext:<bookingId>` for external guests. */
  key: string;
  familyName: string;
  /** Parents (adults) in the sleeping family. */
  parents: number;
  /** Children (kids) in the sleeping family. */
  children: number;
  /** Candles this family adds = parents + children. */
  candles: number;
}

export interface CandleStats {
  /** The mother-of-the-house baseline (BASE_CANDLES). */
  base: number;
  /** One entry per sleeping married nuclear family that adds candles. */
  families: CandleFamily[];
  /** base + Σ family candles. */
  total: number;
}

/**
 * Shabbat candle requirement for an event.
 *
 *  - The mother of the house always lights {@link BASE_CANDLES} (default 10).
 *  - Only families that registered for *sleeping* count — and `eventBookings`
 *    are exactly the room bookings, so meal-only guests are already excluded.
 *  - Only a married nuclear family adds candles: a married couple means two
 *    parents, so a lone adult (single guest) creates no requirement.
 *  - Each family adds `parents + children` candles.
 *  - A family that booked more than one room (or sleep + meals) is collapsed to
 *    one entry so members are never double-counted; external guests are always
 *    distinct parties.
 */
export function computeCandleStats(eventBookings: Booking[]): CandleStats {
  // Collapse all of a family's sleeping bookings into one party first, so a
  // family split across two rooms (or registered for sleep and meals) is counted
  // exactly once and its members are summed rather than double-counted.
  const byFamily = new Map<string, { name: string; parents: number; children: number }>();
  for (const b of eventBookings) {
    const key = b.isExternalGuest ? `ext:${b.id}` : b.familyId;
    const entry = byFamily.get(key) ?? { name: b.familyName, parents: 0, children: 0 };
    entry.parents += b.adults || 0;
    entry.children += b.kids || 0;
    byFamily.set(key, entry);
  }

  const families: CandleFamily[] = [];
  for (const [key, e] of byFamily) {
    // A married nuclear family has two parents; a single sleeping guest does not
    // create a separate candle requirement.
    if (e.parents < 2) continue;
    families.push({
      key,
      familyName: e.name,
      parents: e.parents,
      children: e.children,
      candles: e.parents + e.children,
    });
  }
  families.sort((a, b) => a.familyName.localeCompare(b.familyName, 'he'));

  const total = BASE_CANDLES + families.reduce((s, f) => s + f.candles, 0);
  return { base: BASE_CANDLES, families, total };
}
