import React, { useMemo, useState } from 'react';
import { Users, Settings2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useFamilies } from '@/hooks/useFamilies';
import { useAugustFamily } from '@/hooks/useAugustFamily';
import { useAugustPlan } from '@/hooks/useAugustPlan';
import { useTreePersons } from '@/pages/FamilyTree/useTreePersons';
import { familyDisplayName } from '@/lib/utils';
import { augustWeeks, itemOccurrences, toDateStr } from '@/lib/august/plan';
import { detectIssues, type AugustIssue } from '@/lib/august/issues';
import { coverageByDate, monthStats, suggestResponsibleAdult } from '@/lib/august/coverage';
import { holidayGroup, isFamilyHoliday, newGroupId, sharedHolidayPatch } from '@/lib/august/holiday';
import { deriveMembersFromTree } from '@/lib/august/members';
import type { AugustTimelineItem, AugustMember } from '@/types/august';
import { MembersEditor } from './MembersEditor';
import { DayView } from './DayView';
import { MonthSummary } from './MonthSummary';
import { DayRail } from './DayRail';
import { MonthGrid } from './MonthGrid';
import { DayCommand } from './DayCommand';
import { ActionsPanel } from './ActionsPanel';
import { AnalyticsPanel } from './AnalyticsPanel';
import { ItemForm, type ItemDraft } from './ItemForm';
import type { User } from 'firebase/auth';

// ── אוגוסט רחמנא ליצלן — family coverage command center ─────────────────────
// Not a calendar: the page is organized around one job — every child-hour is
// either covered or visibly red. Top: the month's coverage verdict. Side rail:
// every day as a coverage row. Center: the selected day's family timeline,
// children first. Actions panel: the open gaps and the one-tap fix for each.

interface AugustProps {
  user: User | null;
  isAdmin: boolean;
}

/** Quick ItemForm invocation — either a prefilled add (gap fix) or a group edit. */
interface QuickForm {
  date: string;
  draft?: Partial<ItemDraft>;
  editing?: AugustTimelineItem;
}

