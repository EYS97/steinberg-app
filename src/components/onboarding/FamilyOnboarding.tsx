import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { avatarColor, initials } from '@/lib/utils';
import {
  coupleLabel,
  LIFECYCLE_COLLECTION,
  type LifecycleEvent,
  type OnboardingContext,
} from '@/lib/lifecycle';
import {
  currentHebrewYear,
  hebrewYearOptions,
  hebrewMonthsOfYear,
  hebrewDayOptions,
  months,
} from '@/lib/dates';
import type { TreePerson } from '@/types';

// ── Family lifecycle onboarding (wedding_v1) ──────────────────────────────
// A short, warm welcome for a family member who has just joined — currently
// through marriage. Every string is derived from the lifecycle record and the
// family tree, so the same flow serves any future couple with no code change.
// Nothing here is person-specific.

// Hebrew is gendered: pick the form from the tree record's `gender`.
const g = (gender: 'm' | 'f' | undefined, fem: string, masc: string) =>
  gender === 'f' ? fem : masc;

interface StepDef {
  id: string;
  /** Skippable steps show a "דלג" affordance. */
  skippable?: boolean;
}

const STEPS: StepDef[] = [
  { id: 'welcome' },
  { id: 'couple' },
  { id: 'family' },
  { id: 'name', skippable: true },
  { id: 'photo', skippable: true },
  { id: 'wedding', skippable: true },
  { id: 'done' },
];

const LS_STEP = 'lifecycle_step_';

function readStep(lifecycleId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const v = Number(window.localStorage.getItem(LS_STEP + lifecycleId));
    return Number.isFinite(v) && v > 0 && v < STEPS.length ? v : 0;
  } catch { return 0; }
}

function writeStep(lifecycleId: string, step: number): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_STEP + lifecycleId, String(step)); } catch { /* ignore */ }
}

function clearStep(lifecycleId: string): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(LS_STEP + lifecycleId); } catch { /* ignore */ }
}

/** Small round person chip reusing the tree's photo/initials conventions. */
function PersonChip({ person, caption }: { person: TreePerson; caption: string }) {
  const name = person.nickname || person.nameHe || person.nameLatin || '';
  return (
    <div className="flex flex-col items-center gap-1.5 w-20">
      <div
        className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white shrink-0 ring-2 ring-white shadow-card"
        style={{ background: person.photoData ? undefined : avatarColor(name || person.id) }}
      >
        {person.photoData
          ? <img src={person.photoData} alt="" className="w-full h-full object-cover" />
          : initials(name)}
      </div>
      <p className="text-[11px] font-semibold text-text-base text-center leading-tight truncate w-full">{name}</p>
      <p className="text-[10px] text-text-muted text-center leading-tight">{caption}</p>
    </div>
  );
}

