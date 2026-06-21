import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDayLabel } from '@/lib/august/plan';
import type { AugustIssue } from '@/lib/august/issues';

interface IssuesPanelProps {
  issues: AugustIssue[];
  /** Jump to a day when an issue is clicked. */
  onOpenDay: (date: string) => void;
}

/** The "דורש סגירה" panel — auto-generated open issues, red first. */
export function IssuesPanel({ issues, onOpenDay }: IssuesPanelProps) {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>
          <AlertTriangle size={18} className="text-warning" /> דורש סגירה
          {issues.length > 0 && <Badge variant="warning">{issues.length}</Badge>}
        </CardTitle>
      </CardHeader>

      {issues.length === 0 ? (
        <p className="text-sm text-success flex items-center gap-1.5">
          <CheckCircle2 size={16} /> אין בעיות פתוחות — הכול מסודר 🎉
        </p>
      ) : (
        <ul className="space-y-1.5">
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
