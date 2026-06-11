import React, { useState, useEffect } from 'react';
import { Key, Shield, Users, Send, Eye, EyeOff } from 'lucide-react';
import { AppLogo } from '@/components/ui/AppLogo';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { claimAdmin, approveUser } from '@/hooks/useAdmin';
import { useFamilies } from '@/hooks/useFamilies';
import { openWhatsApp } from '@/lib/utils';
import { formatGregorianDate, formatHebrewDate } from '@/lib/dates';
import { ALL_SEUDOT, AUTO_ATTENDEES, AUTO_ATTENDEES_COUNT } from '@/types';
import type { Seudah, SeudahRegistration } from '@/types';
import type { User } from 'firebase/auth';

const MOM_PHONE = '972545300361';

interface SettingsProps { user: User | null; isAdmin: boolean; }

export function Settings({ user, isAdmin }: SettingsProps) {
  const { showToast } = useToast();
  const { data: families } = useFamilies();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<{ uid: string; email: string; name: string }[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists()) setApiKey(snap.data().anthropicApiKey || '');
    });
    getDoc(doc(db, 'settings', 'pendingUsers')).then(snap => {
      if (snap.exists()) setPendingUsers(snap.data().list || []);
    });
  }, [isAdmin]);

  async function saveApiKey() {
    try {
      await setDoc(doc(db, 'settings', 'config'), { anthropicApiKey: apiKey }, { merge: true });
      showToast('מפתח ה-API נשמר ✓');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
  }

  async function handleClaimAdmin() {
    if (!user) return;
    try {
      await claimAdmin(user.uid);
      showToast('הפכת למנהל ✓');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
  }

  async function handleApprove(uid: string, email: string) {
    try {
      await approveUser(uid, email);
      setPendingUsers(prev => prev.filter(u => u.uid !== uid));
      showToast('המשתמש אושר ✓');
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
  }

  async function generateWhatsAppReport() {
    setLoadingReport(true);
    try {
      // Gather all data for the report
      const evSnap = await getDocs(collection(db, 'events'));
      const bkSnap = await getDocs(collection(db, 'bookings'));
      const seudotSnap = await getDocs(collection(db, 'seudot'));
      const regSnap = await getDocs(collection(db, 'seudahRegistrations'));

      const now = new Date();
      const upcoming = evSnap.docs
        .map(d => d.data())
        .filter(e => e.date?.toDate?.() >= now)
        .slice(0, 3);

      let msg = '📋 *דו"ח שבועי — משפחת שטיינברג*\n\n';

      if (upcoming.length > 0) {
        msg += '📅 *אירועים קרובים:*\n';
        upcoming.forEach(ev => {
          const d = ev.date?.toDate?.();
          msg += `• ${ev.title} — ${d ? `${formatGregorianDate(d, 'numeric')} (${formatHebrewDate(d)})` : ''}\n`;
        });
        msg += '\n';
      }

      const bookings = bkSnap.docs.map(d => d.data());
      if (bookings.length > 0) {
        const nextEvId = upcoming[0]?.id || '';
        const nextBookings = nextEvId ? bookings.filter(b => b.eventId === nextEvId) : bookings.slice(0, 4);
        if (nextBookings.length > 0) {
          msg += '🛏 *חדרים מוזמנים:*\n';
          nextBookings.forEach(b => {
            msg += `• ${b.familyName} — ${b.roomId}\n`;
          });
          msg += '\n';
        }
      }

      // Seudot — Shabbat/holiday events are client-generated (not in Firestore),
      // so resolve each seudah's event date from its eventId (shabbat-YYYY-MM-DD)
      // or, for manual events, from the events collection.
      const seudahEventDate = (eventId: string): Date | null => {
        const m = eventId?.match(/(\d{4}-\d{2}-\d{2})$/);
        if (m) return new Date(`${m[1]}T23:59:59`);
        const ev = evSnap.docs.find(d => d.id === eventId)?.data();
        return ev?.date?.toDate?.() ?? null;
      };
      const regs = regSnap.docs.map(d => ({ id: d.id, ...d.data() } as SeudahRegistration));
      const upcomingSeudot = seudotSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as Seudah))
        .map(s => ({ ...s, eventDate: seudahEventDate(s.eventId) }))
        .filter(s => s.eventDate && s.eventDate >= now)
        .sort((a, b) => (a.eventDate as Date).getTime() - (b.eventDate as Date).getTime());

      if (upcomingSeudot.length > 0) {
        // Report the nearest Shabbat/holiday that has seudot
        const nextSeudotEventId = upcomingSeudot[0].eventId;
        const eventSeudot = upcomingSeudot
          .filter(s => s.eventId === nextSeudotEventId)
          .sort((a, b) => ALL_SEUDOT.indexOf(a.type) - ALL_SEUDOT.indexOf(b.type));
        msg += `🍽 *סעודות — ${upcomingSeudot[0].eventTitle}:*\n`;
        eventSeudot.forEach(s => {
          const sRegs = regs.filter(r => r.seudahId === s.id);
          // Household residents + permanent guests are always at the table
          const diners = AUTO_ATTENDEES_COUNT + sRegs.reduce((sum, r) => sum + (r.diners || 0), 0);
          msg += `• ${s.type} — ${diners} סועדים\n`;
          sRegs.forEach(r => {
            msg += `   - משפחת ${r.familyName} (${r.diners})${r.bringing ? ` · מביאים: ${r.bringing}` : ''}\n`;
          });
        });
        msg += `_כולל ${AUTO_ATTENDEES_COUNT} קבועים: ${AUTO_ATTENDEES.map(p => p.name).join(', ')}_\n`;
      }

      openWhatsApp(MOM_PHONE, msg);
      showToast('פתיחת WhatsApp...');
    } catch (e: unknown) {
      showToast((e as Error).message, 'error');
    } finally {
      setLoadingReport(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">⚙ הגדרות</h1>
        <p className="text-text-muted text-sm mt-0.5">ניהול ועדכוני מערכת</p>
      </div>

      <div className="space-y-5">
        {/* Report */}
        <Card>
          <CardHeader>
            <CardTitle><Send size={18} className="text-success" /> דוח שבועי</CardTitle>
          </CardHeader>
          <p className="text-sm text-text-muted mb-4">שלח דו"ח שבועי לאמא בוואטסאפ עם סיכום כל האירועים, ההזמנות והאוכל.</p>
          <Button variant="success" onClick={generateWhatsAppReport} loading={loadingReport}>
            <Send size={16} /> שלח דוח לאמא 📱
          </Button>
        </Card>

        {/* Admin claim */}
        {!isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle><Shield size={18} className="text-primary" /> הרשאות מנהל</CardTitle>
            </CardHeader>
            <p className="text-sm text-text-muted mb-4">אם אתה חבר משפחה מאושר, תוכל לתבוע הרשאות מנהל.</p>
            <Button variant="secondary" onClick={handleClaimAdmin}>
              <Shield size={16} /> תבע הרשאות מנהל
            </Button>
          </Card>
        )}

        {/* API key - admin only */}
        {isAdmin && (
          <>
            <Card>
              <CardHeader>
                <CardTitle><Key size={18} className="text-primary" /> מפתח Anthropic API</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    label="מפתח API"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute left-3 top-9 text-text-muted hover:text-text-base"
                    aria-label={showKey ? 'הסתר' : 'הצג'}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Button onClick={saveApiKey} size="sm">שמור מפתח</Button>
              </div>
            </Card>

            {/* Pending users */}
            {pendingUsers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle><Users size={18} className="text-warning" /> משתמשים ממתינים ({pendingUsers.length})</CardTitle>
                </CardHeader>
                <div className="space-y-2">
                  {pendingUsers.map(u => (
                    <div key={u.uid} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-text-base">{u.name || u.email}</p>
                        <p className="text-xs text-text-muted">{u.email}</p>
                      </div>
                      <Button size="sm" onClick={() => handleApprove(u.uid, u.email)}>
                        אשר
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}

        {/* About Shteinberg App */}
        <Card>
          <div className="flex flex-col items-center py-2 gap-4">
            <AppLogo variant="full" iconSize={72} />
            <div className="text-center">
              <p className="text-xs text-text-muted">
                Shteinberg App – The Digital Home of the Shteinberg Family
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Family OS · כרמיאל · v2.0
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Powered by Firebase + React
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
