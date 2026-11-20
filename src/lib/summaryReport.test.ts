import { describe, it, expect } from 'vitest';
import {
  buildSummaryReport,
  HOST_CITY,
  NOT_ENTERED,
  type BuildSummaryReportInput,
} from './summaryReport';
import { BASE_CANDLES } from './eventState';
import { AUTO_ATTENDEES_COUNT, defaultSeudahId } from '@/types';
import type {
  AppEvent,
  Booking,
  Family,
  SeudahRegistration,
} from '@/types';

// ── Builders ──────────────────────────────────────────────────────────────
function ts(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return { toDate: () => d } as AppEvent['date'];
}
const EVENT_ID = 'shabbat-2099-01-03';
function shabbat(partial: Partial<AppEvent> = {}): AppEvent {
  return {
    id: EVENT_ID,
    title: 'שבת בהעלותך',
    type: 'shabbat',
    date: ts('2099-01-03'),
    notes: '',
    parasha: 'בהעלותך',
    ...partial,
  };
}
function family(p: Partial<Family> & Pick<Family, 'id'>): Family {
  return {
    husband: 'משה', wife: 'שרה', adults: 2, kids: 0, status: '', needs: '',
    whatsapp: '', email: '', ...p,
  };
}
function booking(p: Partial<Booking> & Pick<Booking, 'roomId'>): Booking {
  return {
    id: `bk-${Math.random()}`,
    familyId: 'fam',
    familyName: 'כהן',
    eventId: EVENT_ID,
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
    eventId: EVENT_ID,
    familyName: 'כהן',
    adults: 0,
    kids: 0,
    diners: 0,
    ...p,
  };
}

function build(overrides: Partial<BuildSummaryReportInput> = {}) {
  return buildSummaryReport({
    event: shabbat(),
    families: [],
    bookings: [],
    seudot: [],
    registrations: [],
    locks: {},
    isClosed: false,
    ...overrides,
  });
}

// ── Header ──────────────────────────────────────────────────────────────────
describe('header', () => {
  it('reports kind, parasha, host city and Hebrew date', () => {
    const { header } = build();
    expect(header.kindLabel).toBe('שבת');
    expect(header.isHoliday).toBe(false);
    expect(header.parasha).toBe('בהעלותך');
    expect(header.hostCity).toBe(HOST_CITY);
    expect(header.hebrewDate).not.toBe(NOT_ENTERED);
    expect(header.gregorianDate).not.toBe(NOT_ENTERED);
  });

  it('marks holidays', () => {
    const { header } = build({ event: shabbat({ type: 'holiday', title: 'פסח', parasha: undefined }) });
    expect(header.isHoliday).toBe(true);
    expect(header.kindLabel).toBe('חג');
    expect(header.parasha).toBeUndefined();
  });
});

// ── Candles ───────────────────────────────────────────────────────────────
describe('candles', () => {
  it('is just the base when nobody sleeps in Karmiel', () => {
    const { candles } = build();
    expect(candles.total).toBe(BASE_CANDLES);
    expect(candles.rows).toHaveLength(1);
    expect(candles.rows[0]).toMatchObject({ isBase: true, candles: BASE_CANDLES, people: null });
  });

  it('adds parents + children for each sleeping married family', () => {
    // Cohen: 2 parents + 3 kids = 5 candles; Levi: 2 + 1 = 3 candles.
    const { candles } = build({
      bookings: [
        booking({ roomId: 'penina', familyId: 'cohen', familyName: 'כהן', adults: 2, kids: 3 }),
        booking({ roomId: 'israel', familyId: 'levi', familyName: 'לוי', adults: 2, kids: 1 }),
      ],
    });
    expect(candles.total).toBe(BASE_CANDLES + 5 + 3);
    expect(candles.rows).toHaveLength(3); // base + 2 families
    const cohen = candles.rows.find(r => r.familyName.includes('כהן'))!;
    expect(cohen).toMatchObject({ people: 5, candles: 5, sleepsInKarmiel: true });
  });

  it('ignores a single sleeping adult (not a married nuclear family)', () => {
    const { candles } = build({
      bookings: [booking({ roomId: 'penina', familyId: 'single', adults: 1, kids: 0 })],
    });
    expect(candles.total).toBe(BASE_CANDLES);
    expect(candles.rows).toHaveLength(1);
  });

  it('collapses a family booked into two rooms into one row', () => {
    const { candles } = build({
      bookings: [
        booking({ roomId: 'penina', familyId: 'cohen', adults: 2, kids: 1 }),
        booking({ roomId: 'israel', familyId: 'cohen', adults: 0, kids: 2 }),
      ],
    });
    expect(candles.rows).toHaveLength(2); // base + one Cohen row
    const cohen = candles.rows.find(r => !r.isBase)!;
    expect(cohen.candles).toBe(5); // 2 parents + 3 kids
  });
});

