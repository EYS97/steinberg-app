import { describe, it, expect } from 'vitest';
import {
  resolveDefaultEventId,
  upcomingEventsFrom,
  computeRoomStats,
  computeMealStats,
  computeCandleStats,
  BASE_CANDLES,
} from './eventState';
import {
  ROOMS,
  AUTO_ATTENDEES_COUNT,
  SHABBAT_SEUDOT,
  defaultSeudahId,
} from '@/types';
import type { AppEvent, Booking, SeudahRegistration } from '@/types';

// ── Helpers ─────────────────────────────────────────────────────────────────
function ts(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { toDate: () => d } as AppEvent['date'];
}
function shabbat(dateStr: string): AppEvent {
  return { id: `shabbat-${dateStr}`, title: 'שבת', type: 'shabbat', date: ts(dateStr), notes: '' };
}
function makeEvent(partial: Partial<AppEvent> & Pick<AppEvent, 'id' | 'type'>): AppEvent {
  return { title: '', date: ts('2099-01-03'), notes: '', ...partial };
}
function booking(p: Partial<Booking> & Pick<Booking, 'roomId'>): Booking {
  return {
    id: `bk-${Math.random()}`,
    familyId: 'fam',
    familyName: 'משפחה',
    eventId: 'shabbat-2099-01-03',
    eventTitle: '',
    adults: 0,
    kids: 0,
    notes: '',
    mealParticipation: [],
    ...p,
  };
}
function reg(p: Partial<SeudahRegistration> & Pick<SeudahRegistration, 'seudahId' | 'familyId'>): SeudahRegistration {
  return {
    id: `r-${Math.random()}`,
    eventId: 'shabbat-2099-01-03',
    familyName: 'משפחה',
    adults: 0,
    kids: 0,
    diners: 0,
    ...p,
  };
}

const BEDS_TOTAL = ROOMS.reduce((s, r) => s + r.maxAdults, 0);

// ── Event selection ──────────────────────────────────────────────────────────
describe('resolveDefaultEventId / upcomingEventsFrom', () => {
  it('returns "" when there is no Shabbat/holiday', () => {
    expect(resolveDefaultEventId([], new Date())).toBe('');
  });

  it('filters out events that have halachically ended', () => {
    const past = shabbat('2000-01-01');
    const future = shabbat('2099-01-03');
    const list = upcomingEventsFrom([past, future], new Date());
    expect(list.map(e => e.id)).toEqual([future.id]);
  });

  it('shabbatHolidayOnly excludes non Shabbat/holiday events', () => {
    const sh = shabbat('2099-01-03');
    const memorial = makeEvent({ id: 'mem-2099-01-04', type: 'memorial', date: ts('2099-01-04') });
    const all = upcomingEventsFrom([sh, memorial], new Date());
    const shOnly = upcomingEventsFrom([sh, memorial], new Date(), { shabbatHolidayOnly: true });
    expect(all.map(e => e.id)).toContain('mem-2099-01-04');
    expect(shOnly.map(e => e.id)).not.toContain('mem-2099-01-04');
    expect(shOnly.map(e => e.id)).toContain(sh.id);
  });
});

// ── Rooms ─────────────────────────────────────────────────────────────────────
describe('computeRoomStats', () => {
  it('treats every room as free when there are no bookings', () => {
    const s = computeRoomStats([], {}, false);
    expect(s.freeRooms).toBe(ROOMS.length);
    expect(s.bookedRooms).toBe(0);
    expect(s.allFull).toBe(false);
    expect(s.availableBeds).toBe(BEDS_TOTAL);
    expect(s.sleepingGuests).toBe(0);
    expect(s.perRoom.every(r => r.status === 'available')).toBe(true);
  });

  it('marks a room booked as soon as a single booking exists (not by capacity)', () => {
    // penina has capacity 4; a 2-adult booking must still mark it taken, matching
    // the Rooms page (which blocks a second booking and never shows it free).
    const s = computeRoomStats([booking({ roomId: 'penina', adults: 2, kids: 1 })], {}, false);
    const penina = s.perRoom.find(r => r.room.id === 'penina')!;
    expect(penina.booked).toBe(true);
    expect(penina.available).toBe(false);
    expect(penina.status).toBe('booked');
    expect(penina.guests).toBe(3);
    expect(s.bookedRooms).toBe(1);
    expect(s.freeRooms).toBe(ROOMS.length - 1);
    expect(s.availableBeds).toBe(BEDS_TOTAL - 4); // penina's 4 beds no longer bookable
    expect(s.sleepingGuests).toBe(3);
  });

  it('honours locks', () => {
    const s = computeRoomStats([], { israel: true }, false);
    const israel = s.perRoom.find(r => r.room.id === 'israel')!;
    expect(israel.status).toBe('locked');
    expect(israel.available).toBe(false);
    expect(s.freeRooms).toBe(ROOMS.length - 1);
  });

  it('closes every free room when the event is closed', () => {
    const s = computeRoomStats([], {}, true);
    expect(s.freeRooms).toBe(0);
    expect(s.allFull).toBe(true);
    expect(s.availableBeds).toBe(0);
    expect(s.perRoom.every(r => r.status === 'closed')).toBe(true);
  });
});

