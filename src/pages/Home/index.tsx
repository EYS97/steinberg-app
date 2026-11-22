import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, MessageCircle, ChevronLeft, ChevronDown, Lock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { LogoIcon } from '@/components/ui/LogoIcon';
import { HomeHeroBackground } from '@/components/ui/HomeHeroBackground';
import { FamilyEventsHub } from '@/components/home/FamilyEventsHub';
import { WelcomeCard } from '@/components/home/WelcomeCard';
import { useToast } from '@/components/ui/Toast';
import { useActiveEvent } from '@/hooks/useActiveEvent';
import { isActiveOrUpcoming } from '@/lib/jewishEvents';
import { computeRoomStats, computeMealStats, computeCandleStats } from '@/lib/eventState';
import { useSeudot, useSeudahRegistrations } from '@/hooks/useSeudot';
import { useAllBookings, useClosedEvents, useLocks } from '@/hooks/useBookings';
import { useHosting, approveRequestAsHost, rejectRequest } from '@/hooks/useHosting';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useFamilies } from '@/hooks/useFamilies';
import { useTrackHomeVisit } from '@/hooks/useUserAnalytics';
import { useLifecycle } from '@/hooks/useLifecycle';
import {
  ROOMS,
  SEUDAH_ICONS,
  AUTO_ATTENDEES,
} from '@/types';
import type { AppEvent, HostingRequest } from '@/types';
import {
  formatHebrewDate,
  formatHebrewDateShort,
  formatGregorianDate,
  daysBetween,
} from '@/lib/dates';
import { buildFamilyEvents } from '@/lib/familyEvents';
import { initials, avatarColor } from '@/lib/utils';
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
  return               { color: '#2E7D32', label: 'עומס נמוך',   variant: 'success' as const };
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

// A party attending a seudah — either a direct family registration or a room
// booking that opted into the meal. Both show identically on the home card.
interface SeudahParty {
  id: string;
  name: string;
  diners: number;
  /** External guest (no "משפחת" prefix). */
  external?: boolean;
}

