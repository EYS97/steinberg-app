import React, { useMemo, useState } from 'react';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  deleteField, serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { X } from 'lucide-react';
import { db } from '@/firebase/config';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { avatarColor, initials, cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TreePerson } from '@/types';
import { indexPersons, getHeritageSpine, computeLegacyStats } from '@/lib/familyTree/adapter';
import { TreeCanvas } from './TreeCanvas';
import { TimelineView } from './TimelineView';
import { LegacyView } from './LegacyView';
import { useTreePersons } from './useTreePersons';
import './new-tree.css';

interface NewFamilyTreeProps {
  user: User | null;
  isAdmin: boolean;
}

type ViewMode = 'tree' | 'timeline' | 'legacy' | 'map';

const VIEWS: Array<{ id: ViewMode; label: string; icon: string; soon?: boolean }> = [
  { id: 'tree',     label: 'עץ',      icon: '🌳' },
  { id: 'timeline', label: 'ציר זמן', icon: '📜' },
  { id: 'legacy',   label: 'מורשת',   icon: '✦' },
  { id: 'map',      label: 'מפה',     icon: '🗺', soon: true },
];

// ── Add / edit person form ────────────────────────────────────
interface PersonForm {
  nameHe: string; nameLatin: string; nickname: string; maidenName: string;
  gender: string; birthYear: string; birthCity: string; deathYear: string;
  originCountry: string; burialPlace: string; story: string; photoData: string;
  fatherId: string; motherId: string; spouseId: string;
}

const EMPTY_FORM: PersonForm = {
  nameHe: '', nameLatin: '', nickname: '', maidenName: '',
  gender: 'm', birthYear: '', birthCity: '', deathYear: '',
  originCountry: '', burialPlace: '', story: '', photoData: '',
  fatherId: '', motherId: '', spouseId: '',
};


// ── "Coming in a later phase" placeholder ─────────────────────
function ComingSoon({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="nt-canvas">
      <div className="nt-soon">
        <div className="nt-soon-icon" aria-hidden="true">{icon}</div>
        <div className="nt-soon-title">{title}</div>
        <div className="nt-soon-sub">{sub}</div>
      </div>
    </div>
  );
}