// ── Meals ───────────────────────────────────────────────────────────────────
describe('computeMealStats', () => {
  const event = shabbat('2099-01-03');
  const firstSeudahId = defaultSeudahId(event.id, SHABBAT_SEUDOT[0]);

  it('every seudah includes the permanent household/guest base', () => {
    const m = computeMealStats(event, [], [], []);
    expect(m.eventSeudot).toHaveLength(SHABBAT_SEUDOT.length);
    expect(m.perSeudah.every(s => s.diners === AUTO_ATTENDEES_COUNT)).toBe(true);
    expect(m.totalDiners).toBe(AUTO_ATTENDEES_COUNT * SHABBAT_SEUDOT.length);
    expect(m.totalFamilies).toBe(0);
    expect(m.peakLoad).toBe(AUTO_ATTENDEES_COUNT);
  });

  it('adds direct family registrations', () => {
    const m = computeMealStats(
      event, [],
      [reg({ seudahId: firstSeudahId, familyId: 'famA', diners: 3 })],
      []
    );
    const first = m.bySeudahId[firstSeudahId];
    expect(first.diners).toBe(AUTO_ATTENDEES_COUNT + 3);
    expect(first.partyCount).toBe(1);
    expect(m.totalFamilies).toBe(1);
    expect(m.peakLoad).toBe(AUTO_ATTENDEES_COUNT + 3);
  });

  it('counts room bookings that opted into a meal', () => {
    const m = computeMealStats(
      event, [], [],
      [booking({ roomId: 'penina', familyId: 'famB', adults: 2, kids: 0, mealParticipation: [SHABBAT_SEUDOT[0]] })]
    );
    const first = m.bySeudahId[firstSeudahId];
    expect(first.diners).toBe(AUTO_ATTENDEES_COUNT + 2);
    expect(first.roomGuests).toHaveLength(1);
    expect(m.totalFamilies).toBe(1);
  });

  it('does not double-count a family registered directly and also via a room booking', () => {
    const m = computeMealStats(
      event, [],
      [reg({ seudahId: firstSeudahId, familyId: 'famC', diners: 4 })],
      [booking({ roomId: 'penina', familyId: 'famC', adults: 2, mealParticipation: [SHABBAT_SEUDOT[0]] })]
    );
    const first = m.bySeudahId[firstSeudahId];
    // The booking is excluded for this seudah — only the direct registration counts.
    expect(first.diners).toBe(AUTO_ATTENDEES_COUNT + 4);
    expect(first.roomGuests).toHaveLength(0);
    expect(m.totalFamilies).toBe(1);
  });

  it('keeps external guests even when a family of the same id is registered', () => {
    const m = computeMealStats(
      event, [],
      [reg({ seudahId: firstSeudahId, familyId: 'external', diners: 2 })],
      [booking({ roomId: 'penina', familyId: 'external', isExternalGuest: true, adults: 3, mealParticipation: [SHABBAT_SEUDOT[0]] })]
    );
    const first = m.bySeudahId[firstSeudahId];
    expect(first.roomGuests).toHaveLength(1);
    expect(first.diners).toBe(AUTO_ATTENDEES_COUNT + 2 + 3);
  });

  it('returns empty stats for no event', () => {
    const m = computeMealStats(null, [], [], []);
    expect(m.eventSeudot).toHaveLength(0);
    expect(m.totalDiners).toBe(0);
    expect(m.totalFamilies).toBe(0);
  });
});

// ── Shabbat candles ───────────────────────────────────────────────────────────
describe('computeCandleStats', () => {
  it('is just the mother-of-the-house baseline when nobody sleeps', () => {
    const c = computeCandleStats([]);
    expect(c.base).toBe(BASE_CANDLES);
    expect(c.total).toBe(10);
    expect(c.families).toHaveLength(0);
  });

  it('adds parents + children for a sleeping married nuclear family', () => {
    // 2 parents + 3 children adds 5 candles → 15 total.
    const c = computeCandleStats([
      booking({ roomId: 'penina', familyId: 'famA', familyName: 'כהן', adults: 2, kids: 3 }),
    ]);
    expect(c.families).toHaveLength(1);
    expect(c.families[0]).toMatchObject({ familyName: 'כהן', parents: 2, children: 3, candles: 5 });
    expect(c.total).toBe(15);
  });

  it('does not count a lone sleeping adult (single guest)', () => {
    const c = computeCandleStats([
      booking({ roomId: 'israel', familyId: 'single', adults: 1, kids: 0 }),
    ]);
    expect(c.families).toHaveLength(0);
    expect(c.total).toBe(10);
  });

  it('sums multiple sleeping families', () => {
    const c = computeCandleStats([
      booking({ roomId: 'penina', familyId: 'famA', familyName: 'כהן', adults: 2, kids: 4 }), // 6
      booking({ roomId: 'israel', familyId: 'famB', familyName: 'לוי', adults: 2, kids: 1 }), // 3
    ]);
    expect(c.families).toHaveLength(2);
    expect(c.total).toBe(10 + 6 + 3);
  });

  it('counts a family once when it booked more than one room', () => {
    const c = computeCandleStats([
      booking({ roomId: 'penina', familyId: 'famA', familyName: 'כהן', adults: 2, kids: 2 }),
      booking({ roomId: 'israel', familyId: 'famA', familyName: 'כהן', adults: 0, kids: 2 }),
    ]);
    expect(c.families).toHaveLength(1);
    expect(c.families[0]).toMatchObject({ parents: 2, children: 4, candles: 6 });
    expect(c.total).toBe(16);
  });

  it('keeps external guests as distinct parties', () => {
    const c = computeCandleStats([
      booking({ roomId: 'penina', familyId: 'ext', familyName: 'אורח א', isExternalGuest: true, adults: 2, kids: 1 }),
      booking({ roomId: 'israel', familyId: 'ext', familyName: 'אורח ב', isExternalGuest: true, adults: 2, kids: 0 }),
    ]);
    expect(c.families).toHaveLength(2);
    expect(c.total).toBe(10 + 3 + 2);
  });
});
