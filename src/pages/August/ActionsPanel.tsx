import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatDayLabel } from '@/lib/august/plan';
import type { AugustIssue } from '@/lib/august/issues';

// ── ActionsPanel — "what needs closing, and what to do about it" ─────────────
// The month's open work, hardest first: red child-coverage gaps each carry a
// one-tap "assign an adult" fix; yellow decisions (conflicts/overlaps) jump to
// their day; gray logistics (optional pickup/dropoff) sits apart at the bottom
// and never masquerades as a coverage failure.

interface ActionsPanelProps {
  issues: AugustIssue[];
  selectedDate: string;
  onJumpToDay: (date: string) => void;
  onQuickFix: (gap: AugustIssue) => void;
}

function Section({ title, tone, children }: {
  title: string; tone: string; children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className={`text-xs font-bold mb-1.5 ${tone}`}>{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

export function ActionsPanel({ issues, selectedDate, onJumpToDay, onQuickFix }: ActionsPanelProps) {
  const [open, setOpen] = useState(true);

  // Selected day's issues float to the top of each section.
  const bySelectedFirst = (a: AugustIssue, b: AugustIssue) =>
    Number(b.date === selectedDate) - Number(a.date === selectedDate) || a.date.localeCompare(b.date);

  const gaps = issues.filter(i => i.kind === 'coverage_gap').sort(bySelectedFirst);
  const decisions = issues.filter(i => i.severity === 'yellow').sort(bySelectedFirst);
  const logistics = issues.filter(i => i.severity === 'info').sort(bySelectedFirst);
  const allClear = gaps.length === 0 && decisions.length === 0;

  return (
    <Card padding="sm" className="flex flex-col gap-3 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-right"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-primary shrink-0">לסגירה עכשיו</h2>
          {/* Collapsed: the counts still tell the story at a glance */}
          {!open && (
            <span className="text-[11px] text-text-muted truncate tabular-nums">
              {allClear ? '✓ הכול מכוסה' : [
                gaps.length > 0 ? `🔴 ${gaps.length}` : '',
                decisions.length > 0 ? `🟡 ${decisions.length}` : '',
                logistics.length > 0 ? `🚗 ${logistics.length}` : '',
              ].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {!open ? null : allClear ? (
        <p className="text-sm text-success flex items-center gap-1.5">
          <CheckCircle2 size={15} /> כל שעות הילדים מכוסות 🎉
        </p>
      ) : (
        <>
          {gaps.length > 0 && (
            <Section title={`🔴 פערי כיסוי (${gaps.length})`} tone="text-red-700">
              {gaps.map(g => (
                <li key={g.id} className="rounded-md border border-red-200 bg-red-50/70 p-2">
                  <button
                    onClick={() => onJumpToDay(g.date)}
                    className="w-full text-right text-xs text-text-mid hover:underline"
                  >
                    <span className="font-semibold text-text-base">{formatDayLabel(g.date)}</span>
                    {' — '}{g.message}
                  </button>
                  <button
                    onClick={() => onQuickFix(g)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold rounded-badge px-2.5 min-h-[2.25rem] bg-white text-red-700 border border-red-300 hover:bg-red-100 transition-colors"
                  >
                    <UserPlus size={11} /> שבצו אחראי/ת
                  </button>
                </li>
              ))}
            </Section>
          )}

          {decisions.length > 0 && (
            <Section title={`🟡 דורש החלטה (${decisions.length})`} tone="text-amber-700">
              {decisions.map(i => (
                <li key={i.id}>
                  <button
                    onClick={() => onJumpToDay(i.date)}
                    className="w-full text-right text-xs text-text-mid rounded-md px-2 py-1.5 hover:bg-surface-alt transition-colors"
                  >
                    <span className="font-semibold text-text-base">{formatDayLabel(i.date)}</span>
                    {' — '}{i.message}
                  </button>
                </li>
              ))}
            </Section>
          )}
        </>
      )}

      {open && logistics.length > 0 && (
        <Section title={`🚗 לוגיסטיקה חסרה — רשות (${logistics.length})`} tone="text-text-muted">
          {logistics.map(i => (
            <li key={i.id}>
              <button
                onClick={() => onJumpToDay(i.date)}
                className="w-full text-right text-[11px] text-text-muted rounded-md px-2 py-1 hover:bg-surface-alt transition-colors"
              >
                {formatDayLabel(i.date)} — {i.message}
              </button>
            </li>
          ))}
        </Section>
      )}
    </Card>
  );
}
