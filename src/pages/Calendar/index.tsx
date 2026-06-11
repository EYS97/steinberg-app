import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEvents } from '@/hooks/useEvents';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useAllBookings } from '@/hooks/useBookings';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { useToast } from '@/components/ui/Toast';
import {
  HDate,
  type CalendarMode,
  type CalendarType,
  convertGregorianToHebrew,
  convertHebrewToGregorian,
  getHebrewMonthView,
  adjacentHebrewMonth,
  hebrewSpanLabel,
  hebrewMonthsOfYear,
  hebrewDayOptions,
  hebrewYearOptions,
  currentHebrewYear,
  formatHebrewDate,
  formatHebrewDateShort,
  formatGregorianDate,
  formatDateByMode,
  hebrewMonthName,
  hebrewDayLabel,
  occurrencesInRange,
} from '@/lib/dates';
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
  { value: 'meal',     label: 'סעודה',     color: '#C4614A', icon: '🍽' },
  { value: 'hosting',  label: 'אירוח',     color: '#0EA5A4', icon: '🏡' },
];

const BIRTHDAY_STYLE = { icon: '🎂', color: '#C4614A', label: 'יום הולדת' };
const MEMORIAL_STYLE = { icon: '🕯', color: '#6B5094', label: 'יום זיכרון' };

const HE_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const MODE_OPTIONS: { value: CalendarMode; label: string }[] = [
  { value: 'gregorian', label: 'לועזי' },
  { value: 'hebrew',    label: 'עברי' },
  { value: 'combined',  label: 'משולב' },
];

type ViewMode = 'month' | 'agenda' | 'history';

interface DayCell {
  greg: Date;
  /** Primary label shown in the cell (Gregorian number or gematriya) */
  primary: string;
  /** Secondary label in the other calendar */
  secondary: string;
}

interface DayEntry {
  icon: string;
  color: string;
  title: string;
  typeLabel: string;
  recurrence?: string;
}

