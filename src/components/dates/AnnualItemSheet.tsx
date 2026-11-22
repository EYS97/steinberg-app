import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import {
  type AnniversaryKind,
  currentHebrewYear,
  formatGregorianDate,
  formatHebrewDate,
  hebrewDayOptions,
  hebrewMonthsOfYear,
  hebrewYearOptions,
  nextOccurrence,
  daysBetween,
  startOfToday,
} from '@/lib/dates';
import {
  type AnnualFormState,
  type AnnualItemDoc,
  countdownLabel,
  draftItem,
  findDuplicate,
  validateAnnualForm,
  yearsAt,
} from '@/lib/annualItems';

const G_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

interface AnnualItemSheetProps {
  open: boolean;
  kind: AnniversaryKind;
  /** null = add mode; otherwise the doc being edited */
  editing: AnnualItemDoc | null;
  initialForm: AnnualFormState;
  /** All items of this kind, for the duplicate warning */
  existing: AnnualItemDoc[];
  /** Names offered as autocomplete suggestions */
  nameSuggestions: string[];
  onClose: () => void;
  onSave: (form: AnnualFormState) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function AnnualItemSheet({
  open, kind, editing, initialForm, existing, nameSuggestions, onClose, onSave, onDelete,
}: AnnualItemSheetProps) {
  const [form, setForm] = useState<AnnualFormState>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset the form whenever the sheet opens for a different item / prefill
  useEffect(() => {
    if (open) { setForm(initialForm); setError(null); setConfirmDelete(false); }
  }, [open, initialForm]);

  const isBirthday = kind === 'birthday';
  const noun = isBirthday ? 'יום הולדת' : 'יום זיכרון';
  const title = editing ? `עריכת ${noun}` : `הוספת ${noun}`;
  const hYearRef = form.hYear || currentHebrewYear();

  const duplicate = useMemo(
    () => findDuplicate(existing, form.name, editing?.id),
    [existing, form.name, editing?.id]
  );

  // Live preview: when does it fall next, and (if year known) how old / how many years
  const preview = useMemo(() => {
    const item = draftItem(form);
    if (!item) return null;
    const next = nextOccurrence(item, kind);
    if (!next) return null;
    return { next, days: daysBetween(startOfToday(), next), years: yearsAt(item, next) };
  }, [form, kind]);

  const set = (patch: Partial<AnnualFormState>) => { setForm(f => ({ ...f, ...patch })); setError(null); };

  async function handleSave() {
    const err = validateAnnualForm(form);
    if (err) { setError(err); return; }
    setSaving(true);
    try { await onSave(form); }
    catch (e) { setError((e as Error).message || 'השמירה נכשלה'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!editing) return;
    setDeleting(true);
    try { await onDelete(editing.id); setConfirmDelete(false); }
    finally { setDeleting(false); }
  }

  const gDayCount = form.gMonth ? new Date(form.gYear || 2000, form.gMonth, 0).getDate() : 31;
  const thisYear = new Date().getFullYear();

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title}
        footer={
          confirmDelete && editing ? (
            <div className="flex gap-2 items-center" role="alert">
              <p className="text-sm text-error font-medium flex-1">למחוק את „{editing.name}” לכל בני המשפחה?</p>
              <Button variant="outline" onClick={() => setConfirmDelete(false)}>ביטול</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting}>כן, למחוק</Button>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              {editing && (
                <Button variant="ghost" className="text-error" onClick={() => setConfirmDelete(true)} aria-label={`מחק ${noun}`}>
                  <Trash2 size={16} /> מחיקה
                </Button>
              )}
              <div className="flex gap-2 mr-auto">
                <Button variant="outline" onClick={onClose}>ביטול</Button>
                <Button onClick={handleSave} loading={saving}>{editing ? 'שמירה' : 'הוספה'}</Button>
              </div>
            </div>
          )
        }
      >
        <form className="space-y-4" dir="rtl" onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <div>
            <Input
              label="שם"
              value={form.name}
              onChange={e => set({ name: e.target.value })}
              placeholder={isBirthday ? 'למשל: איתן שטיינברג' : 'שם המנוח/ה'}
              list="annual-name-suggestions"
              autoFocus={!editing}
              autoComplete="off"
            />
            <datalist id="annual-name-suggestions">
              {nameSuggestions.map(n => <option key={n} value={n} />)}
            </datalist>
            {duplicate && (
              <p className="text-xs text-amber-700 mt-1">⚠️ כבר קיים {noun} בשם „{duplicate.name}”. בטוח שזה לא אותו אדם?</p>
            )}
          </div>

