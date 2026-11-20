import type { Timestamp } from 'firebase/firestore';
import type { CalendarType, HebrewDateParts } from '@/lib/dates';

// ── Auth ──────────────────────────────────────────────────────────────────
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

// ── Family ────────────────────────────────────────────────────────────────
export interface Family {
  id: string;
  husband: string;
  wife: string;
  adults: number;
  kids: number;
  status: string;
  needs: string;
  whatsapp: string;
  email: string;
  city?: string;
  createdBy?: string;
  createdAt?: Timestamp;
}

// ── Family tree ───────────────────────────────────────────────────────────
export interface TreePerson {
  id: string;
  nameHe?: string;
  nameLatin?: string;
  nickname?: string;
  maidenName?: string;
  gender?: 'm' | 'f';
  birthYear?: number | null;
  birthCity?: string;
  deathYear?: number | null;
  originCountry?: string;
  burialPlace?: string;
  story?: string;
  /** Data-URL of a small (200px) profile photo */
  photoData?: string | null;
  fatherId?: string | null;
  motherId?: string | null;
  spouseId?: string | null;
  createdAt?: Timestamp;
}

// ── Rooms ─────────────────────────────────────────────────────────────────
export interface Room {
  id: string;
  name: string;
  icon: string;
  cap: string;
  detail: string;
  maxAdults: number;
  hasCrib?: boolean;
}

export const ROOMS: Room[] = [
  { id: 'penina',    name: 'חדר פנינה', icon: '🛏', cap: '4 מיטות בודדות',    detail: 'מתאים עד 4 אנשים',               maxAdults: 4 },
  // Display names only — the ids are stable keys that bookings/locks reference.
  // June 2026: ישראל התחתן ועבר; חדרו הפך לחדר יהודה, וחדר יהודה הישן — לסלון.
  { id: 'israel',   name: 'חדר יהודה', icon: '🛏', cap: 'זוג או 2 בודדים',   detail: 'עם מיטה זוגית / שתי יחידות',    maxAdults: 2 },
  { id: 'yehuda',   name: 'סלון',      icon: '🛏', cap: 'זוג + תינוק',        detail: 'עריסה זמינה',                     maxAdults: 2, hasCrib: true },
  { id: 'hayechida',name: 'היחידה',    icon: '🏠', cap: 'זוג + תינוק',        detail: 'כניסה עצמאית',                   maxAdults: 2, hasCrib: true },
];

// ── Permanent attendees (household residents + permanent guest) ───────────
/** A person automatically counted in every seudah — never registered manually.
 *  Residents do not occupy bookable rooms: every room's full capacity is for guests. */
export interface PermanentAttendee {
  name: string;
  /** Household resident (lives at home) vs external permanent guest */
  isResident: boolean;
}

export const HOUSEHOLD_RESIDENTS: PermanentAttendee[] = [
  { name: 'אבא',   isResident: true },
  { name: 'אמא',   isResident: true },
  { name: 'פנינה', isResident: true },
  { name: 'סבא',   isResident: true },
];

/** External permanent guests (לושה — male) — counted in every seudah but never sleep over */
export const PERMANENT_GUESTS: PermanentAttendee[] = [
  { name: 'לושה', isResident: false },
];

export const AUTO_ATTENDEES: PermanentAttendee[] = [...HOUSEHOLD_RESIDENTS, ...PERMANENT_GUESTS];
/** Base attendance of every seudah before any registrations */
export const AUTO_ATTENDEES_COUNT = AUTO_ATTENDEES.length;

// ── Booking ───────────────────────────────────────────────────────────────
export interface Booking {
  id: string;
  roomId: string;
  familyId: string;
  familyName: string;
  eventId: string;
  eventTitle: string;
  adults: number;
  kids: number;
  notes: string;
  mealParticipation: string[];
  isExternalGuest?: boolean;
  /** Auth uid of the user who made the booking. Only this user (or an admin)
   *  may cancel it. Absent on legacy bookings created before this field — those
   *  are admin-cancel-only. */
  createdBy?: string;
  createdAt?: Timestamp;
}

// ── Events ────────────────────────────────────────────────────────────────
export type EventType = 'shabbat' | 'holiday' | 'event' | 'memorial' | 'meal' | 'hosting';

