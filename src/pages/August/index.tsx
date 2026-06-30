import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Settings2, ChevronLeft, ChevronRight, CalendarRange, CalendarDays } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useFamilies } from '@/hooks/useFamilies';
import { useAugustFamily } from '@/hooks/useAugustFamily';
import { useAugustPlan } from '@/hooks/useAugustPlan';
import { useTreePersons } from '@/pages/FamilyTree/useTreePersons';
import { familyDisplayName } from '@/lib/utils';
import { augustWeeks, itemOccurrences, type AugustWeek } from '@/lib/august/plan';
import { detectIssues, dayStatus, summarize, type DayStatus, type AugustIssue } from '@/lib/august/issues';
import {
  workloadByMember, costRollup, peaceOfMind, peaceForWeek, PEACE_EMOJI,
} from '@/lib/august/analytics';
import { deriveMembersFromTree } from '@/lib/august/members';
import type { AugustTimelineItem, AugustMember } from '@/types/august';
import { MembersEditor } from './MembersEditor';
import { DayView } from './DayView';
import { IssuesPanel } from './IssuesPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { FamilyDayCard } from './FamilyDayCard';
import { WeekHealthStrip } from './WeekHealthStrip';
import { MonthHeatmap } from './MonthHeatmap';
import type { ItemDraft } from './ItemForm';
import type { User } from 'firebase/auth';

type ViewMode = 'month' | 'week';

interface AugustProps {
  user: User | null;
  isAdmin: boolean;
}

