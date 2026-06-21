import React, { useMemo } from 'react';
import { BarChart3, Wallet, Palmtree, HeartPulse } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDayLabel } from '@/lib/august/plan';
import type { AugustWeek } from '@/lib/august/plan';
import {
  workloadByMember, costRollup, vacationWindows, peaceOfMind, PEACE_LABEL,
} from '@/lib/august/analytics';
import { MEMBER_ROLE_EMOJI, AUGUST_TYPE_ICONS } from '@/types/august';
import type { FamilyAugustPlan, AugustTimelineItem } from '@/types/august';
import type { AugustIssue } from '@/lib/august/issues';

interface AnalyticsPanelProps {
  plan: FamilyAugustPlan;
  items: AugustTimelineItem[];
  weeks: AugustWeek[];
  issues: AugustIssue[];
  year: number;
}

const PEACE_BAND_BAR: Record<string, string> = {
  good: 'bg-success', attention: 'bg-warning', problem: 'bg-error',
};

export function AnalyticsPanel({ plan, items, weeks, issues, year }: AnalyticsPanelProps) {
  const workload = useMemo(() => workloadByMember(plan, items), [plan, items]);
  const cost = useMemo(() => costRollup(items, weeks), [items, weeks]);
  const windows = useMemo(() => vacationWindows(year, items, issues).slice(0, 3), [year, items, issues]);
  const peace = useMemo(() => peaceOfMind(issues), [issues]);

  const maxHours = Math.max(1, ...workload.map(w => w.careHours));
  const costEntries = Object.entries(cost.byType).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
      {/* Peace of mind */}
      <Card>
        <CardHeader>
          <CardTitle><HeartPulse size={18} className="text-accent" /> מדד שקט נפשי</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold text-primary">{peace.score}</div>
          <div className="flex-1">
            <div className="h-3 rounded-full bg-surface-alt overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${PEACE_BAND_BAR[peace.band]}`}
                style={{ width: `${peace.score}%` }}
              />
            </div>
            <p className="text-sm text-text-mid mt-1.5">{PEACE_LABEL[peace.band]}</p>
          </div>
        </div>
      </Card>

      {/* Workload */}
      <Card>
        <CardHeader>
          <CardTitle><BarChart3 size={18} className="text-accent" /> עומס המשפחה</CardTitle>
        </CardHeader>
        {workload.length === 0 ? (
          <p className="text-sm text-text-muted">הוסיפו הורים / מטפלים כדי לראות חלוקת עומס.</p>
        ) : (
          <div className="space-y-2">
            {workload.map(w => (
              <div key={w.member.id} className="flex items-center gap-2">
                <span className="text-sm w-24 truncate flex items-center gap-1">
                  <span aria-hidden="true">{MEMBER_ROLE_EMOJI[w.member.role]}</span>
                  {w.member.name}
                </span>
                <div className="flex-1 h-2.5 rounded-full bg-surface-alt overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: `${(w.careHours / maxHours) * 100}%` }} />
                </div>
                <span className="text-xs text-text-muted w-12 text-left">{w.careHours} ש׳</span>
              </div>
            ))}
            <p className="text-xs text-text-muted pt-1">שעות בהן בן המשפחה אחראי על ילד</p>
          </div>
        )}
      </Card>

      {/* Cost breakdown */}
      <Card>
        <CardHeader>
          <CardTitle><Wallet size={18} className="text-accent" /> עלויות</CardTitle>
        </CardHeader>
        <p className="text-2xl font-bold text-primary mb-3">₪{cost.total.toLocaleString('he-IL')}</p>
        {costEntries.length === 0 ? (
          <p className="text-sm text-text-muted">עדיין לא הוזנו עלויות.</p>
        ) : (
          <ul className="space-y-1.5">
            {costEntries.map(([type, amount]) => (
              <li key={type} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-text-mid">
                  <span aria-hidden="true">{AUGUST_TYPE_ICONS[type as keyof typeof AUGUST_TYPE_ICONS]}</span>
                  {type}
                </span>
                <span className="font-medium text-text-base">₪{(amount ?? 0).toLocaleString('he-IL')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Vacation windows */}
      <Card>
        <CardHeader>
          <CardTitle><Palmtree size={18} className="text-accent" /> חלונות מומלצים לחופשה</CardTitle>
        </CardHeader>
        {windows.length === 0 ? (
          <p className="text-sm text-text-muted">אין כרגע חלון פנוי של יומיים ברצף — נסו לפנות ימי עבודה.</p>
        ) : (
          <ul className="space-y-2">
            {windows.map(w => (
              <li key={w.start} className="flex items-center justify-between rounded-md bg-surface-alt px-3 py-2">
                <span className="text-sm text-text-base">
                  {formatDayLabel(w.start)} – {formatDayLabel(w.end)}
                </span>
                <Badge variant="success">{w.length} ימים</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
