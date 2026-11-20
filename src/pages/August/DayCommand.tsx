import React, { useMemo } from 'react';
import { Car, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDayLong } from '@/lib/august/plan';
import {
  orderedMembers, transportationForDay, coverageSegments, parentTimeline,
  dayBadge, DAY_BADGE_LABEL, type DayBadge,
} from '@/lib/august/dayView';
import { holidayOnDate } from '@/lib/august/holiday';
import { Avatar } from './Avatar';
import { ChildCoverageBar, ParentBar } from './CoverageBar';
import type { AugustIssue } from '@/lib/august/issues';
import type { DayCoverage } from '@/lib/august/coverage';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

// ── DayCommand — the selected day as a family coverage dashboard ─────────────
// The center of the command center. Reading order = importance order:
// status → family holiday banner → each CHILD's hour-by-hour coverage bar with
// red holes and a one-tap "assign an adult" fix per hole → the adults' context
// (work muted, responsibility prominent) → optional gray logistics. Red appears
// here only where a child truly has no one.

interface DayCommandProps {
  date: string;
  coverage: DayCoverage | undefined;
  members: AugustMember[];
  dayItems: AugustTimelineItem[];
  issues: AugustIssue[];
  avatarFor: (memberId: string) => string | null;
  winStart: string;
  winEnd: string;
  onQuickFix: (gap: AugustIssue) => void;
  onEditHoliday: (item: AugustTimelineItem) => void;
  onDeleteHoliday: (item: AugustTimelineItem) => void;
  onAddActivity: () => void;
  onOpenEditor: () => void;
  /** Step to the previous/next August day (absent at the month's edges). */
  onPrevDay?: () => void;
  onNextDay?: () => void;
}

const BADGE_TONE: Record<DayBadge, string> = {
  covered:   'bg-green-100 text-green-700',
  attention: 'bg-amber-100 text-amber-700',
  conflict:  'bg-amber-100 text-amber-700',
  uncovered: 'bg-red-100 text-red-700',
  empty:     'bg-surface-alt text-text-muted',
};

