import React from 'react';
import { parseDateStr } from '@/lib/august/plan';
import type { AugustDay } from '@/lib/august/plan';
import type { DayCoverage, CoverageDayStatus } from '@/lib/august/coverage';

// ── MonthGrid — the mobile day selector ──────────────────────────────────────
// A compact 7-column calendar: the whole month's coverage shape in one glance,
// no scrolling. Each cell is its day's verdict (status color), with a red gap
// badge and a 🏖 for family holidays; tapping selects the day in the dashboard
// below. Desktop uses the vertical DayRail instead — same data, same colors.

interface MonthGridProps {
  days: AugustDay[];
  coverage: Map<string, DayCoverage>;
  selected: string;
  onSelect: (date: string) => void;
}

const CELL_TONE: Record<CoverageDayStatus, string> = {
  covered:   'border-success/40 bg-green-50',
  partial:   'border-error/40 bg-red-50/70',
  uncovered: 'border-error/70 bg-red-100',
  weekend:   'border-border bg-surface-alt/60 text-text-muted',
  unplanned: 'border-dashed border-border bg-surface',
};

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sun..Sat

export function MonthGrid({ days, coverage, selected, onSelect }: MonthGridProps) {
  // Leading blanks so day 1 lands under its actual weekday column.
  const leadingBlanks = days.length > 0 ? parseDateStr(days[0].date).getDay() : 0;

  return (
    <div aria-label="לוח חודש">
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map(d => (
          <span key={d} className="text-center text-[10px] font-semibold text-text-muted">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, i) => <span key={`pad${i}`} />)}
        {days.map(day => {
          const cov = coverage.get(day.date);
          const status = cov?.status ?? 'unplanned';
          const isSelected = day.date === selected;
          const gapCount = cov?.gaps.length ?? 0;
          return (
            <button
              key={day.date}
              onClick={() => onSelect(day.date)}
              aria-current={isSelected ? 'date' : undefined}
              aria-label={`${day.dayOfMonth} באוגוסט`}
              className={[
                'relative h-11 rounded-md border flex flex-col items-center justify-center leading-none transition-all',
                CELL_TONE[status],
                isSelected ? 'ring-2 ring-accent shadow-sm' : '',
              ].join(' ')}
            >
              <span className="text-sm font-bold text-text-base">{day.dayOfMonth}</span>
              {cov?.isHoliday && <span className="text-[9px] mt-0.5" aria-hidden="true">🏖</span>}
              {gapCount > 0 && (
                <span className="absolute -top-1 -left-1 text-[9px] font-bold text-white bg-error rounded-full min-w-[0.95rem] h-[0.95rem] px-0.5 flex items-center justify-center">
                  {gapCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-50 border border-success/40" /> מכוסה</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-50 border border-error/40" /> פער</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-surface border border-dashed border-border" /> טרם תוכנן</span>
        <span aria-hidden="true">🏖 חופשה</span>
      </p>
    </div>
  );
}