export interface AppEvent {
  id: string;
  title: string;
  date: Timestamp;
  type: EventType;
  notes: string;
  createdAt?: Timestamp;
  /** Parasha name for auto-generated Shabbat events (no "פרשת" prefix) */
  parasha?: string;
  /** True for client-generated events (Shabbatot, Hebcal holidays) — not stored in Firestore */
  auto?: boolean;
  isHoliday?: boolean;
  /** Which calendar the user anchored this event to (default gregorian) */
  calendarType?: CalendarType;
  /** Original Hebrew date when calendarType is 'hebrew' */
  hebrewDate?: HebrewDateParts;
  /** Set when the event repeats annually; determines which calendar drives recurrence */
  recurrenceCalendar?: CalendarType;
  /** For expanded occurrences of recurring events: the Firestore doc id of the source event */
  sourceId?: string;
}

// ── Food (legacy — old dish coordination, kept for the `food` collection) ──
export type MealType = 'ליל שישי' | 'צהריים שבת' | 'ערב שבת';
export type FoodCategory = 'מנות ראשונות' | 'עיקריות' | 'קינוחים' | 'שתייה' | 'כללי';

export interface FoodItem {
  id: string;
  category: FoodCategory | string;
  mealType: MealType | string;
  dish: string;
  family: string;
  familyId: string;
  headcount: number;
  notes: string;
  eventId: string;
  eventTitle: string;
  createdAt?: Timestamp;
}

// ── Seudot (Shabbat & Holiday seudot hosting) ─────────────────────────────
export type SeudahType =
  | 'סעודת ערב שבת'
  | 'סעודת שבת'
  | 'סעודה שלישית'
  | 'ערב חג'
  | 'סעודת חג';

export const SHABBAT_SEUDOT: SeudahType[] = ['סעודת ערב שבת', 'סעודת שבת', 'סעודה שלישית'];
export const HOLIDAY_SEUDOT: SeudahType[] = ['ערב חג', 'סעודת חג'];
export const ALL_SEUDOT: SeudahType[] = [...SHABBAT_SEUDOT, ...HOLIDAY_SEUDOT];

export const SEUDAH_ICONS: Record<SeudahType, string> = {
  'סעודת ערב שבת': '🕯',
  'סעודת שבת':     '☀️',
  'סעודה שלישית':  '🌅',
  'ערב חג':        '🕯',
  'סעודת חג':      '✨',
};

/** "What are you bringing?" quick-pick options; 'אחר' enables free text */
export const BRINGING_OPTIONS = ['קינוח', 'מנה עיקרית', 'סלט', 'שתייה', 'אחר'] as const;

export interface Seudah {
  id: string;
  eventId: string;
  eventTitle: string;
  type: SeudahType;
  createdAt?: Timestamp;
  createdBy?: string;
  /** True for auto-default seudot that aren't (yet) stored in Firestore. Always
   *  present for every Shabbat/holiday — families join them, nobody creates them. */
  synthetic?: boolean;
}

/** The seudot every Shabbat/holiday has by default. */
export function defaultSeudotTypes(eventType?: string): SeudahType[] {
  return eventType === 'holiday' ? HOLIDAY_SEUDOT : SHABBAT_SEUDOT;
}

/** Deterministic id for an auto-default seudah (so registrations can target it
 *  without anyone having created a Firestore doc). */
export function defaultSeudahId(eventId: string, type: SeudahType): string {
  return `${eventId}__${type}`;
}

/**
 * Every Shabbat/holiday automatically has its seudot — users only choose whether
 * to join. Returns the default seudot for the event in canonical order, reusing
 * any Firestore doc that already exists for a type (so legacy registrations keep
 * working) and synthesizing the rest. Manually-added seudot of non-default types
 * (e.g. a holiday that also falls on Shabbat) are appended.
 */
export function seudotForEvent(
  event: { id: string; title?: string; type?: string } | undefined | null,
  all: Seudah[]
): Seudah[] {
  if (!event) return [];
  const fs = all.filter(s => s.eventId === event.id);
  const byType = new Map(fs.map(s => [s.type, s]));
  const defaults = defaultSeudotTypes(event.type);
  const out: Seudah[] = defaults.map(
    type =>
      byType.get(type) ?? {
        id: defaultSeudahId(event.id, type),
        eventId: event.id,
        eventTitle: event.title || '',
        type,
        synthetic: true,
      }
  );
  fs.forEach(s => { if (!defaults.includes(s.type)) out.push(s); });
  return out.sort((a, b) => ALL_SEUDOT.indexOf(a.type) - ALL_SEUDOT.indexOf(b.type));
}

// ── Guest-family limit (מגבלת משפחות מתארחות) ─────────────────────────────
/** Meal-level request status. Legacy registrations have no status field and
 *  are treated as 'approved' everywhere (safe runtime fallback — never migrate). */