          {/* Calendar switch */}
          <div>
            <p className="text-sm font-medium text-text-mid mb-1">לפי איזה לוח לחגוג?</p>
            <div role="radiogroup" className="grid grid-cols-2 gap-1 p-1 bg-surface-alt rounded-btn">
              {([['gregorian', '📆 לועזי'], ['hebrew', '🕎 עברי']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={form.calendarType === value}
                  onClick={() => set({ calendarType: value })}
                  className={cn(
                    'py-2 text-sm rounded-btn transition-colors',
                    form.calendarType === value ? 'bg-surface shadow text-primary font-semibold' : 'text-text-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.calendarType === 'gregorian' ? (
            <div className="grid grid-cols-3 gap-2">
              <Select
                label="יום"
                placeholder="יום"
                options={Array.from({ length: gDayCount }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                value={form.gDay ? String(form.gDay) : ''}
                onChange={e => set({ gDay: Number(e.target.value) || 0 })}
              />
              <Select
                label="חודש"
                placeholder="חודש"
                options={G_MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                value={form.gMonth ? String(form.gMonth) : ''}
                onChange={e => set({ gMonth: Number(e.target.value) || 0 })}
              />
              <Input
                label="שנה (רשות)"
                type="number"
                inputMode="numeric"
                min={1850}
                max={thisYear}
                placeholder="לא ידוע"
                value={form.gYear || ''}
                onChange={e => set({ gYear: Number(e.target.value) || 0 })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Select
                label="יום"
                options={hebrewDayOptions(form.hMonth, hYearRef).map(o => ({ value: String(o.value), label: o.label }))}
                value={String(form.hDay)}
                onChange={e => set({ hDay: Number(e.target.value) })}
              />
              <Select
                label="חודש"
                options={hebrewMonthsOfYear(hYearRef).map(o => ({ value: String(o.value), label: o.label }))}
                value={String(form.hMonth)}
                onChange={e => set({ hMonth: Number(e.target.value) })}
              />
              <Select
                label="שנה (רשות)"
                placeholder="לא ידוע"
                options={hebrewYearOptions(currentHebrewYear() - 120, currentHebrewYear()).map(o => ({ value: String(o.value), label: o.label }))}
                value={form.hYear ? String(form.hYear) : ''}
                onChange={e => set({ hYear: Number(e.target.value) || 0 })}
              />
            </div>
          )}

          {preview && (
            <div className="rounded-md bg-accent/5 border border-accent/20 p-3 text-sm" aria-live="polite">
              <p className="font-medium text-primary">
                {isBirthday ? '🎂' : '🕯'} הפעם הבאה: {formatGregorianDate(preview.next, 'full')}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {formatHebrewDate(preview.next)} · {countdownLabel(preview.days, kind)}
                {preview.years ? (isBirthday ? ` · גיל ${preview.years}` : ` · ${preview.years} שנה`) : ''}
              </p>
            </div>
          )}

          <Input
            label="הערה (רשות)"
            value={form.notes}
            onChange={e => set({ notes: e.target.value })}
            placeholder={isBirthday ? 'למשל: הבן של יונתן ורות' : 'אופציונלי'}
          />

          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <button type="submit" hidden />
        </form>
      </Modal>

    </>
  );
}
