import React, { useState } from 'react';
import { BedDouble, Users, Lock, Unlock, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Select, Input, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useEvents } from '@/hooks/useEvents';
import {
  useBookingsForEvent, useAllBookings, addBooking, cancelBooking,
  useLocks, useClosedEvents
} from '@/hooks/useBookings';
import { useFamilies } from '@/hooks/useFamilies';
import { useToast } from '@/components/ui/Toast';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { formatDateByMode } from '@/lib/dates';
import { ROOMS, SHABBAT_SEUDOT, HOLIDAY_SEUDOT, permanentOccupants, availableBeds } from '@/types';
import { setDoc, doc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { User } from 'firebase/auth';

interface RoomsProps {
  user: User | null;
  isAdmin: boolean;
}

export function Rooms({ user, isAdmin }: RoomsProps) {
  const { showToast } = useToast();
  const { data: events, loading: evLoading } = useEvents();
  const { data: families } = useFamilies();
  const locks = useLocks();
  const closedEventIds = useClosedEvents();
  const [calMode] = useCalendarMode();

  const upcomingEvents = events.filter(e => e.date?.toDate?.() >= new Date());
  const [selectedEventId, setSelectedEventId] = useState('');
  const eventId = selectedEventId || upcomingEvents[0]?.id || '';
  const event = events.find(e => e.id === eventId);
  const isClosed = closedEventIds.includes(eventId);
  const seudahOptions = event?.type === 'holiday' ? HOLIDAY_SEUDOT : SHABBAT_SEUDOT;

  const { bookings, loading: bkLoading } = useBookingsForEvent(eventId);
  const { bookings: allBookings } = useAllBookings();

  const [bookModal, setBookModal] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [form, setForm] = useState({
    familyId: '',
    familyName: '',
    adults: 2,
    kids: 0,
    notes: '',
    mealParticipation: [] as string[],
    isExternal: false,
    externalName: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const eventOptions = upcomingEvents.map(e => ({
    value: e.id,
    label: `${e.title} — ${formatDateByMode(e.date?.toDate?.() ?? null, calMode, 'short')}`,
  }));

  function openBook(roomId: string) {
    if ((isClosed && !isAdmin) || locks[roomId]) return;
    setSelectedRoomId(roomId);
    setForm({ familyId: '', familyName: '', adults: 2, kids: 0, notes: '', mealParticipation: [], isExternal: false, externalName: '' });
    setBookModal(true);
  }

  async function handleBook() {
    if (!eventId) return;
    const fname = form.isExternal ? form.externalName : form.familyName;
    if (!fname) { showToast('נא לבחור משפחה', 'error'); return; }
    if (bookings.find(b => b.roomId === selectedRoomId)) {
      showToast('החדר כבר מוזמן לאירוע זה', 'error'); return;
    }
    // Beds taken by permanent residents are not available for guests
    const room = ROOMS.find(r => r.id === selectedRoomId);
    if (room && form.adults > availableBeds(room)) {
      const occ = permanentOccupants(room.id).map(o => o.name).join(', ');
      showToast(`בחדר זה גר/ה ${occ} באופן קבוע — נותרו ${availableBeds(room)} מיטות לאורחים`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await addBooking({
        roomId: selectedRoomId,
        familyId: form.isExternal ? 'external' : form.familyId,
        familyName: fname,
        eventId,
        eventTitle: event?.title || '',
        adults: form.adults,
        kids: form.kids,
        notes: form.notes,
        mealParticipation: form.mealParticipation,
        isExternalGuest: form.isExternal,
      });
      showToast('ההזמנה נרשמה ✓');
      setBookModal(false);
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(bookingId: string) {
    try {
      await cancelBooking(bookingId);
      showToast('ההזמנה בוטלה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  async function toggleLock(roomId: string) {
    if (!isAdmin) return;
    const current = locks[roomId] || false;
    try {
      const allLocks = { ...locks, [roomId]: !current };
      await setDoc(doc(db, 'settings', 'locks'), allLocks);
    } catch {}
  }

  async function toggleClose() {
    if (!isAdmin || !eventId) return;
    try {
      const updated = isClosed
        ? closedEventIds.filter(id => id !== eventId)
        : [...closedEventIds, eventId];
      await setDoc(doc(db, 'settings', 'closedEvents'), { ids: updated });
      showToast(isClosed ? 'הזמנות נפתחו' : 'הזמנות נסגרו');
    } catch {}
  }

  const familyOptions = families.map(f => ({
    value: f.id,
    label: [f.husband, f.wife].filter(Boolean).join(' ו') || f.id,
  }));

  const selectedRoom = ROOMS.find(r => r.id === selectedRoomId);
  const selectedRoomOccupants = selectedRoom ? permanentOccupants(selectedRoom.id) : [];
  const selectedRoomBeds = selectedRoom ? availableBeds(selectedRoom) : 0;

  const toggleMeal = (meal: string) => {
    setForm(f => ({
      ...f,
      mealParticipation: f.mealParticipation.includes(meal)
        ? f.mealParticipation.filter(m => m !== meal)
        : [...f.mealParticipation, meal],
    }));
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">🛏 חדרים</h1>
          <p className="text-text-muted text-sm mt-0.5">הזמנת חדרי שינה לאירועים</p>
        </div>
        {isAdmin && eventId && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleClose}>
              {isClosed ? <><Unlock size={14} /> פתח הזמנות</> : <><Lock size={14} /> סגור הזמנות</>}
            </Button>
          </div>
        )}
      </div>

      {/* Event selector */}
      <Card className="mb-5">
        <Select
          label="בחר אירוע"
          options={eventOptions}
          value={eventId}
          onChange={e => setSelectedEventId(e.target.value)}
          placeholder="-- בחר אירוע --"
        />
        {isClosed && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 flex items-center gap-2">
            <Lock size={14} />
            ההזמנות לאירוע זה סגורות{isAdmin ? ' — ניתן לפתוח דרך כפתור ניהול' : ''}
          </div>
        )}
      </Card>

      {/* Rooms grid */}
      {bkLoading || evLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ROOMS.map(r => <SkeletonCard key={r.id} />)}
        </div>
      ) : !eventId ? (
        <EmptyState icon="📅" title="בחר אירוע כדי לצפות בחדרים" />
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
        >
          {ROOMS.map(room => {
            const booking = bookings.find(b => b.roomId === room.id);
            const isBooked = !!booking;
            const isLocked = locks[room.id];
            const isClickable = !isLocked && (!isClosed || isAdmin);

            return (
              <motion.div
                key={room.id}
                variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
              >
                <Card
                  hover={isClickable && !isBooked}
                  onClick={() => !isBooked && isClickable && openBook(room.id)}
                  className={
                    isBooked ? 'border-accent/60 bg-teal-50/40'
                    : isLocked ? 'border-amber-300 bg-amber-50/40 opacity-70'
                    : ''
                  }
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-card bg-primary/10 flex items-center justify-center text-2xl">
                      {room.icon}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleLock(room.id); }}
                        className="p-1.5 rounded-md hover:bg-surface-alt transition-colors text-text-muted"
                        aria-label={isLocked ? 'שחרר נעילה' : 'נעל חדר'}
                      >
                        {isLocked ? <Lock size={16} className="text-amber-600" /> : <Unlock size={16} />}
                      </button>
                    )}
                  </div>

                  <h3 className="font-bold text-primary text-base">{room.name}</h3>
                  <p className="text-text-muted text-sm mt-0.5">{room.cap}</p>
                  <p className="text-text-muted text-xs mt-0.5">{room.detail}</p>
                  {room.hasCrib && (
                    <p className="text-xs text-amber-600 mt-0.5">🍼 עריסה זמינה</p>
                  )}
                  {permanentOccupants(room.id).length > 0 && (
                    <p className="text-xs text-primary mt-0.5">
                      🏠 דייר/ת קבוע/ה: {permanentOccupants(room.id).map(o => o.name).join(', ')} · נותרו {availableBeds(room)} מיטות לאורחים
                    </p>
                  )}

                  <div className="mt-3">
                    {isLocked ? (
                      <Badge variant="warning"><Lock size={10} /> נעול</Badge>
                    ) : isBooked ? (
                      <div className="space-y-1">
                        <Badge variant="accent">
                          ✓ {booking.familyName}
                          {booking.isExternalGuest ? ' 👤' : ''}
                        </Badge>
                        {booking.mealParticipation?.length > 0 && (
                          <p className="text-xs text-text-muted">
                            🍽 {booking.mealParticipation.join(' · ')}
                          </p>
                        )}
                      </div>
                    ) : isClosed ? (
                      <Badge variant="error"><Lock size={10} /> סגור</Badge>
                    ) : (
                      <Badge variant="success">● פנוי</Badge>
                    )}
                  </div>

                  {isBooked && (
                    <div className="mt-3 pt-3 border-t border-border flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={e => { e.stopPropagation(); handleCancel(booking.id); }}
                        className="text-error border-error/40 hover:bg-red-50"
                      >
                        <X size={12} /> בטל הזמנה
                      </Button>
                      <div className="flex items-center gap-1 text-xs text-text-muted">
                        <Users size={12} />
                        {booking.adults} מבוגרים
                        {booking.kids > 0 && ` · ${booking.kids} ילדים`}
                      </div>
                    </div>
                  )}

                  {!isBooked && isClickable && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={e => { e.stopPropagation(); openBook(room.id); }}
                    >
                      <BedDouble size={14} /> הזמן חדר
                    </Button>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Booking summary */}
      {bookings.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle><Users size={16} className="text-accent" /> סיכום הזמנות</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {bookings.map(b => {
              const room = ROOMS.find(r => r.id === b.roomId);
              return (
                <div key={b.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-lg">{room?.icon || '🛏'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-base">{room?.name}</p>
                    <p className="text-xs text-text-muted">{b.familyName} · {b.adults} מבוגרים{b.kids > 0 ? ` · ${b.kids} ילדים` : ''}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Book modal */}
      <Modal
        open={bookModal}
        onClose={() => setBookModal(false)}
        title={`הזמנת ${ROOMS.find(r => r.id === selectedRoomId)?.name || 'חדר'}`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setBookModal(false)}>ביטול</Button>
            <Button onClick={handleBook} loading={submitting}>אשר הזמנה</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedRoomOccupants.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-text-mid">
              🏠 בחדר זה גר/ה באופן קבוע: <strong>{selectedRoomOccupants.map(o => o.name).join(', ')}</strong>
              <span className="text-text-muted"> · {selectedRoomBeds} מיטות פנויות לאורחים</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ext-guest"
              checked={form.isExternal}
              onChange={e => setForm(f => ({ ...f, isExternal: e.target.checked }))}
            />
            <label htmlFor="ext-guest" className="text-sm text-text-mid">אורח חיצוני (לא ממשפחות הרשומות)</label>
          </div>

          {form.isExternal ? (
            <Input
              label="שם האורח"
              value={form.externalName}
              onChange={e => setForm(f => ({ ...f, externalName: e.target.value }))}
              placeholder="שם האורח / המשפחה"
            />
          ) : (
            <Select
              label="משפחה"
              options={familyOptions}
              value={form.familyId}
              placeholder="-- בחר משפחה --"
              onChange={e => {
                const fam = families.find(f => f.id === e.target.value);
                setForm(f => ({
                  ...f,
                  familyId: e.target.value,
                  familyName: fam ? [fam.husband, fam.wife].filter(Boolean).join(' ו') : '',
                }));
              }}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="מבוגרים"
              type="number"
              min={1}
              max={selectedRoomBeds || 6}
              value={form.adults}
              onChange={e => setForm(f => ({ ...f, adults: Number(e.target.value) }))}
            />
            <Input
              label="ילדים"
              type="number"
              min={0}
              max={6}
              value={form.kids}
              onChange={e => setForm(f => ({ ...f, kids: Number(e.target.value) }))}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-mid mb-2 block">השתתפות בסעודות</label>
            <div className="flex flex-wrap gap-2">
              {seudahOptions.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMeal(m)}
                  className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                    form.mealParticipation.includes(m)
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface border-border text-text-mid hover:border-accent/50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <TextArea
            label="הערות"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="הערות נוספות..."
          />
        </div>
      </Modal>
    </div>
  );
}