export type MealRequestStatus =
  | 'approved'
  | 'pendingAdminApproval'
  | 'rejected'
  | 'cancelled';

export type ApprovalSource =
  | 'automaticWithinLimit'
  | 'adminApproved'
  | 'hostInvited';

export const MEAL_REQUEST_STATUS_LABELS: Record<MealRequestStatus, string> = {
  approved: 'מאושר ✓',
  pendingAdminApproval: 'ממתין לבדיקה',
  rejected: 'לא אושר',
  cancelled: 'בוטל',
};

/**
 * Per-event meal configuration (doc id = eventId, collection `eventMealConfig`).
 * Lives in its own collection because auto-generated Shabbat/holiday events have
 * no Firestore doc of their own. Limits are keyed by seudah *type* — stable for
 * both synthetic seudot and Firestore-doc seudot of the same event.
 */
export interface EventMealConfig {
  id: string; // == eventId
  /** Max complete guest families with children per seudah type. Missing key ⇒ default 2. */
  limits?: Partial<Record<SeudahType, number>>;
  /** The hosting nuclear family for this event; null/absent ⇒ the household hosts. */
  hostFamilyId?: string | null;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

/** Audit log entry for the guest-family-limit mechanism (`mealLimitAudit`). */
export interface MealLimitAudit {
  id: string;
  action:
    | 'attendanceRequested'
    | 'autoApproved'
    | 'sentToAdminApproval'
    | 'adminApproved'
    | 'adminRejected'
    | 'attendanceCancelled'
    | 'autoApprovedAfterCancellation'
    | 'mealFamilyLimitChanged'
    | 'hostInvitedFamily';
  eventId: string;
  seudahType?: string;
  familyId?: string;
  performedByUserId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt?: Timestamp;
}

/**
 * A nuclear-family registration to a single seudah. Attending seudot is
 * independent of sleeping over (rooms/hosting) — no host approval needed.
 */
export interface SeudahRegistration {
  id: string;
  seudahId: string;
  eventId: string;
  familyId: string;
  familyName: string;
  adults: number;
  kids: number;
  /** Total diners — adults + kids, counted automatically from the family record */
  diners: number;
  /** Optional "what are we bringing" note, e.g. "קינוח – עוגת שוקולד" */
  bringing?: string;
  createdAt?: Timestamp;
  createdBy?: string;
  // ── Guest-family-limit fields (all optional — absent on legacy docs) ────
  /** Absent on legacy docs ⇒ treated as 'approved'. */
  status?: MealRequestStatus;
  approvalSource?: ApprovalSource | null;
  /** Queue key for FIFO promotion; falls back to createdAt on older docs. */
  requestedAt?: Timestamp;
  approvedAt?: Timestamp;
  approvedByUserId?: string;
  rejectedAt?: Timestamp;
  rejectedByUserId?: string;
  cancelledAt?: Timestamp;
  /** True when approved automatically after waiting (place became available). */
  promotedAfterWait?: boolean;
  /** Seudah type snapshot — lets admin screens label requests without loading seudot. */
  seudahType?: string;
  /** Event title snapshot for admin screens. */
  eventTitle?: string;
}

// ── Guests ────────────────────────────────────────────────────────────────
export interface Guest {
  id: string;
  name: string;
  count: number;
  phone?: string;
  familyId?: string;
  eventId?: string;
  isPermanent?: boolean;
  createdAt?: Timestamp;
}

// ── Birthdays ─────────────────────────────────────────────────────────────
export interface Birthday {
  id: string;
  name: string;
  /** Gregorian "MM-DD" / "YYYY-MM-DD" (legacy docs may hold a Firestore Timestamp) */
  date: string;
  notes?: string;
  /** Structured Hebrew date; legacy docs may hold a free-text string */
  hebrewDate?: HebrewDateParts | string;
  /** Which calendar the annual recurrence follows (default gregorian) */
  calendarType?: CalendarType;
  createdAt?: Timestamp;
}

// ── Memorials ─────────────────────────────────────────────────────────────
export interface Memorial {
  id: string;
  name: string;
  /** Gregorian "MM-DD" / "YYYY-MM-DD" (legacy docs may hold a Firestore Timestamp) */
  date: string;
  /** Structured Hebrew date; legacy docs may hold a free-text string */
  hebrewDate?: HebrewDateParts | string;
  /** Which calendar the annual recurrence follows (default hebrew for yahrzeits) */
  calendarType?: CalendarType;
  notes?: string;
  createdAt?: Timestamp;
}

// ── Announcements ─────────────────────────────────────────────────────────
export interface Announcement {
  id: string;
  text: string;
  expiresAt?: Timestamp;
  createdAt?: Timestamp;
  createdBy?: string;
}

// ── Hosting ───────────────────────────────────────────────────────────────
export type HostingType = 'meal' | 'sleep' | 'full';
export type CapacityMode = 'singleFamily' | 'multipleFamilies';
export type AvailabilityStatus = 'available' | 'matched' | 'cancelled';

export interface HostingAvailability {
  id: string;
  familyId: string;
  familyName: string;
  eventId: string;
  eventTitle: string;
  city: string;
  type: HostingType;
  meals: string[];
  beds: number;
  mattresses: number;
  maxFamilySize: number;
  capacityMode: CapacityMode;
  notes?: string;
  status: AvailabilityStatus;
  createdAt?: Timestamp;
  createdBy?: string;
}

export type RequestStatus =
  | 'pending'
  | 'host_approved'
  | 'admin_approved'
  | 'confirmed'
  | 'rejected'
  | 'cancelled';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'ממתין לאישור',
  host_approved: 'אושר על ידי המארח',
  admin_approved: 'אושר על ידי הנהלה',
  confirmed: 'מאושר ✓',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};

