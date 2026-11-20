import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatHebrewDateShort, formatGregorianDate } from '@/lib/dates';
import type { FamilyEvent, FamilyEventKind } from '@/lib/familyEvents';

// ── Visual registry ───────────────────────────────────────────────────────
// One entry per event kind. Adding a future type (births, b'nei mitzvah,
// graduations, reunions…) is a single line here — the layout never changes.
interface KindVisual {
  icon: string;
  /** Hebrew noun for the milestone, e.g. "יום הולדת" */
  label: string;
  /** Tint classes for the round icon bubble */
  bubble: string;
}

const KIND_VISUALS: Record<FamilyEventKind, KindVisual> = {
  birthday:    { icon: '🎂', label: 'יום הולדת',  bubble: 'bg-rose-50 ring-rose-100' },
  anniversary: { icon: '💍', label: 'יום נישואין', bubble: 'bg-amber-50 ring-amber-100' },
  yahrzeit:    { icon: '🕯️', label: 'יארצייט',     bubble: 'bg-violet-50 ring-violet-100' },
  milestone:   { icon: '🎉', label: 'אירוע משפחתי', bubble: 'bg-teal-50 ring-teal-100' },
  birth:       { icon: '👶', label: 'הולדת תינוק',  bubble: 'bg-sky-50 ring-sky-100' },
  bar_mitzvah: { icon: '📜', label: 'בר/בת מצווה',  bubble: 'bg-indigo-50 ring-indigo-100' },
  graduation:  { icon: '🎓', label: 'סיום לימודים', bubble: 'bg-blue-50 ring-blue-100' },
  celebration: { icon: '🎊', label: 'שמחה משפחתית', bubble: 'bg-fuchsia-50 ring-fuchsia-100' },
};

const FALLBACK: KindVisual = { icon: '✨', label: 'אירוע', bubble: 'bg-surface-alt ring-border' };

function daysLabel(days: number): string {
  if (days <= 0) return 'היום';
  if (days === 1) return 'מחר';
  if (days === 2) return 'מחרתיים';
  return `בעוד ${days} ימים`;
}

/** Subtitle line, e.g. "יום הולדת 18" or "יום נישואין 24" or "יארצייט". */
function subtitle(event: FamilyEvent, v: KindVisual): string {
  return event.count ? `${v.label} ${event.count}` : v.label;
}

interface FamilyEventsHubProps {
  events: FamilyEvent[];
  /** Open the event in context (calendar / profile) */
  onSelect: (event: FamilyEvent) => void;
  /** Optional "view all" action in the header */
  onViewAll?: () => void;
  className?: string;
}

export function FamilyEventsHub({ events, onSelect, onViewAll, className }: FamilyEventsHubProps) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base sm:text-lg font-bold text-primary flex items-center gap-2">
          <span aria-hidden="true">🎉</span>
          אירועים משפחתיים קרובים
        </h2>
        {onViewAll && (
          <Button variant="ghost" size="sm" onClick={onViewAll}>
            לוח שנה
            <ChevronLeft size={14} />
          </Button>
        )}
      </div>

      <Card padding="sm">
        {events.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-6 px-3">
            <span className="text-3xl" aria-hidden="true">🎈</span>
            <p className="text-sm font-medium text-text-base">אין אירועים משפחתיים קרובים</p>
            <p className="text-xs text-text-muted max-w-[16rem]">
              ימי הולדת, ימי נישואין וימי זיכרון של המשפחה יופיעו כאן אוטומטית
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map(event => {
              const v = KIND_VISUALS[event.kind] ?? FALLBACK;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(event)}
                    className="w-full flex items-center gap-3 py-2.5 first:pt-1 last:pb-1 text-right rounded-md transition-colors hover:bg-surface-alt/60 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 px-1 -mx-1"
                  >
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ring-1 ${v.bubble}`}
                      aria-hidden="true"
                    >
                      {v.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm text-text-base truncate">
                        {event.name}
                      </span>
                      <span className="block text-xs text-accent-dark font-medium">
                        {subtitle(event, v)}
                      </span>
                      <span className="block text-[11px] text-text-muted truncate mt-0.5">
                        {formatHebrewDateShort(event.date)} ‏· {formatGregorianDate(event.date, 'short')}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-accent-dark bg-accent/10 rounded-badge px-2.5 py-1 whitespace-nowrap">
                      {daysLabel(event.days)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