export function August({ user, isAdmin }: AugustProps) {
  const year = new Date().getFullYear();
  const { data: families, loading: familiesLoading } = useFamilies();
  const { familyId, family, resolving, selectFamily } = useAugustFamily(user, families);
  const { plan, items, loading, ensurePlan, setMembers, setDayNote, setDayTasks, addItem, updateItem, deleteItem } =
    useAugustPlan(familyId, year);
  const { persons: treePersons } = useTreePersons();

  const [membersOpen, setMembersOpen] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('week');
  const [weekIdx, setWeekIdx] = useState(() => currentWeekIndex(year));

  const weeks = useMemo(() => augustWeeks(year), [year]);

  // Real tree photo per member (tree-derived member.id === person.id); falls back
  // to a colored initials avatar for anyone without a photo.
  const photoByMember = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const p of treePersons) m.set(p.id, p.photoData ?? null);
    return m;
  }, [treePersons]);
  const avatarFor = (id: string): string | null => photoByMember.get(id) ?? null;

  // Members: prefer the plan's saved list; otherwise auto-derive from the
  // family tree (parents + named children matched by name).
  const derivedMembers = useMemo(
    () => (family ? deriveMembersFromTree(family, treePersons) : []),
    [family, treePersons]
  );
  const members: AugustMember[] = (plan?.members?.length ? plan.members : derivedMembers);

  // Persist members lazily — only when the user actually edits or adds, so we
  // never write empty plan docs just from viewing a family.
  async function persistMembersIfNeeded() {
    if (!members.length) return;
    if (!plan) await ensurePlan(members);
    else if ((plan.members?.length ?? 0) === 0) await setMembers(members);
  }
  async function saveMembers(next: AugustMember[]) {
    if (!plan) await ensurePlan(next);
    else await setMembers(next);
  }
  async function handleAddItem(draft: ItemDraft) {
    await persistMembersIfNeeded();
    await addItem(draft);
  }

  // Index timeline items by every day they occur on (multi-day items land on
  // each of their days).
  const itemsByDay = useMemo(() => {
    const map = new Map<string, AugustTimelineItem[]>();
    for (const it of items) {
      for (const date of itemOccurrences(it)) {
        const list = map.get(date) ?? [];
        list.push(it);
        map.set(date, list);
      }
    }
    return map;
  }, [items]);

  // ── Phase 2 detection engines ─────────────────────────────────────────
  const issues = useMemo(
    () => (plan ? detectIssues(plan, items) : []),
    [plan, items]
  );
  const issuesByDate = useMemo(() => {
    const map = new Map<string, typeof issues>();
    for (const i of issues) {
      const list = map.get(i.date) ?? [];
      list.push(i);
      map.set(i.date, list);
    }
    return map;
  }, [issues]);

  const summary = useMemo(() => {
    const datesWithItems = new Set(items.map(i => i.date));
    const cost = items.reduce((s, i) => s + (typeof i.cost === 'number' ? i.cost : 0), 0);
    return { ...summarize(issues, datesWithItems), cost };
  }, [items, issues]);

  // ── Phase 3 analytics for the summary tiles ───────────────────────────
  const peace = useMemo(() => peaceOfMind(issues), [issues]);
  const totalCareHours = useMemo(
    () => (plan ? workloadByMember(plan, items).reduce((s, w) => s + w.careHours, 0) : 0),
    [plan, items]
  );
  const weeklyCost = useMemo(
    () => (plan ? costRollup(items, weeks).byWeek : {}),
    [plan, items, weeks]
  );

  const statusOf = (date: string): DayStatus =>
    dayStatus(issuesByDate.get(date) ?? [], (itemsByDay.get(date)?.length ?? 0) > 0);

  const familyOptions = families.map(f => ({ value: f.id, label: familyDisplayName(f) }));

  // ── Family resolution gate ────────────────────────────────────────────
  if (resolving || familiesLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PageHeading />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!familyId) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <PageHeading />
        <Card className="max-w-md mx-auto mt-4">
          <h2 className="text-base font-bold text-primary mb-1">בחרו את המשפחה שלכם</h2>
          <p className="text-sm text-text-muted mb-4">
            כדי לתכנן את אוגוסט, בחרו את המשפחה. הבחירה תיזכר בפעם הבאה.
          </p>
          <Select
            label="המשפחה שלי"
            options={familyOptions}
            value=""
            placeholder="בחר משפחה..."
            onChange={e => e.target.value && selectFamily(e.target.value)}
          />
          {families.length === 0 && (
            <p className="text-xs text-text-muted mt-3">עדיין לא הוגדרו משפחות במערכת.</p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <PageHeading />
        {/* Family switcher — always for admins, plus a "change" affordance for all */}
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <div className="min-w-[12rem]">
              <Select
                label="בחר משפחה"
                options={familyOptions}
                value={familyId}
                onChange={e => selectFamily(e.target.value)}
              />
            </div>
          ) : (
            <button
              onClick={() => selectFamily('')}
              className="text-xs text-text-muted hover:text-accent transition-colors mt-1"
            >
              החלף משפחה
            </button>
          )}
        </div>
      </div>

      {/* Active family + members */}
      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-accent" />
            <span className="font-bold text-primary">{family ? familyDisplayName(family) : 'משפחה'}</span>
            {members.length > 0 && (
              <span className="text-sm text-text-muted">
                · {members.map(m => m.name).join(', ')}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
            <Settings2 size={14} /> בני המשפחה
          </Button>
        </div>
      </Card>

      {loading ? (
        <SkeletonList count={3} />
      ) : members.length === 0 ? (
        <EmptyState
          icon="🏖"
          title="בואו נתחיל לתכנן את אוגוסט"
          description="קודם נגדיר מי בני המשפחה — הורים וילדים — ואז נוכל לבנות את לוח הקיץ."
          action={{ label: 'הגדרת בני המשפחה', onClick: () => setMembersOpen(true) }}
        />
      ) : (
        <>
          {/* Summary tiles — status overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <SummaryTile emoji="🟢" label="ימים מכוסים" value={summary.covered} />
            <SummaryTile emoji="🟡" label="דורש החלטה" value={summary.attention} />
            <SummaryTile emoji="🔴" label="פערי כיסוי" value={summary.gaps} />
            <SummaryTile emoji="💰" label="עלות אוגוסט" value={`₪${summary.cost.toLocaleString('he-IL')}`} />
            <SummaryTile emoji="📊" label="שעות טיפול" value={`${totalCareHours}`} />
            <SummaryTile emoji={PEACE_EMOJI[peace.band]} label="שקט נפשי" value={peace.score} />
          </div>

          {/* Open issues — "דורש סגירה" */}
          <IssuesPanel issues={issues} onOpenDay={setOpenDay} />

          {/* View toggle: whole month vs one week in detail */}
          <div className="flex items-center justify-between mb-4 mt-2 gap-2 flex-wrap">
            <div className="inline-flex rounded-lg bg-surface-alt p-0.5">
              <ToggleBtn active={view === 'month'} onClick={() => setView('month')}>
                <CalendarDays size={14} /> חודש
              </ToggleBtn>
              <ToggleBtn active={view === 'week'} onClick={() => setView('week')}>
                <CalendarRange size={14} /> שבוע
              </ToggleBtn>
            </div>
            {view === 'week' && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={weekIdx === 0} aria-label="שבוע קודם">
                  <ChevronRight size={16} />
                </Button>
                <span className="text-sm font-semibold text-primary min-w-[4.5rem] text-center">{weeks[weekIdx]?.label}</span>
                <Button variant="ghost" size="icon" onClick={() => setWeekIdx(i => Math.min(weeks.length - 1, i + 1))} disabled={weekIdx >= weeks.length - 1} aria-label="שבוע הבא">
                  <ChevronLeft size={16} />
                </Button>
              </div>
            )}
          </div>

          {view === 'week' ? (
            weeks[weekIdx] && (
              <WeekDashboard
                week={weeks[weekIdx]}
                members={members}
                itemsByDay={itemsByDay}
                issuesByDate={issuesByDate}
                issues={issues}
                statusOf={statusOf}
                weeklyCost={weeklyCost[weeks[weekIdx].index] ?? 0}
                avatarFor={avatarFor}
                winStart={plan?.coverageStart ?? '08:00'}
                winEnd={plan?.coverageEnd ?? '20:00'}
                onOpenDay={setOpenDay}
              />
            )
          ) : (
            <MonthHeatmap
              weeks={weeks}
              members={members}
              itemsByDay={itemsByDay}
              issuesByDate={issuesByDate}
              statusOf={statusOf}
              onPickDay={(date) => {
                setWeekIdx(weekIndexOf(weeks, date));
                setView('week');
              }}
            />
          )}

          {/* Deeper planning analytics */}
          {plan && (
            <AnalyticsPanel plan={plan} items={items} weeks={weeks} issues={issues} year={year} />
          )}
        </>
      )}

      {/* Editors */}
      <MembersEditor
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        members={members}
        onSave={saveMembers}
      />

      {openDay && (
        <DayView
          open={!!openDay}
          onClose={() => setOpenDay(null)}
          date={openDay}
          members={members}
          items={itemsByDay.get(openDay) ?? []}
          issues={issuesByDate.get(openDay) ?? []}
          coverageStart={plan?.coverageStart ?? '08:00'}
          coverageEnd={plan?.coverageEnd ?? '20:00'}
          note={plan?.dayNotes?.[openDay] ?? ''}
          tasks={plan?.dayTasks?.[openDay] ?? []}
          onSaveNote={note => setDayNote(openDay, note)}
          onSaveTasks={tasks => setDayTasks(openDay, tasks)}
          onAddItem={handleAddItem}
          onUpdateItem={(id, draft: ItemDraft) => updateItem(id, draft)}
          onDeleteItem={deleteItem}
        />
      )}
    </div>
  );
}

