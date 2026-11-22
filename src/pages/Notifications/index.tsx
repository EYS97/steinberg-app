import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Bell, Search, ChevronLeft } from 'lucide-react';
import {
  collection, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnnualItemSheet } from '@/components/dates/AnnualItemSheet';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useFamilies } from '@/hooks/useFamilies';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { type AnniversaryKind, formatAnnualItemDate, formatGregorianDate } from '@/lib/dates';
import {
  type AnnualFormState,
  type AnnualItemDoc,
  annualFieldsFromForm,
  countdownLabel,
  emptyAnnualForm,
  formForDate,
  formFromItem,
  groupByUpcomingMonth,
  matchesSearch,
  parseIsoDay,
} from '@/lib/annualItems';
import type { User } from 'firebase/auth';

interface NotificationsProps { user: User | null; isAdmin: boolean; }

export type DatesTab = 'birthdays' | 'memorials' | 'announcements';

const TABS: { id: DatesTab; label: string; icon: string }[] = [
  { id: 'birthdays',     label: 'ימי הולדת',  icon: '🎂' },
  { id: 'memorials',     label: 'ימי זיכרון', icon: '🕯' },
  { id: 'announcements', label: 'הודעות',     icon: '📢' },
];

const KIND_OF: Record<'birthdays' | 'memorials', AnniversaryKind> = { birthdays: 'birthday', memorials: 'yahrzeit' };
const COLLECTION_OF: Record<'birthdays' | 'memorials', string> = { birthdays: 'birthdays', memorials: 'memorials' };

function isTab(v: string | null): v is DatesTab {
  return v === 'birthdays' || v === 'memorials' || v === 'announcements';
}

interface SheetState {
  tab: 'birthdays' | 'memorials';
  editing: AnnualItemDoc | null;
  initialForm: AnnualFormState;
}

