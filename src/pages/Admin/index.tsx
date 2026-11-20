import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ShieldCheck, Users, Lock, Unlock, UserPlus, X, ClipboardList } from 'lucide-react';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { AdminTabs } from './AdminTabs';
import { FamilyLifecycleAdmin } from './FamilyLifecycle';
import { claimAdmin, revokeAdmin, approveUser } from '@/hooks/useAdmin';
import { useEvents } from '@/hooks/useEvents';
import { useClosedEvents } from '@/hooks/useBookings';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { formatDateByMode } from '@/lib/dates';
import type { User } from 'firebase/auth';

interface AdminProps { user: User | null; isAdmin: boolean; }

interface PendingUser { uid: string; email: string; name: string; ts?: string; }
interface ActiveUser { uid: string; email: string; name: string; lastSeen?: { toDate?: () => Date }; }

export function Admin({ user, isAdmin }: AdminProps) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { data: events } = useEvents();
  const closedEventIds = useClosedEvents();
  const [calMode] = useCalendarMode();

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [grantUid, setGrantUid] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<ActiveUser | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    getDoc(doc(db, 'settings', 'pendingUsers')).then(snap => {
      if (snap.exists()) setPendingUsers(snap.data().list || []);
    });
    getDocs(collection(db, 'userActivity')).then(snap => {
      setActiveUsers(snap.docs.map(d => d.data() as ActiveUser));
    });
    const unsub = onSnapshot(doc(db, 'settings', 'admins'), snap => {
      setAdminUids(snap.exists() ? (snap.data().uids || []) : []);
    });
    return unsub;
  }, [isAdmin]);

  const userByUid = useMemo(() => {
    const map = new Map<string, ActiveUser>();
    activeUsers.forEach(u => map.set(u.uid, u));
    return map;
  }, [activeUsers]);

  const grantCandidates = useMemo(
    () => activeUsers
      .filter(u => !adminUids.includes(u.uid))
      .map(u => ({ value: u.uid, label: u.name || u.email || u.uid })),
    [activeUsers, adminUids]
  );

  const upcomingEvents = useMemo(
    () => events.filter(e => e.date?.toDate?.() >= new Date()).slice(0, 8),
    [events]
  );

  async function handleClaimAdmin() {
    if (!user) return;
    setBusy(true);
    try {
      await claimAdmin(user.uid);
      showToast('הפכת למנהל ✓');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function handleApprove(p: PendingUser) {
    try {
      await approveUser(p.uid, p.email);
      const updated = pendingUsers.filter(u => u.uid !== p.uid);
      await setDoc(doc(db, 'settings', 'pendingUsers'), { list: updated });
      setPendingUsers(updated);
      showToast('המשתמש אושר ✓');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
  }

  async function handleReject(p: PendingUser) {
    try {
      const updated = pendingUsers.filter(u => u.uid !== p.uid);
      await setDoc(doc(db, 'settings', 'pendingUsers'), { list: updated });
      setPendingUsers(updated);
      showToast('הבקשה הוסרה');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
  }

  async function handleGrant() {
    if (!grantUid) { showToast('נא לבחור משתמש', 'error'); return; }
    setBusy(true);
    try {
      await claimAdmin(grantUid);
      setGrantUid('');
      showToast('הרשאות מנהל הוענקו ✓');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await revokeAdmin(revokeTarget.uid);
      showToast('הרשאות המנהל הוסרו');
      setRevokeTarget(null);
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  async function toggleEventClosed(eventId: string) {
    const isClosed = closedEventIds.includes(eventId);
    try {
      const updated = isClosed
        ? closedEventIds.filter(id => id !== eventId)
        : [...closedEventIds, eventId];
      await setDoc(doc(db, 'settings', 'closedEvents'), { ids: updated });
      showToast(isClosed ? 'הזמנות נפתחו' : 'הזמנות נסגרו');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
  }

  // Non-admins reaching /admin can claim admin here (open by design)
  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-primary">🛡 ניהול</h1>
          <p className="text-text-muted text-sm mt-0.5">אזור זה מיועד למנהלי המערכת</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle><Shield size={18} className="text-primary" /> הרשאות מנהל</CardTitle>
          </CardHeader>
          <p className="text-sm text-text-muted mb-4">אם אתה חבר משפחה מאושר, תוכל לתבוע הרשאות מנהל.</p>
          <Button variant="secondary" onClick={handleClaimAdmin} loading={busy}>
            <Shield size={16} /> תבע הרשאות מנהל
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">🛡 ניהול</h1>
        <p className="text-text-muted text-sm mt-0.5">אישור משתמשים, הרשאות מנהל וסגירת הזמנות</p>
      </div>

      <AdminTabs />

      <div className="space-y-5">
        {/* Shabbat / Holiday summary report */}
        <Card>
          <CardHeader>
            <CardTitle><ClipboardList size={18} className="text-accent" /> דוח שבת / חג</CardTitle>
          </CardHeader>
          <p className="text-sm text-text-muted mb-4">
            סיכום מרוכז להכנת האירוח — נרות, סעודות, לינה ומי מביא מה. מתאים להדפסה.
          </p>
          <Button onClick={() => navigate('/report')}>
            <ClipboardList size={16} /> פתח דוח שבת / חג
          </Button>
        </Card>

        {/* Weddings & new family members (lifecycle records) */}
        <FamilyLifecycleAdmin user={user} />

        {/* Pending users */}
        <Card>
          <CardHeader>
            <CardTitle>
              <Users size={18} className="text-warning" /> משתמשים ממתינים
              {pendingUsers.length > 0 && <Badge variant="warning">{pendingUsers.length}</Badge>}
            </CardTitle>
          </CardHeader>
          {pendingUsers.length === 0 ? (
            <p className="text-sm text-text-muted">אין משתמשים הממתינים לאישור 🎉</p>
          ) : (
            <div className="space-y-2">
              {pendingUsers.map(p => (
                <div key={p.uid} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text-base truncate">{p.name || p.email}</p>
                    <p className="text-xs text-text-muted truncate">{p.email}</p>
                  </div>
                  <Button size="sm" onClick={() => handleApprove(p)}>אשר</Button>
                  <Button size="sm" variant="ghost" onClick={() => handleReject(p)} aria-label="דחה">
                    <X size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Admins */}
        <Card>
          <CardHeader>
            <CardTitle><ShieldCheck size={18} className="text-accent" /> מנהלים ({adminUids.length})</CardTitle>
          </CardHeader>
          <div className="space-y-2 mb-4">
            {adminUids.map(uid => {
              const u = userByUid.get(uid);
              const isMe = uid === user?.uid;
              return (
                <div key={uid} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text-base truncate">
                      {u?.name || u?.email || uid}
                      {isMe && <span className="text-xs text-accent font-normal mr-2">(אתה)</span>}
                    </p>
                    {u?.email && <p className="text-xs text-text-muted truncate">{u.email}</p>}
                  </div>
                  {!isMe && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRevokeTarget(u || { uid, email: '', name: uid })}
                      aria-label="הסר הרשאות מנהל"
                    >
                      <X size={14} /> הסר
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="הוסף מנהל"
                value={grantUid}
                onChange={e => setGrantUid(e.target.value)}
                options={grantCandidates}
                placeholder="בחר משתמש..."
              />
            </div>
            <Button onClick={handleGrant} loading={busy} disabled={!grantUid}>
              <UserPlus size={16} /> הוסף
            </Button>
          </div>
          {grantCandidates.length === 0 && (
            <p className="text-xs text-text-muted mt-2">כל המשתמשים הפעילים כבר מנהלים.</p>
          )}
        </Card>

        {/* Bookings open/close */}
        <Card>
          <CardHeader>
            <CardTitle><Lock size={18} className="text-primary" /> פתיחה וסגירה של הזמנות</CardTitle>
          </CardHeader>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-text-muted">אין אירועים קרובים.</p>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map(ev => {
                const isClosed = closedEventIds.includes(ev.id);
                return (
                  <div key={ev.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-text-base truncate">{ev.title}</p>
                      <p className="text-xs text-text-muted">
                        {formatDateByMode(ev.date?.toDate?.() ?? null, calMode, 'short')}
                      </p>
                    </div>
                    {isClosed && <Badge variant="error"><Lock size={10} /> סגור</Badge>}
                    <Button
                      size="sm"
                      variant={isClosed ? 'success' : 'outline'}
                      onClick={() => toggleEventClosed(ev.id)}
                    >
                      {isClosed ? <><Unlock size={14} /> פתח</> : <><Lock size={14} /> סגור</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Revoke confirmation */}
      <Modal
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="הסרת הרשאות מנהל"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-mid">
            להסיר את הרשאות המנהל של <strong>{revokeTarget?.name || revokeTarget?.email}</strong>?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>ביטול</Button>
            <Button variant="danger" onClick={handleRevoke} loading={busy}>הסר הרשאות</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
