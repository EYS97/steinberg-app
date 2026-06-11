import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, MessageCircle, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useEvents } from '@/hooks/useEvents';
import { useSeudot, useSeudahRegistrations } from '@/hooks/useSeudot';
import { useAllBookings } from '@/hooks/useBookings';
import { useHosting, approveRequestAsHost, rejectRequest } from '@/hooks/useHosting';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useFamilies } from '@/hooks/useFamilies';
import {
  ROOMS,
  ALL_SEUDOT,
  SEUDAH_ICONS,
  AUTO_ATTENDEES,
  AUTO_ATTENDEES_COUNT,
  permanentOccupants,
} from '@/types';
import type { AppEvent, SeudahRegistration, HostingRequest } from '@/types';
import {
  formatHebrewDate,
  formatHebrewDateShort,
  formatGregorianDate,
  startOfToday,
  daysBetween,
  daysUntilOccurrence,
  nextOccurrence,
} from '@/lib/dates';
import type { User } from 'firebase/auth';

interface HomeProps {
  user: User | null;
  isAdmin: boolean;
}

// ── Load levels (per seudah): 0–10 green, 11–20 orange, 21+ bright red ────
const LOAD_BAR_SCALE = 20;

function loadInfo(diners: number) {
  if (diners >= 21) return { color: '#FF2D2D', label: 'עומס גבוה',   variant: 'error'   as const };
  if (diners >= 11) return { color: '#F59E0B', label: 'עומס בינוני', variant: 'warning' as const };
  return               { color: '#22C55E', label: 'עומס נמוך',   variant: 'success' as const };
}

function LoadBar({ diners }: { diners: number }) {
  const pct = Math.min(100, Math.round((diners / LOAD_BAR_SCALE) * 100));
  return (
    <div className="h-2 w-full bg-surface-alt rounded-full overflow-hidden border border-border/50">
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ background: loadInfo(diners).color }}
      />
    </div>
  );
}

function daysLabel(days: number): string {
  if (days <= 0) return 'היום';
  if (days === 1) return 'מחר';
  return `בעוד ${days} ימים`;
}

// Section heading shared by all dashboard sections
function SectionTitle({ icon, children, action }: {
  icon: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base sm:text-lg font-bold text-primary flex items-center gap-2">
        <span aria-hidden="true">{icon}</span>
        {children}
      </h2>
      {action && (
        <Button variant="ghost" size="sm" onClick={action.onClick}>
          {action.label}
          <ChevronLeft size={14} />
        </Button>
      )}
    </div>
  );
}

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.06 } } },
  item: { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } },
};

