import React, { useMemo, useState } from 'react';
import { Car, Pencil, ChevronDown, Plus } from 'lucide-react';
import { formatDayLabel } from '@/lib/august/plan';
import {
  orderedMembers, transportationForDay, coverageSegments, parentTimeline,
  dayBadge, DAY_BADGE_LABEL, type DayBadge,
} from '@/lib/august/dayView';
import { Avatar } from './Avatar';
import { ChildCoverageBar, ParentBar } from './CoverageBar';
import type { AugustIssue } from '@/lib/august/issues';
import type { AugustDay } from '@/lib/august/plan';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

// ── FamilyDayCard — the day as a mini family dashboard ──────────────────────
// People-first, top to bottom: status → each child's coverage bar (the hero:
// who has them hour-by-hour, gaps shown in place) → parents' work/responsibility
// (muted vs prominent) and transport behind an inline expand. The 2-second
// read — "are the kids covered, and who has them?" — never needs a modal.
// Editing still lives in the day modal (the pencil / footer button opens it).

interface FamilyDayCardProps {
  day: AugustDay;
  members: AugustMember[];
  dayItems: AugustTimelineItem[];
  issues: AugustIssue[];
  avatarFor: (memberId: string) => string | null | undefined;
  winStart: string;
  winEnd: string;
  onOpen: () => void;
}

const BADGE_TONE: Record<DayBadge, { pill: string; top: string }> = {
  covered:   { pill: 'bg-green-100 text-green-700',   top: 'border-t-success/60' },
  attention: { pill: 'bg-amber-100 text-amber-700',   top: 'border-t-warning/70' },
  uncovered: { pill: 'bg-red-100 text-red-700',       top: 'border-t-error/70' },
  conflict:  { pill: 'bg-red-100 text-red-700',       top: 'border-t-error/70' },
  empty:     { pill: 'bg-surface-alt text-text-muted', top: 'border-t-border' },
};

/** "08:00"→"8", "08:30"→"8:30". */
function compactTime(t: string): string {
  const [h, m] = t.split(':');
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`;
}

export function FamilyDayCard({
  day, members, dayItems, issues, avatarFor, winStart, winEnd, onOpen,
}: FamilyDayCardProps) {
  const [expanded, setExpanded] = useState(false);
  const ordered = useMemo(() => orderedMembers(members), [members]);
  const children = ordered.filter(m => m.role === 'child');
  const parents = ordered.filter(m => m.role === 'parent');

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
  const hasAnyItems = dayItems.length > 0;

  return (
    <div
      className={[
        'flex flex-col rounded-card border border-t-[3px] bg-surface shadow-sm transition-all p-3 gap-2.5',
        tone.top,
        day.isWeekend ? 'bg-surface-alt/40' : '',
      ].join(' ')}
    >
      {/* Header — date + status; toggles inline detail */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between gap-2 text-right"
        aria-expanded={expanded}
      >
        <span className="font-bold text-primary text-sm">{formatDayLabel(day.date)}</span>
        <span className="flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold rounded-badge px-2 py-0.5 ${tone.pill}`}>
            {DAY_BADGE_LABEL[badge]}
          </span>
          <ChevronDown
            size={15}
            className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {/* Children — the hero. Each child's coverage bar is always visible. */}
      {children.length > 0 && (
        <div className="space-y-2.5">
          {children.map(child => {
            const gaps = gapsByChild.get(child.id) ?? [];
            const segments = coverageSegments(dayItems, day.date, child.id, members, winStart, winEnd);
            const covered = segments.length > 0 && segments.every(s => s.covered);
            return (
              <div key={child.id}>
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Avatar name={child.name} role={child.role} photo={avatarFor(child.id)} size={22} />
                    <span className="font-semibold text-sm text-text-base truncate">{child.name}</span>
                  </span>
                  {day.isWeekend ? (
                    <span className="text-[11px] text-text-muted shrink-0">סופ״ש · עם ההורים</span>
                  ) : gaps.length > 0 ? (
                    <span className="text-[11px] font-semibold text-red-700 shrink-0 tabular-nums">
                      🔴 חסר כיסוי {compactTime(gaps[0].window?.start ?? '')}–{compactTime(gaps[0].window?.end ?? '')}
                    </span>
                  ) : covered ? (
                    <span className="text-[11px] font-semibold text-green-700 shrink-0">🟢 מכוסה</span>
                  ) : null}
                </div>
                {!day.isWeekend && segments.length > 0 && (
                  <ChildCoverageBar segments={segments} winStart={winStart} winEnd={winEnd} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline detail — parents (work muted / responsibility prominent) + transport */}
      {expanded && (
        <div className="space-y-2.5 pt-1 border-t border-border">
          {parents.length > 0 && (
            <div className="space-y-2">
              {parents.map(p => {
                const tl = parentTimeline(dayItems, day.date, p.id, winStart, winEnd);
                return (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 w-20 shrink-0 min-w-0">
                      <Avatar name={p.name} role={p.role} photo={avatarFor(p.id)} size={18} />
                      <span className="text-xs font-medium text-text-mid truncate">{p.name}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <ParentBar work={tl.work} responsibility={tl.responsibility} />
                    </span>
                  </div>
                );
              })}
              <p className="text-[10px] text-text-muted flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-[3px] w-4 rounded-full bg-text-muted/40" /> עבודה
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-4 rounded bg-green-200 border border-green-400" /> אחריות משפחתית
                </span>
              </p>
            </div>
          )}

          {legs.length > 0 && (
            <div className="flex items-start gap-1.5 text-[11px] text-text-muted">
              <Car size={13} className="shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5 min-w-0">
                {legs.map(l => (
                  <span key={l.id} className="truncate">
                    <span className="tabular-nums font-medium">{compactTime(l.time)}</span> {l.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onOpen}
            className="self-start inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
          >
            <Pencil size={12} /> פתח לעריכה
          </button>
        </div>
      )}

      {/* Empty day */}
      {!hasAnyItems && children.length === 0 && (
        <button onClick={onOpen} className="flex flex-col items-center justify-center py-3 text-center gap-1">
          <span className="text-2xl" aria-hidden="true">🏖️</span>
          <span className="text-xs text-text-muted">אין עדיין תוכניות ליום זה</span>
          <span className="text-xs text-accent font-medium flex items-center gap-0.5">
            <Plus size={12} /> הוסף פעילות
          </span>
        </button>
      )}
    </div>
  );
}
