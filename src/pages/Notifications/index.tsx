import React, { useState } from 'react';
import { Plus, Trash2, Send, Bell, FileText } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useToast } from '@/components/ui/Toast';
import {
  type CalendarType,
  daysUntilOccurrence,
  formatAnnualItemDate,
  nextOccurrence,
  formatGregorianDate,
  hebrewDayOptions,
  hebrewMonthsOfYear,
  hebrewYearOptions,
  currentHebrewYear,
} from '@/lib/dates';
import type { User } from 'firebase/auth';

interface NotificationsProps { user: User | null; isAdmin: boolean; }

interface AnnualFormState {
  name: string; date: string; notes: string;
  calendarType: CalendarType;
  hDay: number; hMonth: number; hYear: number;
}

/** Calendar-type choice + matching date entry (Gregorian MM-DD or Hebrew selects) */
function AnnualDateFields({ form, setForm }: {
  form: AnnualFormState;
  setForm: React.Dispatch<React.SetStateAction<AnnualFormState>>;
}) {
  const hYearRef = form.hYear || currentHebrewYear();
  return (
    <>
      <Select
        label="סוג תאריך"
        options={[
          { value: 'gregorian', label: '📆 תאריך לועזי' },
          { value: 'hebrew',    label: '🕎 תאריך עברי' },
        ]}
        value={form.calendarType}
        onChange={e => setForm(f => ({ ...f, calendarType: e.target.value as CalendarType }))}
      />
      {form.calendarType === 'gregorian' ? (
        <Input
          label="תאריך (MM-DD)"
          value={form.date}
          onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          placeholder="למשל 03-14"
        />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Select
            label="יום"
            options={hebrewDayOptions(form.hMonth, hYearRef).map(o => ({ value: String(o.value), label: o.label }))}
            value={String(form.hDay)}
            onChange={e => setForm(f => ({ ...f, hDay: Number(e.target.value) }))}
          />
          <Select
            label="חודש"
            options={hebrewMonthsOfYear(hYearRef).map(o => ({ value: String(o.value), label: o.label }))}
            value={String(form.hMonth)}
            onChange={e => setForm(f => ({ ...f, hMonth: Number(e.target.value) }))}
          />
          <Select
            label="שנה (אופציונלי)"
            placeholder="לא ידוע"
            options={hebrewYearOptions(currentHebrewYear() - 120, currentHebrewYear()).map(o => ({ value: String(o.value), label: o.label }))}
            value={form.hYear ? String(form.hYear) : ''}
            onChange={e => setForm(f => ({ ...f, hYear: Number(e.target.value) || 0 }))}
          />
        </div>
      )}
    </>
  );
}