export interface HostingRequest {
  id: string;
  availabilityId: string;
  guestFamilyId: string;
  guestFamilyName: string;
  adults: number;
  children: number;
  needsSleep: boolean;
  meals: string[];
  notes?: string;
  status: RequestStatus;
  eventId?: string;
  eventTitle?: string;
  hostFamilyId?: string;
  hostFamilyName?: string;
  hostApprovedAt?: Timestamp;
  adminApprovedAt?: Timestamp;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt?: Timestamp;
  createdBy?: string;
}

// ── User analytics (userActivity collection, doc id = auth uid) ───────────
/**
 * Usage analytics per user. Lives in the existing `userActivity` collection —
 * the base doc is written at login (useAuth) and the Home screen visit
 * counters are updated by useTrackHomeVisit. Reads are admin-only by
 * Firestore rules; each user may only write their own doc.
 *
 * Extensible for future engagement metrics — add counters alongside
 * totalHomeVisits (planned: hostingOffersCreated, guestRegistrations,
 * mealRegistrations, sleepRegistrations, matchApprovals, notificationsOpened).
 */
export interface UserAnalytics {
  uid: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Search keys for server-side prefix search */
  nameLower?: string | null;
  emailLower?: string | null;
  phoneDigits?: string | null;
  /** Auth account creation time; null on legacy docs where it is unknown */
  registrationDate: Timestamp | null;
  totalHomeVisits: number;
  /** null = never visited the Home screen */
  lastHomeVisitAt: Timestamp | null;
  lastSeen?: Timestamp;
}

// ── Settings ──────────────────────────────────────────────────────────────
export interface AppSettings {
  anthropicApiKey?: string;
  momPhone?: string;
}

// ── Navigation ────────────────────────────────────────────────────────────
export type NavItem = {
  id: string;
  label: string;
  icon: string;
  path: string;
  adminOnly?: boolean;
  showInMobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { id: 'home',          label: 'בית',       icon: '🏠', path: '/',              showInMobile: true },
  { id: 'calendar',      label: 'לוח שנה',   icon: '📅', path: '/calendar',      showInMobile: true },
  { id: 'rooms',         label: 'חדרים',      icon: '🛏', path: '/rooms',         showInMobile: false },
  { id: 'seudot',        label: 'סעודות',     icon: '🍽', path: '/seudot',        showInMobile: false },
  { id: 'hosting',       label: 'אירוחים',    icon: '🏡', path: '/hosting',       showInMobile: true },
  { id: 'family',        label: 'משפחה',      icon: '👨‍👩‍👧‍👦', path: '/family',        showInMobile: true },
  { id: 'august',        label: 'אוגוסט',     icon: '🏖', path: '/august',        showInMobile: true },
  { id: 'family-tree',   label: 'עץ משפחה',  icon: '🌳', path: '/family-tree',   showInMobile: false },
  { id: 'notifications', label: 'התראות',     icon: '🔔', path: '/notifications', showInMobile: false },
  { id: 'settings',      label: 'הגדרות',     icon: '⚙', path: '/settings',      showInMobile: false },
  { id: 'admin',         label: 'ניהול',      icon: '🛡', path: '/admin',         adminOnly: true, showInMobile: true },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(n => n.showInMobile);
