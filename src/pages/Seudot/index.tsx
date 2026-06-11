import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  collection,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useEvents } from '@/hooks/useEvents';
import { useSeudot, useSeudahRegistrations } from '@/hooks/useSeudot';
import { useFamilies } from '@/hooks/useFamilies';
import { useToast } from '@/components/ui/Toast';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { formatDateByMode } from '@/lib/dates';
import {
  SHABBAT_SEUDOT,
  HOLIDAY_SEUDOT,
  ALL_SEUDOT,
  SEUDAH_ICONS,
  BRINGING_OPTIONS,
  HOUSEHOLD_RESIDENTS,
  PERMANENT_GUESTS,
  AUTO_ATTENDEES_COUNT,
} from '@/types';
import type { SeudahType, Seudah, SeudahRegistration } from '@/types';
import type { User } from 'firebase/auth';

interface SeudotProps {
  user: User | null;
  isAdmin: boolean;
}

// Load bar per seudah: 0–10 green, 10–20 orange, 20+ bright red
const LOAD_FULL_SCALE = 30;
function loadColor(diners: number): string {
  if (diners > 20) return '#FF2D2D';
  if (diners > 10) return '#F59E0B';
  return '#22C55E';
}

function LoadBar({ diners }: { diners: number }) {
  const pct = Math.min(100, Math.round((diners / LOAD_FULL_SCALE) * 100));
  return (
    <div className="h-2 w-full bg-surface-alt rounded-full overflow-hidden border border-border/50">
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ background: loadColor(diners) }}
      />
    </div>
  );
}

