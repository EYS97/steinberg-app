import type { Timestamp } from 'firebase/firestore';

// ── "אוגוסט רחמנא ליצלן" — family summer operations center ──────────────────
// Self-contained feature: a family's August plan stores its own member list
// (parents + named children) so nothing in the shared `families`/people model
// has to change. Plans + timeline items live in their own Firestore
// collections and are isolated per nuclear family on the client.

/** August is month index 8 (1-based) — the only month this feature plans. */
export const AUGUST_MONTH = 8;

/** Default child-coverage window — configurable per plan. */
export const DEFAULT_COVERAGE_START = '08:00';
export const DEFAULT_COVERAGE_END = '20:00';

// ── Members (stored inside the plan) ───────────────────────────────────────
export type AugustMemberRole =
  | 'parent'
  | 'child'
  | 'grandparent'
  | 'sitter'
  | 'other';

export interface AugustMember {
  id: string;
  name: string;
  role: AugustMemberRole;
}

export const MEMBER_ROLE_LABELS: Record<AugustMemberRole, string> = {
  parent:      'הורה',
  child:       'ילד/ה',
  grandparent: 'סבא/סבתא',
  sitter:      'בייביסיטר',
  other:       'אחר',
};

export const MEMBER_ROLE_EMOJI: Record<AugustMemberRole, string> = {
  parent:      '🧑‍🍼',
  child:       '🧒',
  grandparent: '👴',
  sitter:      '🧑‍🎓',
  other:       '👤',
};

/** Children are the people that need continuous coverage. */
export function isChild(m: AugustMember): boolean {
  return m.role === 'child';
}

// ── Timeline item types ────────────────────────────────────────────────────
export type AugustItemType =
  | 'עבודה'
  | 'חופש מהעבודה'
  | 'קייטנה'
  | 'בייביסיטר'
  | 'סבתא'
  | 'סבא'
  | 'הורה'
  | 'בית'
  | 'חופשה משפחתית'
  | 'מבחן'
  | 'אירוע'
  | 'נסיעה'
  | 'אחר';

export const AUGUST_ITEM_TYPES: AugustItemType[] = [
  'עבודה',
  'חופש מהעבודה',
  'קייטנה',
  'בייביסיטר',
  'סבתא',
  'סבא',
  'הורה',
  'בית',
  'חופשה משפחתית',
  'מבחן',
  'אירוע',
  'נסיעה',
  'אחר',
];

export const AUGUST_TYPE_ICONS: Record<AugustItemType, string> = {
  'עבודה':          '💼',
  'חופש מהעבודה':   '🌴',
  'קייטנה':         '🎒',
  'בייביסיטר':      '🧑‍🎓',
  'סבתא':           '👵',
  'סבא':            '👴',
  'הורה':           '🧑‍🍼',
  'בית':            '🏠',
  'חופשה משפחתית':  '🏖',
  'מבחן':           '📝',
  'אירוע':          '🎉',
  'נסיעה':          '🚗',
  'אחר':            '📌',
};

/**
 * Types that "cover" a child (someone is responsible for them during the slot).
 * Work / vacation-from-work / exams are parent-occupying, not child-covering.
 */
export const COVERING_TYPES: AugustItemType[] = [
  'קייטנה',
  'בייביסיטר',
  'סבתא',
  'סבא',
  'הורה',
  'בית',
  'חופשה משפחתית',
  'נסיעה',
];

/** Types that occupy a parent so they cannot simultaneously cover a child. */
export const PARENT_BUSY_TYPES: AugustItemType[] = ['עבודה'];

/** Types where a start/end time is mandatory (camps & sitters per spec). */
export const TIME_REQUIRED_TYPES: AugustItemType[] = ['קייטנה', 'בייביסיטר'];

// ── Documents ──────────────────────────────────────────────────────────────
export interface AugustTimelineItem {
  id: string;
  planId: string;
  nuclearFamilyId: string;
  /** Gregorian "YYYY-MM-DD" */
  date: string;
  personId: string;
  type: AugustItemType;
  title: string;
  /** Inclusive end date "YYYY-MM-DD" for multi-day items (e.g. a camp); absent → single day. */
  endDate?: string;
  /** Weekdays the item runs on (0=Sun..6=Sat); absent/empty → every day in range. */
  daysOfWeek?: number[];
  /** "HH:MM" 24h */
  startTime: string;
  endTime: string;
  responsiblePersonId?: string;
  dropOffPersonId?: string;
  pickUpPersonId?: string;
  location?: string;
  cost?: number;
  notes?: string;
  isCritical?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** A to-do for a specific day ("משימות היום"). */
export interface AugustTask {
  id: string;
  text: string;
  done: boolean;
}

export interface FamilyAugustPlan {
  id: string;
  nuclearFamilyId: string;
  year: number;
  month: number;
  /** Coverage window "HH:MM" */
  coverageStart: string;
  coverageEnd: string;
  members: AugustMember[];
  /** Free-text per-day host notes, keyed by "YYYY-MM-DD" */
  dayNotes?: Record<string, string>;
  /** Per-day task lists, keyed by "YYYY-MM-DD" */
  dayTasks?: Record<string, AugustTask[]>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}
