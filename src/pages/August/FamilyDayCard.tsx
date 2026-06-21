import React, { useMemo } from 'react';
import { Car, Plus } from 'lucide-react';
import { formatDayLabel } from '@/lib/august/plan';
import {
  orderedMembers, transportationForDay, dayBadge, DAY_BADGE_LABEL, type DayBadge,
} from '@/lib/august/dayView';
import { itemsOnDate } from '@/lib/august/dayView';
import { AUGUST_TYPE_ICONS, COVERING_TYPES } from '@/types/august';
import { AUGUST_TYPE_TONE } from './typeStyles';
import { Avatar } from './Avatar';
import type { AugustIssue } from '@/lib/august/issues';
import type { AugustDay } from '@/lib/august/plan';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

// ── FamilyDayCard — the day as a mini family dashboard ──────────────────────
// People-first: children dominate (each with coverage status + inline gap chips),
// parents sit in a compact footer, transport on one line. Answers "what is each
// family member doing today?" without opening the day. Detail/edit lives in the
// day modal (the whole card is a button that opens it).

interface FamilyDayCardProps {
  day: AugustDay;
  members: AugustMember[];
  dayItems: AugustTimelineItem[];
  issues: AugustIssue[];
  avatarFor: (memberId: string) => string | null | undefined;
  onOpen: () => void;
}

const BADGE_TONE: Record<DayBadge, { pill: string; top: string }> = {
  covered:   { pill: 'bg-green-100 text-green-700',  top: 'border-t-success/60' },
  attention: { pill: 'bg-amber-100 text-amber-700',  top: 'border-t-warning/70' },
  uncovered: { pill: 'bg-red-100 text-red-700',      top: 'border-t-error/70' },
  conflict:  { pill: 'bg-red-100 text-red-700',      top: 'border-t-error/70' },
  empty:     { pill: 'bg-surface-alt text-text-muted', top: 'border-t-border' },
};

/** "08:00"→"8", "08:30"→"8:30" — compact like a wall clock. */
function compactTime(t: string): string {
  const [h, m] = t.split(':');
  const hh = String(Number(h));
  return m === '00' ? hh : `${hh}:${m}`;
}

function Chip({ item }: { item: AugustTimelineItem }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[11px] font-medium max-w-full ${AUGUST_TYPE_TONE[item.type]}`}
    >
      <span aria-hidden="true">{AUGUST_TYPE_ICONS[item.type]}</span>
      <span className="tabular-nums opacity-80">{compactTime(item.startTime)}–{compactTime(item.endTime)}</span>
      <span className="truncate">{item.title}</span>
    </span>
  );
}

function GapChip({ start, end }: { start: string; end: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-[11px] font-semibold bg-red-100 text-red-700">
      <span aria-hidden="true">⚠️</span>
      <span className="tabular-nums">פער {compactTime(start)}–{compactTime(end)}</span>
    </span>
  );
}

export function FamilyDayCard({ day, members, dayItems, issues, avatarFor, onOpen }: FamilyDayCardProps) {
  const ordered = useMemo(() => orderedMembers(members), [members]);
  const children = ordered.filter(m => m.role === 'child');
  const parents = ordered.filter(m => m.role !== 'child');

  const itemsByPerson = useMemo(() => {
    const map = new Map<string, AugustTimelineItem[]>();
    for (const it of itemsOnDate(dayItems, day.date)) {
      const list = map.get(it.personId) ?? [];
      list.push(it);
      map.set(it.personId, list);
    }
    return map;
  }, [dayItems, day.date]);

  const gapsByChild = useMemo(() => {
    const map = new Map<string, AugustIssue[]>();
    for (const i of issues) {
      if (i.kind !== 'coverage_gap' || !i.personId) continue;
      const list = map.get(i.personId) ?? [];
      list.push(i);
      map.set(i.personId, list);
    }
    return map;
  }, [issues]);

  const legs = useMemo(
    () => transportationForDay(dayItems, day.date, members),
    [dayItems, day.date, members]
  );

  const badge = dayBadge(issues, dayItems.length > 0);
  const tone = BADGE_TONE[badge];

  return (
    <button
      onClick={onOpen}
      className={[
        'w-full text-right flex flex-col rounded-card border border-t-[3px] bg-surface',
        'shadow-sm hover:shadow-card hover:border-accent/40 transition-all p-3 gap-2.5',
        tone.top,
        day.isWeekend ? 'bg-surface-alt/40' : '',
      ].join(' ')}
    >
      {/* Header — date + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-primary text-sm">{formatDayLabel(day.date)}</span>
        <span className={`text-[11px] font-semibold rounded-badge px-2 py-0.5 ${tone.pill}`}>
          {DAY_BADGE_LABEL[badge]}
        </span>
      </div>

      {/* Children — the day's anxiety, emphasized */}
      {children.length > 0 && (
        <div className="space-y-2">
          {children.map(child => {
            const items = itemsByPerson.get(child.id) ?? [];
            const gaps = gapsByChild.get(child.id) ?? [];
            return (
              <div key={child.id} className="border-r-[3px] border-accent/40 pr-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Avatar name={child.name} role={child.role} photo={avatarFor(child.id)} size={24} />
                  <span className="font-semibold text-sm text-text-base truncate">{child.name}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {items.map(it => <Chip key={it.id} item={it} />)}
                  {gaps.map(g => (
                    <GapChip key={g.id} start={g.window?.start ?? '—'} end={g.window?.end ?? '—'} />
                  ))}
                  {items.length === 0 && gaps.length === 0 && (
                    <span className="text-[11px] text-text-muted">
                      {day.isWeekend ? 'סופ״ש — עם ההורים' : 'ללא תוכנית'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Parents — compact footer */}
      {parents.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-2 border-t border-border">
          {parents.map(p => {
            const items = itemsByPerson.get(p.id) ?? [];
            return (
              <div key={p.id} className="flex items-center gap-1.5 min-w-0">
                <Avatar name={p.name} role={p.role} photo={avatarFor(p.id)} size={20} />
                <span className="text-xs font-medium text-text-mid">{p.name}</span>
                <div className="flex flex-wrap gap-1">
                  {items.length === 0
                    ? <span className="text-[11px] text-text-muted">—</span>
                    : items.map(it => <Chip key={it.id} item={it} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Transport — one compact line */}
      {legs.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-text-muted flex-wrap">
          <Car size={12} className="shrink-0" />
          {legs.slice(0, 2).map(l => (
            <span key={l.id} className="tabular-nums">
              {compactTime(l.time)} {l.kind === 'pickup' ? 'איסוף' : 'הורדה'}
            </span>
          ))}
          {legs.length > 2 && <span>+{legs.length - 2}</span>}
        </div>
      )}

      {/* Empty state */}
      {dayItems.length === 0 && children.length === 0 && (
        <div className="flex flex-col items-center justify-center py-3 text-center gap-1">
          <span className="text-2xl" aria-hidden="true">🏖️</span>
          <span className="text-xs text-text-muted">אין עדיין תוכניות ליום זה</span>
          <span className="text-xs text-accent font-medium flex items-center gap-0.5">
            <Plus size={12} /> הוסף פעילות
          </span>
        </div>
      )}
    </button>
  );
}
