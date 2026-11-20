import React, { useMemo, useState } from 'react';
import { Heart, Trash2, Link2 } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useTreePersons } from '@/pages/FamilyTree/useTreePersons';
import { useLifecycleEvents } from '@/hooks/useLifecycle';
import { indexPersons } from '@/lib/familyTree/adapter';
import {
  LIFECYCLE_COLLECTION,
  ONBOARDING_IDS,
  personFirstName,
  weddingDateLabel,
  hasWeddingDate,
} from '@/lib/lifecycle';
import {
  currentHebrewYear,
  hebrewYearOptions,
  hebrewMonthsOfYear,
  hebrewDayOptions,
  months,
} from '@/lib/dates';
import type { User } from 'firebase/auth';

// Admin surface for family-lifecycle records. Creating one here is the ONLY
// step a future wedding needs: it makes the new member eligible for the
// wedding onboarding and gives the family an annual anniversary. No code
// change, no deploy.

export function FamilyLifecycleAdmin({ user }: { user: User | null }) {
  const { showToast } = useToast();
  const { persons } = useTreePersons();
  const { events } = useLifecycleEvents();

  const idx = useMemo(() => indexPersons(persons), [persons]);
  const personOptions = useMemo(
    () => persons
      .map(p => ({ value: p.id, label: p.nameHe || p.nameLatin || p.id }))
      .sort((a, b) => a.label.localeCompare(b.label, 'he')),
    [persons]
  );

  const hy = currentHebrewYear();
  const [memberId, setMemberId] = useState('');
  const [spouseId, setSpouseId] = useState('');
  const [email, setEmail] = useState('');
  const [wDay, setWDay] = useState('1');
  const [wMonth, setWMonth] = useState(String(months.ELUL));
  const [wYear, setWYear] = useState(String(hy));
  const [busy, setBusy] = useState(false);

  // Picking the new member pre-fills the spouse from the tree's own link.
  function pickMember(id: string) {
    setMemberId(id);
    const linked = idx.spouseOf.get(id);
    if (linked) setSpouseId(linked);
  }

  const duplicate = events.find(ev => ev.memberPersonId === memberId);
  const member = memberId ? idx.byId.get(memberId) : undefined;
  const spouse = spouseId ? idx.byId.get(spouseId) : undefined;
  const treeLinkMissing = !!member && !!spouse && idx.spouseOf.get(member.id) !== spouse.id;

  async function handleCreate() {
    if (!memberId || !email.trim()) {
      showToast('נא לבחור בן/בת משפחה ולהזין אימייל', 'error');
      return;
    }
    if (duplicate) {
      showToast('כבר קיימת רשומת חתונה עבור בן/בת המשפחה הזה', 'error');
      return;
    }
    setBusy(true);
    try {
      await addDoc(collection(db, LIFECYCLE_COLLECTION), {
        type: 'wedding',
        onboardingId: ONBOARDING_IDS.wedding,
        memberPersonId: memberId,
        spousePersonId: spouseId || null,
        memberEmails: [email.trim().toLowerCase()],
        hebrewDate: { day: Number(wDay), month: Number(wMonth), year: Number(wYear) },
        calendarType: 'hebrew',
        createdAt: serverTimestamp(),
        createdBy: user?.uid || '',
      });
      showToast('רשומת החתונה נוצרה ✓');
      setMemberId(''); setSpouseId(''); setEmail('');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה ביצירת הרשומה', 'error');
    } finally { setBusy(false); }
  }

  /** Mirror the spouse link onto the tree when it is genuinely absent. */
  async function handleLinkSpouses() {
    if (!member || !spouse) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'familyTree', member.id), { spouseId: spouse.id });
      await updateDoc(doc(db, 'familyTree', spouse.id), { spouseId: member.id });
      showToast('הקשר הזוגי עודכן בעץ המשפחה ✓');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה בעדכון הקשר', 'error');
    } finally { setBusy(false); }
  }

  async function handleDelete(id: string) {
    setBusy(true);
    try {
      await deleteDoc(doc(db, LIFECYCLE_COLLECTION, id));
      showToast('הרשומה נמחקה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה במחיקה', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Heart size={18} className="text-accent" /> חתונות והצטרפות למשפחה
          {events.length > 0 && <Badge variant="accent">{events.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <p className="text-sm text-text-muted mb-4">
        יצירת רשומה כאן פותחת לבן/בת המשפחה החדש/ה את מסך ההצטרפות, ומוסיפה יום נישואין
        שנתי לאירועי המשפחה. כל חתונה עתידית מתווספת כך — בלי שינוי קוד.
      </p>

      {/* Existing records */}
      {events.length > 0 && (
        <div className="divide-y divide-border mb-5">
          {events.map(ev => {
            const m = idx.byId.get(ev.memberPersonId);
            const s = ev.spousePersonId ? idx.byId.get(ev.spousePersonId) : undefined;
            return (
              <div key={ev.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-base truncate">
                    {personFirstName(s) || '—'} ו{personFirstName(m) || '—'} 💍
                  </p>
                  <p className="text-xs text-text-muted truncate">
                    {hasWeddingDate(ev) ? weddingDateLabel(ev) : 'ללא תאריך'}
                    {(ev.memberEmails || []).length > 0 && ` ‏· ${ev.memberEmails!.join(', ')}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="מחיקת רשומה"
                  onClick={() => handleDelete(ev.id)}
                  disabled={busy}
                >
                  <Trash2 size={15} className="text-error" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Create */}
      <div className="space-y-3">
        <Select
          label="בן/בת המשפחה החדש/ה"
          value={memberId}
          onChange={e => pickMember(e.target.value)}
          options={personOptions}
          placeholder="בחר/י מעץ המשפחה"
        />
        <Select
          label="בן/בת הזוג מהמשפחה"
          value={spouseId}
          onChange={e => setSpouseId(e.target.value)}
          options={personOptions}
          placeholder="בחר/י מעץ המשפחה"
        />
        <Input
          label="אימייל להתחברות"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="name@example.com"
          hint="לפי האימייל הזה מזוהה מי רואה את מסך ההצטרפות"
        />
        <div className="grid grid-cols-3 gap-2">
          <Select
            label="יום"
            value={wDay}
            onChange={e => setWDay(e.target.value)}
            options={hebrewDayOptions(Number(wMonth), Number(wYear)).map(o => ({ value: String(o.value), label: o.label }))}
          />
          <Select
            label="חודש"
            value={wMonth}
            onChange={e => setWMonth(e.target.value)}
            options={hebrewMonthsOfYear(Number(wYear)).map(o => ({ value: String(o.value), label: o.label }))}
          />
          <Select
            label="שנה"
            value={wYear}
            onChange={e => setWYear(e.target.value)}
            options={hebrewYearOptions(hy - 5, hy).map(o => ({ value: String(o.value), label: o.label }))}
          />
        </div>

        {duplicate && (
          <p className="text-xs text-warning font-medium">
            כבר קיימת רשומה עבור בן/בת המשפחה הזה — לא ניתן ליצור כפילות.
          </p>
        )}

        {treeLinkMissing && (
          <div className="flex items-center justify-between gap-2 bg-surface-alt rounded-md p-2.5">
            <p className="text-xs text-text-mid">
              אין קשר זוגי בעץ המשפחה בין השניים.
            </p>
            <Button variant="outline" size="sm" onClick={handleLinkSpouses} disabled={busy}>
              <Link2 size={14} /> חיבור בעץ
            </Button>
          </div>
        )}

        <Button onClick={handleCreate} loading={busy} disabled={!!duplicate}>
          <Heart size={16} /> יצירת רשומת חתונה
        </Button>
      </div>
    </Card>
  );
}