/** Celebratory hearts — suppressed entirely under prefers-reduced-motion. */
function Celebration({ enabled }: { enabled: boolean }) {
  const pieces = useMemo(
    () => Array.from({ length: 14 }, (_, i) => ({
      id: i,
      left: `${(i * 7 + 5) % 95}%`,
      delay: (i % 7) * 0.18,
      emoji: ['💕', '✨', '💍', '🤍'][i % 4],
    })),
    []
  );
  if (!enabled) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {pieces.map(p => (
        <motion.span
          key={p.id}
          className="absolute text-lg"
          style={{ left: p.left, top: '-8%' }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '115%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 5.5, delay: p.delay, repeat: Infinity, ease: 'linear' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </div>
  );
}

interface FamilyOnboardingProps {
  lifecycle: LifecycleEvent;
  context: OnboardingContext;
  onComplete: (ev: LifecycleEvent) => Promise<void>;
  /** Defer for this session ("לא עכשיו"). */
  onDismiss: () => void;
}

export function FamilyOnboarding({ lifecycle, context, onComplete, onDismiss }: FamilyOnboardingProps) {
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState(() => readStep(lifecycle.id));
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const {
    member, spouse, memberFirstName, spouseFirstName, memberGender,
    spouseParents, spouseSiblings, siblingSpouses, hasWeddingDate, weddingDateLabel,
  } = context;

  // Personalization drafts — prefilled from what the system already knows.
  const [nickname, setNickname] = useState(member?.nickname || '');
  const [photoData, setPhotoData] = useState<string | null>(member?.photoData ?? null);
  const hy = currentHebrewYear();
  const [wYear, setWYear] = useState(String(lifecycle.hebrewDate?.year ?? hy));
  const [wMonth, setWMonth] = useState(String(lifecycle.hebrewDate?.month ?? months.ELUL));
  const [wDay, setWDay] = useState(String(lifecycle.hebrewDate?.day ?? 1));

  useEffect(() => { writeStep(lifecycle.id, step); }, [lifecycle.id, step]);

  // Focus the dialog on mount and on each step, so keyboard/screen-reader users
  // land inside the flow rather than behind it.
  useEffect(() => { dialogRef.current?.focus(); }, [step]);

  // Trap focus inside the dialog while it is open.
  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      node.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, []);

  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        // Same 200px square down-scale the family tree already uses.
        const c = document.createElement('canvas');
        const size = 200;
        c.width = c.height = size;
        const ctx = c.getContext('2d')!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        setPhotoData(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  /** Persist an optional personalization to the member's EXISTING tree record. */
  async function savePerson(patch: Record<string, unknown>) {
    if (!member) return;
    try {
      await updateDoc(doc(db, 'familyTree', member.id), patch);
    } catch {
      showToast('לא הצלחנו לשמור — אפשר להמשיך ולעדכן מאוחר יותר', 'error');
    }
  }

  async function saveWeddingDate() {
    const day = Number(wDay), month = Number(wMonth), year = Number(wYear);
    if (!day || !month || !year) return;
    try {
      await setDoc(
        doc(db, LIFECYCLE_COLLECTION, lifecycle.id),
        { hebrewDate: { day, month, year }, calendarType: 'hebrew' },
        { merge: true }
      );
    } catch {
      showToast('לא הצלחנו לשמור את התאריך', 'error');
    }
  }

  async function finish() {
    setSaving(true);
    try {
      await onComplete(lifecycle);
      clearStep(lifecycle.id);
    } finally {
      setSaving(false);
    }
  }

  const heading = 'text-xl sm:text-2xl font-bold text-primary leading-tight';
  const body = 'text-sm sm:text-base text-text-mid leading-relaxed';

  function renderStep() {
    switch (current.id) {
      case 'welcome':
        return (
          <div className="text-center relative">
            <Celebration enabled={!reduceMotion} />
            <div className="relative">
              <span className="text-5xl" aria-hidden="true">💍</span>
              <h2 className={`${heading} mt-4`}>
                {g(memberGender, 'ברוכה הבאה למשפחה', 'ברוך הבא למשפחה')}, {memberFirstName}! 💍❤️
              </h2>
              <p className={`${body} mt-3`}>
                {g(memberGender, 'אנחנו כל כך שמחים שאת כאן.', 'אנחנו כל כך שמחים שאתה כאן.')}
                {spouseFirstName && (
                  <>
                    {' '}
                    {g(memberGender, `עכשיו כשאת ו${spouseFirstName} נשואים`, `עכשיו כש${spouseFirstName} ואתה נשואים`)},
                    {' '}הבית הזה קצת יותר {g(memberGender, 'שלך', 'שלך')} גם. ✨
                  </>
                )}
              </p>
            </div>
          </div>
        );

      case 'couple':
        return (
          <div className="text-center">
            <h2 className={heading}>
              {g(memberGender, 'את ו', 'אתה ו')}{spouseFirstName} — רשמית גם כאן ❤️
            </h2>
            <p className={`${body} mt-3`}>
              חיברנו {g(memberGender, 'אותך', 'אותך')} ו{spouseFirstName} במשפחה, כך שהמערכת
              מזהה אתכם כזוג בכל מקום שזה רלוונטי.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              {member && <PersonChip person={member} caption={g(memberGender, 'הצטרפה', 'הצטרף')} />}
              <span className="text-2xl" aria-hidden="true">❤️</span>
              {spouse && <PersonChip person={spouse} caption="בן/בת הזוג" />}
            </div>
            {member && spouse && (
              <p className="text-xs text-text-muted mt-4">
                הקשר כבר קיים בעץ המשפחה — לא נוצר כפל רישום.
              </p>
            )}
          </div>
        );

      case 'family': {
        const groups: { label: string; people: TreePerson[] }[] = [
          { label: 'ההורים', people: spouseParents },
          { label: 'האחים והאחיות', people: spouseSiblings },
          { label: 'בני/בנות הזוג שלהם', people: siblingSpouses },
        ].filter(gr => gr.people.length > 0);
        return (
          <div>
            <h2 className={`${heading} text-center`}>מכירים את המשפחה</h2>
            <p className={`${body} mt-2 text-center`}>
              {spouseFirstName ? `המעגל הקרוב של ${spouseFirstName} — עכשיו גם שלך.` : 'המעגל המשפחתי הקרוב.'}
            </p>
            <div className="mt-5 space-y-4 max-h-[42vh] overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-sm text-text-muted text-center">
                  פרטי המשפחה יופיעו כאן ברגע שיתווספו לעץ המשפחה.
                </p>
              ) : groups.map(gr => (
                <div key={gr.label}>
                  <p className="text-xs font-semibold text-text-muted mb-2">{gr.label}</p>
                  <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                    {gr.people.map(p => (
                      <PersonChip key={p.id} person={p} caption="" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'name':
        return (
          <div>
            <h2 className={`${heading} text-center`}>איך נקרא לך?</h2>
            <p className={`${body} mt-2 text-center`}>
              זה השם שיופיע למשפחה. אפשר להשאיר כמו שהוא.
            </p>
            <div className="mt-5 max-w-xs mx-auto">
              <Input
                label="שם מוצג במשפחה"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                placeholder={memberFirstName}
                hint="לא חובה — אפשר לדלג"
              />
            </div>
          </div>
        );

      case 'photo':
        return (
          <div className="text-center">
            <h2 className={heading}>תמונת פרופיל</h2>
            <p className={`${body} mt-2`}>
              {photoData ? 'זו התמונה שלך היום — אפשר להחליף או להשאיר.' : 'אפשר להוסיף תמונה, או לדלג ולהוסיף בהמשך.'}
            </p>
            <div className="mt-5 flex flex-col items-center gap-3">
              <div
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-xl font-bold text-white ring-2 ring-white shadow-card"
                style={{ background: photoData ? undefined : avatarColor(memberFirstName || lifecycle.id) }}
              >
                {photoData
                  ? <img src={photoData} alt="" className="w-full h-full object-cover" />
                  : initials(memberFirstName)}
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-accent-dark cursor-pointer hover:underline focus-within:underline">
                <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoFile} />
                {photoData ? 'החלפת תמונה' : 'בחירת תמונה'}
              </label>
            </div>
          </div>
        );

      case 'wedding': {
        const coupleName = coupleLabel(context);
        return (
          <div className="text-center">
            <h2 className={heading}>יש תאריך אחד שלא נרצה לשכוח… 💒</h2>
            <p className={`${body} mt-3`}>
              החתונה של {coupleName} 💍
            </p>
            {hasWeddingDate ? (
              <>
                <p className="mt-3 text-base font-semibold text-accent-dark">{weddingDateLabel}</p>
                <p className="text-xs text-text-muted mt-2">
                  יום הנישואין של {coupleName} ❤️ יופיע מעכשיו באירועים המשפחתיים, מדי שנה.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-text-muted mt-3">
                  אפשר להוסיף את התאריך העברי כדי שיום הנישואין יופיע מדי שנה.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 max-w-sm mx-auto text-right">
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
                    options={hebrewYearOptions(hy - 3, hy).map(o => ({ value: String(o.value), label: o.label }))}
                  />
                </div>
              </>
            )}
          </div>
        );
      }

      case 'done':
        return (
          <div className="text-center relative">
            <Celebration enabled={!reduceMotion} />
            <div className="relative">
              <span className="text-5xl" aria-hidden="true">✨</span>
              <h2 className={`${heading} mt-4`}>
                {g(memberGender, 'את חלק מהבית עכשיו', 'אתה חלק מהבית עכשיו')} ✨
              </h2>
              <p className={`${body} mt-3`}>
                מעכשיו {g(memberGender, 'תהיי', 'תהיה')} חלק מהאירועים, השמחות, החגים והרגעים
                המשותפים של המשפחה.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  async function handlePrimary() {
    // Persist what this step collected, then advance.
    if (current.id === 'name' && member && nickname.trim() !== (member.nickname || '')) {
      await savePerson({ nickname: nickname.trim() });
    }
    if (current.id === 'photo' && member && photoData !== (member.photoData ?? null)) {
      await savePerson({ photoData });
    }
    if (current.id === 'wedding' && !hasWeddingDate) {
      await saveWeddingDate();
    }
    if (current.id === 'done') { await finish(); return; }
    next();
  }

  const primaryLabel =
    current.id === 'welcome' ? 'קדימה'
    : current.id === 'done' ? 'קחו אותי הביתה 🏠'
    : 'המשך';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
        initial={reduceMotion ? false : { opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full sm:max-w-lg bg-surface shadow-modal rounded-t-modal sm:rounded-modal max-h-[92vh] overflow-y-auto focus:outline-none"
      >
        {/* Progress */}
        <div className="flex items-center gap-1.5 p-4 pb-0" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-border'}`}
            />
          ))}
        </div>
        <p className="sr-only" id="onboarding-title">
          הצטרפות למשפחה — שלב {step + 1} מתוך {STEPS.length}
        </p>

        <div className="p-5 sm:p-7 min-h-[280px] flex flex-col">
          <div className="flex-1">
            {/* Keyed remount plays the enter animation for each step. Deliberately
                NOT AnimatePresence mode="wait": coordinating an exit can wedge the
                swap, leaving the wizard stuck on a completed step. */}
            <motion.div
              key={current.id}
              initial={reduceMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18 }}
            >
              {renderStep()}
            </motion.div>
          </div>

          <div className="flex items-center gap-2 mt-7">
            {step > 0 && current.id !== 'done' && (
              <Button variant="ghost" size="sm" onClick={back}>חזרה</Button>
            )}
            <div className="flex-1" />
            {current.skippable && (
              <Button variant="ghost" size="sm" onClick={next}>דלג</Button>
            )}
            <Button onClick={handlePrimary} loading={saving} size="lg">
              {primaryLabel}
            </Button>
          </div>

          {current.id === 'welcome' && (
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 text-xs text-text-muted hover:text-text-mid underline self-center"
            >
              לא עכשיו
            </button>
          )}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
