import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc,
  deleteField, serverTimestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { X } from 'lucide-react';
import { db } from '@/firebase/config';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { avatarColor, initials, cn } from '@/lib/utils';
import {
  computeTreeLayout, getSpineIds, computeAncestors, computeDescendants,
  CARD_W, CARD_H, FLAG_CC, type TreeUnit,
} from '@/lib/treeLayout';
import type { TreePerson } from '@/types';
import { setNewFamilyTreeEnabled } from '@/lib/featureFlags';
import './tree.css';

interface FamilyTreeProps {
  user: User | null;
  isAdmin: boolean;
}

// ── Data ──────────────────────────────────────────────────
// Module-level cache so revisiting the page shows the tree instantly
// instead of re-running the skeleton.
let personsCache: TreePerson[] | null = null;

function useTreePersons() {
  const [persons, setPersons] = useState<TreePerson[]>(personsCache ?? []);
  const [loading, setLoading] = useState(personsCache === null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'familyTree'),
      (snap) => {
        personsCache = snap.docs.map(d => ({ id: d.id, ...d.data() } as TreePerson));
        setPersons(personsCache);
        setLoading(false);
      },
      (err) => { console.error('familyTree load error:', err); setLoading(false); }
    );
    return unsub;
  }, []);

  return { persons, loading };
}

// ── Person card ───────────────────────────────────────────
interface TreeCardProps {
  person: TreePerson;
  x: number;
  y: number;
  spine: boolean;
  inLaw: boolean;
  dim: boolean;
  focused: boolean;
  onOpen: (id: string) => void;
}

const TreeCard = React.memo(function TreeCard({ person: p, x, y, spine, inLaw, dim, focused, onOpen }: TreeCardProps) {
  const years = [p.birthYear, p.deathYear].filter(Boolean).join(' – ');
  const city = [p.birthCity, p.originCountry].filter(Boolean).join(', ');
  const flagCc = p.originCountry ? (FLAG_CC[p.originCountry.trim()] || '') : '';
  const label = [p.nameHe, years ? `(${years})` : ''].filter(Boolean).join(' ');

  return (
    <div
      className={cn(
        'tree-card',
        p.deathYear && 'deceased',
        inLaw && 'in-law',
        spine && 'spine',
        dim && 'tc-dim',
        focused && 'tc-focused',
      )}
      style={{ left: x, top: y }}
      onClick={() => onOpen(p.id)}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); } }}
    >
      {p.story && <span className="tc-story-icon" aria-hidden="true">📖</span>}
      {p.photoData ? (
        <img className="tc-photo" src={p.photoData} alt={p.nameHe || 'תמונה'} />
      ) : (
        <div
          className="tc-photo"
          style={{ background: avatarColor(p.nameHe || p.id), color: '#fff' }}
          aria-hidden="true"
        >
          {initials(p.nameHe || '?')}
        </div>
      )}
      <div className="tc-name">{p.nameHe || ''}</div>
      {p.maidenName && <div className="tc-maiden">({p.maidenName})</div>}
      {years && <div className="tc-years">{years}</div>}
      {(city || flagCc) && (
        <div className="tc-city">
          {flagCc && (
            <img
              src={`https://flagcdn.com/16x12/${flagCc}.png`}
              alt={flagCc.toUpperCase()}
              style={{ verticalAlign: 'middle', marginLeft: 3, borderRadius: 1 }}
            />
          )}
          {city && ` ${city}`}
        </div>
      )}
    </div>
  );
});

// ── Loading skeleton — a tree-shaped placeholder ──────────
function SkeletonPersonCard() {
  return (
    <div className="bg-surface rounded-[18px] border border-border p-3 w-[140px] flex flex-col items-center gap-2">
      <Skeleton width={44} height={44} className="rounded-full" />
      <Skeleton height={12} width="70%" />
      <Skeleton height={10} width="50%" />
    </div>
  );
}

function TreeSkeleton() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-12 overflow-hidden px-4" aria-busy="true" aria-label="טוען עץ משפחה">
      <div className="flex gap-4"><SkeletonPersonCard /></div>
      <div className="flex gap-8"><SkeletonPersonCard /><SkeletonPersonCard /></div>
      <div className="hidden sm:flex gap-8">
        <SkeletonPersonCard /><SkeletonPersonCard /><SkeletonPersonCard /><SkeletonPersonCard />
      </div>
      <div className="flex sm:hidden gap-8"><SkeletonPersonCard /><SkeletonPersonCard /></div>
    </div>
  );
}

