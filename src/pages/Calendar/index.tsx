import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEvents } from '@/hooks/useEvents';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useToast } from '@/components/ui/Toast';
import type { EventType } from '@/types';
import type { User } from 'firebase/auth';

interface CalendarProps {
  user: User | null;
  isAdmin: boolean;
}

const EVENT_TYPES: { value: EventType; label: string; color: string; icon: string }[] = [
  { value: 'shabbat',  label: 'שבת',      color: '#C49A3C', icon: '🕯' },
  { value: 'holiday',  label: 'חג',        color: '#7A8C5C', icon: '✨' },
  { value: 'event',    label: 'אירוע',     color: '#4A7C9E', icon: '🎉' },
  { value: 'memorial', label: 'יום זיכרון', color: '#6B5094', icon: '🕯' },
  { value: 'meal',     label: 'ארוחה',     color: '#C4614A', icon: '🍽' },
  { value: 'hosting',  label: 'אירוח',     color: '#0EA5A4', icon: '🏡' },
];

function parseDateToMonthDay(date: unknown): [number, number] | null {
  if (typeof date === 'string' && date.includes('-')) {
    const parts = date.split('-').map(Number);
    if (parts.length >= 3) return [parts[1], parts[2]];
  }
  if (date && typeof (date as { toDate?: () => Date }).toDate === 'function') {
    const dt = (date as { toDate: () => Date }).toDate();
    return [dt.getMonth() + 1, dt.getDate()];
  }
  return null;
}

const HE_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

type ViewMode = 'month' | 'agenda';