export function Notifications({ user, isAdmin }: NotificationsProps) {
  const { showToast } = useToast();
  const { data: birthdays, loading: bLoading } = useBirthdays();
  const { data: memorials, loading: mLoading } = useMemorials();
  const { data: announcements } = useAnnouncements();
  const { data: families } = useFamilies();
  const [params, setParams] = useSearchParams();

  const tab: DatesTab = isTab(params.get('tab')) ? (params.get('tab') as DatesTab) : 'birthdays';
  const setTab = (t: DatesTab) => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });

  const [query, setQuery] = useState('');
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [addAnn, setAddAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ text: '', expiresDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const itemsOf = (t: 'birthdays' | 'memorials') => (t === 'birthdays' ? birthdays : memorials) as AnnualItemDoc[];

  function openAdd(t: 'birthdays' | 'memorials', date?: Date | null) {
    const cal = t === 'memorials' ? 'hebrew' : 'gregorian';
    setSheet({ tab: t, editing: null, initialForm: date ? formForDate(date, cal) : emptyAnnualForm(cal) });
  }
  function openEdit(t: 'birthdays' | 'memorials', item: AnnualItemDoc) {
    setSheet({ tab: t, editing: item, initialForm: formFromItem(item) });
  }

  // Deep links: ?tab=birthdays&add=1&date=YYYY-MM-DD  |  ?tab=birthdays&edit=<id>
  const addParam = params.get('add');
  const editParam = params.get('edit');
  const dataReady = !bLoading && !mLoading;
  useEffect(() => {
    if (tab === 'announcements' || (!addParam && !editParam)) return;
    if (editParam && !dataReady) return; // wait for the item to load
    if (addParam) openAdd(tab, parseIsoDay(params.get('date')));
    else if (editParam) {
      const item = itemsOf(tab).find(i => i.id === editParam);
      if (item) openEdit(tab, item);
      else showToast('הפריט לא נמצא', 'error');
    }
    setParams(p => { const n = new URLSearchParams(p); n.delete('add'); n.delete('edit'); n.delete('date'); return n; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addParam, editParam, tab, dataReady]);

  const nameSuggestions = useMemo(() => {
    const s = new Set<string>();
    families.forEach(f => { if (f.husband) s.add(f.husband.trim()); if (f.wife) s.add(f.wife.trim()); });
    birthdays.forEach(b => b.name && s.add(b.name.trim()));
    return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'));
  }, [families, birthdays]);

  async function saveItem(form: AnnualFormState) {
    if (!sheet) return;
    const col = COLLECTION_OF[sheet.tab];
    const fields = annualFieldsFromForm(form);
    const audit = { updatedAt: serverTimestamp(), updatedBy: user?.uid ?? '' };
    if (sheet.editing) {
      await updateDoc(doc(db, col, sheet.editing.id), { ...fields, ...audit });
      showToast('נשמר ✓');
    } else {
      await addDoc(collection(db, col), { ...fields, ...audit, createdAt: serverTimestamp(), createdBy: user?.uid ?? '' });
      showToast(sheet.tab === 'birthdays' ? 'יום ההולדת נוסף ✓' : 'יום הזיכרון נוסף ✓');
    }
    setSheet(null);
  }

  async function deleteItem(id: string) {
    if (!sheet) return;
    await deleteDoc(doc(db, COLLECTION_OF[sheet.tab], id));
    showToast('נמחק');
    setSheet(null);
  }

  // ── Announcements (unchanged behaviour: admins publish/delete) ──────────
  const now = new Date();
  const activeAnns = announcements.filter(a => !a.expiresAt || a.expiresAt.toDate() > now);

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

  async function deleteAnnouncement(id: string) {
    await deleteDoc(doc(db, 'announcements', id));
    showToast('נמחקה');
  }

  const counts: Record<DatesTab, number> = {
    birthdays: birthdays.length, memorials: memorials.length, announcements: activeAnns.length,
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-28 sm:pb-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-primary">🎂 תאריכים משפחתיים</h1>
        <p className="text-text-muted text-sm mt-0.5">ימי הולדת, ימי זיכרון והודעות למשפחה</p>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="סוג תאריך" className="flex gap-1 p-1 mb-4 bg-surface-alt rounded-btn overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => { setTab(t.id); setQuery(''); }}
            className={cn(
              'flex-1 min-w-max flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-btn transition-colors',
              tab === t.id ? 'bg-surface shadow text-primary font-semibold' : 'text-text-muted hover:text-text-mid'
            )}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            <span className="text-[11px] text-text-muted">({counts[t.id]})</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'announcements' ? (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-primary flex items-center gap-2"><Bell size={18} className="text-accent" /> הודעות משפחתיות</h2>
              {isAdmin && <Button size="sm" onClick={() => setAddAnn(true)}><Plus size={14} /> הודעה חדשה</Button>}
            </div>
            {activeAnns.length === 0 ? (
              <EmptyState icon="📢" title="אין הודעות פעילות" />
            ) : (
              <div className="space-y-2">
                {activeAnns.map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <span className="text-lg shrink-0">📢</span>
                    <p className="flex-1 text-sm text-text-mid">{a.text}</p>
                    {isAdmin && (
                      <button onClick={() => deleteAnnouncement(a.id)} className="text-text-muted hover:text-error" aria-label="מחק הודעה">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : (
          <AnnualList
            kind={KIND_OF[tab]}
            items={itemsOf(tab)}
            loading={tab === 'birthdays' ? bLoading : mLoading}
            query={query}
            onQuery={setQuery}
            onAdd={() => openAdd(tab)}
            onOpen={item => openEdit(tab, item)}
          />
        )}
      </div>

      {/* Floating add button on mobile (birthdays / memorials) */}
      {tab !== 'announcements' && (
        <button
          onClick={() => openAdd(tab)}
          className="sm:hidden fixed bottom-24 left-4 z-40 w-14 h-14 rounded-full bg-accent text-white shadow-modal flex items-center justify-center active:scale-95"
          aria-label={tab === 'birthdays' ? 'הוסף יום הולדת' : 'הוסף יום זיכרון'}
        >
          <Plus size={26} />
        </button>
      )}

      {sheet && (
        <AnnualItemSheet
          open
          kind={KIND_OF[sheet.tab]}
          editing={sheet.editing}
          initialForm={sheet.initialForm}
          existing={itemsOf(sheet.tab)}
          nameSuggestions={sheet.tab === 'birthdays' ? nameSuggestions : []}
          onClose={() => setSheet(null)}
          onSave={saveItem}
          onDelete={deleteItem}
        />
      )}

      <Modal open={addAnn} onClose={() => setAddAnn(false)} title="הודעה חדשה"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddAnn(false)}>ביטול</Button><Button onClick={saveAnnouncement} loading={submitting}>פרסם</Button></div>}>
        <div className="space-y-3">
          <TextArea label="הודעה" value={annForm.text} onChange={e => setAnnForm(f => ({ ...f, text: e.target.value }))} placeholder="כתוב הודעה למשפחה..." />
          <Input label="תפוגה (אופציונלי)" type="date" value={annForm.expiresDate} onChange={e => setAnnForm(f => ({ ...f, expiresDate: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}

// ── Full list, grouped by the month of the next occurrence ─────────────────
function AnnualList({ kind, items, loading, query, onQuery, onAdd, onOpen }: {
  kind: AnniversaryKind;
  items: AnnualItemDoc[];
  loading: boolean;
  query: string;
  onQuery: (q: string) => void;
  onAdd: () => void;
  onOpen: (item: AnnualItemDoc) => void;
}) {
  const isBirthday = kind === 'birthday';
  const groups = useMemo(
    () => groupByUpcomingMonth(items.filter(i => matchesSearch(i, query)), kind),
    [items, query, kind]
  );

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="חיפוש לפי שם"
            aria-label="חיפוש לפי שם"
            className="w-full pr-9 pl-3 py-2.5 border border-border rounded-input text-sm bg-surface focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <Button onClick={onAdd} className="hidden sm:inline-flex">
          <Plus size={16} /> {isBirthday ? 'יום הולדת חדש' : 'יום זיכרון חדש'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted text-center py-6">טוען...</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={isBirthday ? '🎂' : '🕯'}
          title={isBirthday ? 'עדיין אין ימי הולדת' : 'עדיין אין ימי זיכרון'}
          description="לחצו על + כדי להוסיף את הראשון"
        />
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6">לא נמצאו תוצאות ל„{query}”</p>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <section key={g.key} aria-label={g.label}>
              <h3 className="text-xs font-semibold text-text-muted mb-1 sticky top-0 bg-surface py-1">{g.label}</h3>
              <ul className="divide-y divide-border">
                {g.items.map(({ item, next, days, years }) => (
                  <li key={item.id}>
                    <button
                      onClick={() => onOpen(item)}
                      className="w-full flex items-center gap-3 py-2.5 px-1 text-right hover:bg-surface-alt rounded-md transition-colors"
                      aria-label={`ערוך ${item.name}`}
                    >
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0', isBirthday ? 'bg-red-50' : 'bg-purple-50')}>
                        {isBirthday ? '🎂' : '🕯'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-text-base truncate">{item.name}</p>
                        <p className="text-xs text-text-muted truncate">
                          {years ? <span className="text-accent-dark font-medium">{isBirthday ? `גיל ${years}` : `${years} שנה`} · </span> : null}
                          {formatAnnualItemDate(item)}
                          {item.calendarType === 'hebrew' && next ? ` · ${formatGregorianDate(next, 'short')}` : ''}
                          {item.calendarType === 'hebrew' ? ' 🕎' : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </p>
                      </div>
                      {Number.isFinite(days) && (
                        <Badge variant={!isBirthday ? 'memorial' : days <= 7 ? 'error' : days <= 14 ? 'warning' : 'default'}>
                          {countdownLabel(days, kind)}
                        </Badge>
                      )}
                      <ChevronLeft size={16} className="text-text-muted shrink-0" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