// Overlapping avatar row: household chip + one circle per attending party
function AvatarRow({ parties }: { parties: SeudahParty[] }) {
  const shown = parties.slice(0, 4);
  const extra = parties.length - shown.length;
  return (
    <div className="flex items-center shrink-0">
      <div
        className="w-8 h-8 rounded-full bg-surface-alt border-2 border-surface flex items-center justify-center text-sm shrink-0"
        title={`בני הבית ואורחים קבועים — ${AUTO_ATTENDEES.map(p => p.name).join(', ')}`}
      >
        🏠
      </div>
      {shown.map(p => (
        <div
          key={p.id}
          className="w-8 h-8 rounded-full border-2 border-surface flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ background: avatarColor(p.name), marginInlineStart: '-8px' }}
          title={`${p.external ? '' : 'משפחת '}${p.name} ‏· ${p.diners} סועדים`}
        >
          {initials(p.name)}
        </div>
      ))}
      {extra > 0 && (
        <div
          className="w-8 h-8 rounded-full bg-primary/10 border-2 border-surface flex items-center justify-center text-[11px] font-bold text-primary shrink-0"
          style={{ marginInlineStart: '-8px' }}
        >
          +{extra}
        </div>
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
  useTrackHomeVisit(user);
  const firstName = user?.displayName?.split(' ')[0] || '';
  const detailsRef = useRef<HTMLElement>(null);

  const { resolved, events, now, loading: evLoading } = useActiveEvent();
  const { data: seudot } = useSeudot();
  const { data: registrations } = useSeudahRegistrations();
  const { bookings } = useAllBookings();
  const closedEventIds = useClosedEvents();
  const locks = useLocks();
  const { availability, requests } = useHosting();
  const { data: announcements } = useAnnouncements();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();
  const { data: families } = useFamilies();
  // Family-lifecycle: anniversaries for the events hub + this member's own
  // temporary welcome card. Empty/null for everyone without a record.
  const { anniversaries, welcomeFor, welcomeContext, seasonal, dismissWelcomeCard } =
    useLifecycle(user);

  const today = useMemo(() => {
    const t = new Date(now);
    t.setHours(0, 0, 0, 0);
    return t;
  }, [now]);

  // ── Focus events: the active-or-next Shabbat / holiday (tabs when both are
  // close). The primary is resolved by halachic time in Jerusalem, so it rolls
  // over to the next event automatically the moment the current one ends. ──
  const focusEvents = useMemo(() => {
    const first = resolved?.event;
    if (!first) return [] as AppEvent[];
    // A nearby event of the other kind (e.g. a holiday right around the next
    // Shabbat) that hasn't ended yet — shown as a second tab.
    const second = events.find(e =>
      (e.type === 'shabbat' || e.type === 'holiday') &&
      e.id !== first.id &&
      e.type !== first.type &&
      isActiveOrUpcoming(e, now) &&
      Math.abs(daysBetween(first.date.toDate(), e.date.toDate())) <= 10
    );
    return second ? [first, second] : [first];
  }, [resolved, events, now]);

  const [focusIdx, setFocusIdx] = useState(0);
  const activeIdx = Math.min(focusIdx, Math.max(focusEvents.length - 1, 0));
  const focusEvent = focusEvents[activeIdx];
  const isHoliday = focusEvent?.type === 'holiday';
  const eventNoun = isHoliday ? 'החג' : 'השבת';
  // The primary tab is "happening now" only while its halachic window is active.
  const showingActive = !!resolved?.isActiveNow && focusEvent?.id === resolved?.eventId;
  const endTimeLabel = resolved
    ? resolved.endDateTime.toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jerusalem',
      })
    : '';

  // Sleeping and meals are one registration: a closed event is fully closed for both
  const focusClosed = !!focusEvent && closedEventIds.includes(focusEvent.id);
  const canRegister = !focusClosed || isAdmin;

  // ── Everything derived from the selected Shabbat / holiday ───────────────
  // All meal and room figures come from the shared eventState selectors — the
  // same code the Seudot and Rooms pages use — so the homepage can never drift
  // out of sync with them.
  const focus = useMemo(() => {
    if (!focusEvent) return null;
    const date = focusEvent.date.toDate();
    // Event timestamps are at noon — normalize to midnight for day-distance math
    const dateDay = new Date(date);
    dateDay.setHours(0, 0, 0, 0);

    const eventBookings = bookings.filter(b => b.eventId === focusEvent.id);

    // Meals: identical math to the Seudot page (household base + registrations +
    // room bookings that opted into each meal).
    const meals = computeMealStats(focusEvent, seudot, registrations, eventBookings);

    // Rooms: identical "booked = a booking exists" semantics as the Rooms page,
    // honouring locks and the event's open/closed state.
    const rooms = computeRoomStats(eventBookings, locks, focusClosed);

    // Shabbat candles: mother-of-the-house baseline + each sleeping married
    // nuclear family (room bookings only, so meal-only guests never count).
    const candles = computeCandleStats(eventBookings);

    const pendingCount = requests.filter(
      r => r.status === 'pending' && r.eventId === focusEvent.id
    ).length;

    // Families that opened hosting availability for this event
    const hostingFamilies = new Set(
      availability
        .filter(a => a.eventId === focusEvent.id && a.status !== 'cancelled')
        .map(a => a.familyId)
    ).size;

    const pendingAllocation = requests.filter(
      r => r.status === 'pending' && r.eventId === focusEvent.id && r.needsSleep
    ).length;

    return {
      date,
      days: daysBetween(today, dateDay),
      meals,
      rooms,
      candles,
      eventBookings,
      pendingCount,
      hostingFamilies,
      pendingAllocation,
    };
  }, [focusEvent, focusClosed, seudot, registrations, bookings, locks, requests, availability, today]);

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
    .slice(0, 3);

  // ── Upcoming family events (birthdays · anniversaries · yahrzeits · …) ────
  // One chronological feed for the Family Events Hub. Extensible by design —
  // see buildFamilyEvents / FamilyEventsHub for adding future event types.
  const familyEvents = useMemo(
    () => buildFamilyEvents(birthdays, memorials, { today, limit: 6 }, anniversaries),
    [birthdays, memorials, today, anniversaries]
  );

  // ── Upcoming events (small card) ─────────────────────────────────────────
  const upcomingEvents = useMemo(
    () => events.filter(e => isActiveOrUpcoming(e, now)).slice(0, 4),
    [events, now]
  );

  // ── Quick actions ─────────────────────────────────────────────────────────
  const actions = [
    { icon: '🙏', label: 'אני רוצה להתארח', onClick: () => navigate('/rooms'), primary: false },
    { icon: '🏡', label: 'אני רוצה לארח',   onClick: () => navigate('/hosting', { state: { openWizard: true } }), primary: true },
    { icon: '🤝', label: 'התאמות אירוח',    onClick: () => navigate('/hosting', { state: { tab: 'incoming' } }), primary: false },
    { icon: '💬', label: 'הודעה למשפחה',    onClick: () => navigate('/notifications'), primary: false },
  ];

  function scrollToDetails() {
    if (focus && focus.meals.eventSeudot.length === 0) {
      navigate('/seudot');
      return;
    }
    detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div>
      {/* ── 1. Hero — the house is the identity of the Home screen ────────── */}
      <HomeHeroBackground
        image="/assets/home-hero.jpeg"
        objectPosition="center 42%"
        // Desktop: a compact dashboard header — even veil instead of the tall-hero side gradient
        overlayLg="linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.46) 55%, rgba(0,0,0,0.62) 100%)"
        className="min-h-[300px] sm:min-h-[380px] lg:min-h-[280px]"
      >
        <div className="flex flex-col min-h-[inherit] p-4 sm:p-6 lg:px-8 lg:py-4 max-w-6xl xl:max-w-[1240px] mx-auto w-full">
          {/* Top identity bar: logo on the right (RTL start), profile chip on the left.
              Desktop already has the sidebar logo + header chip, so it's hidden there. */}
          <div className="flex items-start justify-between gap-3 lg:hidden">
            <div className="flex items-center gap-2.5">
              <LogoIcon size={42} className="shadow-card" />
              <div className="leading-tight">
                <p className="text-white font-bold text-sm drop-shadow">Family OS</p>
                <p className="text-white/80 text-xs">משפחת שטיינברג ‏· כרמיאל</p>
              </div>
            </div>
            {user && (
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/25 rounded-badge ps-1.5 pe-3 py-1.5 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                  style={{ background: avatarColor(user.displayName || user.email || '') }}
                >
                  {initials(user.displayName || user.email || '')}
                </div>
                <span className="text-white text-xs font-semibold">{firstName || 'משתמש'}</span>
              </button>
            )}
          </div>

          {/* Desktop (≥lg): welcome text and focus card sit side by side — the card,
              on the right (RTL start), is the hero focus. Mobile keeps the stacked flow
              untouched via display:contents. */}
          <div className="contents lg:mt-auto lg:flex lg:flex-row-reverse lg:items-end lg:justify-between lg:gap-6 xl:gap-10 lg:pt-3">
            {/* Welcome text — right-aligned (RTL start) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-auto pt-6 lg:mt-0 lg:pt-0 lg:min-w-0 lg:pb-1"
            >
              <p className="text-white/85 text-sm mb-1.5">
                שלום {firstName} 👋 ‏· {formatHebrewDate(today)}
              </p>
              <h1 className="text-white text-2xl sm:text-3xl lg:text-2xl xl:text-[32px] font-bold leading-tight drop-shadow-md">
                ברוכים הבאים לבית משפחת שטיינברג
              </h1>
              <p className="text-white/85 mt-1.5 text-sm sm:text-lg lg:text-sm xl:text-base">
                ניהול חכם של אירוח, משפחה וקהילה
              </p>
            </motion.div>

            {/* Glass focus card — the next Shabbat / holiday */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mt-4 sm:mt-5 max-w-xl rounded-card bg-black/45 backdrop-blur-md border border-white/20 text-white p-4 sm:p-5 lg:p-4 shadow-modal lg:mt-0 lg:max-w-none lg:w-[520px] xl:w-[580px] lg:shrink-0"
            >
            {evLoading ? (
              <div className="space-y-3 animate-pulse" aria-label="טוען">
                <div className="h-3 w-20 bg-white/20 rounded-full" />
                <div className="h-6 w-48 bg-white/25 rounded-full" />
                <div className="h-3 w-full max-w-[260px] bg-white/15 rounded-full" />
              </div>
            ) : !focusEvent || !focus ? (
              <p className="text-sm text-white/85">
                🕯 אין שבת או חג קרובים — אירועי שבת וחג יופיעו כאן אוטומטית
              </p>
            ) : (
              <>
                {focusEvents.length > 1 && (
                  <div className="flex gap-1.5 mb-3">
                    {focusEvents.map((e, i) => (
                      <button
                        key={e.id}
                        onClick={() => setFocusIdx(i)}
                        className={`px-3 py-1 rounded-badge text-xs font-semibold transition-colors ${
                          i === activeIdx
                            ? 'bg-white text-text-base'
                            : 'bg-white/15 text-white/85 hover:bg-white/25'
                        }`}
                      >
                        {e.type === 'holiday' ? '✨' : '🕯'} {e.title}
                        {closedEventIds.includes(e.id) && ' 🔒'}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold tracking-wide text-white/70">
                      {showingActive
                        ? (isHoliday ? 'החג מתקיים כעת' : 'שבת מתקיימת כעת')
                        : (isHoliday ? 'החג הקרוב' : 'שבת הקרובה')}
                    </p>
                    <h2 className="text-xl sm:text-2xl lg:text-[26px] font-bold mt-0.5 text-white">
                      {isHoliday ? '✨' : '🕯'} {focusEvent.title}
                    </h2>
                    <p className="text-sm text-white/80 mt-1">
                      {formatHebrewDate(focus.date)} ‏· {formatGregorianDate(focus.date, 'long')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-badge whitespace-nowrap">
                      {showingActive ? `כעת · עד ${endTimeLabel}` : daysLabel(focus.days)}
                    </span>
                    {!focusClosed && (
                      <span className="hidden lg:inline-flex bg-success/90 text-white text-xs font-bold px-3 py-1.5 rounded-badge whitespace-nowrap items-center gap-1">
                        ההרשמה פתוחה
                      </span>
                    )}
                    {!focusClosed && focus.rooms.allFull && (
                      <span className="bg-warning/90 text-white text-xs font-bold px-3 py-1.5 rounded-badge whitespace-nowrap inline-flex items-center gap-1">
                        🛏 לינה מלאה
                      </span>
                    )}
                    {focusClosed && (
                      <span className="bg-error/90 text-white text-xs font-bold px-3 py-1.5 rounded-badge whitespace-nowrap inline-flex items-center gap-1">
                        <Lock size={11} /> ההרשמה סגורה
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 lg:mt-3">
                  {[
                    { n: focus.meals.totalDiners, label: 'סועדים' },
                    { n: focus.hostingFamilies,   label: 'משפחות מארחות' },
                    { n: focus.rooms.freeRooms,   label: 'חדרים פנויים' },
                    // Display-only extra stat for the wider desktop card
                    {
                      n: focus.rooms.availableBeds,
                      label: 'מיטות פנויות',
                      lgOnly: true,
                    },
                  ].map(s => (
                    <div
                      key={s.label}
                      className={`${'lgOnly' in s && s.lgOnly ? 'hidden lg:flex' : 'flex'} items-baseline gap-1.5`}
                    >
                      <span className="text-xl font-bold">{s.n}</span>
                      <span className="text-xs text-white/75">{s.label}</span>
                    </div>
                  ))}
                </div>

                {focusClosed && (
                  <p className="text-xs font-medium text-white/85 mt-3 flex items-center gap-1.5">
                    <Lock size={11} /> ההרשמה לשינה ולסעודות סגורה
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mt-4 lg:mt-3">
                  <Button
                    onClick={scrollToDetails}
                    className="bg-accent hover:bg-accent-dark border-none lg:h-10"
                  >
                    לפרטי {eventNoun}
                    <ChevronDown size={16} />
                  </Button>
                  {focusClosed && isAdmin && (
                    <Button
                      variant="outline"
                      className="border-white/40 text-white hover:bg-white/10"
                      onClick={() => navigate('/admin')}
                    >
                      ניהול הרשמה
                    </Button>
                  )}
                </div>
              </>
            )}
            </motion.div>
          </div>
        </div>
      </HomeHeroBackground>

      <div className="p-4 sm:p-6 max-w-6xl xl:max-w-[1240px] mx-auto lg:px-8 lg:pt-6 lg:pb-10">
        {/* ── Temporary welcome for a newly-onboarded family member ───────── */}
        {welcomeFor && welcomeContext && (
          <div className="mb-5">
            <WelcomeCard
              context={welcomeContext}
              seasonal={seasonal}
              onDismiss={() => dismissWelcomeCard(welcomeFor)}
            />
          </div>
        )}

        {/* ── 2. Quick actions — horizontal action bar right under the hero on desktop ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6 lg:flex lg:flex-wrap lg:gap-3 lg:mb-5"
        >
          {actions.map(a => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`flex items-center justify-center gap-2 px-3 py-3 lg:h-12 lg:py-0 lg:px-6 rounded-badge text-sm font-semibold transition-all active:scale-95 ${
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

        {/* Wide desktop (≥xl): dashboard grid — main column (seudot + small cards) and a
            side column (rooms, messages, hosting, birthdays). Below xl the wrappers are
            display:contents and `order-*` recreates today's stacked mobile sequence. */}
        <motion.div
          variants={stagger.container}
          initial="initial"
          animate="animate"
          className="flex flex-col gap-6 xl:flex-row xl:items-start"
        >
          {/* Main column */}
          <div className="contents xl:flex xl:flex-col xl:gap-6 xl:flex-1 xl:min-w-0">
          {/* ── 3. Seudot of the upcoming Shabbat / holiday ─────────────────── */}
          {focusEvent && focus && (
            <motion.section variants={stagger.item} ref={detailsRef} className="scroll-mt-20 order-1 xl:order-none">
              <SectionTitle icon="🍽" action={{ label: 'ניהול סעודות', onClick: () => navigate('/seudot') }}>
                סעודות {eventNoun} — {focusEvent.title}
              </SectionTitle>
              {focus.meals.eventSeudot.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="🍽"
                    title="אין סעודות עדיין"
                    description={isHoliday
                      ? 'הוסיפו את סעודת ערב החג וסעודת החג'
                      : 'הוסיפו את סעודת ערב שבת, סעודת שבת וסעודה שלישית'}
                    action={canRegister ? { label: 'הוסף סעודה', onClick: () => navigate('/seudot') } : undefined}
                  />
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {focus.meals.perSeudah.map(({ seudah: s, registrations: regs, roomGuests, partyCount, diners }) => {
                    const load = loadInfo(diners);
                    // Direct family registrations + room bookings that opted into
                    // this meal — both count as attending parties (same as the
                    // Seudot page), so the homepage never says "no families" while
                    // a room guest is already eating.
                    const parties: SeudahParty[] = [
                      ...regs.map(r => ({ id: r.id, name: r.familyName, diners: r.diners })),
                      ...roomGuests.map(b => ({
                        id: b.id,
                        name: b.familyName,
                        diners: (b.adults || 0) + (b.kids || 0),
                        external: !!b.isExternalGuest,
                      })),
                    ];
                    return (
                      <Card key={s.id} padding="sm" className="flex flex-col">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-bold text-primary text-base">
                            {SEUDAH_ICONS[s.type]} {s.type}
                          </h3>
                          <Badge variant={load.variant}>
                            <Users size={12} /> {diners}
                          </Badge>
                        </div>
                        <div className="mt-2.5">
                          <LoadBar diners={diners} />
                          <p className="text-xs text-text-muted mt-1">
                            {load.label} ‏· {diners} סועדים (כולל בני הבית)
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-x-2 gap-y-1 mt-3 flex-wrap">
                          <AvatarRow parties={parties} />
                          <p className="text-xs text-text-muted min-w-0">בני הבית + {partyCount} משפחות</p>
                        </div>
                        <p className="text-xs text-text-muted mt-2 flex-1">
                          {parties.length === 0
                            ? 'עדיין לא נרשמו משפחות נוספות — היו הראשונים 🙋'
                            : parties.map(p => `${p.external ? '' : 'משפחת '}${p.name} (${p.diners})`).join(', ')}
                        </p>

                        {focusClosed ? (
                          isAdmin ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 border-error/40 text-error hover:bg-error/5"
                              onClick={() => navigate('/seudot')}
                            >
                              <Lock size={12} /> ההרשמה סגורה · ניהול
                            </Button>
                          ) : (
                            <p className="text-xs font-semibold text-error flex items-center justify-center gap-1 mt-3">
                              <Lock size={12} /> ההרשמה סגורה
                            </p>
                          )
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full mt-3"
                            onClick={() => navigate('/seudot')}
                          >
                            🙋 אני מתארח בסעודה
                          </Button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </motion.section>
          )}

          {/* ── 6. Family events hub + upcoming Shabbatot/holidays — two cards
              side by side in the main column at every width. */}
          <div className="order-4 xl:order-none grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
            <motion.div variants={stagger.item}>
              <FamilyEventsHub
                events={familyEvents}
                onSelect={ev =>
                  ev.kind === 'birthday' ? navigate(`/notifications?tab=birthdays&edit=${ev.sourceId}`)
                  : ev.kind === 'yahrzeit' ? navigate(`/notifications?tab=memorials&edit=${ev.sourceId}`)
                  : navigate('/calendar')}
                onAdd={() => navigate('/notifications?tab=birthdays&add=1')}
                onViewAll={() => navigate('/calendar')}
              />
            </motion.div>

            <motion.section variants={stagger.item}>
              <SectionTitle icon="📅" action={{ label: 'לוח שנה', onClick: () => navigate('/calendar') }}>
                אירועים קרובים
              </SectionTitle>
              <Card padding="sm">
                {upcomingEvents.length === 0 ? (
                  <div className="p-2 text-sm text-text-muted">אין אירועים קרובים</div>
                ) : (
                  <div className="divide-y divide-border">
                    {upcomingEvents.map(e => {
                      const d = e.date.toDate();
                      const dDay = new Date(d);
                      dDay.setHours(0, 0, 0, 0);
                      return (
                        <div key={e.id} className="flex items-center gap-3 py-2.5 first:pt-1 last:pb-1">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0" aria-hidden="true">
                            {e.type === 'holiday' ? '✨' : e.type === 'shabbat' ? '🕯' : '📅'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-text-base truncate">{e.title}</p>
                            <p className="text-xs text-text-muted">
                              {formatHebrewDateShort(d)} ‏· {daysLabel(daysBetween(today, dDay))}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </motion.section>

          </div>
          </div>

          {/* Side column */}
          <div className="contents xl:flex xl:flex-col xl:gap-6 xl:w-[360px] xl:shrink-0">
          {/* ── 4. Rooms occupancy + recent messages (2 columns; stacked in the
              side column on ≥xl) ───────────────────────────────────────────── */}
          <div className="order-2 xl:order-none grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-1 gap-6 items-start">
            {focusEvent && focus && (
              <motion.section variants={stagger.item}>
                <SectionTitle
                  icon="🛏"
                  action={canRegister ? { label: 'הזמנת חדר', onClick: () => navigate('/rooms') } : undefined}
                >
                  תפוסת חדרים — {focusEvent.title}
                </SectionTitle>
                <Card padding="sm">
                  <div className="grid grid-cols-4 gap-2 text-center mb-4">
                    {[
                      { n: ROOMS.length,            label: 'חדרים',   cls: 'text-primary' },
                      { n: focus.rooms.bookedRooms, label: 'תפוסים',  cls: 'text-accent' },
                      { n: focus.rooms.freeRooms,   label: 'פנויים',  cls: 'text-success' },
                      { n: focus.pendingAllocation, label: 'ממתינים', cls: focus.pendingAllocation > 0 ? 'text-warning' : 'text-primary' },
                    ].map(s => (
                      <div key={s.label} className="bg-surface-alt/60 rounded-md border border-border/60 py-2">
                        <p className={`text-lg font-bold ${s.cls}`}>{s.n}</p>
                        <p className="text-[11px] text-text-muted">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2.5">
                    {focus.rooms.perRoom.map(({ room, occupiedAdults, booked, locked, status, assigned }) => (
                      <div key={room.id} className="flex items-center gap-3">
                        <p className="text-sm text-text-base w-28 shrink-0 truncate">
                          {room.icon} {room.name}
                        </p>
                        <div className="h-2 flex-1 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.round(((booked ? room.maxAdults : occupiedAdults) / room.maxAdults) * 100)}%`,
                              background: booked ? 'var(--error)' : locked ? 'var(--warning)' : 'var(--accent)',
                            }}
                          />
                        </div>
                        <p className="text-xs text-text-muted w-10 shrink-0" title={assigned.join(', ') || room.cap}>
                          {occupiedAdults}/{room.maxAdults}
                        </p>
                        {status === 'booked' ? (
                          <Badge variant="error">תפוס</Badge>
                        ) : status === 'locked' ? (
                          <Badge variant="warning"><Lock size={10} /> נעול</Badge>
                        ) : status === 'closed' ? (
                          <Badge variant="error"><Lock size={10} /> סגור</Badge>
                        ) : (
                          <Badge variant="success">פנוי</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                  {focusClosed ? (
                    isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-4 border-error/40 text-error hover:bg-error/5"
                        onClick={() => navigate('/rooms')}
                      >
                        <Lock size={12} /> ההרשמה סגורה · ניהול
                      </Button>
                    ) : (
                      <p className="text-xs font-semibold text-error flex items-center justify-center gap-1 mt-4">
                        <Lock size={12} /> ההרשמה סגורה
                      </p>
                    )
                  ) : (
                    <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => navigate('/rooms')}>
                      🛏 הקצאת חדר
                    </Button>
                  )}
                </Card>
              </motion.section>
            )}

            {focusEvent && focus && (
              <motion.section variants={stagger.item}>
                <SectionTitle icon="🕯">נרות שבת</SectionTitle>
                <Card padding="sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-text-muted">סה״כ נרות להדלקה</p>
                      <p className="text-3xl font-bold text-accent leading-tight">{focus.candles.total}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center text-2xl shrink-0" aria-hidden="true">
                      🕯
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="text-text-mid">ברירת מחדל - אמא</span>
                      <span className="font-semibold text-text-base">{focus.candles.base}</span>
                    </div>
                    {focus.candles.families.map(f => (
                      <div key={f.key} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-text-mid min-w-0 truncate">
                          {f.familyName.startsWith('משפחת') ? f.familyName : `משפחת ${f.familyName}`}:{' '}
                          <span className="text-text-muted">{f.parents} הורים + {f.children} ילדים</span>
                        </span>
                        <span className="font-semibold text-text-base shrink-0">= {f.candles}</span>
                      </div>
                    ))}
                    {focus.candles.families.length === 0 && (
                      <p className="text-xs text-text-muted">אין משפחות אורחות שנרשמו ללינה — רק נרות אמא</p>
                    )}
                  </div>
                </Card>
              </motion.section>
            )}

            <motion.section variants={stagger.item}>
              <SectionTitle icon="💬" action={{ label: 'כל ההודעות', onClick: () => navigate('/notifications') }}>
                הודעות אחרונות
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
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-base shrink-0" aria-hidden="true">
                          📢
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-mid">{a.text}</p>
                          {a.createdAt && (
                            <p className="text-xs text-text-muted mt-0.5">
                              {formatHebrewDateShort(a.createdAt.toDate())}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.section>
          </div>

          {/* ── 5. Pending hosting matches ──────────────────────────────────── */}
          <motion.section variants={stagger.item} className="order-3 xl:order-none">
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

          </div>
        </motion.div>
      </div>
    </div>
  );
}
