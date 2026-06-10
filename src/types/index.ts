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
  { id: 'israel',   name: 'חדר ישראל', icon: '🛏', cap: 'זוג או 2 בודדים',   detail: 'עם מיטה זוגית / שתי יחידות',    maxAdults: 2 },
  { id: 'yehuda',   name: 'חדר יהודה', icon: '🛏', cap: 'זוג + תינוק',        detail: 'עריסה זמינה',                     maxAdults: 2, hasCrib: true },
  { id: 'hayechida',name: 'היחידה',    icon: '🏠', cap: 'זוג + תינוק',        detail: 'כניסה עצמאית',                   maxAdults: 2, hasCrib: true },
];

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

// ── Food ──────────────────────────────────────────────────────────────────
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
  { id: 'meals',         label: 'ארוחות',     icon: '🍲', path: '/meals',         showInMobile: false },
  { id: 'hosting',       label: 'אירוחים',    icon: '🏡', path: '/hosting',       showInMobile: true },
  { id: 'family',        label: 'משפחה',      icon: '👨‍👩‍👧‍👦', path: '/family',        showInMobile: true },
  { id: 'family-tree',   label: 'עץ משפחה',  icon: '🌳', path: '/family-tree',   showInMobile: false },
  { id: 'notifications', label: 'התראות',     icon: '🔔', path: '/notifications', showInMobile: false },
  { id: 'settings',      label: 'הגדרות',     icon: '⚙', path: '/settings',      showInMobile: false },
  { id: 'admin',         label: 'ניהול',      icon: '🛡', path: '/admin',         adminOnly: true, showInMobile: false },
];

export const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(n => n.showInMobile);
