import { itemOccurrences } from './plan';
import type { AugustTimelineItem } from '@/types/august';

// ── Family holidays as shared events ────────────────────────────────────────
// A "חופשה משפחתית" is one family event stored as N per-member copies (the
// coverage engine, analytics and timeline all reason per person, so copies keep
// every downstream derivation untouched). What makes it ONE event is the shared
// groupId: editing or deleting any copy fans out to the whole group.
//
// Backward compatibility: copies created before groupId existed are grouped
// implicitly by (type, title, date, endDate) — the exact tuple the old fan-out
// duplicated — so legacy holidays edit/delete as one event too, and no stored
// data is ever migrated or mutated just by loading the page.

export const FAMILY_HOLIDAY_TYPE = 'חופשה משפחתית';

export function isFamilyHoliday(it: Pick<AugustTimelineItem, 'type'>): boolean {
  return it.type === FAMILY_HOLIDAY_TYPE;
}

/** Fresh group id for a newly created shared event. */
export function newGroupId(): string {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The identity of the shared event this item belongs to. Explicit groupId wins;
 * legacy copies fall back to the tuple the old fan-out kept identical across
 * members. Non-holiday items have no group (each stands alone).
 */
export function holidayGroupKey(it: AugustTimelineItem): string | null {
  if (!isFamilyHoliday(it)) return null;
  if (it.groupId) return `g:${it.groupId}`;
  return `legacy:${it.title}|${it.date}|${it.endDate ?? ''}`;
}

/**
 * Every copy of the same family holiday as `target` (target included).
 * For non-holiday items, returns just the item itself.
 */
export function holidayGroup(
  items: AugustTimelineItem[],
  target: AugustTimelineItem,
): AugustTimelineItem[] {
  const key = holidayGroupKey(target);
  if (!key) return [target];
  return items.filter(it => holidayGroupKey(it) === key);
}

/**
 * Distinct dates on which any family holiday occurs — powers the day-rail 🏖
 * marker and the "family holiday days" summary count.
 */
export function familyHolidayDates(items: AugustTimelineItem[]): Set<string> {
  const dates = new Set<string>();
  const seen = new Set<string>();
  for (const it of items) {
    const key = holidayGroupKey(it);
    if (!key || seen.has(key)) continue; // one expansion per group is enough
    seen.add(key);
    for (const d of itemOccurrences(it)) dates.add(d);
  }
  return dates;
}

/**
 * The part of an edited holiday that is shared by the whole family. Person-
 * specific fields (personId, cost — stored once on one copy — and transport
 * assignments) stay on the copy that was actually edited; everything that
 * describes the event itself fans out to every member's copy.
 * Undefined values are intentional "clear this field" markers for updates.
 */
export function sharedHolidayPatch(
  draft: Partial<AugustTimelineItem>,
): Partial<AugustTimelineItem> {
  return {
    type: draft.type,
    title: draft.title,
    date: draft.date,
    endDate: draft.endDate,
    daysOfWeek: draft.daysOfWeek,
    startTime: draft.startTime,
    endTime: draft.endTime,
    location: draft.location,
    notes: draft.notes,
    isCritical: draft.isCritical,
    groupId: draft.groupId,
  };
}

/** The first family-holiday item occurring on `date`, if any (for the banner). */
export function holidayOnDate(
  items: AugustTimelineItem[],
  date: string,
): AugustTimelineItem | undefined {
  return items.find(it => isFamilyHoliday(it) && itemOccurrences(it).includes(date));
}
