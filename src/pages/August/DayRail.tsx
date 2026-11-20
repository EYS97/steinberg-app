import React, { useEffect, useRef } from 'react';
import { parseDateStr, weekdayShort } from '@/lib/august/plan';
import type { AugustDay } from '@/lib/august/plan';
import type { DayCoverage, CoverageDayStatus } from '@/lib/august/coverage';

// ── DayRail — every August day as a coverage row ─────────────────────────────
// The date selector of the command center. Each row IS the day's coverage
// verdict: green covered, red-family when child-hours are missing (light =
// partial, solid = nothing covered), gray for weekend/unplanned. A 🏖 marks
// family-holiday days. Vertical rail on desktop, horizontal strip on mobile.

interface DayRailProps {
  days: AugustDay[];
  coverage: Map<string, DayCoverage>;
  selected: string;
  onSelect: (date: string) => void;
}

const STATUS_STYLE: Record<CoverageDayStatus, { row: string; dot: string; label: string }> = {
  covered:   { row: 'border-success/40 bg-green-50/60',  dot: 'bg-success',      label: 'מכוסה' },
  partial:   { row: 'border-error/40 bg-red-50/60',      dot: 'bg-error/60',     label: 'פער חלקי' },
  uncovered: { row: 'border-error/70 bg-red-50',         dot: 'bg-error',        label: 'ללא כיסוי' },
  weekend:   { row: 'border-border bg-surface-alt/50',   dot: 'bg-text-muted/30', label: 'סופ״ש' },
  unplanned: { row: 'border-dashed border-border bg-surface', dot: 'bg-border',  label: 'טרם תוכנן' },
};

function hoursLabel(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h}ש׳`;
}

export function DayRail({ days, coverage, selected, onSelect }: DayRailProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Keep the selected day in view when jumping from the actions panel.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selected]);

  return (
    <nav
      aria-label="בחירת יום"
      className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-[calc(100vh-14rem)] pb-1 lg:pb-0 lg:pl-1"
    >
      {days.map(day => {
        const cov = coverage.get(day.date);
        const status = cov?.status ?? 'unplanned';
        const style = STATUS_STYLE[status];
        const isSelected = day.date === selected;
        return (
          <button
            key={day.date}
            ref={isSelected ? selectedRef : undefined}
            onClick={() => onSelect(day.date)}
            aria-current={isSelected ? 'date' : undefined}
            className={[
              'shrink-0 lg:w-full rounded-md border px-2.5 py-1.5 text-right transition-all',
              'flex items-center gap-2 min-w-[7.5rem] lg:min-w-0',
              style.row,
              isSelected ? 'ring-2 ring-accent shadow-sm' : 'hover:ring-1 hover:ring-accent/50',
            ].join(' ')}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} aria-hidden="true" />
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-text-base leading-tight">
                {weekdayShort(parseDateStr(day.date))} {day.dayOfMonth}/8
              </span>
              <span className="text-[10px] text-text-muted leading-tight truncate">
                {cov?.isHoliday
                  ? 'חופשה משפחתית'
                  : status === 'partial' || status === 'uncovered'
                    ? `חסר ${hoursLabel(cov!.uncoveredMinutes)}`
                    : style.label}
              </span>
            </span>
            {cov?.isHoliday && <span className="text-xs shrink-0" aria-label="חופשה משפחתית">🏖</span>}
            {(status === 'partial' || status === 'uncovered') && (
              <span className="shrink-0 text-[10px] font-bold text-white bg-error rounded-full min-w-[1.1rem] h-[1.1rem] px-1 flex items-center justify-center">
                {cov!.gaps.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
