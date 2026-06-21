import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import {
  AUGUST_ITEM_TYPES, AUGUST_TYPE_ICONS, TIME_REQUIRED_TYPES,
} from '@/types/august';
import { timeToMinutes } from '@/lib/august/plan';
import type { AugustMember, AugustTimelineItem, AugustItemType } from '@/types/august';

export type ItemDraft = Omit<AugustTimelineItem, 'id' | 'planId' | 'nuclearFamilyId' | 'createdAt' | 'updatedAt'>;

interface ItemFormProps {
  open: boolean;
  onClose: () => void;
  date: string;
  members: AugustMember[];
  /** When editing, the existing item; null when adding. */
  editing: AugustTimelineItem | null;
  /** Pre-selected person when adding from a member row. */
  defaultPersonId?: string;
  /** Pre-selected type for quick-add buttons. */
  defaultType?: AugustItemType;
  onSubmit: (draft: ItemDraft) => Promise<void>;
}

const TYPE_OPTIONS = AUGUST_ITEM_TYPES.map(t => ({ value: t, label: `${AUGUST_TYPE_ICONS[t]} ${t}` }));

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sun..Sat

function emptyDraft(date: string, personId: string): ItemDraft {
  return {
    date,
    endDate: undefined,
    daysOfWeek: undefined,
    personId,
    type: 'קייטנה',
    title: '',
    startTime: '08:00',
    endTime: '14:00',
    responsiblePersonId: '',
    dropOffPersonId: '',
    pickUpPersonId: '',
    location: '',
    cost: undefined,
    notes: '',
    isCritical: false,
  };
}

export function ItemForm({
  open, onClose, date, members, editing, defaultPersonId, defaultType, onSubmit,
}: ItemFormProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<ItemDraft>(() => emptyDraft(date, defaultPersonId ?? ''));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id, planId, nuclearFamilyId, createdAt, updatedAt, ...rest } = editing;
      void id; void planId; void nuclearFamilyId; void createdAt; void updatedAt;
      setForm(rest);
    } else {
      const fresh = emptyDraft(date, defaultPersonId ?? members[0]?.id ?? '');
      setForm(defaultType ? { ...fresh, type: defaultType } : fresh);
    }
  }, [open, editing, date, defaultPersonId, defaultType, members]);

  function set<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  const personOptions = members.map(m => ({ value: m.id, label: m.name }));
  const optionalPersonOptions = [{ value: '', label: '— ללא —' }, ...personOptions];
  const timeRequired = TIME_REQUIRED_TYPES.includes(form.type);
  const isMultiDay = !!form.endDate && form.endDate > form.date;

  function toggleDay(dow: number) {
    setForm(f => {
      const cur = f.daysOfWeek ?? [];
      const next = cur.includes(dow) ? cur.filter(d => d !== dow) : [...cur, dow].sort();
      return { ...f, daysOfWeek: next.length ? next : undefined };
    });
  }

  async function submit() {
    if (!form.personId) { showToast('נא לבחור בן משפחה', 'error'); return; }
    if (!form.title.trim()) { showToast('נא להזין כותרת', 'error'); return; }
    const s = timeToMinutes(form.startTime);
    const e = timeToMinutes(form.endTime);
    if (Number.isNaN(s) || Number.isNaN(e)) { showToast('שעות לא תקינות', 'error'); return; }
    if (e <= s) { showToast('שעת הסיום חייבת להיות אחרי שעת ההתחלה', 'error'); return; }
    if (form.endDate && form.endDate < form.date) { showToast('תאריך הסיום חייב להיות אחרי תאריך ההתחלה', 'error'); return; }

    const multiDay = !!form.endDate && form.endDate > form.date;
    const payload: ItemDraft = {
      ...form,
      title: form.title.trim(),
      // Always store endDate (= start for single-day) so editing a range back to
      // one day can't leave a stale span behind.
      endDate: multiDay ? form.endDate : form.date,
      daysOfWeek: multiDay && form.daysOfWeek?.length ? form.daysOfWeek : undefined,
      location: form.location?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
      responsiblePersonId: form.responsiblePersonId || undefined,
      dropOffPersonId: form.dropOffPersonId || undefined,
      pickUpPersonId: form.pickUpPersonId || undefined,
      cost: form.cost === undefined || Number.isNaN(form.cost) ? undefined : Number(form.cost),
    };
    setSaving(true);
    try {
      await onSubmit(payload);
      onClose();
    } catch (err) {
      showToast((err as Error).message || 'שמירה נכשלה', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'עריכת פריט' : 'הוספת פריט'}
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} loading={saving}>{editing ? 'שמור' : 'הוסף'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="בן משפחה"
            options={personOptions}
            value={form.personId}
            onChange={e => set('personId', e.target.value)}
            placeholder="בחר..."
          />
          <Select
            label="סוג"
            options={TYPE_OPTIONS}
            value={form.type}
            onChange={e => set('type', e.target.value as AugustItemType)}
          />
        </div>

        <Input
          label="כותרת"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="קייטנת ים, עבודה, סבתא..."
        />

        {/* Date range — single day by default; set an end date for a multi-day camp */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="מתאריך"
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
          />
          <Input
            label="עד תאריך (לקייטנה רב-יומית)"
            type="date"
            min={form.date}
            value={form.endDate || ''}
            onChange={e => set('endDate', e.target.value || undefined)}
          />
        </div>

        {isMultiDay && (
          <div>
            <label className="text-sm font-medium text-text-mid">ימים בשבוע (ריק = כל הימים)</label>
            <div className="flex gap-1.5 mt-1.5">
              {WEEKDAYS.map((d, dow) => {
                const active = (form.daysOfWeek ?? []).includes(dow);
                return (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => toggleDay(dow)}
                    className={[
                      'w-8 h-8 rounded-full text-sm font-semibold transition-colors',
                      active ? 'bg-accent text-white' : 'bg-surface-alt text-text-mid hover:bg-border',
                    ].join(' ')}
                    aria-pressed={active}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label={`משעה${timeRequired ? ' *' : ''}`}
            type="time"
            value={form.startTime}
            onChange={e => set('startTime', e.target.value)}
          />
          <Input
            label={`עד שעה${timeRequired ? ' *' : ''}`}
            type="time"
            value={form.endTime}
            onChange={e => set('endTime', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Select
            label="אחראי/ת"
            options={optionalPersonOptions}
            value={form.responsiblePersonId || ''}
            onChange={e => set('responsiblePersonId', e.target.value)}
          />
          <Select
            label="הורדה"
            options={optionalPersonOptions}
            value={form.dropOffPersonId || ''}
            onChange={e => set('dropOffPersonId', e.target.value)}
          />
          <Select
            label="איסוף"
            options={optionalPersonOptions}
            value={form.pickUpPersonId || ''}
            onChange={e => set('pickUpPersonId', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="מיקום"
            value={form.location || ''}
            onChange={e => set('location', e.target.value)}
            placeholder="כתובת / שם מקום"
          />
          <Input
            label="מחיר (אופציונלי)"
            type="number"
            min={0}
            value={form.cost ?? ''}
            onChange={e => set('cost', e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="₪ סה״כ"
            hint={isMultiDay ? 'מחיר כולל לכל התקופה' : undefined}
          />
        </div>

        <TextArea
          label="הערות"
          value={form.notes || ''}
          onChange={e => set('notes', e.target.value)}
          placeholder="פרטים נוספים..."
        />

        <label className="flex items-center gap-2 text-sm text-text-mid cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.isCritical}
            onChange={e => set('isCritical', e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          סמן כקריטי ⚠️
        </label>
      </div>
    </Modal>
  );
}
