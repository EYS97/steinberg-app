import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { parseDateStr, weekdayShort, type AugustWeek } from '@/lib/august/plan';
import { COVERING_TYPES } from '@/types/august';
import type { DayStatus, AugustIssue } from '@/lib/august/issues';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

// ── MonthHeatmap — scan all 31 days at a glance ─────────────────────────────
// The whole-month overview: each day is a status-tinted cell carrying a small
// per-child coverage dot (green covered / red gap / grey unplanned). Tapping a
// day jumps to its week, where the full people-first dashboard lives.

interface MonthHeatmapProps {
  weeks: AugustWeek[];
  members: AugustMember[];
  itemsByDay: Map<string, AugustTimelineItem[]>;
  issuesByDate: Map<string, AugustIssue[]>;
  statusOf: (date: string) => DayStatus;
  onPickDay: (date: string) => void;
}

const STATUS_TINT: Record<DayStatus, string> = {
  green:  'bg-green-50 border-success/30',
  yellow: 'bg-amber-50 border-warning/40',
  red:    'bg-red-50 border-error/40',
  empty:  'bg-surface border-border',
};

type Dot = 'green' | 'red' | 'none';
const DOT_CLASS: Record<Dot, string> = {
  green: 'bg-success',
  red:   'bg-error',
  none:  'bg-border',
};

function childDot(
  childId: string,
  date: string,
  itemsByDay: Map<string, AugustTimelineItem[]>,
  issuesByDate: Map<string, AugustIssue[]>,
): Dot {
  const hasGap = (issuesByDate.get(date) ?? [])
    .some(i => i.kind === 'coverage_gap' && i.personId === childId);
  if (hasGap) return 'red';
  const covered = (itemsByDay.get(date) ?? [])
    .some(it => it.personId === childId && COVERING_TYPES.includes(it.type));
  return covered ? 'green' : 'none';
}

export function MonthHeatmap({
  weeks, members, itemsByDay, issuesByDate, statusOf, onPickDay,
}: MonthHeatmapProps) {
  const children = members.filter(m => m.role === 'child');

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {weeks.map(week => (
          <div key={week.index}>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-sm font-bold text-primary">{week.label}</h3>
              <Badge variant="default">{week.rangeLabel}</Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {week.days.map(day => {
                const status = statusOf(day.date);
                const count = itemsByDay.get(day.date)?.length ?? 0;
                return (
                  <button
                    key={day.date}
                    onClick={() => onPickDay(day.date)}
                    className={[
                      'flex flex-col items-center gap-1 rounded-md border p-1.5 min-w-[3.25rem] min-h-[3.75rem]',
                      'hover:border-accent transition-colors',
                      STATUS_TINT[status],
                      day.isWeekend ? 'opacity-60' : '',
                    ].join(' ')}
                    aria-label={`${weekdayShort(parseDateStr(day.date))} ${day.dayOfMonth} — ${count} פריטים`}
                  >
                    <span className="text-[10px] text-text-muted leading-none">
                      {weekdayShort(parseDateStr(day.date))}
                    </span>
                    <span className="text-sm font-bold text-text-base leading-none">{day.dayOfMonth}</span>
                    {children.length > 0 && !day.isWeekend ? (
                      <span className="flex items-center gap-0.5 mt-0.5">
                        {children.map(c => (
                          <span
                            key={c.id}
                            className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[childDot(c.id, day.date, itemsByDay, issuesByDate)]}`}
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="h-1.5 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-text-muted flex-wrap pt-1">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success" /> מכוסה</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-error" /> פער</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-border" /> לא מתוכנן</span>
        <span className="text-text-muted/80">· נקודה לכל ילד/ה · הקש על יום למעבר לשבוע</span>
      </div>
    </div>
  );
}