export function Seudot({ user, isAdmin }: SeudotProps) {
  const { showToast } = useToast();
  const { data: events } = useEvents();
  const { data: seudot, loading } = useSeudot();
  const { data: registrations } = useSeudahRegistrations();
  const { data: families } = useFamilies();
  const [calMode] = useCalendarMode();

  // Seudot belong to a Shabbat or holiday
  const upcomingEvents = events.filter(
    e => e.date?.toDate?.() >= new Date() && (e.type === 'shabbat' || e.type === 'holiday')
  );
  const [selectedEventId, setSelectedEventId] = useState('');
  const eventId = selectedEventId || upcomingEvents[0]?.id || '';
  const event = events.find(e => e.id === eventId);
  const seudahOptions: SeudahType[] = event?.type === 'holiday' ? HOLIDAY_SEUDOT : SHABBAT_SEUDOT;

  // Seudot + registrations of the selected event, in canonical order
  const eventSeudot = useMemo(
    () =>
      seudot
        .filter(s => s.eventId === eventId)
        .sort((a, b) => ALL_SEUDOT.indexOf(a.type) - ALL_SEUDOT.indexOf(b.type)),
    [seudot, eventId]
  );
  const eventRegs = useMemo(
    () => registrations.filter(r => r.eventId === eventId),
    [registrations, eventId]
  );
  const regsBySeudah = useMemo(() => {
    const map: Record<string, SeudahRegistration[]> = {};
    eventRegs.forEach(r => { (map[r.seudahId] ??= []).push(r); });
    return map;
  }, [eventRegs]);
  // Every seudah automatically includes the household residents + permanent guest
  const dinersOf = (seudahId: string) =>
    AUTO_ATTENDEES_COUNT +
    (regsBySeudah[seudahId] || []).reduce((sum, r) => sum + (r.diners || 0), 0);

  // ── Add seudah modal ──────────────────────────────────────────────────
  const [addModal, setAddModal] = useState(false);
  const [newTypes, setNewTypes] = useState<SeudahType[]>([]);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const existingTypes = eventSeudot.map(s => s.type);

  async function handleAddSeudot() {
    if (!eventId || !newTypes.length) { showToast('נא לבחור סעודה אחת לפחות', 'error'); return; }
    setAddSubmitting(true);
    try {
      const batch = writeBatch(db);
      newTypes.forEach(type => {
        batch.set(doc(collection(db, 'seudot')), {
          eventId,
          eventTitle: event?.title || '',
          type,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || '',
        });
      });
      await batch.commit();
      showToast(newTypes.length > 1 ? 'הסעודות נוספו ✓' : 'הסעודה נוספה ✓');
      setAddModal(false);
      setNewTypes([]);
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleDeleteSeudah(s: Seudah) {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'seudot', s.id));
      (regsBySeudah[s.id] || []).forEach(r => batch.delete(doc(db, 'seudahRegistrations', r.id)));
      await batch.commit();
      showToast('הסעודה הוסרה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  // ── Registration modal ("אני מגיע/ה לסעודה") ──────────────────────────
  const [regModal, setRegModal] = useState(false);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regForm, setRegForm] = useState({
    familyId: '',
    seudahIds: [] as string[],
    bringingCategory: '',
    bringingNote: '',
  });

  const regFamily = families.find(f => f.id === regForm.familyId);
  const regAdults = regFamily?.adults || 0;
  const regKids = regFamily?.kids || 0;
  const regDiners = regAdults + regKids;
  const familyName = (f: { husband: string; wife: string; id: string }) =>
    [f.husband, f.wife].filter(Boolean).join(' ו') || f.id;

  // Seudot this family is already registered to (one registration per family per seudah)
  const alreadyRegistered = (seudahId: string) =>
    !!regForm.familyId &&
    (regsBySeudah[seudahId] || []).some(r => r.familyId === regForm.familyId);

  function openRegModal(preselectSeudahId?: string) {
    setRegForm({
      familyId: '',
      seudahIds: preselectSeudahId ? [preselectSeudahId] : [],
      bringingCategory: '',
      bringingNote: '',
    });
    setRegModal(true);
  }

  async function handleRegister() {
    if (!regForm.familyId || !regFamily) { showToast('נא לבחור משפחה', 'error'); return; }
    const targetIds = regForm.seudahIds.filter(id => !alreadyRegistered(id));
    if (!targetIds.length) { showToast('נא לבחור סעודה אחת לפחות', 'error'); return; }
    if (regDiners === 0) { showToast('למשפחה זו אין סועדים מוגדרים — עדכנו את פרטי המשפחה', 'error'); return; }
    const bringing =
      regForm.bringingCategory === 'אחר'
        ? regForm.bringingNote.trim()
        : [regForm.bringingCategory, regForm.bringingNote.trim()].filter(Boolean).join(' – ');
    setRegSubmitting(true);
    try {
      const batch = writeBatch(db);
      targetIds.forEach(seudahId => {
        batch.set(doc(collection(db, 'seudahRegistrations')), {
          seudahId,
          eventId,
          familyId: regFamily.id,
          familyName: familyName(regFamily),
          adults: regAdults,
          kids: regKids,
          diners: regDiners,
          bringing,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || '',
        });
      });
      await batch.commit();
      showToast('נרשמתם לסעודה ✓ מחכים לכם!');
      setRegModal(false);
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setRegSubmitting(false);
    }
  }

  async function handleDeleteRegistration(id: string) {
    try {
      await deleteDoc(doc(db, 'seudahRegistrations', id));
      showToast('הרישום הוסר');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  const familyOptions = families.map(f => ({ value: f.id, label: familyName(f) }));
  const eventOptions = upcomingEvents.map(e => ({
    value: e.id,
    label: `${e.title} — ${formatDateByMode(e.date?.toDate?.() ?? null, calMode, 'short')}`,
  }));

  // Event total includes the automatic attendees of every seudah
  const totalDiners =
    eventRegs.reduce((s, r) => s + (r.diners || 0), 0) +
    eventSeudot.length * AUTO_ATTENDEES_COUNT;
  const totalFamilies = new Set(eventRegs.map(r => r.familyId)).size;
  const residentNames = HOUSEHOLD_RESIDENTS.map(p => p.name).join(', ');
  const permanentGuestNames = PERMANENT_GUESTS.map(p => p.name).join(', ');

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">🍽 סעודות</h1>
          <p className="text-text-muted text-sm mt-0.5">אירוח סעודות שבת וחג</p>
        </div>
        <Button onClick={() => { setNewTypes([]); setAddModal(true); }} disabled={!eventId}>
          <Plus size={16} /> הוסף סעודה
        </Button>
      </div>

      {/* Event + stats */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <Select
              label="בחר שבת או חג"
              options={eventOptions}
              value={eventId}
              onChange={e => setSelectedEventId(e.target.value)}
              placeholder="-- בחר שבת או חג --"
            />
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-primary">{eventSeudot.length}</p>
              <p className="text-xs text-text-muted">סעודות</p>
            </div>
            <div>
              <p className="text-xl font-bold text-accent">{totalFamilies}</p>
              <p className="text-xs text-text-muted">משפחות</p>
            </div>
            <div>
              <p className="text-xl font-bold text-accent">{totalDiners}</p>
              <p className="text-xs text-text-muted">סועדים סה״כ</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Seudot of the selected event */}
      {!eventId ? (
        <EmptyState icon="🍽" title="בחר שבת או חג כדי לצפות בסעודות" />
      ) : !loading && eventSeudot.length === 0 ? (
        <EmptyState
          icon="🍽"
          title="אין סעודות עדיין"
          description="הוסף סעודה לשבת או חג"
          action={{ label: 'הוסף סעודה', onClick: () => { setNewTypes([]); setAddModal(true); } }}
        />
      ) : (
        <div className="space-y-5">
          {eventSeudot.map(s => {
            const regs = regsBySeudah[s.id] || [];
            const diners = dinersOf(s.id);
            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card padding="none">
                  <div className="px-5 py-3 bg-primary/5 border-b border-border rounded-t-card">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-bold text-primary text-base">
                        {SEUDAH_ICONS[s.type]} {s.type}
                      </h2>
                      <div className="flex items-center gap-2">
                        <Badge variant={diners > 20 ? 'error' : diners > 10 ? 'warning' : 'success'}>
                          <Users size={12} /> {diners} סועדים
                        </Badge>
                        {(isAdmin || s.createdBy === user?.uid) && (
                          <button
                            onClick={() => handleDeleteSeudah(s)}
                            className="p-1.5 text-text-muted hover:text-error transition-colors rounded"
                            aria-label="מחק סעודה"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <LoadBar diners={diners} />
                      <p className="text-xs text-text-muted mt-1">
                        {regs.length === 0
                          ? `בני הבית ואורחת קבועה בלבד · ${AUTO_ATTENDEES_COUNT} סועדים`
                          : `${regs.length} משפחות + בני הבית · ${diners} סועדים`}
                      </p>
                    </div>
                  </div>

                  <div className="p-4">
                    {/* Automatic attendees — always present, not removable */}
                    <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-md border border-primary/20 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-text-base">
                          🏠 בני הבית
                          <span className="text-text-muted font-normal"> · {HOUSEHOLD_RESIDENTS.length} סועדים</span>
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {residentNames} · נספרים אוטומטית בכל סעודה
                        </p>
                      </div>
                      <Badge variant="accent">קבוע</Badge>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-md border border-primary/20 mb-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-text-base">
                          👤 {permanentGuestNames}
                          <span className="text-text-muted font-normal"> · {PERMANENT_GUESTS.length} סועדים</span>
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          אורחת קבועה · ללא לינה
                        </p>
                      </div>
                      <Badge variant="accent">קבוע</Badge>
                    </div>
                    {regs.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {regs.map(r => (
                          <div
                            key={r.id}
                            className="flex items-center gap-3 p-3 bg-surface-alt rounded-md border border-border"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-text-base">
                                משפחת {r.familyName}
                                <span className="text-text-muted font-normal"> · {r.diners} סועדים</span>
                              </p>
                              {r.bringing && (
                                <p className="text-xs text-text-muted mt-0.5">🧺 מביאים: {r.bringing}</p>
                              )}
                            </div>
                            {(isAdmin || r.createdBy === user?.uid) && (
                              <button
                                onClick={() => handleDeleteRegistration(r.id)}
                                className="p-1.5 text-text-muted hover:text-error transition-colors rounded"
                                aria-label="הסר רישום"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openRegModal(s.id)}>
                      🙋 אני מגיע/ה לסעודה
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add seudah modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="הוסף סעודה"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAddModal(false)}>ביטול</Button>
            <Button onClick={handleAddSeudot} loading={addSubmitting}>הוסף</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-text-mid">
            {event?.title} · {event?.type === 'holiday' ? 'חג' : 'שבת'}
          </p>
          <div>
            <label className="text-sm font-medium text-text-mid mb-2 block">אילו סעודות יתקיימו?</label>
            <div className="flex flex-wrap gap-2">
              {seudahOptions.map(t => {
                const exists = existingTypes.includes(t);
                const selected = newTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={exists}
                    onClick={() =>
                      setNewTypes(prev => selected ? prev.filter(x => x !== t) : [...prev, t])
                    }
                    className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                      exists
                        ? 'bg-surface-alt border-border text-text-muted cursor-not-allowed opacity-60'
                        : selected
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface border-border text-text-mid hover:border-accent/50'
                    }`}
                  >
                    {SEUDAH_ICONS[t]} {t}{exists && ' ✓'}
                  </button>
                );
              })}
            </div>
            {existingTypes.length > 0 && (
              <p className="text-xs text-text-muted mt-2">סעודות עם ✓ כבר קיימות לאירוע זה</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Registration modal */}
      <Modal
        open={regModal}
        onClose={() => setRegModal(false)}
        title="אני מגיע/ה לסעודה"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setRegModal(false)}>ביטול</Button>
            <Button onClick={handleRegister} loading={regSubmitting}>אני מגיע/ה לסעודה 🙋</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="משפחה"
            options={familyOptions}
            value={regForm.familyId}
            placeholder="-- בחר משפחה --"
            onChange={e => setRegForm(f => ({ ...f, familyId: e.target.value }))}
          />
          {regFamily && (
            <div className="p-3 bg-surface-alt rounded-md border border-border text-sm text-text-mid">
              👨‍👩‍👧‍👦 נספרים אוטומטית: <strong>{regDiners} סועדים</strong>
              <span className="text-text-muted"> ({regAdults} מבוגרים, {regKids} ילדים)</span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-text-mid mb-2 block">לאילו סעודות תגיעו?</label>
            <div className="flex flex-col gap-2">
              {eventSeudot.map(s => {
                const taken = alreadyRegistered(s.id);
                const selected = regForm.seudahIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={taken}
                    onClick={() =>
                      setRegForm(f => ({
                        ...f,
                        seudahIds: selected
                          ? f.seudahIds.filter(x => x !== s.id)
                          : [...f.seudahIds, s.id],
                      }))
                    }
                    className={`px-3 py-2 rounded-btn text-sm border text-right transition-colors ${
                      taken
                        ? 'bg-surface-alt border-border text-text-muted cursor-not-allowed opacity-60'
                        : selected
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface border-border text-text-mid hover:border-accent/50'
                    }`}
                  >
                    {SEUDAH_ICONS[s.type]} {s.type}{taken && ' · כבר רשומים ✓'}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-text-mid mb-2 block">מה תביאו? (לא חובה)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {BRINGING_OPTIONS.map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    setRegForm(f => ({ ...f, bringingCategory: f.bringingCategory === opt ? '' : opt }))
                  }
                  className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                    regForm.bringingCategory === opt
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface border-border text-text-mid hover:border-accent/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <Input
              value={regForm.bringingNote}
              onChange={e => setRegForm(f => ({ ...f, bringingNote: e.target.value }))}
              placeholder={regForm.bringingCategory === 'אחר' ? 'מה תביאו?' : 'פירוט (למשל: עוגת שוקולד)'}
            />
          </div>
          <p className="text-xs text-text-muted">
            💡 רישום לסעודה אינו כולל לינה — להזמנת חדר לשינה השתמשו בעמוד החדרים.
          </p>
        </div>
      </Modal>
    </div>
  );
}