export function August({ user, isAdmin }: AugustProps) {
  const year = new Date().getFullYear();
  const { data: families, loading: familiesLoading } = useFamilies();
  const { familyId, family, resolving, selectFamily } = useAugustFamily(user, families);
  const {
    plan, items, loading, ensurePlan, setMembers, setDayNote, setDayTasks,
    addItem, addItems, updateItem, updateItems, deleteItem, deleteItems,
  } = useAugustPlan(familyId, year);
  const { persons: treePersons } = useTreePersons();

  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => defaultDate(year));
  const [editorOpen, setEditorOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<QuickForm | null>(null);
  const [holidayToDelete, setHolidayToDelete] = useState<AugustTimelineItem | null>(null);
  // Mobile-only bottom sheet for the actions list (desktop shows the side panel).
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);

  const weeks = useMemo(() => augustWeeks(year), [year]);
  const allDays = useMemo(() => weeks.flatMap(w => w.days), [weeks]);

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
  async function handleAddItems(drafts: ItemDraft[]) {
    await persistMembersIfNeeded();
    await addItems(drafts);
  }

  // ── Family holidays are ONE event — edit/delete any copy, all copies follow.
  // Shared fields fan out to every member's copy (each keeps its own personId;
  // cost/transport stay on the edited copy). Legacy pre-groupId copies group by
  // their identical title+dates and get stamped with a real groupId on first
  // edit — existing data is never touched merely by loading.
  async function handleUpdateItem(id: string, draft: ItemDraft) {
    const target = items.find(i => i.id === id);
    if (target && isFamilyHoliday(target)) {
      const group = holidayGroup(items, target);
      if (group.length > 1) {
        const groupId = target.groupId ?? newGroupId();
        const shared = { ...sharedHolidayPatch(draft), groupId };
        await updateItems(group.map(g => ({
          id: g.id,
          patch: g.id === id ? { ...draft, groupId } : { ...shared, personId: g.personId },
        })));
        return;
      }
    }
    await updateItem(id, draft);
  }
  async function handleDeleteItem(id: string) {
    const target = items.find(i => i.id === id);
    if (target && isFamilyHoliday(target)) {
      await deleteItems(holidayGroup(items, target).map(g => g.id));
      return;
    }
    await deleteItem(id);
  }

  // Index timeline items by every day they occur on (multi-day items land on
  // each of their days).
  const itemsByDay = useMemo(() => {
    const map = new Map<string, AugustTimelineItem[]>();
    for (const it of items) {
      for (const date of itemOccurrences(it)) {
        map.set(date, [...(map.get(date) ?? []), it]);
      }
    }
    return map;
  }, [items]);

  const issues = useMemo(
    () => (plan ? detectIssues(plan, items) : detectIssues({ members, coverageStart: '08:00', coverageEnd: '20:00' }, items)),
    [plan, items, members]
  );
  const issuesByDate = useMemo(() => {
    const map = new Map<string, AugustIssue[]>();
    for (const i of issues) map.set(i.date, [...(map.get(i.date) ?? []), i]);
    return map;
  }, [issues]);

  // The one coverage model everything reads — rail, summary and actions all
  // derive from the same map, so the counts always match the visible timeline.
  const coverage = useMemo(
    () => coverageByDate(allDays.map(d => d.date), itemsByDay, issuesByDate, members, items),
    [allDays, itemsByDay, issuesByDate, members, items]
  );
  const stats = useMemo(() => monthStats(coverage, members), [coverage, members]);

  const winStart = plan?.coverageStart ?? '08:00';
  const winEnd = plan?.coverageEnd ?? '20:00';

  // Day stepping for the dashboard header arrows (clamped to August).
  const dayIdx = allDays.findIndex(d => d.date === selectedDate);
  const stepDay = (delta: number) => {
    const next = allDays[dayIdx + delta];
    if (next) setSelectedDate(next.date);
  };

  // Selecting from the mobile actions sheet: close it and bring the day
  // dashboard into view (on phones the sheet covers it).
  function jumpFromSheet(date: string) {
    setSelectedDate(date);
    setActionsSheetOpen(false);
    // After React commits the sheet unmount. Instant (not smooth) on purpose:
    // smooth scrolling depends on compositor frames that some webviews starve,
    // and the user just wants to SEE the day they tapped.
    window.setTimeout(() => {
      document.getElementById('august-day')?.scrollIntoView({ block: 'start' });
    }, 120);
  }

  const openGapCount = issues.filter(i => i.kind === 'coverage_gap').length;
  const openDecisionCount = issues.filter(i => i.severity === 'yellow').length;

  // A red gap's one-tap fix: prefill a care item over the exact hole, with the
  // best available adult (free + least loaded) already suggested as responsible.
  function quickFix(gap: AugustIssue) {
    if (!gap.window || !gap.personId) return;
    const adult = suggestResponsibleAdult(items, gap.date, gap.window, members);
    setSelectedDate(gap.date);
    setQuickForm({
      date: gap.date,
      draft: {
        date: gap.date,
        endDate: undefined,
        personId: gap.personId,
        type: 'הורה',
        title: adult ? `עם ${adult.name}` : 'השגחת מבוגר',
        startTime: gap.window.start,
        endTime: gap.window.end,
        responsiblePersonId: adult?.id ?? '',
      },
    });
  }

  const familyOptions = families.map(f => ({ value: f.id, label: familyDisplayName(f) }));

  // ── Family resolution gate ────────────────────────────────────────────
  if (resolving || familiesLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <PageHeading />
        <SkeletonList count={3} />
      </div>
    );
  }

  if (!familyId) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
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
    <div className="p-4 sm:p-6 max-w-6xl mx-auto pb-24 sm:pb-6">
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
      <Card className="mb-4" padding="sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Users size={18} className="text-accent shrink-0" />
            <span className="font-bold text-primary shrink-0">{family ? familyDisplayName(family) : 'משפחה'}</span>
            {members.length > 0 && (
              <span className="hidden sm:inline text-sm text-text-muted truncate">
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
          {/* Top — the month's coverage verdict */}
          <MonthSummary stats={stats} />

          {/* Command center: day selector · selected-day timeline · open actions.
              Mobile gets a 7-col month grid + a bottom-sheet for actions;
              desktop gets the vertical rail + side panel. */}
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[10.5rem_minmax(0,1fr)_17rem] lg:gap-4 lg:items-start">
            <div className="lg:hidden">
              <MonthGrid
                days={allDays}
                coverage={coverage}
                selected={selectedDate}
                onSelect={setSelectedDate}
              />
            </div>
            <div className="hidden lg:block">
              <DayRail
                days={allDays}
                coverage={coverage}
                selected={selectedDate}
                onSelect={setSelectedDate}
              />
            </div>
            <div id="august-day" className="scroll-mt-16">
              <DayCommand
                date={selectedDate}
                coverage={coverage.get(selectedDate)}
                members={members}
                dayItems={itemsByDay.get(selectedDate) ?? []}
                issues={issuesByDate.get(selectedDate) ?? []}
                avatarFor={avatarFor}
                winStart={winStart}
                winEnd={winEnd}
                onQuickFix={quickFix}
                onEditHoliday={it => setQuickForm({ date: selectedDate, editing: it })}
                onDeleteHoliday={setHolidayToDelete}
                onAddActivity={() => setQuickForm({ date: selectedDate })}
                onOpenEditor={() => setEditorOpen(true)}
                onPrevDay={dayIdx > 0 ? () => stepDay(-1) : undefined}
                onNextDay={dayIdx >= 0 && dayIdx < allDays.length - 1 ? () => stepDay(1) : undefined}
              />
            </div>
            <div className="hidden lg:block">
              <ActionsPanel
                issues={issues}
                selectedDate={selectedDate}
                onJumpToDay={setSelectedDate}
                onQuickFix={quickFix}
              />
            </div>
          </div>

          {/* Mobile actions: floating pill above the nav → bottom sheet */}
          {(openGapCount > 0 || openDecisionCount > 0) && !actionsSheetOpen && (
            <button
              onClick={() => setActionsSheetOpen(true)}
              className="lg:hidden fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 rounded-full bg-primary text-white text-sm font-semibold px-4 py-2.5 shadow-lg"
            >
              {openGapCount > 0 && <span>🔴 {openGapCount}</span>}
              {openDecisionCount > 0 && <span>🟡 {openDecisionCount}</span>}
              לסגירה
            </button>
          )}
          {actionsSheetOpen && (
            <div
              className="lg:hidden fixed inset-0 z-50"
              onClick={() => setActionsSheetOpen(false)}
            >
              <div className="absolute inset-0 bg-black/40" />
              <div
                className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-surface shadow-xl p-3 pb-6 max-h-[75vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
                <ActionsPanel
                  issues={issues}
                  selectedDate={selectedDate}
                  onJumpToDay={jumpFromSheet}
                  onQuickFix={gap => { setActionsSheetOpen(false); quickFix(gap); }}
                />
              </div>
            </div>
          )}

          {/* Deeper planning analytics */}
          {plan && (
            <div className="mt-6">
              <AnalyticsPanel plan={plan} items={items} weeks={weeks} issues={issues} year={year} />
            </div>
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

      {editorOpen && (
        <DayView
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          date={selectedDate}
          members={members}
          items={itemsByDay.get(selectedDate) ?? []}
          issues={issuesByDate.get(selectedDate) ?? []}
          coverageStart={winStart}
          coverageEnd={winEnd}
          note={plan?.dayNotes?.[selectedDate] ?? ''}
          tasks={plan?.dayTasks?.[selectedDate] ?? []}
          onSaveNote={note => setDayNote(selectedDate, note)}
          onSaveTasks={tasks => setDayTasks(selectedDate, tasks)}
          onAddItem={handleAddItem}
          onAddItems={handleAddItems}
          onUpdateItem={handleUpdateItem}
          onDeleteItem={handleDeleteItem}
        />
      )}

      {/* Quick add / gap fix / family-holiday edit — no full day modal needed */}
      <ItemForm
        open={!!quickForm}
        onClose={() => setQuickForm(null)}
        date={quickForm?.date ?? selectedDate}
        members={members}
        editing={quickForm?.editing ?? null}
        defaultDraft={quickForm?.draft}
        onSubmit={async draft => {
          if (quickForm?.editing) await handleUpdateItem(quickForm.editing.id, draft);
          else await handleAddItem(draft);
        }}
        onSubmitMany={handleAddItems}
      />

      <ConfirmDialog
        open={!!holidayToDelete}
        onClose={() => setHolidayToDelete(null)}
        onConfirm={async () => {
          if (holidayToDelete) await handleDeleteItem(holidayToDelete.id);
          setHolidayToDelete(null);
        }}
        title="מחיקת חופשה משפחתית"
        message={`החופשה "${holidayToDelete?.title}" תימחק לכל בני המשפחה. למחוק?`}
        confirmLabel="מחק"
      />
    </div>
  );
}

/** Today when we're inside August of `year`, else the month's first day. */
function defaultDate(year: number): string {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === 7) return toDateStr(now);
  return `${year}-08-01`;
}

function PageHeading() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-primary">🏖 אוגוסט רחמנא ליצלן</h1>
      <p className="text-text-muted text-sm mt-0.5">
        מרכז שליטה לכיסוי הילדים — כל שעה מכוסה, או מסומנת באדום
      </p>
    </div>
  );
}