export function Calendar({ user, isAdmin }: CalendarProps) {
  const { showToast } = useToast();
  const { data: events, loading } = useEvents();
  const { bookings } = useAllBookings();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();
  const [calMode, setCalMode] = useCalendarMode();

  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState<ViewMode>('month');
  const [addModal, setAddModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [form, setForm] = useState({
    title: '', date: '', type: 'shabbat' as EventType, notes: '',
    calendarType: 'gregorian' as CalendarType,
    hDay: 1, hMonth: 7, hYear: currentHebrewYear(),
    recurring: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const hebrewView = calMode === 'hebrew';

  // ── Build the month grid (Gregorian or Hebrew month) ───────────────────
  const { cells, startDow, headerLabel } = useMemo(() => {
    if (hebrewView) {
      const anchor = new HDate(viewDate);
      const view = getHebrewMonthView(anchor.getFullYear(), anchor.getMonth());
      const cells: DayCell[] = view.days.map(d => ({
        greg: d.greg,
        primary: d.label,
        secondary: `${d.greg.getDate()}.${d.greg.getMonth() + 1}`,
      }));
      return { cells, startDow: view.startDow, headerLabel: view.label };
    }
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const cells: DayCell[] = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const greg = new Date(year, month, d);
      const hd = new HDate(greg);
      cells.push({
        greg,
        primary: String(d),
        secondary: calMode === 'combined'
          ? (hd.getDate() === 1
              ? `${hebrewDayLabel(1)} ${hebrewMonthName(hd.getMonth(), hd.getFullYear())}`
              : hebrewDayLabel(hd.getDate()))
          : '',
      });
    }
    const headerLabel = calMode === 'combined'
      ? `${HE_MONTHS[month]} ${year} · ${hebrewSpanLabel(firstDay, lastDay)}`
      : `${HE_MONTHS[month]} ${year}`;
    return { cells, startDow: firstDay.getDay(), headerLabel };
  }, [viewDate, year, month, calMode, hebrewView]);

  // ── Map events + birthdays + memorials onto the visible range ──────────
  const entriesByDate = useMemo(() => {
    const map: Record<string, DayEntry[]> = {};
    if (cells.length === 0) return map;
    const rangeStart = cells[0].greg;
    const rangeEnd = new Date(cells[cells.length - 1].greg);
    rangeEnd.setHours(23, 59, 59);

    events.forEach(ev => {
      const d = ev.date?.toDate?.();
      if (!d) return;
      const type = EVENT_TYPES.find(t => t.value === ev.type);
      (map[d.toDateString()] = map[d.toDateString()] || []).push({
        icon: type?.icon || '📌',
        color: type?.color || '#888',
        title: ev.title,
        typeLabel: type?.label || '',
        recurrence: ev.recurrenceCalendar
          ? (ev.recurrenceCalendar === 'hebrew' ? 'חוזר כל שנה (לוח עברי)' : 'חוזר כל שנה (לוח לועזי)')
          : undefined,
      });
    });

    birthdays.forEach(b => {
      occurrencesInRange(b, rangeStart, rangeEnd, 'birthday').forEach(g => {
        (map[g.toDateString()] = map[g.toDateString()] || []).push({
          icon: BIRTHDAY_STYLE.icon, color: BIRTHDAY_STYLE.color, title: b.name,
          typeLabel: BIRTHDAY_STYLE.label,
          recurrence: b.calendarType === 'hebrew' ? 'לפי התאריך העברי' : 'לפי התאריך הלועזי',
        });
      });
    });

    memorials.forEach(m => {
      occurrencesInRange(m, rangeStart, rangeEnd, 'yahrzeit').forEach(g => {
        (map[g.toDateString()] = map[g.toDateString()] || []).push({
          icon: MEMORIAL_STYLE.icon, color: MEMORIAL_STYLE.color, title: m.name,
          typeLabel: MEMORIAL_STYLE.label,
          recurrence: m.calendarType === 'hebrew' ? 'לפי התאריך העברי' : 'לפי התאריך הלועזי',
        });
      });
    });

    return map;
  }, [events, birthdays, memorials, cells]);

  // Agenda: all events sorted
  const agendaItems = useMemo(() => {
    return events
      .filter(e => e.date?.toDate?.() >= today)
      .map(e => ({ ...e, _date: e.date!.toDate() }))
      .sort((a, b) => a._date.getTime() - b._date.getTime())
      .slice(0, 30);
  }, [events]);

  // History: past events that had room bookings, newest first
  const historyItems = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return events
      .map(e => ({ ...e, _date: e.date?.toDate?.() }))
      .filter((e): e is typeof e & { _date: Date } => !!e._date && e._date < t)
      .map(e => ({ ...e, _bookings: bookings.filter(b => b.eventId === e.id) }))
      .filter(e => e._bookings.length > 0)
      .sort((a, b) => b._date.getTime() - a._date.getTime());
  }, [events, bookings]);

  function navigateMonth(delta: 1 | -1) {
    if (hebrewView) {
      const anchor = new HDate(viewDate);
      const adj = adjacentHebrewMonth(anchor.getFullYear(), anchor.getMonth(), delta);
      setViewDate(new HDate(1, adj.month, adj.year).greg());
    } else {
      setViewDate(new Date(year, month + delta, 1));
    }
  }

  async function handleAdd() {
    if (!form.title.trim()) { showToast('נא להזין כותרת', 'error'); return; }
    let gregDate: Date;
    if (form.calendarType === 'hebrew') {
      gregDate = convertHebrewToGregorian({ day: form.hDay, month: form.hMonth, year: form.hYear });
    } else {
      if (!form.date) { showToast('נא לבחור תאריך', 'error'); return; }
      gregDate = new Date(`${form.date}T12:00:00`);
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        date: Timestamp.fromDate(gregDate),
        type: form.type,
        notes: form.notes,
        calendarType: form.calendarType,
        createdAt: serverTimestamp(),
      };
      if (form.calendarType === 'hebrew') {
        payload.hebrewDate = { day: form.hDay, month: form.hMonth, year: form.hYear };
      }
      if (form.recurring) payload.recurrenceCalendar = form.calendarType;
      await addDoc(collection(db, 'events'), payload);
      showToast('האירוע נוסף ✓');
      setAddModal(false);
      setForm({
        title: '', date: '', type: 'shabbat', notes: '',
        calendarType: 'gregorian', hDay: 1, hMonth: 7, hYear: currentHebrewYear(), recurring: false,
      });
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
    return d.toDateString() === today.toDateString();
  }

  // Live preview of the date in the "other" calendar inside the add form
  const formDatePreview = useMemo(() => {
    if (form.calendarType === 'hebrew') {
      const g = convertHebrewToGregorian({ day: form.hDay, month: form.hMonth, year: form.hYear });
      return formatGregorianDate(g, 'full');
    }
    if (!form.date) return '';
    return formatHebrewDate(new Date(`${form.date}T12:00:00`));
  }, [form.calendarType, form.date, form.hDay, form.hMonth, form.hYear]);

  const selectedEntries = selectedDay ? entriesByDate[selectedDay.toDateString()] || [] : [];

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
        {/* View toggle + calendar-mode toggle + nav */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex gap-2">
            {([['month', 'חודש'], ['agenda', 'רשימה'], ['history', '📜 היסטוריה']] as [ViewMode, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === v ? 'bg-accent text-white' : 'text-text-muted hover:bg-surface-alt'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Gregorian / Hebrew / combined mode */}
          <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="סוג לוח">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCalMode(opt.value)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  calMode === opt.value ? 'bg-primary text-white' : 'bg-surface text-text-muted hover:bg-surface-alt'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'month' && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => navigateMonth(-1)}
              className="p-1.5 rounded-md hover:bg-surface-alt transition-colors"
              aria-label="חודש קודם"
            >
              <ChevronRight size={18} />
            </button>
            <span className="font-semibold text-text-base min-w-[150px] text-center" dir="rtl">
              {headerLabel}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              className="p-1.5 rounded-md hover:bg-surface-alt transition-colors"
              aria-label="חודש הבא"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        )}

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
              {Array.from({ length: startDow }).map((_, i) => <div key={`e-${i}`} />)}
              {cells.map(cell => {
                const dayEvents = entriesByDate[cell.greg.toDateString()] || [];
                const isTodayDay = isToday(cell.greg);
                return (
                  <div
                    key={cell.greg.toDateString()}
                    onClick={() => setSelectedDay(cell.greg)}
                    className={`cal-day min-h-[56px] rounded-md p-1 ${
                      isTodayDay ? 'bg-primary text-white' : 'hover:bg-surface-alt'
                    }`}
                  >
                    <span dir="rtl" className={`text-xs font-semibold w-full text-center block ${isTodayDay ? 'text-white' : 'text-text-mid'}`}>
                      {cell.primary}
                    </span>
                    {cell.secondary && (
                      <span dir="rtl" className={`text-[8px] leading-tight w-full text-center block ${isTodayDay ? 'text-white/80' : 'text-text-muted'}`}>
                        {cell.secondary}
                      </span>
                    )}
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
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: BIRTHDAY_STYLE.color }} />
                יום הולדת
              </span>
            </div>
          </>
        ) : view === 'history' ? (
          /* History view — past events with their room bookings */
          historyItems.length === 0 ? (
            <EmptyState icon="📜" title="אין פעילות מוקלטת עדיין" />
          ) : (
            <div className="space-y-2">
              {historyItems.map(ev => {
                const totalPax = ev._bookings.reduce((s, b) => s + (b.adults || 0) + (b.kids || 0), 0);
                const type = EVENT_TYPES.find(t => t.value === ev.type);
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-3 p-3 bg-surface-alt rounded-md border border-border"
                    title={`${formatGregorianDate(ev._date, 'full')} · ${formatHebrewDate(ev._date)}`}
                  >
                    <div
                      className="w-11 h-11 rounded-md flex flex-col items-center justify-center shrink-0 text-white"
                      style={{ background: type?.color || '#C49A3C' }}
                    >
                      {calMode === 'hebrew' ? (
                        <>
                          <span className="text-sm font-extrabold leading-none">{hebrewDayLabel(new HDate(ev._date).getDate())}</span>
                          <span className="text-[9px] font-semibold">
                            {hebrewMonthName(new HDate(ev._date).getMonth(), new HDate(ev._date).getFullYear())}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-base font-extrabold leading-none">{ev._date.getDate()}</span>
                          <span className="text-[9px] font-semibold">
                            {formatGregorianDate(ev._date, 'short').replace(/^\d+\s*ב?/, '')}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-text-base truncate">
                        {type?.icon} {ev.title}
                      </p>
                      {calMode === 'combined' && (
                        <p className="text-[10px] text-text-muted">{formatHebrewDateShort(ev._date)}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ev._bookings.map(b => {
                          const pax = (b.adults || 0) + (b.kids || 0);
                          return (
                            <span
                              key={b.id}
                              className="text-[11px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5"
                            >
                              {b.familyName}{pax ? ` (${pax})` : ''}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <div className="text-lg font-extrabold text-accent">{totalPax}</div>
                      <div className="text-[9px] text-text-muted">אורחים</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
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
                      <p className="text-xs text-text-muted" dir="rtl">{formatDateByMode(ev._date, calMode, 'full')}</p>
                      {ev.recurrenceCalendar && (
                        <p className="text-[10px] text-accent">
                          {ev.recurrenceCalendar === 'hebrew' ? '🔁 חוזר כל שנה לפי הלוח העברי' : '🔁 חוזר כל שנה לפי הלוח הלועזי'}
                        </p>
                      )}
                    </div>
                    <Badge variant="default">{type?.label}</Badge>
                    {isAdmin && !ev.auto && (
                      <button
                        onClick={() => handleDelete(ev.sourceId ?? ev.id)}
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

      {/* Day detail modal */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? formatGregorianDate(selectedDay, 'full') : ''}
      >
        {selectedDay && (
          <div className="space-y-4" dir="rtl">
            <div className="bg-surface-alt rounded-md p-3 space-y-1">
              <p className="text-sm font-semibold text-primary">{formatHebrewDate(selectedDay)}</p>
              <p className="text-xs text-text-muted">{formatGregorianDate(selectedDay, 'full')}</p>
            </div>
            {selectedEntries.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-2">אין אירועים ביום זה</p>
            ) : (
              <div className="space-y-2">
                {selectedEntries.map((en, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-surface-alt rounded-md">
                    <span className="text-lg" style={{ color: en.color }}>{en.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-base">{en.title}</p>
                      <p className="text-xs text-text-muted">{en.typeLabel}</p>
                      {en.recurrence && <p className="text-[10px] text-accent">🔁 {en.recurrence}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

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
              label="תאריך"
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Select
                label="יום"
                options={hebrewDayOptions(form.hMonth, form.hYear).map(o => ({ value: String(o.value), label: o.label }))}
                value={String(form.hDay)}
                onChange={e => setForm(f => ({ ...f, hDay: Number(e.target.value) }))}
              />
              <Select
                label="חודש"
                options={hebrewMonthsOfYear(form.hYear).map(o => ({ value: String(o.value), label: o.label }))}
                value={String(form.hMonth)}
                onChange={e => setForm(f => ({ ...f, hMonth: Number(e.target.value) }))}
              />
              <Select
                label="שנה"
                options={hebrewYearOptions(currentHebrewYear() - 1, currentHebrewYear() + 3).map(o => ({ value: String(o.value), label: o.label }))}
                value={String(form.hYear)}
                onChange={e => setForm(f => ({ ...f, hYear: Number(e.target.value) }))}
              />
            </div>
          )}

          {formDatePreview && (
            <p className="text-xs text-text-muted bg-surface-alt rounded-md px-3 py-2" dir="rtl">
              {form.calendarType === 'hebrew' ? '📆 ' : '🕎 '}{formDatePreview}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-text-mid cursor-pointer">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={e => setForm(f => ({ ...f, recurring: e.target.checked }))}
              className="accent-primary"
            />
            חוזר כל שנה ({form.calendarType === 'hebrew' ? 'לפי הלוח העברי' : 'לפי הלוח הלועזי'})
          </label>

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
