import React, { useState, useEffect } from 'react';
import { Key, Send, Eye, EyeOff } from 'lucide-react';
import { AppLogo } from '@/components/ui/AppLogo';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useFamilies } from '@/hooks/useFamilies';
import { useEvents } from '@/hooks/useEvents';
import { getActiveOrNextJewishEvent, isActiveOrUpcoming } from '@/lib/jewishEvents';
import { openWhatsApp } from '@/lib/utils';
import { formatGregorianDate, formatHebrewDate } from '@/lib/dates';
import { seudotForEvent, AUTO_ATTENDEES, AUTO_ATTENDEES_COUNT } from '@/types';
import type { AppEvent, Seudah, SeudahRegistration } from '@/types';
import type { User } from 'firebase/auth';

interface SettingsProps { user: User | null; isAdmin: boolean; }

export function Settings({ user, isAdmin }: SettingsProps) {
  const { showToast } = useToast();
  const { data: families } = useFamilies();
  const { data: events } = useEvents();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  // The weekly roster report is sent to a single recipient (e.g. mom's WhatsApp).
  // The number lives in admin-only settings/config so it never ships in the
  // public client bundle. Editable below by admins.
  const [reportPhone, setReportPhone] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);

  useEffect(() => {
    // settings/config is admin-only at the rules layer (it holds secrets).
    if (!isAdmin) return;
    getDoc(doc(db, 'settings', 'config')).then(snap => {
      if (snap.exists()) {
        setApiKey(snap.data().anthropicApiKey || '');
        setReportPhone(snap.data().reportPhone || '');
      }
    });
  }, [isAdmin]);

  async function saveApiKey() {
    try {
      await setDoc(
        doc(db, 'settings', 'config'),
        { anthropicApiKey: apiKey, reportPhone },
        { merge: true }
      );
      showToast('ההגדרות נשמרו ✓');
    } catch { showToast('שמירת ההגדרות נכשלה', 'error'); }
  }

  async function generateWhatsAppReport() {
    if (!reportPhone) {
      showToast('יש להגדיר מספר יעד לדו"ח בהגדרות המנהל', 'error');
      return;
    }
    setLoadingReport(true);
    try {
      // Gather all data for the report
      const evSnap = await getDocs(collection(db, 'events'));
      const bkSnap = await getDocs(collection(db, 'bookings'));
      const seudotSnap = await getDocs(collection(db, 'seudot'));
      const regSnap = await getDocs(collection(db, 'seudahRegistrations'));

      const now = new Date();
      // Active-or-next Shabbat/holiday by halachic time (Jerusalem) — the same
      // resolver the home screen uses, so the report never reports an event
      // that has already ended.
      const nextEvent = getActiveOrNextJewishEvent(events, now)?.event;
      const upcoming = evSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as AppEvent))
        .filter(e => isActiveOrUpcoming(e, now))
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
        const nextEvId = nextEvent?.id || upcoming[0]?.id || '';
        const nextBookings = nextEvId ? bookings.filter(b => b.eventId === nextEvId) : bookings.slice(0, 4);
        if (nextBookings.length > 0) {
          msg += '🛏 *חדרים מוזמנים:*\n';
          nextBookings.forEach(b => {
            msg += `• ${b.familyName} — ${b.roomId}\n`;
          });
          msg += '\n';
        }
      }

      // Seudot — every Shabbat/holiday has its seudot by default (synthesized
      // client-side from the generated events), with families joining them. Pull
      // the nearest upcoming Shabbat/holiday and merge any stored seudot docs.
      const fsSeudot = seudotSnap.docs.map(d => ({ id: d.id, ...d.data() } as Seudah));
      const regs = regSnap.docs.map(d => ({ id: d.id, ...d.data() } as SeudahRegistration));

      if (nextEvent) {
        const eventSeudot = seudotForEvent(nextEvent, fsSeudot);
        msg += `🍽 *סעודות — ${nextEvent.title}:*\n`;
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

      openWhatsApp(reportPhone, msg);
      showToast('פתיחת WhatsApp...');
    } catch {
      showToast('יצירת הדו"ח נכשלה', 'error');
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
        {/* Report — admin only (sends the full family roster to the configured number) */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle><Send size={18} className="text-success" /> דוח שבועי</CardTitle>
            </CardHeader>
            <p className="text-sm text-text-muted mb-4">שלח דו"ח שבועי בוואטסאפ עם סיכום כל האירועים, ההזמנות והאוכל.</p>
            <Button variant="success" onClick={generateWhatsAppReport} loading={loadingReport}>
              <Send size={16} /> שלח דוח 📱
            </Button>
          </Card>
        )}

        {/* Admin config: API key + report recipient — admin only */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle><Key size={18} className="text-primary" /> הגדרות מנהל</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div className="relative">
                <Input
                  label="מפתח Anthropic API"
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
              <Input
                label={'מספר יעד לדו"ח (WhatsApp)'}
                type="tel"
                value={reportPhone}
                onChange={e => setReportPhone(e.target.value)}
                placeholder="972500000000"
              />
              <Button onClick={saveApiKey} size="sm">שמור הגדרות</Button>
            </div>
          </Card>
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
