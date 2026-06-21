import React from 'react';
import { Car } from 'lucide-react';
import type { TransportLeg } from '@/lib/august/dayView';

/** "🚗 הסעות היום" — auto-generated from item drop-offs/pickups. */
export function TransportationList({ legs }: { legs: TransportLeg[] }) {
  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <h4 className="font-bold text-primary flex items-center gap-1.5 mb-2">
        <Car size={16} className="text-accent" /> הסעות היום
      </h4>
      {legs.length === 0 ? (
        <p className="text-sm text-text-muted">אין הסעות מתוכננות.</p>
      ) : (
        <ul className="space-y-1.5">
          {legs.map(leg => (
            <li key={leg.id} className="flex items-start gap-2 text-sm">
              <span className="font-semibold tabular-nums text-text-base w-12 shrink-0">{leg.time}</span>
              <span aria-hidden="true">{leg.kind === 'dropoff' ? '⬇️' : '⬆️'}</span>
              <span className="text-text-mid">{leg.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
