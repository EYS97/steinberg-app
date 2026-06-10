import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, BedDouble, UtensilsCrossed, Heart, ChevronLeft, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEvents } from '@/hooks/useEvents';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useAllBookings } from '@/hooks/useBookings';
import { useHosting } from '@/hooks/useHosting';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { ROOMS } from '@/types';
import { formatDateShort, daysUntil, relativeDate } from '@/lib/utils';
import type { User } from 'firebase/auth';

interface HomeProps {
  user: User | null;
  isAdmin: boolean;
}

const stagger = {
  container: { animate: { transition: { staggerChildren: 0.07 } } },
  item: { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } },
};

export function Home({ user, isAdmin }: HomeProps) {
  const navigate = useNavigate();
  const firstName = user?.displayName?.split(' ')[0] || '';
  const { data: events, loading: evLoading } = useEvents();
  const { data: birthdays } = useBirthdays();
  const { bookings } = useAllBookings();
  const { availability, requests } = useHosting();
  const { data: announcements } = useAnnouncements();

  const now = new Date();

  // Upcoming events (next 30 days)
  const upcomingEvents = useMemo(() => {
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return events
      .filter(e => {
        const d = e.date?.toDate?.();
        return d && d >= now && d <= in30;
      })
      .slice(0, 4);
  }, [events]);

  // Next event
  const nextEvent = upcomingEvents[0];

  // Room availability for next event
  const nextEventBookings = useMemo(() => {
    if (!nextEvent) return [];
    return bookings.filter(b => b.eventId === nextEvent.id);
  }, [bookings, nextEvent]);

  // Upcoming birthdays
  const upcomingBdays = useMemo(() => {
    return birthdays
      .map(b => ({ ...b, days: daysUntil(b.date) }))
      .filter(b => b.days <= 30)
      .sort((a, b) => a.days - b.days)
      .slice(0, 3);
  }, [birthdays]);

  // Open hosting
  const openHosting = availability.filter(h => h.status === 'available').slice(0, 3);

  // Pending requests as host
  const myFamilyId = user?.uid;
  const incomingRequests = requests.filter(r => {
    const av = availability.find(h => h.id === r.availabilityId);
    return av?.createdBy === myFamilyId && r.status === 'pending';
  }).length;

  // Active announcements
  const activeAnnouncements = announcements.filter(a => {
    if (!a.expiresAt) return true;
    return a.expiresAt.toDate() > now;
  }).slice(0, 2);

  const eventTypeIcon: Record<string, string> = {
    shabbat: '🕯',
    holiday: '✨',
    event:   '🎉',
    memorial:'🕯',
    meal:    '🍽',
    hosting: '🏡',
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">
          שלום {firstName} 👋
        </h1>
        <p className="text-text-muted mt-1 text-sm">
          {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </motion.div>

      {/* Announcements banner */}
      {activeAnnouncements.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 space-y-2"
        >
          {activeAnnouncements.map(a => (
            <div
              key={a.id}
              className="bg-amber-50 border border-amber-200 rounded-card p-4 flex gap-3 items-start"
            >
              <span className="text-xl shrink-0">📢</span>
              <p className="text-sm text-text-mid">{a.text}</p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Incoming requests badge */}
      {incomingRequests > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-5 bg-accent/10 border border-accent/30 rounded-card p-4 flex items-center gap-3 cursor-pointer"
          onClick={() => navigate('/hosting')}
        >
          <span className="text-2xl">🙏</span>
          <div className="flex-1">
            <p className="font-semibold text-accent text-sm">{incomingRequests} בקשות אירוח ממתינות לאישורך</p>
            <p className="text-xs text-text-muted">לחץ לצפייה ואישור</p>
          </div>
          <ChevronLeft className="text-accent" size={18} />
        </motion.div>
      )}

      <motion.div
        variants={stagger.container}
        initial="initial"
        animate="animate"
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        {/* Upcoming Events */}
        <motion.div variants={stagger.item}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Calendar size={18} className="text-accent" />
                אירועים קרובים
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/calendar')}>
                הכל
              </Button>
            </CardHeader>
            {evLoading ? (
              <SkeletonCard />
            ) : upcomingEvents.length === 0 ? (
              <EmptyState icon="📅" title="אין אירועים קרובים" withWatermark />
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(ev => {
                  const d = ev.date?.toDate?.();
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-3 p-3 bg-surface-alt rounded-md cursor-pointer hover:bg-border/40 transition-colors"
                      onClick={() => navigate('/calendar')}
                    >
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-lg shrink-0">
                        {eventTypeIcon[ev.type] || '📌'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-text-base truncate">{ev.title}</p>
                        <p className="text-xs text-text-muted">{d ? relativeDate(d) : ''}</p>
                      </div>
                      {d && (
                        <span className="text-xs text-text-muted shrink-0">{formatDateShort(d)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Room Availability */}
        <motion.div variants={stagger.item}>
          <Card>
            <CardHeader>
              <CardTitle>
                <BedDouble size={18} className="text-accent" />
                {nextEvent ? `חדרים — ${nextEvent.title}` : 'חדרים'}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/rooms')}>
                הזמן
              </Button>
            </CardHeader>
            <div className="grid grid-cols-2 gap-2">
              {ROOMS.map(room => {
                const booking = nextEventBookings.find(b => b.roomId === room.id);
                return (
                  <div
                    key={room.id}
                    className="p-3 rounded-md border cursor-pointer hover:border-accent/50 transition-all"
                    style={{
                      background: booking ? 'var(--surface-alt)' : 'var(--surface)',
                      borderColor: booking ? '#0EA5A4' : 'var(--border)',
                    }}
                    onClick={() => navigate('/rooms')}
                  >
                    <div className="text-lg mb-1">{room.icon}</div>
                    <p className="text-xs font-semibold text-text-base leading-tight">{room.name}</p>
                    <p className="text-xs text-text-muted mt-0.5">{room.cap}</p>
                    <Badge
                      variant={booking ? 'accent' : 'success'}
                      className="mt-1.5 text-[10px]"
                    >
                      {booking ? `✓ ${booking.familyName}` : '● פנוי'}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Upcoming Birthdays */}
        {upcomingBdays.length > 0 && (
          <motion.div variants={stagger.item}>
            <Card>
              <CardHeader>
                <CardTitle>
                  <Heart size={18} className="text-error" />
                  ימי הולדת קרובים
                </CardTitle>
              </CardHeader>
              <div className="space-y-3">
                {upcomingBdays.map(b => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg shrink-0">
                      🎂
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-base">{b.name}</p>
                      <p className="text-xs text-text-muted">
                        {b.days === 0 ? '🎉 היום!' : b.days === 1 ? 'מחר' : `בעוד ${b.days} ימים`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Open Hosting */}
        <motion.div variants={stagger.item}>
          <Card>
            <CardHeader>
              <CardTitle>
                <Users size={18} className="text-accent" />
                הזדמנויות אירוח
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/hosting')}>
                כל האירוחים
              </Button>
            </CardHeader>
            {openHosting.length === 0 ? (
              <EmptyState
                icon="🏡"
                title="אין אירוחים פתוחים"
                description="היה הראשון לאחסן!"
                action={{ label: 'הצע אירוח', onClick: () => navigate('/hosting') }}
                withWatermark
              />
            ) : (
              <div className="space-y-2">
                {openHosting.map(h => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 p-3 bg-surface-alt rounded-md cursor-pointer hover:bg-border/40 transition-colors"
                    onClick={() => navigate('/hosting')}
                  >
                    <span className="text-xl">🏡</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-base truncate">{h.familyName}</p>
                      <p className="text-xs text-text-muted">{h.city} · {h.eventTitle}</p>
                    </div>
                    <Badge variant="success">פתוח</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { icon: '🛏', label: 'הזמן חדר', path: '/rooms', color: '#8B5E3C' },
          { icon: '🍲', label: 'הוסף מנה', path: '/meals', color: '#0EA5A4' },
          { icon: '🏡', label: 'הצע אירוח', path: '/hosting', color: '#22C55E' },
          { icon: '📅', label: 'הוסף אירוע', path: '/calendar', color: '#F59E0B' },
        ].map(qa => (
          <button
            key={qa.path}
            onClick={() => navigate(qa.path)}
            className="flex flex-col items-center gap-2 p-4 bg-surface rounded-card border border-border hover:border-accent/40 hover:shadow-card transition-all cursor-pointer"
          >
            <span className="text-2xl">{qa.icon}</span>
            <span className="text-xs font-medium text-text-mid">{qa.label}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}