export function Calendar({ user, isAdmin }: CalendarProps) {
  const { showToast } = useToast();
  const { data: events, loading } = useEvents();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();

  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<ViewMode>('month');
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({ title: '', date: '', type: 'shabbat' as EventType, notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Build calendar days
  const calDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 1) % 7; // Sun=0 in JS, we want Sun=0
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }, [year, month]);

  // Map events to dates
  const eventsByDate = useMemo(() => {
    const map: Record<string, { icon: string; color: string; title: string }[]> = {};

    events.forEach(ev => {
      const d = ev.date?.toDate?.();
      if (!d) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const type = EVENT_TYPES.find(t => t.value === ev.type);
      (map[key] = map[key] || []).push({ icon: type?.icon || '📌', color: type?.color || '#888', title: ev.title });
    });

    birthdays.forEach(b => {
      const md = parseDateToMonthDay(b.date);
      if (!md) return;
      const key = `${year}-${md[0] - 1}-${md[1]}`;
      (map[key] = map[key] || []).push({ icon: '🎂', color: '#C4614A', title: b.name });
    });

    memorials.forEach(m => {
      const md = parseDateToMonthDay(m.date);
      if (!md) return;
      const key = `${year}-${md[0] - 1}-${md[1]}`;
      (map[key] = map[key] || []).push({ icon: '🕯', color: '#6B5094', title: m.name });
    });

    return map;
  }, [events, birthdays, memorials, year]);

  // Agenda: all events sorted
  const agendaItems = useMemo(() => {
    const all = events
      .filter(e => e.date?.toDate?.() >= today)
      .map(e => ({ ...e, _date: e.date!.toDate() }))
      .sort((a, b) => a._date.getTime() - b._date.getTime())
      .slice(0, 30);
    return all;
  }, [events]);

  async function handleAdd() {
    if (!form.title.trim()) { showToast('נא להזין כותרת', 'error'); return; }
    if (!form.date) { showToast('נא לבחור תאריך', 'error'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'events'), {
        title: form.title,
        date: Timestamp.fromDate(new Date(form.date)),
        type: form.type,
        notes: form.notes,
        createdAt: serverTimestamp(),
      });
      showToast('האירוע נוסף ✓');
      setAddModal(false);
      setForm({ title: '', date: '', type: 'shabbat', notes: '' });
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDoc(doc(db, 'events', id));
      showToast('האירוע נמחק');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  function isToday(d: Date) {
    return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }

  const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">📅 לוח שנה</h1>
          <p className="text-text-muted text-sm mt-0.5">אירועים ותאריכים משפחתיים</p>
        </div>
        <Button onClick={() => setAddModal(true)}>
          <Plus size={16} /> הוסף אירוע
        </Button>
      </div>

      <Card>
        {/* View toggle + nav */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-2">
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'month' ? 'bg-accent text-white' : 'text-text-muted hover:bg-surface-alt'}`}
            >
              חודש
            </button>
            <button
              onClick={() => setView('agenda')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'agenda' ? 'bg-accent text-white' : 'text-text-muted hover:bg-surface-alt'}`}
            >
              רשימה
            </button>
          </div>

          {view === 'month' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewDate(new Date(year, month - 1, 1))}
                className="p-1.5 rounded-md hover:bg-surface-alt transition-colors"
                aria-label="חודש קודם"
              >
                <ChevronRight size={18} />
              </button>
              <span className="font-semibold text-text-base min-w-[120px] text-center">
                {HE_MONTHS[month]} {year}
              </span>
              <button
                onClick={() => setViewDate(new Date(year, month + 1, 1))}
                className="p-1.5 rounded-md hover:bg-surface-alt transition-colors"
                aria-label="חודש הבא"
              >
                <ChevronLeft size={18} />
              </button>
            </div>
          )}
        </div>

        {view === 'month' ? (
          <>
            {/* Day names */}
            <div className="cal-grid mb-1">
              {HE_DAYS.map(d => (
                <div key={d} className="text-center text-xs font-semibold text-text-muted py-1">{d}</div>
              ))}
            </div>
            {/* Days */}
            <div className="cal-grid gap-1">
              {calDays.map((day, i) => {
                if (!day) return <div key={`e-${i}`} />;
                const key = dateKey(day);
                const dayEvents = eventsByDate[key] || [];
                const isTodayDay = isToday(day);
                return (
                  <div
                    key={key}
                    className={`cal-day min-h-[52px] rounded-md p-1 ${
                      isTodayDay ? 'bg-primary text-white' : 'hover:bg-surface-alt'
                    }`}
                  >
                    <span className={`text-xs font-semibold w-full text-center block ${isTodayDay ? 'text-white' : 'text-text-mid'}`}>
                      {day.getDate()}
                    </span>
                    <div className="w-full space-y-0.5 mt-0.5">
                      {dayEvents.slice(0, 2).map((ev, j) => (
                        <div
                          key={j}
                          className="text-[9px] font-semibold truncate px-0.5 rounded leading-tight"
                          style={{ color: isTodayDay ? 'white' : ev.color }}
                        >
                          {ev.icon} {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] text-text-muted">+{dayEvents.length - 2}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border">
              {EVENT_TYPES.map(t => (
                <span key={t.value} className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          /* Agenda view */
          agendaItems.length === 0 ? (
            <EmptyState icon="📅" title="אין אירועים קרובים" />
          ) : (
            <div className="space-y-2">
              {agendaItems.map(ev => {
                const type = EVENT_TYPES.find(t => t.value === ev.type);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-3 p-3 bg-surface-alt rounded-md border border-border"
                  >
                    <div
                      className="w-10 h-10 rounded-md flex items-center justify-center text-lg shrink-0"
                      style={{ background: `${type?.color}20` }}
                    >
                      {type?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-base">{ev.title}</p>
                      <p className="text-xs text-text-muted">{ev._date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                    </div>
                    <Badge variant="default">{type?.label}</Badge>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(ev.id)}
                        className="p-1.5 text-text-muted hover:text-error transition-colors rounded"
                        aria-label="מחק"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </Card>

      {/* Add event modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="הוסף אירוע"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAddModal(false)}>ביטול</Button>
            <Button onClick={handleAdd} loading={submitting}>הוסף</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="כותרת"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="שם האירוע"
          />
          <Input
            label="תאריך"
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
          />
          <Select
            label="סוג אירוע"
            options={EVENT_TYPES.map(t => ({ value: t.value, label: `${t.icon} ${t.label}` }))}
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as EventType }))}
          />
          <TextArea
            label="הערות"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="פרטים נוספים..."
          />
        </div>
      </Modal>
    </div>
  );
}