/** "08:00"→"8", "08:30"→"8:30". */
function compactTime(t: string): string {
  const [h, m] = t.split(':');
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`;
}

export function DayCommand({
  date, coverage, members, dayItems, issues, avatarFor, winStart, winEnd,
  onQuickFix, onEditHoliday, onDeleteHoliday, onAddActivity, onOpenEditor,
  onPrevDay, onNextDay,
}: DayCommandProps) {
  const ordered = useMemo(() => orderedMembers(members), [members]);
  const children = ordered.filter(m => m.role === 'child');
  const parents = ordered.filter(m => m.role !== 'child');
  const isWeekend = coverage?.status === 'weekend';
  const holiday = useMemo(() => holidayOnDate(dayItems, date), [dayItems, date]);
  // On a family holiday the family is together — no coverage bars, no gaps,
  // nobody needs to be assigned.
  const onHoliday = coverage?.isHoliday ?? !!holiday;
  const legs = useMemo(() => transportationForDay(dayItems, date, members), [dayItems, date, members]);
  const badge = dayBadge(issues, dayItems.length > 0);

  const gapsByChild = useMemo(() => {
    const map = new Map<string, AugustIssue[]>();
    for (const g of coverage?.gaps ?? []) {
      if (!g.personId) continue;
      map.set(g.personId, [...(map.get(g.personId) ?? []), g]);
    }
    return map;
  }, [coverage]);

  return (
    <Card padding="sm" className="flex flex-col gap-3">
      {/* Header — the 1-second verdict, with day stepping (RTL: forward = left) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="flex items-center gap-0.5 min-w-0">
          <button
            onClick={onPrevDay}
            disabled={!onPrevDay}
            className="p-1.5 -my-1 rounded-md text-text-muted hover:text-primary hover:bg-surface-alt transition-colors disabled:opacity-30"
            aria-label="יום קודם"
          >
            <ChevronRight size={17} />
          </button>
          <h2 className="text-base font-bold text-primary truncate">{formatDayLong(date)}</h2>
          <button
            onClick={onNextDay}
            disabled={!onNextDay}
            className="p-1.5 -my-1 rounded-md text-text-muted hover:text-primary hover:bg-surface-alt transition-colors disabled:opacity-30"
            aria-label="יום הבא"
          >
            <ChevronLeft size={17} />
          </button>
        </span>
        <span className={`text-xs font-semibold rounded-badge px-2.5 py-1 ${BADGE_TONE[badge]}`}>
          {isWeekend ? '🏠 סופ״ש · עם ההורים' : DAY_BADGE_LABEL[badge]}
        </span>
      </div>

      {/* Family holiday — one shared event, edited/deleted once for everyone */}
      {holiday && (
        <div className="rounded-md bg-cyan-50 border border-cyan-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-semibold text-cyan-900 flex items-center gap-1.5 min-w-0">
            <span aria-hidden="true">🏖</span>
            <span className="truncate">חופשה משפחתית · {holiday.title}</span>
            {holiday.endDate && holiday.endDate !== holiday.date && (
              <span className="text-xs font-normal text-cyan-700 shrink-0" dir="ltr">
                {holiday.date.slice(8)}/{holiday.date.slice(5, 7)}–{holiday.endDate.slice(8)}/{holiday.endDate.slice(5, 7)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEditHoliday(holiday)}
              className="p-1.5 rounded-md text-cyan-800 hover:bg-cyan-100 transition-colors"
              aria-label="עריכת החופשה המשפחתית"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDeleteHoliday(holiday)}
              className="p-1.5 rounded-md text-cyan-800 hover:bg-red-100 hover:text-red-700 transition-colors"
              aria-label="מחיקת החופשה המשפחתית"
            >
              <Trash2 size={14} />
            </button>
          </span>
        </div>
      )}

      {/* Children — the primary layer: who has each child, hour by hour */}
      {children.length > 0 ? (
        <div className="space-y-3">
          {children.map(child => {
            const segments = coverageSegments(dayItems, date, child.id, members, winStart, winEnd);
            const gaps = gapsByChild.get(child.id) ?? [];
            const covered = !isWeekend && segments.length > 0 && segments.every(s => s.covered);
            return (
              <div key={child.id}>
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Avatar name={child.name} role={child.role} photo={avatarFor(child.id)} size={24} />
                    <span className="font-semibold text-sm text-text-base truncate">{child.name}</span>
                  </span>
                  {isWeekend ? (
                    <span className="text-[11px] text-text-muted shrink-0">עם ההורים</span>
                  ) : onHoliday ? (
                    <span className="text-[11px] font-semibold text-cyan-700 shrink-0">🏖 בחופשה משפחתית</span>
                  ) : gaps.length > 0 ? (
                    <span className="text-[11px] font-semibold text-red-700 shrink-0">
                      🔴 {gaps.length === 1 ? 'פער אחד' : `${gaps.length} פערים`}
                    </span>
                  ) : covered ? (
                    <span className="text-[11px] font-semibold text-green-700 shrink-0">🟢 מכוסה</span>
                  ) : (
                    <span className="text-[11px] text-text-muted shrink-0">לא מתוכנן</span>
                  )}
                </div>

                {!isWeekend && !onHoliday && segments.length > 0 && (
                  <ChildCoverageBar segments={segments} winStart={winStart} winEnd={winEnd} />
                )}

                {/* One-tap fix per hole — the "who is responsible next" action */}
                {!isWeekend && !onHoliday && gaps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {gaps.map(g => (
                      <button
                        key={g.id}
                        onClick={() => onQuickFix(g)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-badge px-2.5 min-h-[2.25rem] bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors tabular-nums"
                      >
                        <UserPlus size={11} />
                        {compactTime(g.window?.start ?? '')}–{compactTime(g.window?.end ?? '')} · שבצו אחראי/ת
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted">אין ילדים מוגדרים — הוסיפו אותם ב"בני המשפחה".</p>
      )}

      {/* Adults — secondary context: work muted, family responsibility prominent */}
      {parents.length > 0 && !isWeekend && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          {parents.map(p => {
            const tl = parentTimeline(dayItems, date, p.id, winStart, winEnd);
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 w-24 shrink-0 min-w-0">
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

      {/* Logistics — optional, gray, never a failure */}
      {(legs.length > 0 || (coverage?.logistics.length ?? 0) > 0) && (
        <div className="flex items-start gap-1.5 text-[11px] text-text-muted pt-2 border-t border-border">
          <Car size={13} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5 min-w-0">
            {legs.map(l => (
              <span key={l.id} className="truncate">
                <span className="tabular-nums font-medium">{compactTime(l.time)}</span> {l.text}
              </span>
            ))}
            {coverage?.logistics.map(l => (
              <span key={l.id} className="truncate text-text-muted/80">◦ {l.message} (רשות)</span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onAddActivity}>
          <Plus size={14} /> הוסף פעילות
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenEditor}>
          <Pencil size={14} /> עריכה מלאה
        </Button>
      </div>
    </Card>
  );
}
