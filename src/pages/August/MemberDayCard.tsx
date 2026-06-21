import React from 'react';
import { ChevronDown, MapPin, Pencil, Trash2, Plus, Car, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { AUGUST_TYPE_ICONS, MEMBER_ROLE_EMOJI, MEMBER_ROLE_LABELS, COVERING_TYPES } from '@/types/august';
import { AUGUST_TYPE_TONE } from './typeStyles';
import type { AugustMember, AugustTimelineItem } from '@/types/august';

interface MemberDayCardProps {
  member: AugustMember;
  items: AugustTimelineItem[];   // this member's items for the day, sorted
  members: AugustMember[];       // for name lookups
  expanded: boolean;
  hasGap: boolean;               // child has an uncovered window today
  highlight: boolean;            // focused via a relationship click
  onToggle: () => void;
  onAdd: () => void;
  onEdit: (it: AugustTimelineItem) => void;
  onDelete: (it: AugustTimelineItem) => void;
  onFocusPerson: (personId: string) => void;
}

export function MemberDayCard({
  member, items, members, expanded, hasGap, highlight,
  onToggle, onAdd, onEdit, onDelete, onFocusPerson,
}: MemberDayCardProps) {
  const isChild = member.role === 'child';
  const nameOf = (id?: string) => members.find(m => m.id === id)?.name ?? '—';
  const statusLabel = isChild ? (hasGap ? '🔴 חוסר כיסוי' : items.length ? '🟢 מכוסה' : '⚪ ריק') : null;

  return (
    <div className={['rounded-card border transition-colors', highlight ? 'border-accent ring-1 ring-accent' : 'border-border', 'bg-surface'].join(' ')}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-right"
        aria-expanded={expanded}
      >
        <span className="text-xl" aria-hidden="true">{MEMBER_ROLE_EMOJI[member.role]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-primary">{member.name}</span>
            <span className="text-xs text-text-muted">{MEMBER_ROLE_LABELS[member.role]}</span>
            {statusLabel && (
              <span className={`text-xs font-semibold ${hasGap ? 'text-error' : 'text-success'}`}>{statusLabel}</span>
            )}
          </div>
        </div>
        <span className="text-xs text-text-muted">{items.length} פריטים</span>
        <ChevronDown size={18} className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-text-muted">אין פעילויות ליום זה.</p>
          ) : items.map(it => {
            const covering = isChild && COVERING_TYPES.includes(it.type);
            return (
              <div key={it.id} className={`rounded-md p-2.5 group ${AUGUST_TYPE_TONE[it.type]}`}>
                <div className="flex items-start gap-2">
                  <span className="text-base shrink-0" aria-hidden="true">{AUGUST_TYPE_ICONS[it.type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm tabular-nums">{it.startTime}–{it.endTime}</span>
                      <span className="text-sm">{it.title}</span>
                      {it.endDate && it.endDate !== it.date && <Badge variant="default">מרובה ימים</Badge>}
                      {it.isCritical && <Badge variant="error"><AlertTriangle size={10} /> חשוב</Badge>}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                      {it.location && <span className="flex items-center gap-1"><MapPin size={11} />{it.location}</span>}
                      {/* Relationship: the responsible carer, clickable to focus their card */}
                      {covering && it.responsiblePersonId && (
                        <button
                          onClick={() => onFocusPerson(it.responsiblePersonId!)}
                          className="flex items-center gap-1 font-semibold underline decoration-dotted hover:opacity-70"
                        >
                          אחראי/ת: {nameOf(it.responsiblePersonId)}
                        </button>
                      )}
                      {it.dropOffPersonId && (
                        <button onClick={() => onFocusPerson(it.dropOffPersonId!)} className="flex items-center gap-1 hover:opacity-70">
                          <Car size={11} /> הורדה: {nameOf(it.dropOffPersonId)}
                        </button>
                      )}
                      {it.pickUpPersonId && (
                        <button onClick={() => onFocusPerson(it.pickUpPersonId!)} className="flex items-center gap-1 hover:opacity-70">
                          <Car size={11} /> איסוף: {nameOf(it.pickUpPersonId)}
                        </button>
                      )}
                      {typeof it.cost === 'number' && it.cost > 0 && <span>💰 ₪{it.cost}</span>}
                      {it.notes && <span>📝 {it.notes}</span>}
                    </div>
                  </div>

                  <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(it)} aria-label="ערוך" className="p-1 hover:text-accent rounded"><Pencil size={13} /></button>
                    <button onClick={() => onDelete(it)} aria-label="מחק" className="p-1 hover:text-error rounded"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-1 py-2 rounded-md border border-dashed border-border text-sm text-text-mid hover:border-accent hover:text-accent transition-colors"
          >
            <Plus size={14} /> הוסף פריט ל{member.name}
          </button>
        </div>
      )}
    </div>
  );
}
