import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { MonthCoverageStats } from '@/lib/august/coverage';

// ── MonthSummary — the command center's top strip ────────────────────────────
// One glance answers "how is August doing?": a segmented coverage bar over the
// planned days plus the raw counts the family actually manages by — uncovered
// child-hours and open gaps first, logistics counted apart (it's optional and
// never a failure).

interface MonthSummaryProps {
  stats: MonthCoverageStats;
}

function Tile({ emoji, value, label, tone = 'bg-surface-alt' }: {
  emoji: string; value: React.ReactNode; label: string; tone?: string;
}) {
  return (
    <div className={`rounded-md px-3 py-2 flex items-center gap-2 ${tone}`}>
      <span className="text-lg leading-none" aria-hidden="true">{emoji}</span>
      <div className="min-w-0">
        <p className="text-base font-bold leading-tight text-text-base">{value}</p>
        <p className="text-[11px] text-text-muted truncate">{label}</p>
      </div>
    </div>
  );
}

export function MonthSummary({ stats }: MonthSummaryProps) {
  // On mobile the tile block is tall — keep the bar + verdict always visible
  // and put the full counts behind a tap. Desktop always shows everything.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const planned = stats.coveredDays + stats.partialDays + stats.uncoveredDays;
  const allClear = stats.unresolvedGaps === 0 && planned > 0;

  // Segmented bar over planned days — green fraction is the 1-second signal.
  const seg = (n: number) => (planned > 0 ? (n / planned) * 100 : 0);

  return (
    <Card className="mb-4" padding="sm">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-primary">מצב הכיסוי של אוגוסט</h2>
        <span className="text-xs text-text-muted">
          👨‍👩‍👧‍👦 {stats.totalMembers} בני משפחה · 🧒 {stats.totalChildren} ילדים
        </span>
      </div>

      {planned > 0 && (
        <div className="mb-2">
          <div className="h-2.5 w-full rounded-full bg-surface-alt overflow-hidden flex" dir="ltr">
            <div className="bg-success h-full" style={{ width: `${seg(stats.coveredDays)}%` }} />
            <div className="bg-error/50 h-full" style={{ width: `${seg(stats.partialDays)}%` }} />
            <div className="bg-error h-full" style={{ width: `${seg(stats.uncoveredDays)}%` }} />
          </div>
          <p className={`text-xs mt-1.5 font-semibold ${allClear ? 'text-success' : 'text-error'}`}>
            {allClear
              ? '🟢 כל שעות הילדים מכוסות — אין פערים פתוחים'
              : `🔴 ${stats.uncoveredChildHours} שעות ילדים ללא כיסוי · ${stats.unresolvedGaps} פערים לסגירה`}
          </p>
        </div>
      )}

      <div className={`grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-1 ${detailsOpen ? 'grid' : 'hidden lg:grid'}`}>
        <Tile emoji="🟢" value={stats.coveredDays} label="ימים מכוסים" tone="bg-green-50" />
        <Tile emoji="🟠" value={stats.partialDays} label="פער חלקי" tone="bg-red-50/70" />
        <Tile emoji="🔴" value={stats.uncoveredDays} label="ללא כיסוי" tone="bg-red-50" />
        <Tile emoji="⚪" value={stats.unplannedDays} label="טרם תוכננו" />
        <Tile emoji="⏱" value={stats.uncoveredChildHours} label="שעות ללא כיסוי" tone={stats.uncoveredChildHours > 0 ? 'bg-red-50' : 'bg-green-50'} />
        <Tile emoji="🏖" value={stats.holidayDays} label="ימי חופשה משפחתית" tone="bg-cyan-50" />
        <Tile emoji="🚗" value={stats.missingLogistics} label="לוגיסטיקה חסרה (רשות)" />
      </div>

      <button
        onClick={() => setDetailsOpen(o => !o)}
        className="lg:hidden self-start inline-flex items-center gap-1 text-xs font-medium text-text-muted mt-1"
        aria-expanded={detailsOpen}
      >
        {detailsOpen ? 'פחות פרטים' : 'כל המספרים'}
        <ChevronDown size={13} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
      </button>
    </Card>
  );
}