// ── Inspector drawer ──────────────────────────────────────────
function Inspector({
  person, persons, spine, onOpen, onClose, onEdit, onDelete, canEdit, canDelete,
}: {
  person: TreePerson; persons: TreePerson[]; spine: boolean;
  onOpen: (id: string) => void; onClose: () => void;
  onEdit: (p: TreePerson) => void; onDelete: (id: string) => void;
  canEdit: boolean; canDelete: boolean;
}) {
  const rels = useMemo(() => {
    const idx = indexPersons(persons);
    const rows: Array<{ lbl: string; p: TreePerson }> = [];
    const father = person.fatherId ? idx.byId.get(person.fatherId) : null;
    const mother = person.motherId ? idx.byId.get(person.motherId) : null;
    const spouseId = idx.spouseOf.get(person.id);
    const spouse = spouseId ? idx.byId.get(spouseId) : null;
    if (father) rows.push({ lbl: 'אב', p: father });
    if (mother) rows.push({ lbl: 'אם', p: mother });
    if (spouse) rows.push({ lbl: 'בן/בת זוג', p: spouse });
    (idx.childrenOf.get(person.id) || []).forEach(cid => {
      const c = idx.byId.get(cid);
      if (c) rows.push({ lbl: 'ילד/ה', p: c });
    });
    return rows;
  }, [person, persons]);

  const years = [person.birthYear, person.deathYear].filter(Boolean).join(' — ');
  const loc = [person.birthCity, person.originCountry].filter(Boolean).join(', ');

  return (
    <>
      <button className="nt-drawer-overlay" aria-label="סגור" onClick={onClose} />
      <aside className="nt-drawer open" aria-label="פרטי אדם">
        <button
          className="absolute top-3.5 inset-inline-start-3.5 bg-surface-alt border-0 rounded-full w-[34px] h-[34px] cursor-pointer text-text-muted flex items-center justify-center hover:text-primary z-[1]"
          style={{ insetInlineStart: 14, position: 'absolute', top: 14 }}
          onClick={onClose} aria-label="סגור"
        >
          <X size={15} />
        </button>
        <div
          className="w-20 h-20 rounded-full border-[3px] border-accent flex items-center justify-center mx-auto mt-14 mb-4 bg-surface-alt text-[28px] text-white font-bold overflow-hidden"
          style={{ background: person.photoData ? undefined : avatarColor(person.nameHe || person.id) }}
          aria-hidden="true"
        >
          {person.photoData
            ? <img src={person.photoData} alt="" className="w-full h-full object-cover" />
            : initials(person.nameHe || '?')}
        </div>
        <h2 className="text-[22px] font-bold text-text-base text-center px-6 leading-snug">
          {[person.nameHe, person.nickname ? `"${person.nickname}"` : ''].filter(Boolean).join(' ')}
        </h2>
        {person.nameLatin && (
          <div className="text-[13px] text-text-muted text-center px-6 pt-1" dir="ltr">{person.nameLatin}</div>
        )}
        {(years || loc) && (
          <div className="text-[13px] text-text-muted text-center px-6 pt-1.5">
            {[years, loc].filter(Boolean).join('  ·  ')}
          </div>
        )}
        {spine && (
          <div className="bg-surface-alt border border-accent text-accent text-[11px] font-bold rounded-full px-3.5 py-1 mt-2.5 mx-auto w-fit">
            ✦ שושלת שטיינברג
          </div>
        )}
        <div className="h-px bg-border my-4 mx-6" aria-hidden="true" />
        <div className="px-6 pb-3.5">
          <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1">קשרים משפחתיים</div>
          {rels.map((r, i) => (
            <div
              key={`${r.lbl}-${r.p.id}-${i}`} className="nt-rel-row"
              role="button" tabIndex={0}
              onClick={() => onOpen(r.p.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.p.id); } }}
            >
              <span className="nt-rel-lbl">{r.lbl}</span>
              <span className="nt-rel-name">{r.p.nameHe || r.p.nameLatin || '?'}</span>
              <span className="text-border" aria-hidden="true">←</span>
            </div>
          ))}
        </div>
        {person.story && (
          <div className="text-[13px] leading-7 text-text-mid bg-surface-alt p-3 rounded-input mx-6 mb-4 whitespace-pre-wrap">
            {person.story}
          </div>
        )}
        {(canEdit || canDelete) && (
          <div className="px-6 pb-8 pt-2 mt-auto flex gap-2.5 flex-wrap">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => onEdit(person)} aria-label="ערוך פרטי אדם">
                ערוך
              </Button>
            )}
            {canDelete && (
              <Button variant="danger" size="sm" onClick={() => onDelete(person.id)} aria-label="מחק אדם מהעץ">
                מחק
              </Button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ── Shell ─────────────────────────────────────────────────────
export function NewFamilyTree({ user, isAdmin }: NewFamilyTreeProps) {
  const { showToast } = useToast();
  const { persons, loading } = useTreePersons();
  const [view, setView] = useState<ViewMode>('tree');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The focused person drives lineage illumination on the canvas.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Immersive "full canvas" mode covers the app sidebar/header.
  const [immersive, setImmersive] = useState(false);

  // Add / edit / delete state (parity with the classic tree editor).
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Esc leaves immersive mode (in addition to the on-screen exit button).
  React.useEffect(() => {
    if (!immersive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setImmersive(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [immersive]);

  const stats = useMemo(() => computeLegacyStats(persons), [persons]);
  const spineIds = useMemo(() => new Set(getHeritageSpine(persons).map(p => p.id)), [persons]);
  const selected = selectedId ? persons.find(p => p.id === selectedId) ?? null : null;

  // Opening a person both reveals their detail and illuminates their lineage.
  const openPerson = (id: string) => { setSelectedId(id); setFocusedId(id); };
  const closePanel = () => { setSelectedId(null); setFocusedId(null); };

  const set = (k: keyof PersonForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const personOptions = useMemo(() =>
    persons
      .filter(p => p.id !== editingId)
      .map(p => ({ value: p.id, label: p.nameHe || p.id })),
    [persons, editingId]
  );

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(p: TreePerson) {
    setEditingId(p.id);
    setForm({
      nameHe: p.nameHe || '',
      nameLatin: p.nameLatin || '',
      nickname: p.nickname || '',
      maidenName: p.maidenName || '',
      gender: p.gender || 'm',
      birthYear: p.birthYear ? String(p.birthYear) : '',
      birthCity: p.birthCity || '',
      deathYear: p.deathYear ? String(p.deathYear) : '',
      originCountry: p.originCountry || '',
      burialPlace: p.burialPlace || '',
      story: p.story || '',
      photoData: p.photoData || '',
      fatherId: p.fatherId || '',
      motherId: p.motherId || '',
      spouseId: p.spouseId || '',
    });
    closePanel();
    setModalOpen(true);
  }

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const size = 200;
        c.width = c.height = size;
        const ctx = c.getContext('2d')!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        setForm(f => ({ ...f, photoData: c.toDataURL('image/jpeg', 0.75) }));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!user) { showToast('יש להתחבר תחילה', 'error'); return; }
    if (!form.nameHe.trim()) { showToast('נא למלא שם בעברית', 'error'); return; }
    setSaving(true);
    const raw: Record<string, unknown> = {
      nameHe: form.nameHe.trim(),
      nameLatin: form.nameLatin.trim(),
      nickname: form.nickname.trim(),
      maidenName: form.maidenName.trim(),
      gender: form.gender,
      birthYear: parseInt(form.birthYear) || null,
      birthCity: form.birthCity.trim(),
      deathYear: parseInt(form.deathYear) || null,
      originCountry: form.originCountry.trim(),
      burialPlace: form.burialPlace.trim(),
      story: form.story.trim(),
      photoData: form.photoData || null,
      fatherId: form.fatherId || null,
      motherId: form.motherId || null,
      spouseId: form.spouseId || null,
    };
    const newSpouseId = form.spouseId || null;
    Object.keys(raw).forEach(k => {
      if (raw[k] === null || raw[k] === '') {
        if (editingId) raw[k] = deleteField();
        else delete raw[k];
      }
    });
    try {
      if (editingId) {
        await updateDoc(doc(db, 'familyTree', editingId), raw);
        if (newSpouseId) await updateDoc(doc(db, 'familyTree', newSpouseId), { spouseId: editingId });
        showToast('הרשומה עודכנה ✓');
      } else {
        raw.createdAt = serverTimestamp();
        const ref = await addDoc(collection(db, 'familyTree'), raw);
        if (newSpouseId) await updateDoc(doc(db, 'familyTree', newSpouseId), { spouseId: ref.id });
        showToast('נוסף לעץ המשפחתי ✓');
      }
      setEditingId(null);
      setModalOpen(false);
    } catch (e) {
      showToast('שגיאה: ' + (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const p = persons.find(x => x.id === deleteId);
      if (p?.spouseId) await updateDoc(doc(db, 'familyTree', p.spouseId), { spouseId: deleteField() });
      await deleteDoc(doc(db, 'familyTree', deleteId));
      closePanel();
      showToast('נמחק מהעץ');
    } catch (e) {
      showToast('שגיאה: ' + (e as Error).message, 'error');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div className={cn('nt-root', immersive && 'nt-immersive')}>
      <header className="nt-header">
        <div className="nt-title-he">בית שטיינברג</div>
        <div className="nt-title-en">The House of Shteinberg</div>
        <div className="nt-stats">
          <div className="nt-stat"><span className="nt-stat-num">{stats.generations}</span><span className="nt-stat-lbl">דורות</span></div>
          <div className="nt-stat"><span className="nt-stat-num">{stats.members}</span><span className="nt-stat-lbl">בני משפחה</span></div>
          <div className="nt-stat"><span className="nt-stat-num">{stats.living}</span><span className="nt-stat-lbl">בחיים</span></div>
          <div className="nt-stat"><span className="nt-stat-num">{stats.countries}</span><span className="nt-stat-lbl">ארצות</span></div>
          {stats.founded && (
            <div className="nt-stat"><span className="nt-stat-num" dir="ltr">{stats.founded}</span><span className="nt-stat-lbl">נוסדה</span></div>
          )}
        </div>
        <div className="nt-views" role="tablist" aria-label="מצב תצוגה">
          {VIEWS.map(v => (
            <button
              key={v.id} role="tab" aria-selected={view === v.id}
              className={cn('nt-view-btn', view === v.id && 'active')}
              onClick={() => setView(v.id)}
            >
              <span aria-hidden="true">{v.icon}</span>{v.label}
              {v.soon && <span className="nt-view-soon">בקרוב</span>}
            </button>
          ))}
          {user && (
            <button className="nt-add-btn" onClick={openAdd} aria-label="הוסף אדם לעץ המשפחה">
              <span aria-hidden="true">＋</span> הוסף אדם
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="nt-canvas" aria-busy="true">
          <div className="nt-row">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="nt-card" key={i} style={{ pointerEvents: 'none' }}>
                <Skeleton width={56} height={56} className="rounded-full mx-auto mb-2" />
                <Skeleton height={12} width="70%" className="mx-auto" />
                <Skeleton height={10} width="50%" className="mx-auto mt-2" />
              </div>
            ))}
          </div>
        </div>
      ) : persons.length === 0 ? (
        <div className="nt-canvas flex items-center justify-center">
          <EmptyState
            icon="🌳"
            title="העץ המשפחתי ריק עדיין"
            description='לחצו על "הוסף אדם" כדי להתחיל'
            action={user ? { label: '+ הוסף אדם', onClick: openAdd } : undefined}
            withWatermark
          />
        </div>
      ) : view === 'tree' ? (
        <TreeCanvas
          persons={persons} focusedId={focusedId} onOpen={openPerson}
          onClearFocus={() => setFocusedId(null)}
          immersive={immersive} onToggleImmersive={() => setImmersive(v => !v)}
        />
      ) : view === 'timeline' ? (
        <TimelineView persons={persons} onOpen={openPerson} />
      ) : view === 'legacy' ? (
        <LegacyView persons={persons} onOpen={openPerson} />
      ) : (
        <ComingSoon icon="🗺" title="מסע המשפחה" sub="מפת הגירת הדורות בין ארצות — אוקראינה, רומניה, ישראל — דורשת נתוני מיקום ותיבנה בקרוב." />
      )}

      {selected && (
        <Inspector
          person={selected} persons={persons} spine={spineIds.has(selected.id)}
          onOpen={openPerson} onClose={closePanel}
          onEdit={openEdit} onDelete={setDeleteId}
          canEdit={!!user} canDelete={isAdmin}
        />
      )}

      {/* Add / edit person modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '✏️ עריכת אדם' : '🌳 הוספת אדם לעץ'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModalOpen(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={saving}>{editingId ? 'שמור' : 'הוסף'}</Button>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="שם בעברית *" value={form.nameHe} onChange={set('nameHe')} placeholder="דוד שטיינברג" autoComplete="off" />
            <Input label="שם בלועזית" value={form.nameLatin} onChange={set('nameLatin')} placeholder="David Steinberg" autoComplete="off" dir="ltr" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input label="כינוי" value={form.nickname} onChange={set('nickname')} placeholder="דודי" />
            <Input label="שם נעורים" value={form.maidenName} onChange={set('maidenName')} placeholder="לפני נישואין" />
            <Select
              label="מין"
              value={form.gender}
              onChange={set('gender')}
              options={[{ value: 'm', label: 'זכר' }, { value: 'f', label: 'נקבה' }]}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Input label="שנת לידה" type="number" value={form.birthYear} onChange={set('birthYear')} placeholder="1920" min={1700} max={2100} />
            <Input label="עיר לידה" value={form.birthCity} onChange={set('birthCity')} placeholder="כרמיאל" />
            <Input label="שנת פטירה" type="number" value={form.deathYear} onChange={set('deathYear')} placeholder="(אם נפטר/ה)" min={1700} max={2100} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="ארץ מוצא" value={form.originCountry} onChange={set('originCountry')} placeholder="רוסיה" />
            <Input label="מיקום קבורה" value={form.burialPlace} onChange={set('burialPlace')} placeholder="בית עלמין X" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-mid">תמונה</span>
            <div className="flex gap-2.5 items-center">
              {form.photoData && (
                <img
                  src={form.photoData}
                  alt="תצוגה מקדימה של תמונת הפרופיל"
                  className="w-[52px] h-[52px] rounded-full object-cover border-2 border-accent"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoFile}
                className="text-xs flex-1 border border-border rounded-input px-2 py-1.5"
                aria-label="העלה תמונת פרופיל"
              />
            </div>
          </div>
          <TextArea label="סיפור / הערה" value={form.story} onChange={set('story')} placeholder="כמה מילים על האדם..." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select label="אב" value={form.fatherId} onChange={set('fatherId')} options={personOptions} placeholder="— אין / לא ידוע —" />
            <Select label="אם" value={form.motherId} onChange={set('motherId')} options={personOptions} placeholder="— אין / לא ידוע —" />
          </div>
          <Select label="בן/בת זוג" value={form.spouseId} onChange={set('spouseId')} options={personOptions} placeholder="— אין / לא ידוע —" />
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="מחיקה מהעץ"
        message="למחוק אדם זה מהעץ?"
        confirmLabel="מחק"
        loading={deleting}
      />
    </div>
  );
}
