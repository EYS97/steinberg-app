import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDayLabel } from '@/lib/august/plan';
import type { AugustIssue } from '@/lib/august/issues';

interface IssuesPanelProps {
  issues: AugustIssue[];
  /** Jump to a day when an issue is clicked. */
  onOpenDay: (date: string) => void;
  /** Start expanded? Defaults to collapsed — the list can get long. */
  defaultOpen?: boolean;
}

/** The "דורש סגירה" panel — auto-generated open issues, red first. Collapsed by
 *  default so the long list never dominates the screen; a click reveals it. */
export function IssuesPanel({ issues, onOpenDay, defaultOpen = false }: IssuesPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  // All clear — a small reassuring line, nothing to collapse.
  if (issues.length === 0) {
    return (
      <Card className="mb-6">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning" />
          <h3 className="text-h3 font-semibold text-primary">דורש סגירה</h3>
        </div>
        <p className="mt-2 text-sm text-success flex items-center gap-1.5">
          <CheckCircle2 size={16} /> אין בעיות פתוחות — הכול מסודר 🎉
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-right"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning" />
          <span className="text-h3 font-semibold text-primary">דורש סגירה</span>
          <Badge variant="warning">{issues.length}</Badge>
        </span>
        <span className="flex items-center gap-1 text-xs text-text-muted">
          {open ? 'הסתר' : 'הצג'}
          <ChevronDown size={18} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <ul className="space-y-1.5 mt-3">
          {issues.map(issue => (
            <li key={issue.id}>
              <button
                onClick={() => onOpenDay(issue.date)}
                className="w-full text-right flex items-start gap-2 rounded-md px-2.5 py-2 hover:bg-surface-alt transition-colors"
              >
                <span aria-hidden="true" className="mt-0.5">
                  {issue.severity === 'red' ? '🔴' : '🟡'}
                </span>
                <span className="text-sm text-text-mid flex-1 min-w-0">
                  <span className="font-semibold text-text-base">{formatDayLabel(issue.date)}</span>
                  {' — '}{issue.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