// ── Meals / default guests ──────────────────────────────────────────────────
describe('meals & default guests', () => {
  it('every seudah starts from the automatic household + permanent guest base', () => {
    const r = build();
    expect(r.autoAttendees.count).toBe(AUTO_ATTENDEES_COUNT);
    expect(r.autoAttendees.residents).toEqual(['אבא', 'אמא', 'פנינה', 'סבא']);
    expect(r.autoAttendees.permanentGuests).toEqual(['לושה']);
    // Shabbat has three default seudot, each with just the base attendance.
    expect(r.meals.eventSeudot).toHaveLength(3);
    r.meals.perSeudah.forEach(s => expect(s.diners).toBe(AUTO_ATTENDEES_COUNT));
  });

  it('adds registered diners on top of the base and tracks the peak', () => {
    const seudahId = defaultSeudahId(EVENT_ID, 'סעודת שבת');
    const r = build({
      registrations: [reg({ seudahId, familyId: 'cohen', adults: 2, kids: 4, diners: 6 })],
    });
    const seudah = r.meals.perSeudah.find(s => s.seudah.type === 'סעודת שבת')!;
    expect(seudah.diners).toBe(AUTO_ATTENDEES_COUNT + 6);
    expect(r.cards.peakDiners).toBe(AUTO_ATTENDEES_COUNT + 6);
  });

  it('counts a holiday event with the holiday seudot', () => {
    const r = build({ event: shabbat({ type: 'holiday', title: 'פסח' }) });
    expect(r.meals.eventSeudot.map(s => s.type)).toEqual(['ערב חג', 'סעודת חג']);
  });
});

// ── Commitments ─────────────────────────────────────────────────────────────
describe('commitments', () => {
  it('lists only registrations that recorded what they bring, with the seudah', () => {
    const seudahId = defaultSeudahId(EVENT_ID, 'סעודת שבת');
    const r = build({
      registrations: [
        reg({ seudahId, familyId: 'cohen', familyName: 'כהן', diners: 4, bringing: 'קינוח – עוגת שוקולד' }),
        reg({ seudahId, familyId: 'levi', familyName: 'לוי', diners: 3, bringing: '   ' }), // blank → excluded
        reg({ seudahId, familyId: 'mizrahi', familyName: 'מזרחי', diners: 2 }), // none → excluded
      ],
    });
    expect(r.commitments).toHaveLength(1);
    expect(r.commitments[0]).toMatchObject({
      name: 'משפחת כהן',
      bringing: 'קינוח – עוגת שוקולד',
      seudahType: 'סעודת שבת',
    });
    expect(r.cards.totalCommitments).toBe(1);
  });
});

// ── Sleepers & rooms ─────────────────────────────────────────────────────────
describe('sleepers & rooms', () => {
  it('lists each booking with resolved city, room and totals', () => {
    const r = build({
      families: [family({ id: 'cohen', city: 'תל אביב' })],
      bookings: [
        booking({ roomId: 'penina', familyId: 'cohen', familyName: 'כהן', adults: 2, kids: 2 }),
        booking({ roomId: 'israel', familyId: 'external', familyName: 'אורח', adults: 1, kids: 0, isExternalGuest: true }),
      ],
    });
    expect(r.totalSleepers).toBe(5);
    expect(r.cards.totalSleepers).toBe(5);
    const cohen = r.sleepers.find(s => s.familyName.includes('כהן'))!;
    expect(cohen).toMatchObject({ city: 'תל אביב', total: 4, roomName: 'חדר פנינה' });
    const ext = r.sleepers.find(s => s.isExternal)!;
    expect(ext.city).toBe(NOT_ENTERED); // external guest has no family city
  });

  it('falls back to "לא הוזן" when the family has no city', () => {
    const r = build({
      families: [family({ id: 'cohen', city: undefined })],
      bookings: [booking({ roomId: 'penina', familyId: 'cohen', adults: 2, kids: 0 })],
    });
    expect(r.sleepers[0].city).toBe(NOT_ENTERED);
  });
});

// ── Family events (optional section) ─────────────────────────────────────────
describe('family events', () => {
  it('is empty when no birthday/memorial collections are supplied', () => {
    expect(build().familyEvents).toEqual([]);
  });
});