export function Notifications({ user, isAdmin }: NotificationsProps) {
  const { showToast } = useToast();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();
  const { data: announcements } = useAnnouncements();

  const [addBday, setAddBday] = useState(false);
  const [addMem, setAddMem] = useState(false);
  const [addAnn, setAddAnn] = useState(false);
  const emptyAnnualForm = {
    name: '', date: '', notes: '',
    calendarType: 'gregorian' as CalendarType,
    hDay: 1, hMonth: 7, hYear: 0, // hYear 0 = "לא ידוע"
  };
  const [bdayForm, setBdayForm] = useState({ ...emptyAnnualForm });
  const [memForm,  setMemForm]  = useState({ ...emptyAnnualForm, calendarType: 'hebrew' as CalendarType });
  const [annForm,  setAnnForm]  = useState({ text: '', expiresDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const upcomingBdays = birthdays
    .map(b => ({ ...b, days: daysUntilOccurrence(b, 'birthday'), next: nextOccurrence(b, 'birthday') }))
    .filter(b => b.days <= 60)
    .sort((a, b) => a.days - b.days);

  const upcomingMems = memorials
    .map(m => ({ ...m, days: daysUntilOccurrence(m, 'yahrzeit'), next: nextOccurrence(m, 'yahrzeit') }))
    .filter(m => m.days <= 90)
    .sort((a, b) => a.days - b.days);

  const activeAnns = announcements.filter(a => {
    if (!a.expiresAt) return true;
    return a.expiresAt.toDate() > now;
  });

  function annualPayload(form: typeof bdayForm) {
    const payload: Record<string, unknown> = {
      name: form.name,
      date: form.date,
      notes: form.notes,
      calendarType: form.calendarType,
      createdAt: serverTimestamp(),
    };
    if (form.calendarType === 'hebrew') {
      payload.hebrewDate = {
        day: form.hDay,
        month: form.hMonth,
        ...(form.hYear ? { year: form.hYear } : {}),
      };
    }
    return payload;
  }

  function validAnnualForm(form: typeof bdayForm): boolean {
    if (!form.name) return false;
    return form.calendarType === 'hebrew' ? !!(form.hDay && form.hMonth) : !!form.date;
  }

  async function saveBirthday() {
    if (!validAnnualForm(bdayForm)) { showToast('נא למלא שם ותאריך', 'error'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'birthdays'), annualPayload(bdayForm));
      showToast('יום ההולדת נוסף ✓');
      setAddBday(false);
      setBdayForm({ ...emptyAnnualForm });
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setSubmitting(false); }
  }

  async function saveMemorial() {
    if (!validAnnualForm(memForm)) { showToast('נא למלא שם ותאריך', 'error'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'memorials'), annualPayload(memForm));
      showToast('יום הזיכרון נוסף ✓');
      setAddMem(false);
      setMemForm({ ...emptyAnnualForm, calendarType: 'hebrew' });
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setSubmitting(false); }
  }

  async function saveAnnouncement() {
    if (!annForm.text.trim()) { showToast('נא להזין טקסט', 'error'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        text: annForm.text,
        expiresAt: annForm.expiresDate ? Timestamp.fromDate(new Date(annForm.expiresDate)) : null,
        createdBy: user?.uid || '',
        createdAt: serverTimestamp(),
      });
      showToast('ההודעה פורסמה ✓');
      setAddAnn(false);
      setAnnForm({ text: '', expiresDate: '' });
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setSubmitting(false); }
  }

  async function deleteBirthday(id: string) {
    await deleteDoc(doc(db, 'birthdays', id));
    showToast('נמחק');
  }

  async function deleteMemorial(id: string) {
    await deleteDoc(doc(db, 'memorials', id));
    showToast('נמחק');
  }

  async function deleteAnnouncement(id: string) {
    await deleteDoc(doc(db, 'announcements', id));
    showToast('נמחקה');
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">🔔 התראות ותאריכים</h1>
        <p className="text-text-muted text-sm mt-0.5">ימי הולדת, ימי זיכרון והודעות</p>
      </div>

      <div className="space-y-5">
        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle><Bell size={18} className="text-accent" /> הודעות משפחתיות</CardTitle>
            {isAdmin && (
              <Button size="sm" onClick={() => setAddAnn(true)}>
                <Plus size={14} /> הוסף
              </Button>
            )}
          </CardHeader>
          {activeAnns.length === 0 ? (
            <EmptyState icon="📢" title="אין הודעות פעילות" />
          ) : (
            <div className="space-y-2">
              {activeAnns.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <span className="text-lg shrink-0">📢</span>
                  <p className="flex-1 text-sm text-text-mid">{a.text}</p>
                  {isAdmin && (
                    <button onClick={() => deleteAnnouncement(a.id)} className="text-text-muted hover:text-error">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Birthdays */}
        <Card>
          <CardHeader>
            <CardTitle>🎂 ימי הולדת</CardTitle>
            <Button size="sm" onClick={() => setAddBday(true)}>
              <Plus size={14} /> הוסף
            </Button>
          </CardHeader>
          {upcomingBdays.length === 0 ? (
            <EmptyState icon="🎂" title="אין ימי הולדת קרובים ב-60 יום" />
          ) : (
            <div className="space-y-2">
              {upcomingBdays.map(b => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
                >
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg shrink-0">
                    🎂
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text-base">{b.name}</p>
                    <p className="text-xs text-text-muted" dir="rtl">
                      {formatAnnualItemDate(b)}
                      {b.next ? ` · ${formatGregorianDate(b.next, 'short')}` : ''}
                      {b.calendarType === 'hebrew' && ' 🕎'}
                    </p>
                    {b.notes && <p className="text-xs text-text-muted">{b.notes}</p>}
                  </div>
                  <Badge variant={b.days <= 7 ? 'error' : b.days <= 14 ? 'warning' : 'default'}>
                    {b.days === 0 ? '🎉 היום!' : b.days === 1 ? 'מחר' : `בעוד ${b.days} ימים`}
                  </Badge>
                  {isAdmin && (
                    <button onClick={() => deleteBirthday(b.id)} className="text-text-muted hover:text-error">
                      <Trash2 size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        {/* Memorials */}
        <Card>
          <CardHeader>
            <CardTitle>🕯 ימי זיכרון</CardTitle>
            <Button size="sm" onClick={() => setAddMem(true)}>
              <Plus size={14} /> הוסף
            </Button>
          </CardHeader>
          {upcomingMems.length === 0 ? (
            <EmptyState icon="🕯" title="אין ימי זיכרון קרובים ב-90 יום" />
          ) : (
            <div className="space-y-2">
              {upcomingMems.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-lg shrink-0">
                    🕯
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text-base">{m.name}</p>
                    <p className="text-xs text-text-muted" dir="rtl">
                      {formatAnnualItemDate(m)}
                      {m.next ? ` · ${formatGregorianDate(m.next, 'short')}` : ''}
                      {m.calendarType === 'hebrew' && ' 🕎'}
                    </p>
                    {m.notes && <p className="text-xs text-text-muted">{m.notes}</p>}
                  </div>
                  <Badge variant="memorial">
                    {m.days === 0 ? 'היום' : m.days === 1 ? 'מחר' : `בעוד ${m.days} ימים`}
                  </Badge>
                  {isAdmin && (
                    <button onClick={() => deleteMemorial(m.id)} className="text-text-muted hover:text-error">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modals */}
      <Modal open={addBday} onClose={() => setAddBday(false)} title="הוסף יום הולדת"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddBday(false)}>ביטול</Button><Button onClick={saveBirthday} loading={submitting}>הוסף</Button></div>}>
        <div className="space-y-3">
          <Input label="שם" value={bdayForm.name} onChange={e => setBdayForm(f => ({ ...f, name: e.target.value }))} placeholder="שם מלא" />
          <AnnualDateFields form={bdayForm} setForm={setBdayForm} />
          <Input label="הערות" value={bdayForm.notes} onChange={e => setBdayForm(f => ({ ...f, notes: e.target.value }))} placeholder="אופציונלי" />
        </div>
      </Modal>

      <Modal open={addMem} onClose={() => setAddMem(false)} title="הוסף יום זיכרון"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddMem(false)}>ביטול</Button><Button onClick={saveMemorial} loading={submitting}>הוסף</Button></div>}>
        <div className="space-y-3">
          <Input label="שם" value={memForm.name} onChange={e => setMemForm(f => ({ ...f, name: e.target.value }))} placeholder="שם המנוח/ה" />
          <AnnualDateFields form={memForm} setForm={setMemForm} />
          <Input label="הערות" value={memForm.notes} onChange={e => setMemForm(f => ({ ...f, notes: e.target.value }))} placeholder="אופציונלי" />
        </div>
      </Modal>

      <Modal open={addAnn} onClose={() => setAddAnn(false)} title="הוסף הודעה"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddAnn(false)}>ביטול</Button><Button onClick={saveAnnouncement} loading={submitting}>פרסם</Button></div>}>
        <div className="space-y-3">
          <TextArea label="הודעה" value={annForm.text} onChange={e => setAnnForm(f => ({ ...f, text: e.target.value }))} placeholder="כתוב הודעה למשפחה..." />
          <Input label="תפוגה (אופציונלי)" type="date" value={annForm.expiresDate} onChange={e => setAnnForm(f => ({ ...f, expiresDate: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
