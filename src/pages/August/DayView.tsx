import React, { useState, useMemo, useEffect } from 'react';
import { Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TextArea } from '@/components/ui/Input';
import { ItemForm, type ItemDraft } from './ItemForm';
import { FamilyTimeline } from './FamilyTimeline';
import { MemberDayCard } from './MemberDayCard';
import { TransportationList } from './TransportationList';
import { DayTasks } from './DayTasks';
import { formatDayLong } from '@/lib/august/plan';
import {
  orderedMembers, transportationForDay, dayBadge, DAY_BADGE_LABEL,
} from '@/lib/august/dayView';
import type { AugustIssue } from '@/lib/august/issues';
import type { AugustMember, AugustTimelineItem, AugustTask, AugustItemType } from '@/types/august';

interface DayViewProps {
  open: boolean;
  onClose: () => void;
  date: string;
  members: AugustMember[];
  items: AugustTimelineItem[];   // items occurring this day
  issues: AugustIssue[];         // issues for this day
  coverageStart: string;
  coverageEnd: string;
  note: string;
  tasks: AugustTask[];
  onSaveNote: (note: string) => void;
  onSaveTasks: (tasks: AugustTask[]) => void;
  onAddItem: (draft: ItemDraft) => Promise<void>;
  onUpdateItem: (id: string, draft: ItemDraft) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

const QUICK_ADD: { label: string; type: AugustItemType }[] = [
  { label: '+ קייטנה', type: 'קייטנה' },
  { label: '+ בייביסיטר', type: 'בייביסיטר' },
  { label: '+ סבתא', type: 'סבתא' },
  { label: '+ עבודה', type: 'עבודה' },
  { label: '+ חופש', type: 'חופש מהעבודה' },
  { label: '+ חופשה', type: 'חופשה משפחתית' },
];

export function DayView({
  open, onClose, date, members, items, issues, coverageStart, coverageEnd,
  note, tasks, onSaveNote, onSaveTasks, onAddItem, onUpdateItem, onDeleteItem,
}: DayViewProps) {
  const ordered = useMemo(() => orderedMembers(members), [members]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AugustTimelineItem | null>(null);
  const [defaultPerson, setDefaultPerson] = useState<string | undefined>();
  const [defaultType, setDefaultType] = useState<AugustItemType | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<AugustTimelineItem | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState(note);

  // Default-expand the first member (a child) when the day opens.
  useEffect(() => { if (open) { setExpanded(ordered[0]?.id ?? null); setNoteDraft(note); } }, [open, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemsByPerson = useMemo(() => {
    const map = new Map<string, AugustTimelineItem[]>();
    for (const m of members) map.set(m.id, []);
    for (const it of items) {
      if (!map.has(it.personId)) map.set(it.personId, []);
      map.get(it.personId)!.push(it);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [members, items]);

  const legs = useMemo(() => transportationForDay(items, date, members), [items, date, members]);
  const badge = dayBadge(issues, items.length > 0);
  const cost = items.reduce((s, it) => s + (typeof it.cost === 'number' ? it.cost : 0), 0);
  const criticalCount = items.filter(it => it.isCritical).length;
  const childGap = (id: string) => issues.some(i => i.kind === 'coverage_gap' && i.personId === id);

  function openAdd(personId?: string, type?: AugustItemType) {
    setEditing(null); setDefaultPerson(personId); setDefaultType(type); setFormOpen(true);
  }
  function openEdit(it: AugustTimelineItem) {
    setEditing(it); setDefaultPerson(undefined); setDefaultType(undefined); setFormOpen(true);
  }
  function focusPerson(personId: string) {
    setExpanded(personId);
    setHighlight(personId);
    window.setTimeout(() => setHighlight(h => (h === personId ? null : h)), 1600);
  }
  async function submit(draft: ItemDraft) {
    if (editing) await onUpdateItem(editing.id, draft);
    else await onAddItem(draft);
  }

  // Daily summary statuses
  const memberStatuses = ordered.map(m => ({
    member: m,
    ok: m.role === 'child' ? !childGap(m.id) : true,
  }));
  const allOk = issues.length === 0;

  return (
    <>
      <Modal open={open} onClose={onClose} title={formatDayLong(date)} size="xl">
        <div className="space-y-4">
          {/* Header: status + summary chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={badge === 'covered' ? 'success' : badge === 'attention' ? 'warning' : badge === 'empty' ? 'default' : 'error'}>
              {DAY_BADGE_LABEL[badge]}
            </Badge>
            <span className="text-xs text-text-muted">{items.length} פעילויות</span>
            <span className="text-xs text-text-muted">· {issues.length} בעיות</span>
            <span className="text-xs text-text-muted">· ₪{cost.toLocaleString('he-IL')}</span>
            {criticalCount > 0 && <span className="text-xs text-text-muted">· ⭐ {criticalCount} חשוב</span>}
          </div>

          {/* Open issues */}
          {issues.length > 0 && (
            <div className="rounded-card border border-warning/40 bg-amber-50/60 p-3">
              <h4 className="font-bold text-warning flex items-center gap-1.5 mb-2">
                <AlertTriangle size={16} /> דורש סגירה
              </h4>
              <ul className="space-y-1">
                {issues.map(i => (
                  <li key={i.id} className="text-sm text-text-mid flex items-start gap-1.5">
                    <span aria-hidden="true">{i.severity === 'red' ? '🔴' : '🟡'}</span>{i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Family timeline overview */}
          <FamilyTimeline members={ordered} items={items} date={date} winStart={coverageStart} winEnd={coverageEnd} />

          {/* Quick-add */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_ADD.map(q => (
              <button
                key={q.type}
                onClick={() => openAdd(undefined, q.type)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-badge bg-surface-alt text-text-mid hover:bg-accent hover:text-white transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Main: members (left) + transport/tasks/notes (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              {ordered.map(m => (
                <MemberDayCard
                  key={m.id}
                  member={m}
                  items={itemsByPerson.get(m.id) ?? []}
                  members={members}
                  expanded={expanded === m.id}
                  hasGap={m.role === 'child' && childGap(m.id)}
                  highlight={highlight === m.id}
                  onToggle={() => setExpanded(e => (e === m.id ? null : m.id))}
                  onAdd={() => openAdd(m.id)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  onFocusPerson={focusPerson}
                />
              ))}
              {ordered.length === 0 && (
                <p className="text-sm text-text-muted">הגדירו תחילה את בני המשפחה.</p>
              )}
            </div>

            <div className="space-y-4">
              <TransportationList legs={legs} />
              <DayTasks tasks={tasks} onSave={onSaveTasks} />
              <div className="rounded-card border border-border bg-surface p-3">
                <TextArea
                  label="הערה ליום"
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  onBlur={() => { if (noteDraft !== note) onSaveNote(noteDraft.trim()); }}
                  placeholder="הערה כללית ליום הזה..."
                />
              </div>
            </div>
          </div>

          {/* Daily summary */}
          <div className={`rounded-card p-3 ${allOk ? 'bg-green-50 border border-success/30' : 'bg-red-50 border border-error/30'}`}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {memberStatuses.map(s => (
                <span key={s.member.id} className="text-sm font-medium">
                  {s.member.name} {s.ok ? '🟢' : '🔴'}
                </span>
              ))}
            </div>
            <p className={`text-sm font-semibold flex items-center gap-1.5 ${allOk ? 'text-success' : 'text-error'}`}>
              {allOk ? <><CheckCircle2 size={15} /> היום סגור ומוכן</> : <><AlertTriangle size={15} /> דורש טיפול</>}
            </p>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => openAdd()}><Plus size={16} /> הוסף פריט</Button>
            <Button onClick={onClose}>סגור</Button>
          </div>
        </div>
      </Modal>

      <ItemForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        date={date}
        members={members}
        editing={editing}
        defaultPersonId={defaultPerson}
        defaultType={defaultType}
        onSubmit={submit}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => { if (deleteTarget) await onDeleteItem(deleteTarget.id); setDeleteTarget(null); }}
        title="מחיקת פריט"
        message={`למחוק את "${deleteTarget?.title}"?`}
        confirmLabel="מחק"
      />
    </>
  );
}