/** Array index of the week containing `date`, or 0 if none. */
function weekIndexOf(weeks: AugustWeek[], date: string): number {
  const i = weeks.findIndex(w => w.days.some(d => d.date === date));
  return i < 0 ? 0 : i;
}

/** Default to the week containing today when we're in August, else the first week. */
function currentWeekIndex(year: number): number {
  const now = new Date();
  if (now.getFullYear() !== year || now.getMonth() !== 7) return 0;
  const today = `${year}-08-${String(now.getDate()).padStart(2, '0')}`;
  return weekIndexOf(augustWeeks(year), today);
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-primary">🏖 אוגוסט רחמנא ליצלן</h1>
      <p className="text-text-muted text-sm mt-0.5">
        תכנון קיץ למשפחה – קייטנות, שמירות, עבודה, חופשות ואיסופים
      </p>
    </div>
  );
}

function SummaryTile({ emoji, label, value }: { emoji: string; label: string; value: React.ReactNode }) {
  return (
    <Card padding="sm" className="flex items-center gap-3">
      <span className="text-2xl" aria-hidden="true">{emoji}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold text-primary leading-tight">{value}</p>
        <p className="text-xs text-text-muted truncate">{label}</p>
      </div>
    </Card>
  );
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors',
        active ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-primary',
      ].join(' ')}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

interface WeekDashboardProps {
  week: AugustWeek;
  members: AugustMember[];
  itemsByDay: Map<string, AugustTimelineItem[]>;
  issuesByDate: Map<string, AugustIssue[]>;
  issues: AugustIssue[];
  statusOf: (date: string) => DayStatus;
  weeklyCost: number;
  avatarFor: (memberId: string) => string | null;
  winStart: string;
  winEnd: string;
  onOpenDay: (date: string) => void;
}

function WeekDashboard({
  week, members, itemsByDay, issuesByDate, issues, statusOf, weeklyCost, avatarFor, winStart, winEnd, onOpenDay,
}: WeekDashboardProps) {
  // Per-week health counts — only days with activity count toward covered/gaps
  // (an empty day is "not yet planned", not a failure — mirrors summarize()).
  let covered = 0, attention = 0, gaps = 0;
  for (const d of week.days) {
    switch (statusOf(d.date)) {
      case 'green':  covered++; break;
      case 'yellow': attention++; break;
      case 'red':    gaps++; break;
    }
  }
  const peace = peaceForWeek(issues, week);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <WeekHealthStrip covered={covered} attention={attention} gaps={gaps} cost={weeklyCost} peace={peace} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {week.days.map(day => (
          <FamilyDayCard
            key={day.date}
            day={day}
            members={members}
            dayItems={itemsByDay.get(day.date) ?? []}
            issues={issuesByDate.get(day.date) ?? []}
            avatarFor={avatarFor}
            winStart={winStart}
            winEnd={winEnd}
            onOpen={() => onOpenDay(day.date)}
          />
        ))}
      </div>
    </motion.div>
  );
}
