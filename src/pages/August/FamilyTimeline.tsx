import React from 'react';
import { blockGeometry, axisTicks, itemsOnDate } from '@/lib/august/dayView';
import { AUGUST_TYPE_ICONS, MEMBER_ROLE_EMOJI } from '@/types/august';
import { AUGUST_TYPE_TONE } from './typeStyles';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

interface FamilyTimelineProps {
  members: AugustMember[];     // already ordered
  items: AugustTimelineItem[]; // items occurring this day
  date: string;
  winStart: string;
  winEnd: string;
}

/**
 * One-glance overview: every family member on a shared LTR time axis. Blocks are
 * colored + iconed + labelled (color is never the only signal) and carry a
 * tooltip. Detail lives in the per-member cards below — this is overview only.
 */
export function FamilyTimeline({ members, items, date, winStart, winEnd }: FamilyTimelineProps) {
  const ticks = axisTicks(winStart, winEnd);

  return (
    <div className="rounded-card border border-border bg-surface p-3 overflow-x-auto">
      <div className="min-w-[34rem]">
        {/* Axis */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-24 shrink-0" />
          <div dir="ltr" className="relative flex-1 h-4">
            {ticks.map(h => (
              <span
                key={h}
                className="absolute -translate-x-1/2 text-[10px] text-text-muted tabular-nums"
                style={{ left: `${((h - ticks[0]) / (ticks[ticks.length - 1] - ticks[0])) * 100}%` }}
              >
                {String(h).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>

        {/* Member rows */}
        <div className="space-y-1.5">
          {members.map(m => {
            const mine = itemsOnDate(items, date).filter(it => it.personId === m.id);
            return (
              <div key={m.id} className="flex items-center gap-2">
                <div className="w-24 shrink-0 flex items-center gap-1 text-sm font-medium text-text-base truncate">
                  <span aria-hidden="true">{MEMBER_ROLE_EMOJI[m.role]}</span>
                  <span className="truncate">{m.name}</span>
                </div>
                <div dir="ltr" className="relative flex-1 h-7 rounded-md bg-surface-alt/60">
                  {mine.map(it => {
                    const g = blockGeometry(it.startTime, it.endTime, winStart, winEnd);
                    if (!g) return null;
                    return (
                      <div
                        key={it.id}
                        className={`absolute top-0.5 bottom-0.5 rounded flex items-center gap-1 px-1 overflow-hidden text-[11px] font-medium ${AUGUST_TYPE_TONE[it.type]}`}
                        style={{ left: `${g.leftPct}%`, width: `${g.widthPct}%` }}
                        title={`${it.startTime}–${it.endTime} · ${it.title}`}
                      >
                        <span aria-hidden="true">{AUGUST_TYPE_ICONS[it.type]}</span>
                        <span dir="rtl" className="truncate">{it.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