export function Home({ user, isAdmin }: HomeProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const firstName = user?.displayName?.split(' ')[0] || '';

  const { data: events, loading: evLoading } = useEvents();
  const { data: seudot } = useSeudot();
  const { data: registrations } = useSeudahRegistrations();
  const { bookings } = useAllBookings();
  const { availability, requests } = useHosting();
  const { data: announcements } = useAnnouncements();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();
  const { data: families } = useFamilies();

  const today = startOfToday();

  // ── Focus events: the next Shabbat / holiday (tabs when both are close) ──
  const focusEvents = useMemo(() => {
    const upcoming = events.filter(e => {
      const d = e.date?.toDate?.();
      return d && d >= today && (e.type === 'shabbat' || e.type === 'holiday');
    });
    const first = upcoming[0];
    if (!first) return [] as AppEvent[];
    // A nearby event of the other kind (e.g. a holiday right around the next Shabbat)
    const second = upcoming.find(e =>
      e.id !== first.id &&
      e.type !== first.type &&
      Math.abs(daysBetween(first.date.toDate(), e.date.toDate())) <= 10
    );
    return second ? [first, second] : [first];
  }, [events]);

  const [focusIdx, setFocusIdx] = useState(0);
  const activeIdx = Math.min(focusIdx, Math.max(focusEvents.length - 1, 0));
  const focusEvent = focusEvents[activeIdx];

  // ── Everything derived from the selected Shabbat / holiday ───────────────
  const focus = useMemo(() => {
    if (!focusEvent) return null;
    const date = focusEvent.date.toDate();
    // Event timestamps are at noon — normalize to midnight for day-distance math
    const dateDay = new Date(date);
    dateDay.setHours(0, 0, 0, 0);

    const eventSeudot = seudot
      .filter(s => s.eventId === focusEvent.id)
      .sort((a, b) => ALL_SEUDOT.indexOf(a.type) - ALL_SEUDOT.indexOf(b.type));

    const regs = registrations.filter(r => r.eventId === focusEvent.id);
    const regsBySeudah: Record<string, SeudahRegistration[]> = {};
    regs.forEach(r => { (regsBySeudah[r.seudahId] ??= []).push(r); });
    // Every seudah automatically includes the household residents + permanent guest
    const dinersOf = (seudahId: string) =>
      AUTO_ATTENDEES_COUNT +
      (regsBySeudah[seudahId] || []).reduce((sum, r) => sum + (r.diners || 0), 0);

    // Total guests = household base + each family counted once across all seudot
    const famDiners = new Map<string, number>();
    regs.forEach(r => famDiners.set(r.familyId, Math.max(famDiners.get(r.familyId) ?? 0, r.diners || 0)));
    const totalGuests = eventSeudot.length
      ? AUTO_ATTENDEES_COUNT + [...famDiners.values()].reduce((a, b) => a + b, 0)
      : 0;

    const eventBookings = bookings.filter(b => b.eventId === focusEvent.id);
    const sleepingGuests = eventBookings.reduce((s, b) => s + (b.adults || 0) + (b.kids || 0), 0);

    const pendingCount = requests.filter(
      r => r.status === 'pending' && r.eventId === focusEvent.id
    ).length;

    const peakLoad = eventSeudot.reduce((m, s) => Math.max(m, dinersOf(s.id)), 0);

    return {
      date,
      days: daysBetween(today, dateDay),
      eventSeudot,
      regsBySeudah,
      dinersOf,
      totalGuests,
      eventBookings,
      sleepingGuests,
      pendingCount,
      peakLoad,
    };
  }, [focusEvent, seudot, registrations, bookings, requests]);

  // ── Pending hosting requests (operational queue) ─────────────────────────
  const pendingRequests = useMemo(
    () =>
      requests
        .filter(r => r.status === 'pending')
        .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)),
    [requests]
  );

  const canActOn = (r: HostingRequest) =>
    isAdmin ||
    r.hostFamilyId === user?.uid ||
    availability.find(a => a.id === r.availabilityId)?.createdBy === user?.uid;

  const guestCity = (r: HostingRequest) =>
    families.find(f => f.id === r.guestFamilyId || f.createdBy === r.guestFamilyId)?.city || '';

  async function handleApprove(r: HostingRequest) {
    try {
      await approveRequestAsHost(r.id);
      showToast('הבקשה אושרה ✓');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  async function handleDecline(r: HostingRequest) {
    try {
      await rejectRequest(r.id, user?.uid || '', '');
      showToast('הבקשה נדחתה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  // ── Family messages ───────────────────────────────────────────────────────
  const activeAnnouncements = announcements
    .filter(a => !a.expiresAt || a.expiresAt.toDate() > new Date())
    .slice(0, 4);

  // ── Birthdays & Yahrzeits this month ─────────────────────────────────────
  const annuals = useMemo(() => {
    const all = [
      ...birthdays.map(b => ({ key: `b-${b.id}`, name: b.name, kind: 'birthday' as const, item: b })),
      ...memorials.map(m => ({ key: `m-${m.id}`, name: m.name, kind: 'yahrzeit' as const, item: m })),
    ].map(x => ({
      ...x,
      days: daysUntilOccurrence(x.item, x.kind),
      next: nextOccurrence(x.item, x.kind),
    }));
    return all.filter(x => x.days <= 30).sort((a, b) => a.days - b.days).slice(0, 6);
  }, [birthdays, memorials]);

  // ── Top action bar ────────────────────────────────────────────────────────
  const actions = [
    { icon: '🙏', label: 'אני רוצה להתארח', onClick: () => navigate('/hosting', { state: { tab: 'open' } }), primary: false },
    { icon: '🏡', label: 'אני רוצה לארח',   onClick: () => navigate('/hosting', { state: { openWizard: true } }), primary: true },
    { icon: '🤝', label: 'התאמות אירוח',    onClick: () => navigate('/hosting', { state: { tab: 'incoming' } }), primary: false },
    { icon: '💬', label: 'הודעה למשפחה',    onClick: () => navigate('/notifications'), primary: false },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* ── 1. Header ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          שלום {firstName} 👋
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          {formatHebrewDate(today)} ‏· {formatGregorianDate(today, 'full')}
        </p>
        {focusEvent && focus && (
          <p className="mt-2 inline-flex items-center gap-2 bg-accent/10 text-accent-dark font-semibold text-sm px-3 py-1.5 rounded-badge">
            <span aria-hidden="true">{focusEvent.type === 'holiday' ? '✨' : '🕯'}</span>
            {focusEvent.title} ‏· {daysLabel(focus.days)}
          </p>
        )}
      </motion.div>

      {/* ── 2. Top action bar ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6"
      >
        {actions.map(a => (
          <button
            key={a.label}
            onClick={a.onClick}
            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-badge text-sm font-semibold transition-all active:scale-95 ${
              a.primary
                ? 'bg-accent text-white shadow-card hover:bg-accent-dark'
                : 'bg-surface border-2 border-border text-text-mid hover:border-accent/60 hover:text-accent-dark'
            }`}
          >
            <span className="text-lg" aria-hidden="true">{a.icon}</span>
            <span className="whitespace-nowrap">{a.label}</span>
          </button>
        ))}
      </motion.div>

      <motion.div variants={stagger.container} initial="initial" animate="animate" className="space-y-6">
        {/* ── 3. Upcoming Shabbat / holiday focus card ────────────────────── */}
        <motion.section variants={stagger.item}>
          {evLoading ? (
            <SkeletonCard />
          ) : !focusEvent || !focus ? (
            <Card>
              <EmptyState icon="🕯" title="אין שבת או חג קרובים" description="אירועי שבת וחג יופיעו כאן אוטומטית" withWatermark />
            </Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              {/* Tabs when a Shabbat and a holiday are close together */}
              {focusEvents.length > 1 && (
                <div className="flex gap-1 px-4 pt-3 bg-primary/5">
                  {focusEvents.map((e, i) => (
                    <button
                      key={e.id}
                      onClick={() => setFocusIdx(i)}
                      className={`px-4 py-2 rounded-t-md text-sm font-semibold transition-colors ${
                        i === activeIdx
                          ? 'bg-surface text-accent-dark border border-b-0 border-border'
                          : 'text-text-muted hover:text-text-base'
                      }`}
                    >
                      {e.type === 'holiday' ? '✨' : '🕯'} {e.title}
                    </button>
                  ))}
                </div>
              )}

              <div className="p-5 bg-gradient-to-l from-primary/5 to-transparent">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-primary">
                      {focusEvent.type === 'holiday' ? '✨' : '🕯'} {focusEvent.title}
                    </h2>
                    <p className="text-sm text-text-mid mt-1">
                      {formatHebrewDateShort(focus.date)} ‏· {formatGregorianDate(focus.date, 'long')}
                    </p>
                  </div>
                  <Badge variant="accent" className="text-sm px-3 py-1">{daysLabel(focus.days)}</Badge>
                </div>

                {/* Status summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  <div className="bg-surface rounded-md border border-border p-3 text-center">
                    <p className="text-xl font-bold text-primary">{focus.totalGuests}</p>
                    <p className="text-xs text-text-muted">סועדים (כולל בני הבית)</p>
                  </div>
                  <div className="bg-surface rounded-md border border-border p-3 text-center">
                    <p className="text-xl font-bold text-accent">{focus.sleepingGuests}</p>
                    <p className="text-xs text-text-muted">אורחים לנים</p>
                  </div>
                  <div className="bg-surface rounded-md border border-border p-3 text-center">
                    <p className={`text-xl font-bold ${focus.pendingCount > 0 ? 'text-warning' : 'text-primary'}`}>
                      {focus.pendingCount}
                    </p>
                    <p className="text-xs text-text-muted">בקשות ממתינות</p>
                  </div>
                  <div className="bg-surface rounded-md border border-border p-3 text-center flex flex-col items-center justify-center gap-1">
                    <Badge variant={loadInfo(focus.peakLoad).variant}>{loadInfo(focus.peakLoad).label}</Badge>
                    <p className="text-xs text-text-muted">רמת עומס</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </motion.section>

        {/* ── 4. Seudot & guest breakdown ─────────────────────────────────── */}
        {focusEvent && focus && (
          <motion.section variants={stagger.item}>
            <SectionTitle icon="🍽" action={{ label: 'ניהול סעודות', onClick: () => navigate('/seudot') }}>
              סעודות — {focusEvent.title}
            </SectionTitle>
            {focus.eventSeudot.length === 0 ? (
              <Card>
                <EmptyState
                  icon="🍽"
                  title="אין סעודות עדיין"
                  description={focusEvent.type === 'holiday'
                    ? 'הוסיפו את סעודת ערב החג וסעודת החג'
                    : 'הוסיפו את סעודת ערב שבת, סעודת שבת וסעודה שלישית'}
                  action={{ label: 'הוסף סעודה', onClick: () => navigate('/seudot') }}
                />
              </Card>
            ) : (
              <div className="space-y-4">
                {focus.eventSeudot.map(s => {
                  const regs = focus.regsBySeudah[s.id] || [];
                  const diners = focus.dinersOf(s.id);
                  const load = loadInfo(diners);
                  return (
                    <Card key={s.id} padding="none">
                      <div className="px-5 py-3 bg-primary/5 border-b border-border rounded-t-card">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-bold text-primary text-base">
                            {SEUDAH_ICONS[s.type]} {s.type}
                          </h3>
                          <Badge variant={load.variant}>
                            <Users size={12} /> {diners} סועדים
                          </Badge>
                        </div>
                        <div className="mt-2.5">
                          <LoadBar diners={diners} />
                          <p className="text-xs text-text-muted mt-1">
                            עומס: {diners} סועדים ‏· ‏{Math.min(diners, LOAD_BAR_SCALE)}/{LOAD_BAR_SCALE} ‏· {load.label}
                          </p>
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        {/* Household base — always at the table */}
                        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-md border border-border/60">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-text-base">
                              בני הבית ואורחים קבועים
                              <span className="text-text-muted font-normal"> ‏· {AUTO_ATTENDEES_COUNT} סועדים</span>
                            </p>
                            <p className="text-xs text-text-muted mt-0.5">
                              🏠 {AUTO_ATTENDEES.map(p => p.name).join(', ')}
                            </p>
                          </div>
                        </div>
                        {regs.length === 0 ? (
                          <p className="text-sm text-text-muted px-1 pt-1">
                            עדיין לא נרשמו משפחות נוספות — היו הראשונים 🙋
                          </p>
                        ) : (
                          regs.map(r => (
                            <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-alt rounded-md border border-border">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-text-base">
                                  משפחת {r.familyName}
                                  <span className="text-text-muted font-normal"> ‏· {r.diners} סועדים</span>
                                </p>
                                {r.bringing && (
                                  <p className="text-xs text-text-muted mt-0.5">🧺 מביאים: {r.bringing}</p>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </motion.section>
        )}

        {/* ── 5. Rooms & occupancy for the selected event ─────────────────── */}
        {focusEvent && focus && (
          <motion.section variants={stagger.item}>
            <SectionTitle icon="🛏" action={{ label: 'הזמנת חדר', onClick: () => navigate('/rooms') }}>
              חדרים ולינה — {focusEvent.title}
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ROOMS.map(room => {
                const residents = permanentOccupants(room.id);
                const residentBeds = residents.reduce((s, p) => s + (p.beds ?? 1), 0);
                const roomBookings = focus.eventBookings.filter(b => b.roomId === room.id);
                const guestAdults = roomBookings.reduce((s, b) => s + (b.adults || 0), 0);
                const occupied = Math.min(room.maxAdults, residentBeds + guestAdults);
                const full = occupied >= room.maxAdults;
                const pct = Math.round((occupied / room.maxAdults) * 100);
                const assigned = [
                  ...residents.map(p => p.name),
                  ...roomBookings.map(b => `משפחת ${b.familyName}`),
                ];
                return (
                  <Card
                    key={room.id}
                    padding="sm"
                    hover
                    onClick={() => navigate('/rooms')}
                    className={full ? 'border-error/40' : ''}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm text-text-base">
                        {room.icon} {room.name}
                        <span className="text-text-muted font-normal"> ‏· {occupied}/{room.maxAdults}</span>
                      </p>
                      {full ? (
                        <Badge variant="error">מלא</Badge>
                      ) : (
                        <Badge variant="success">פנוי</Badge>
                      )}
                    </div>
                    <div className="h-2 w-full bg-surface-alt rounded-full overflow-hidden border border-border/50 mt-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: full ? 'var(--error)' : 'var(--accent)' }}
                      />
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                      {assigned.length === 0 ? room.cap : `🧳 ${assigned.join(', ')}`}
                    </p>
                  </Card>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ── 6. Pending hosting matches ──────────────────────────────────── */}
        <motion.section variants={stagger.item}>
          <SectionTitle icon="🤝" action={{ label: 'כל האירוחים', onClick: () => navigate('/hosting') }}>
            בקשות אירוח ממתינות
          </SectionTitle>
          {pendingRequests.length === 0 ? (
            <Card>
              <EmptyState
                icon="🤝"
                title="אין בקשות ממתינות"
                description="כשמשפחה תבקש להתארח, הבקשה תופיע כאן לאישור"
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map(r => {
                const city = guestCity(r);
                const people = (r.adults || 0) + (r.children || 0);
                return (
                  <Card key={r.id} padding="sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-text-base">
                          משפחת {r.guestFamilyName}
                          {city && <span className="text-text-muted font-normal"> מ{city}</span>}
                        </p>
                        {r.eventTitle && (
                          <p className="text-xs text-text-muted mt-0.5">{r.eventTitle}</p>
                        )}
                      </div>
                      <Badge variant="warning">ממתין לאישור</Badge>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {r.meals.map(m => (
                        <span key={m} className="text-xs bg-accent/10 text-accent-dark font-medium px-2 py-0.5 rounded-badge">
                          🍽 {m}
                        </span>
                      ))}
                      <span className="text-xs bg-surface-alt text-text-mid font-medium px-2 py-0.5 rounded-badge">
                        🛏 לינה: {r.needsSleep ? 'כן' : 'לא'}
                      </span>
                      <span className="text-xs bg-surface-alt text-text-mid font-medium px-2 py-0.5 rounded-badge">
                        👨‍👩‍👧‍👦 {people} אורחים
                      </span>
                    </div>

                    {r.notes && (
                      <p className="text-xs text-text-muted mt-2">📝 {r.notes}</p>
                    )}

                    {canActOn(r) && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="success" onClick={() => handleApprove(r)}>
                          אישור ✓
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDecline(r)}>
                          דחייה
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* ── 7. Family messages ──────────────────────────────────────────── */}
        <motion.section variants={stagger.item}>
          <SectionTitle icon="💬" action={{ label: 'כל ההודעות', onClick: () => navigate('/notifications') }}>
            הודעות משפחתיות
          </SectionTitle>
          <Card padding="sm">
            {activeAnnouncements.length === 0 ? (
              <div className="flex items-center gap-3 p-2 text-sm text-text-muted">
                <MessageCircle size={18} className="shrink-0" />
                אין הודעות חדשות — אפשר לפרסם הודעה למשפחה בעמוד ההתראות
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activeAnnouncements.map(a => (
                  <div key={a.id} className="flex items-start gap-3 py-2.5 first:pt-1 last:pb-1">
                    <span className="text-lg shrink-0" aria-hidden="true">📢</span>
                    <p className="text-sm text-text-mid">{a.text}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.section>

        {/* ── 8. Birthdays & Yahrzeits this month ─────────────────────────── */}
        <motion.section variants={stagger.item}>
          <SectionTitle icon="🗓" action={{ label: 'לוח שנה', onClick: () => navigate('/calendar') }}>
            ימי הולדת וימי זיכרון החודש
          </SectionTitle>
          <Card padding="sm">
            {annuals.length === 0 ? (
              <div className="p-2 text-sm text-text-muted">
                אין ימי הולדת או ימי זיכרון בחודש הקרוב
              </div>
            ) : (
              <div className="divide-y divide-border">
                {annuals.map(x => (
                  <div key={x.key} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${
                        x.kind === 'birthday' ? 'bg-red-50' : 'bg-purple-50'
                      }`}
                      aria-hidden="true"
                    >
                      {x.kind === 'birthday' ? '🎂' : '🕯'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-base truncate">{x.name}</p>
                      <p className="text-xs text-text-muted">
                        {x.next ? formatHebrewDateShort(x.next) : ''} ‏· {daysLabel(x.days)}
                      </p>
                    </div>
                    <Badge variant={x.kind === 'birthday' ? 'primary' : 'memorial'}>
                      {x.kind === 'birthday' ? 'יום הולדת' : 'יום זיכרון'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.section>
      </motion.div>
    </div>
  );
}
