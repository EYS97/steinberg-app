import React from 'react';
import { PEACE_EMOJI, type PeaceScore } from '@/lib/august/analytics';

// ── WeekHealthStrip — per-week mission-control band ─────────────────────────
// A 10-second read of the week's health: covered / needs-decision / gap day
// counts, the week's cost, and the peace-of-mind score. Pure presentation —
// every value is computed upstream from the existing analytics helpers.

interface WeekHealthStripProps {
  covered: number;
  attention: number;
  gaps: number;
  cost: number;
  peace: PeaceScore;
}

function Tile({ emoji, value, label, tone }: {
  emoji: string; value: React.ReactNode; label: string; tone: string;
}) {
  return (
    <div className={`rounded-md px-3 py-2 flex items-center gap-2 ${tone}`}>
      <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight">{value}</p>
        <p className="text-[11px] text-text-muted truncate">{label}</p>
      </div>
    </div>
  );
}

export function WeekHealthStrip({ covered, attention, gaps, cost, peace }: WeekHealthStripProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
      <Tile emoji="🟢" value={covered} label="ימים מכוסים" tone="bg-green-50" />
      <Tile emoji="🟡" value={attention} label="דורש החלטה" tone="bg-amber-50" />
      <Tile emoji="🔴" value={gaps} label="פערי כיסוי" tone="bg-red-50" />
      <Tile emoji="💰" value={`₪${cost.toLocaleString('he-IL')}`} label="עלות השבוע" tone="bg-surface-alt" />
      <Tile emoji={PEACE_EMOJI[peace.band]} value={peace.score} label="שקט נפשי" tone="bg-surface-alt" />
    </div>
  );
}
