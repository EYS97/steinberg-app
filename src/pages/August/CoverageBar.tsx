import React from 'react';
import { AUGUST_TYPE_ICONS } from '@/types/august';
import { AUGUST_TYPE_TONE } from './typeStyles';
import type { CoverageSegment, ParentBlock } from '@/lib/august/dayView';

// ── Coverage / responsibility bars — the people-first hero visuals ───────────
// A child's coverage bar is a single LTR handoff timeline: who has them, hour by
// hour, with uncovered holes rendered as a red hatch *in place* (a 2-hour gap
// looks like a 2-hour gap). The parent bar mutes work and emphasises family
// responsibility, so the eye lands on care, never on the job.

/** "08:00"→"8", "08:30"→"8:30" — compact wall-clock label. */
function compactTime(t: string): string {
  const [h, m] = t.split(':');
  return m === '00' ? String(Number(h)) : `${Number(h)}:${m}`;
}

const HATCH =
  'repeating-linear-gradient(45deg,rgb(254 202 202) 0 6px,rgb(254 226 226) 6px 12px)';

interface ChildCoverageBarProps {
  segments: CoverageSegment[];
  /** Render the small hour captions under the track. */
  winStart: string;
  winEnd: string;
}

/** One child's full-width handoff timeline. Covered = toned chip, gap = red hatch. */
export function ChildCoverageBar({ segments, winStart, winEnd }: ChildCoverageBarProps) {
  return (
    <div className="select-none">
      <div dir="ltr" className="relative h-7 w-full rounded-md bg-surface-alt/60 overflow-hidden">
        {segments.map((s, i) => (
          <div
            key={`${s.start}-${i}`}
            className={[
              'absolute top-0 bottom-0 flex items-center justify-center gap-1 px-1 overflow-hidden',
              'text-[10px] font-semibold leading-none',
              s.covered
                ? AUGUST_TYPE_TONE[s.type!]
                : 'text-red-700',
            ].join(' ')}
            style={{
              left: `${s.leftPct}%`,
              width: `${s.widthPct}%`,
              ...(s.covered ? {} : { background: HATCH }),
            }}
            title={
              s.covered
                ? `${s.start}–${s.end} · ${s.label}`
                : `${s.start}–${s.end} · ללא כיסוי`
            }
          >
            {s.covered ? (
              <>
                <span aria-hidden="true">{AUGUST_TYPE_ICONS[s.type!]}</span>
                <span dir="rtl" className="truncate">{s.label}</span>
              </>
            ) : (
              <span aria-hidden="true">⚠️</span>
            )}
          </div>
        ))}
      </div>
      <div dir="ltr" className="flex justify-between mt-0.5 px-0.5 text-[9px] text-text-muted tabular-nums">
        <span>{compactTime(winStart)}</span>
        <span>{compactTime(winEnd)}</span>
      </div>
    </div>
  );
}

interface ParentBarProps {
  work: ParentBlock[];
  responsibility: ParentBlock[];
}

/** A parent's day: muted work track + prominent responsibility blocks layered on top. */
export function ParentBar({ work, responsibility }: ParentBarProps) {
  if (work.length === 0 && responsibility.length === 0) {
    return <div className="h-4 flex items-center text-[10px] text-text-muted px-1">פנוי/ה</div>;
  }
  return (
    <div dir="ltr" className="relative h-4 w-full rounded-md bg-surface-alt/40 overflow-hidden">
      {/* Work — thin, low-contrast, dashed underline; visually recedes */}
      {work.map((b, i) => (
        <div
          key={`w-${i}`}
          className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-text-muted/40 border-b border-dashed border-text-muted/30"
          style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
          title={`עבודה ${b.start}–${b.end}`}
        />
      ))}
      {/* Responsibility — solid, full-height, accent; the part that matters */}
      {responsibility.map((b, i) => (
        <div
          key={`r-${i}`}
          className="absolute top-0 bottom-0 rounded-md bg-green-200 border border-green-400 flex items-center justify-center"
          style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
          title={`אחריות משפחתית ${b.start}–${b.end}`}
        >
          <span className="text-[9px]" aria-hidden="true">🧑‍🍼</span>
        </div>
      ))}
    </div>
  );
}
