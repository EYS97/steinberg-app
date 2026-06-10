import React, { useState } from 'react';
import { Plus, Trash2, Send, Bell, FileText } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBirthdays } from '@/hooks/useBirthdays';
import { useMemorials } from '@/hooks/useMemorials';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useToast } from '@/components/ui/Toast';
import { daysUntil } from '@/lib/utils';
import type { User } from 'firebase/auth';

interface NotificationsProps { user: User | null; isAdmin: boolean; }

export function Notifications({ user, isAdmin }: NotificationsProps) {
  const { showToast } = useToast();
  const { data: birthdays } = useBirthdays();
  const { data: memorials } = useMemorials();
  const { data: announcements } = useAnnouncements();

  const [addBday, setAddBday] = useState(false);
  const [addMem, setAddMem] = useState(false);
  const [addAnn, setAddAnn] = useState(false);
  const [bdayForm, setBdayForm] = useState({ name: '', date: '', notes: '' });
  const [memForm,  setMemForm]  = useState({ name: '', date: '', notes: '' });
  const [annForm,  setAnnForm]  = useState({ text: '', expiresDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const now = new Date();
  const upcomingBdays = birthdays
    .map(b => ({ ...b, days: daysUntil(b.date) }))
    .filter(b => b.days <= 60)
    .sort((a, b) => a.days - b.days);

  const upcomingMems = memorials
    .map(m => ({ ...m, days: daysUntil(m.date) }))
    .filter(m => m.days <= 90)
    .sort((a, b) => a.days - b.days);

  const activeAnns = announcements.filter(a => {
    if (!a.expiresAt) return true;
    return a.expiresAt.toDate() > now;
  });

  async function saveBirthday() {
    if (!bdayForm.name || !bdayForm.date) { showToast('נא למלא שם ותאריך', 'error'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'birthdays'), { ...bdayForm, createdAt: serverTimestamp() });
      showToast('יום ההולדת נוסף ✓');
      setAddBday(false);
      setBdayForm({ name: '', date: '', notes: '' });
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setSubmitting(false); }
  }

  async function saveMemorial() {
    if (!memForm.name || !memForm.date) { showToast('נא למלא שם ותאריך', 'error'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'memorials'), { ...memForm, createdAt: serverTimestamp() });
      showToast('יום הזיכרון נוסף ✓');
      setAddMem(false);
      setMemForm({ name: '', date: '', notes: '' });
    } catch (e: unknown) { showToast((e as Error).message, 'error'); }
    finally { setSubmitting(false); }
  }

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

  async function deleteBirthday(id: string) {
    await deleteDoc(doc(db, 'birthdays', id));
    showToast('נמחק');
  }

  async function deleteMemorial(id: string) {
    await deleteDoc(doc(db, 'memorials', id));
    showToast('נמחק');
  }

  async function deleteAnnouncement(id: string) {
    await deleteDoc(doc(db, 'announcements', id));
    showToast('נמחקה');
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">🔔 התראות ותאריכים</h1>
        <p className="text-text-muted text-sm mt-0.5">ימי הולדת, ימי זיכרון והודעות</p>
      </div>

      <div className="space-y-5">
        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle><Bell size={18} className="text-accent" /> הודעות משפחתיות</CardTitle>
            {isAdmin && (
              <Button size="sm" onClick={() => setAddAnn(true)}>
                <Plus size={14} /> הוסף
              </Button>
            )}
          </CardHeader>
          {activeAnns.length === 0 ? (
            <EmptyState icon="📢" title="אין הודעות פעילות" />
          ) : (
            <div className="space-y-2">
              {activeAnns.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <span className="text-lg shrink-0">📢</span>
                  <p className="flex-1 text-sm text-text-mid">{a.text}</p>
                  {isAdmin && (
                    <button onClick={() => deleteAnnouncement(a.id)} className="text-text-muted hover:text-error">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Birthdays */}
        <Card>
          <CardHeader>
            <CardTitle>🎂 ימי הולדת</CardTitle>
            <Button size="sm" onClick={() => setAddBday(true)}>
              <Plus size={14} /> הוסף
            </Button>
          </CardHeader>
          {upcomingBdays.length === 0 ? (
            <EmptyState icon="🎂" title="אין ימי הולדת קרובים ב-60 יום" />
          ) : (
            <div className="space-y-2">
              {upcomingBdays.map(b => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-0"
                >
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg shrink-0">
                    🎂
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text-base">{b.name}</p>
                    {b.notes && <p className="text-xs text-text-muted">{b.notes}</p>}
                  </div>
                  <Badge variant={b.days <= 7 ? 'error' : b.days <= 14 ? 'warning' : 'default'}>
                    {b.days === 0 ? '🎉 היום!' : b.days === 1 ? 'מחר' : `בעוד ${b.days} ימים`}
                  </Badge>
                  {isAdmin && (
                    <button onClick={() => deleteBirthday(b.id)} className="text-text-muted hover:text-error">
                      <Trash2 size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        {/* Memorials */}
        <Card>
          <CardHeader>
            <CardTitle>🕯 ימי זיכרון</CardTitle>
            <Button size="sm" onClick={() => setAddMem(true)}>
              <Plus size={14} /> הוסף
            </Button>
          </CardHeader>
          {upcomingMems.length === 0 ? (
            <EmptyState icon="🕯" title="אין ימי זיכרון קרובים ב-90 יום" />
          ) : (
            <div className="space-y-2">
              {upcomingMems.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
                  <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-lg shrink-0">
                    🕯
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-text-base">{m.name}</p>
                    {m.notes && <p className="text-xs text-text-muted">{m.notes}</p>}
                  </div>
                  <Badge variant="memorial">
                    {m.days === 0 ? 'היום' : m.days === 1 ? 'מחר' : `בעוד ${m.days} ימים`}
                  </Badge>
                  {isAdmin && (
                    <button onClick={() => deleteMemorial(m.id)} className="text-text-muted hover:text-error">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Modals */}
      <Modal open={addBday} onClose={() => setAddBday(false)} title="הוסף יום הולדת"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddBday(false)}>ביטול</Button><Button onClick={saveBirthday} loading={submitting}>הוסף</Button></div>}>
        <div className="space-y-3">
          <Input label="שם" value={bdayForm.name} onChange={e => setBdayForm(f => ({ ...f, name: e.target.value }))} placeholder="שם מלא" />
          <Input label="תאריך (MM-DD)" value={bdayForm.date} onChange={e => setBdayForm(f => ({ ...f, date: e.target.value }))} placeholder="למשל 03-14" />
          <Input label="הערות" value={bdayForm.notes} onChange={e => setBdayForm(f => ({ ...f, notes: e.target.value }))} placeholder="אופציונלי" />
        </div>
      </Modal>

      <Modal open={addMem} onClose={() => setAddMem(false)} title="הוסף יום זיכרון"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddMem(false)}>ביטול</Button><Button onClick={saveMemorial} loading={submitting}>הוסף</Button></div>}>
        <div className="space-y-3">
          <Input label="שם" value={memForm.name} onChange={e => setMemForm(f => ({ ...f, name: e.target.value }))} placeholder="שם המנוח/ה" />
          <Input label="תאריך (MM-DD)" value={memForm.date} onChange={e => setMemForm(f => ({ ...f, date: e.target.value }))} placeholder="למשל 11-20" />
          <Input label="הערות" value={memForm.notes} onChange={e => setMemForm(f => ({ ...f, notes: e.target.value }))} placeholder="אופציונלי" />
        </div>
      </Modal>

      <Modal open={addAnn} onClose={() => setAddAnn(false)} title="הוסף הודעה"
        footer={<div className="flex gap-2 justify-end"><Button variant="outline" onClick={() => setAddAnn(false)}>ביטול</Button><Button onClick={saveAnnouncement} loading={submitting}>פרסם</Button></div>}>
        <div className="space-y-3">
          <TextArea label="הודעה" value={annForm.text} onChange={e => setAnnForm(f => ({ ...f, text: e.target.value }))} placeholder="כתוב הודעה למשפחה..." />
          <Input label="תפוגה (אופציונלי)" type="date" value={annForm.expiresDate} onChange={e => setAnnForm(f => ({ ...f, expiresDate: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