// ── Add / edit form ───────────────────────────────────────
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

// ── Page ──────────────────────────────────────────────────
export function FamilyTree({ user, isAdmin }: FamilyTreeProps) {
  const { showToast } = useToast();
  const { persons, loading } = useTreePersons();

  // Heavy layout work is memoized — recomputed only when the data changes,
  // not on focus/panel/pan/zoom interactions.
  const layout = useMemo(() => computeTreeLayout(persons), [persons]);
  const spineIds = useMemo(() => getSpineIds(persons), [persons]);
  const byId = useMemo(() => Object.fromEntries(persons.map(p => [p.id, p])), [persons]);
  const unitOf = useMemo(() => {
    const m = new Map<string, TreeUnit>();
    layout.units.forEach(u => u.members.forEach(p => m.set(p.id, u)));
    return m;
  }, [layout]);

  // ── Pan / zoom — refs + direct DOM transform (no React rerenders) ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, x: 60, y: 60 });
  const dims = useRef({ width: 0, height: 0 });
  dims.current = { width: layout.width, height: layout.height };

  const applyTransform = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const v = view.current;
    el.style.transform = `matrix(${v.scale},0,0,${v.scale},${v.x},${v.y})`;
  }, []);

  const fitView = useCallback(() => {
    const vp = wrapRef.current;
    if (!vp) return;
    const vpW = vp.clientWidth, vpH = vp.clientHeight;
    const { width: cW, height: cH } = dims.current;
    if (!vpW || !vpH || !cW || !cH) return;
    const pad = 24;
    const scale = Math.min(1, Math.max(0.12, Math.min((vpW - pad * 2) / cW, (vpH - pad * 2) / cH)));
    view.current = { scale, x: (vpW - cW * scale) / 2, y: pad };
    applyTransform();
  }, [applyTransform]);

  // Bounding box (content coords) of the Shteinberg bloodline spine, so we can
  // open the tree centered on the family's heritage branch rather than the
  // whole sparse canvas. Read-only: derived purely from layout geometry.
  const spineBBox = useMemo(() => {
    const pts = [...spineIds].map(id => layout.positions[id]).filter(Boolean);
    if (!pts.length) return null;
    return {
      minX: Math.min(...pts.map(p => p.x)),
      minY: Math.min(...pts.map(p => p.y)),
      maxX: Math.max(...pts.map(p => p.x)) + CARD_W,
      maxY: Math.max(...pts.map(p => p.y)) + CARD_H,
    };
  }, [spineIds, layout]);

  // Center & fit a content-space box into the viewport (used by fit + center-branch).
  const centerOnBox = useCallback(
    (box: { minX: number; minY: number; maxX: number; maxY: number } | null, maxScale = 1) => {
      const vp = wrapRef.current;
      if (!vp || !box) return;
      const vpW = vp.clientWidth, vpH = vp.clientHeight;
      const bw = box.maxX - box.minX, bh = box.maxY - box.minY;
      if (!vpW || !vpH || !bw || !bh) return;
      const pad = 56;
      const scale = Math.min(maxScale, Math.max(0.12, Math.min((vpW - pad * 2) / bw, (vpH - pad * 2) / bh)));
      view.current = {
        scale,
        x: vpW / 2 - (box.minX + bw / 2) * scale,
        y: vpH / 2 - (box.minY + bh / 2) * scale,
      };
      applyTransform();
    },
    [applyTransform],
  );

  // Center on the Shteinberg branch — the default focus. Falls back to fit-all
  // when no spine is resolvable (e.g. data with no bloodline surname).
  const centerOnSpine = useCallback(() => {
    if (spineBBox) centerOnBox(spineBBox, 1.05);
    else fitView();
  }, [spineBBox, centerOnBox, fitView]);

  // Reset to 1:1 zoom at the canvas origin.
  const resetView = useCallback(() => {
    view.current = { scale: 1, x: 60, y: 60 };
    applyTransform();
  }, [applyTransform]);

  // Open centered on the Shteinberg branch (re-runs when the layout's
  // dimensions change, i.e. a new dataset — same cadence as the old fit-all).
  // `didInitialFit` guards the rAF poll so it only centers ONCE per change,
  // not on every animation frame while waiting for the viewport to size.
  const didInitialFit = useRef(false);
  useLayoutEffect(() => {
    didInitialFit.current = false;
  }, [layout.width, layout.height]);
  useLayoutEffect(() => {
    let raf = 0, tries = 0;
    const attempt = () => {
      if (didInitialFit.current) return;
      const vp = wrapRef.current;
      if (vp && vp.clientWidth && vp.clientHeight) { centerOnSpine(); didInitialFit.current = true; return; }
      if (tries++ < 20) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [layout.width, layout.height, centerOnSpine]);

  // Refit when entering/leaving fullscreen
  useEffect(() => {
    const onFs = () => fitView();
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [fitView]);

  // Drag / wheel-zoom / touch pan+pinch
  useEffect(() => {
    const vp = wrapRef.current;
    if (!vp) return;

    let drag: { sx: number; sy: number; px: number; py: number } | null = null;
    let touches:
      | { t: 1; sx: number; sy: number; px: number; py: number }
      | { t: 2; dist: number; scale: number }
      | null = null;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, px: view.current.x, py: view.current.y };
      vp.classList.add('grabbing');
      e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drag) return;
      view.current.x = drag.px + (e.clientX - drag.sx);
      view.current.y = drag.py + (e.clientY - drag.sy);
      applyTransform();
    };
    const onMouseUp = () => {
      drag = null;
      vp.classList.remove('grabbing');
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const prevScale = view.current.scale;
      view.current.scale = Math.min(2.5, Math.max(0.12, prevScale + delta));
      const ratio = view.current.scale / prevScale;
      view.current.x = mx - ratio * (mx - view.current.x);
      view.current.y = my - ratio * (my - view.current.y);
      applyTransform();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Let taps on person cards become clicks
        if ((e.target as HTMLElement).closest('.tree-card')) return;
        touches = {
          t: 1,
          sx: e.touches[0].clientX, sy: e.touches[0].clientY,
          px: view.current.x, py: view.current.y,
        };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touches = { t: 2, dist: Math.hypot(dx, dy), scale: view.current.scale };
      }
      if (touches) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touches) return;
      if (touches.t === 1 && e.touches.length === 1) {
        view.current.x = touches.px + (e.touches[0].clientX - touches.sx);
        view.current.y = touches.py + (e.touches[0].clientY - touches.sy);
        applyTransform();
      } else if (touches.t === 2 && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        view.current.scale = Math.min(2.5, Math.max(0.12, touches.scale * (Math.hypot(dx, dy) / touches.dist)));
        applyTransform();
      }
      e.preventDefault();
    };
    const onTouchEnd = () => { touches = null; };

    vp.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('touchstart', onTouchStart, { passive: false });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd);
    return () => {
      vp.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
    };
  }, [applyTransform]);

  const zoomBy = (delta: number) => {
    view.current.scale = Math.min(2.5, Math.max(0.12, view.current.scale + delta));
    applyTransform();
  };
  const toggleFullscreen = () => {
    const vp = wrapRef.current;
    if (!vp) return;
    if (!document.fullscreenElement) vp.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };

  // ── Focus / breadcrumb / detail panel ─────────────────
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);

  const litIds = useMemo(() => {
    if (!focusedId) return null;
    const lit = new Set([focusedId, ...computeAncestors(focusedId, byId), ...computeDescendants(focusedId, persons)]);
    persons.forEach(p => { if (lit.has(p.id) && p.spouseId) lit.add(p.spouseId); });
    return lit;
  }, [focusedId, byId, persons]);

  const breadcrumb = useMemo(() => {
    if (!focusedId) return [];
    const chain: TreePerson[] = [];
    const seen = new Set<string>();
    let cur: TreePerson | null = byId[focusedId] ?? null;
    while (cur && !seen.has(cur.id)) {
      chain.unshift(cur);
      seen.add(cur.id);
      cur = cur.fatherId && byId[cur.fatherId] ? byId[cur.fatherId]
          : cur.motherId && byId[cur.motherId] ? byId[cur.motherId] : null;
    }
    return chain.length > 1 ? chain : [];
  }, [focusedId, byId]);

  const openPersonDetail = useCallback((id: string) => {
    setFocusedId(id);
    setPanelId(id);
  }, []);
  const closePanel = () => { setPanelId(null); setFocusedId(null); };

  const panelPerson = panelId ? byId[panelId] ?? null : null;
  const panelRels = useMemo(() => {
    if (!panelPerson) return [];
    const rows: Array<{ lbl: string; person: TreePerson }> = [];
    const father = panelPerson.fatherId ? byId[panelPerson.fatherId] : null;
    const mother = panelPerson.motherId ? byId[panelPerson.motherId] : null;
    const spouse = panelPerson.spouseId ? byId[panelPerson.spouseId] : null;
    if (father) rows.push({ lbl: 'אב', person: father });
    if (mother) rows.push({ lbl: 'אם', person: mother });
    if (spouse) rows.push({ lbl: 'בן/בת זוג', person: spouse });
    persons
      .filter(x => x.fatherId === panelPerson.id || x.motherId === panelPerson.id)
      .forEach(c => rows.push({ lbl: 'ילד/ה', person: c }));
    return rows;
  }, [panelPerson, byId, persons]);

  // ── SVG connectors ────────────────────────────────────
  const connectors = useMemo(() => {
    const els: React.ReactNode[] = [];
    const { positions, units } = layout;

    const unitCx = (u: TreeUnit) => {
      const ps = u.members.map(m => positions[m.id]).filter(Boolean);
      if (!ps.length) return 0;
      return (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x)) + CARD_W) / 2;
    };
    const unitTopY = (u: TreeUnit) => positions[u.members[0].id]?.y ?? 0;

    units.forEach((u, ui) => {
      if (u.members.length < 2) return;
      const p1 = positions[u.members[0].id], p2 = positions[u.members[1].id];
      if (!p1 || !p2) return;
      const ly = p1.y + CARD_H * 0.38;
      const x1 = p1.x + CARD_W, x2 = p2.x;
      els.push(
        <line key={`sp-${ui}`} className="tree-connector" x1={x1} y1={ly} x2={x2} y2={ly} strokeDasharray="4 3" opacity={0.5} />,
        <text key={`h-${ui}`} x={(x1 + x2) / 2} y={ly - 5} textAnchor="middle" fontSize={11} fill="var(--accent)" opacity={0.7}>♥</text>,
      );
    });

    const actualChildCx = (parentUnit: TreeUnit, childUnit: TreeUnit) => {
      const parentIds = parentUnit.members.map(m => m.id);
      const actual = childUnit.members.find(m =>
        parentIds.includes(m.fatherId || '') || parentIds.includes(m.motherId || '')
      ) || childUnit.members[0];
      const p = positions[actual.id];
      return p ? p.x + CARD_W / 2 : unitCx(childUnit);
    };

    units.forEach((u, ui) => {
      if (!u.childUnits.length) return;
      const pcx = unitCx(u);
      const pbot = unitTopY(u) + CARD_H;
      const isSpineParent = u.members.some(m => spineIds.has(m.id));
      u.childUnits
        .filter(cu => cu.members[0] && positions[cu.members[0].id])
        .forEach((cu, ci) => {
          const cx = actualChildCx(u, cu);
          const childTop = unitTopY(cu);
          const midY = pbot + (childTop - pbot) * 0.5;
          const isSpineChild = cu.members.some(m => spineIds.has(m.id));
          els.push(
            <path
              key={`c-${ui}-${ci}`}
              className={isSpineParent && isSpineChild ? 'tree-connector-spine' : 'tree-connector'}
              d={`M${pcx},${pbot} C${pcx},${midY} ${cx},${midY} ${cx},${childTop}`}
            />
          );
        });
    });

    return els;
  }, [layout, spineIds]);

  // ── Add / edit / delete ───────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PersonForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // ── Render ────────────────────────────────────────────
  const panelYears = panelPerson ? [panelPerson.birthYear, panelPerson.deathYear].filter(Boolean).join(' — ') : '';
  const panelLoc = panelPerson ? [panelPerson.birthCity, panelPerson.originCountry].filter(Boolean).join(', ') : '';

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* No page-level header bar here: the global app Header already shows the
          "עץ משפחה" title. A second thick bar would duplicate it and steal
          canvas height — the page title lives in the shell, the canvas owns
          the rest. The "try new view" toggle is a light chip inside the canvas. */}

      {loading ? (
        <TreeSkeleton />
      ) : (
        <div className="tree-wrap" ref={wrapRef}>
          {/* Mobile gesture hint */}
          {persons.length > 0 && (
            <div className="tree-mobile-hint" role="note" aria-label="הוראות מגע">
              👆 גרור להזזה · צבוט להגדלה/הקטנה
            </div>
          )}

          {/* Breadcrumb overlay */}
          {breadcrumb.length > 0 && (
            <nav className="tree-breadcrumb" aria-label="מסלול עץ">
              {breadcrumb.map((p, i) => {
                const isCur = i === breadcrumb.length - 1;
                return (
                  <React.Fragment key={p.id}>
                    <button
                      className={cn('tree-breadcrumb-item', isCur && 'bc-current')}
                      onClick={isCur ? undefined : () => openPersonDetail(p.id)}
                    >
                      {p.nameHe || p.nameLatin || '?'}
                    </button>
                    {!isCur && <span className="tree-breadcrumb-sep" aria-hidden="true"> ← </span>}
                  </React.Fragment>
                );
              })}
            </nav>
          )}

          {/* Transformed layer: connectors + cards */}
          <div className="tree-content" ref={contentRef} style={{ width: layout.width, height: layout.height }}>
            <svg className="tree-svg" width={layout.width} height={layout.height} aria-hidden="true">
              {connectors}
            </svg>
            {persons.map(p => {
              const pos = layout.positions[p.id];
              if (!pos) return null;
              const unit = unitOf.get(p.id);
              const partner = unit?.members.find(m => m.id !== p.id);
              const inLaw = !(p.fatherId || p.motherId) && !!(partner && (partner.fatherId || partner.motherId));
              return (
                <TreeCard
                  key={p.id}
                  person={p}
                  x={pos.x}
                  y={pos.y}
                  spine={spineIds.has(p.id)}
                  inLaw={inLaw}
                  dim={!!litIds && !litIds.has(p.id)}
                  focused={focusedId === p.id}
                  onOpen={openPersonDetail}
                />
              );
            })}
          </div>

          {/* Empty state */}
          {persons.length === 0 && (
            <div className="absolute inset-0 z-[3] flex items-center justify-center">
              <EmptyState
                icon="🌳"
                title="העץ המשפחתי ריק עדיין"
                description='לחץ על "+ הוסף אדם" להתחלה'
                action={{ label: '+ הוסף אדם', onClick: openAdd }}
                withWatermark
              />
            </div>
          )}

          {/* Try the redesigned experience — light chip, not a header bar */}
          <button
            onClick={() => { setNewFamilyTreeEnabled(true); window.location.href = window.location.pathname; }}
            className="tree-newview-chip"
            aria-label="מעבר לתצוגה החדשה"
            title="תצוגה חדשה"
          >
            ✦ תצוגה חדשה
          </button>

          {/* Canvas toolbar — grouped pan / zoom / view controls */}
          <div className="tree-toolbar" role="group" aria-label="פקדי תצוגה">
            <button className="tree-toolbar-btn" onClick={() => zoomBy(0.18)} aria-label="הגדל תצוגה" title="הגדל">＋</button>
            <button className="tree-toolbar-btn" onClick={() => zoomBy(-0.18)} aria-label="הקטן תצוגה" title="הקטן">－</button>
            <span className="tree-toolbar-sep" aria-hidden="true" />
            <button className="tree-toolbar-btn" onClick={centerOnSpine} aria-label="מרכז על שושלת שטיינברג" title="שושלת שטיינברג">✦</button>
            <button className="tree-toolbar-btn" onClick={fitView} aria-label="התאם את כל העץ למסך" title="התאם למסך">⤢</button>
            <button className="tree-toolbar-btn" onClick={resetView} aria-label="איפוס תצוגה" title="איפוס">↺</button>
            <span className="tree-toolbar-sep" aria-hidden="true" />
            <button className="tree-toolbar-btn" onClick={toggleFullscreen} aria-label="מסך מלא" title="מסך מלא">⛶</button>
          </div>

          {/* Add person */}
          {persons.length > 0 && (
            <div className="tree-add-wrap">
              <Button size="sm" onClick={openAdd} aria-label="הוסף אדם לעץ המשפחה">+ הוסף אדם</Button>
            </div>
          )}
        </div>
      )}

      {/* Detail side panel */}
      {panelPerson && (
        <button className="tree-panel-overlay visible" onClick={closePanel} aria-label="סגור פאנל" />
      )}
      <aside className={cn('tree-detail-panel', panelPerson && 'open')} aria-label="פרטי אדם" aria-hidden={!panelPerson}>
        {panelPerson && (
          <>
            <button
              className="absolute top-3.5 left-3.5 bg-surface-alt border-0 rounded-full w-[34px] h-[34px] cursor-pointer text-text-muted flex items-center justify-center hover:text-primary z-[1]"
              onClick={closePanel}
              aria-label="סגור פאנל"
            >
              <X size={15} />
            </button>
            <div
              className="w-20 h-20 rounded-full border-[3px] border-accent flex items-center justify-center mx-auto mt-14 mb-4 bg-surface-alt text-[28px] text-primary font-bold shrink-0 overflow-hidden"
              aria-hidden="true"
            >
              {panelPerson.photoData ? (
                <img src={panelPerson.photoData} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                <span
                  className="w-full h-full flex items-center justify-center rounded-full text-white"
                  style={{ background: avatarColor(panelPerson.nameHe || panelPerson.id) }}
                >
                  {initials(panelPerson.nameHe || '?')}
                </span>
              )}
            </div>
            <h2 className="text-[22px] font-bold text-text-base text-center px-6 leading-snug">
              {[panelPerson.nameHe, panelPerson.nickname ? `"${panelPerson.nickname}"` : ''].filter(Boolean).join(' ')}
            </h2>
            {(panelPerson.nameLatin || panelPerson.maidenName) && (
              <div className="text-[13px] text-text-muted text-center px-6 pt-1" dir="ltr">
                {[panelPerson.nameLatin, panelPerson.maidenName ? `(${panelPerson.maidenName})` : ''].filter(Boolean).join(' ')}
              </div>
            )}
            {(panelYears || panelLoc) && (
              <div className="text-[13px] text-text-muted text-center px-6 pt-1.5">
                {[panelYears, panelLoc].filter(Boolean).join('  ·  ')}
              </div>
            )}
            {spineIds.has(panelPerson.id) && (
              <div className="bg-surface-alt border border-accent text-accent text-[11px] font-bold rounded-full px-3.5 py-1 mt-2.5 mx-auto w-fit">
                ✦ שושלת שטיינברג
              </div>
            )}
            <div className="h-px bg-border my-4 mx-6" aria-hidden="true" />
            <div className="px-6 pb-3.5">
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider mb-2">קשרים משפחתיים</div>
              <div role="list">
                {panelRels.map((r, i) => (
                  <div
                    key={`${r.lbl}-${r.person.id}-${i}`}
                    className="flex justify-between items-center py-2 border-b border-border last:border-0 cursor-pointer group"
                    onClick={() => openPersonDetail(r.person.id)}
                    role="listitem"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPersonDetail(r.person.id); } }}
                    aria-label={`${r.lbl}: ${r.person.nameHe || r.person.nameLatin || '?'}`}
                  >
                    <span className="text-[11px] text-text-muted min-w-16">{r.lbl}</span>
                    <span className="text-[13px] font-semibold text-primary flex-1 px-2 group-hover:text-accent transition-colors">
                      {r.person.nameHe || r.person.nameLatin || '?'}
                    </span>
                    <span className="text-[13px] text-border" aria-hidden="true">←</span>
                  </div>
                ))}
              </div>
            </div>
            {panelPerson.story && (
              <div className="text-[13px] leading-7 text-text-mid bg-surface-alt p-3 rounded-input mx-6 mb-4 whitespace-pre-wrap">
                {panelPerson.story}
              </div>
            )}
            <div className="p-4 px-6 pb-8 flex gap-2.5 border-t border-border flex-wrap mt-auto">
              {user && (
                <Button variant="outline" size="sm" onClick={() => openEdit(panelPerson)} aria-label="ערוך פרטי אדם">
                  ערוך
                </Button>
              )}
              {isAdmin && (
                <Button variant="danger" size="sm" onClick={() => setDeleteId(panelPerson.id)} aria-label="מחק אדם מהעץ">
                  מחק
                </Button>
              )}
            </div>
          </>
        )}
      </aside>

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
