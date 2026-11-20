import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { avatarColor, initials, cn } from '@/lib/utils';
import { computeTreeLayout, CARD_W, FLAG_CC, type TreeUnit } from '@/lib/treeLayout';
import { getHeritageSpine, getBloodlineIds, computeFocus, assignRelativeGenerations } from '@/lib/familyTree/adapter';
import type { TreePerson } from '@/types';

// Visual card height used for connector attach points (taller than the layout's
// CARD_H so lines emerge from the real card edge, not its middle).
const CARD_VIS_H = 150;
// Roomier spacing than the classic tree — clarity over fitting everything in.
const GEN_H = 232;
const H_GAP = 52;
const COUPLE_GAP = 22;

const lifespan = (p: TreePerson) => [p.birthYear, p.deathYear].filter(Boolean).join(' – ');

// ── A single positioned card ──────────────────────────────────
const PositionedCard = React.memo(function PositionedCard({
  person: p, x, y, spine, inLaw, dim, focused, onOpen,
}: {
  person: TreePerson; x: number; y: number;
  spine: boolean; inLaw: boolean; dim: boolean; focused: boolean;
  onOpen: (id: string) => void;
}) {
  const years = lifespan(p);
  const place = (p.birthCity || p.originCountry || '').trim();
  const flag = p.originCountry ? FLAG_CC[p.originCountry.trim()] || '' : '';
  return (
    <div
      className={cn('nt-card', spine && 'spine', inLaw && 'in-law', p.deathYear && 'deceased', dim && 'dim', focused && 'focused')}
      style={{ left: x, top: y }}
      role="button" tabIndex={dim ? -1 : 0}
      aria-label={[p.nameHe, years].filter(Boolean).join(' ')}
      onClick={() => onOpen(p.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); } }}
    >
      {spine && <span className="nt-card-spark" aria-hidden="true">✦</span>}
      {p.story && <span className="nt-card-story" aria-hidden="true">📖</span>}
      {p.photoData ? (
        <img className="nt-card-photo" src={p.photoData} alt="" style={{ padding: 0 }} />
      ) : (
        <div className="nt-card-photo" style={{ background: avatarColor(p.nameHe || p.id) }} aria-hidden="true">
          {initials(p.nameHe || '?')}
        </div>
      )}
      <div className="nt-card-name">{p.nameHe || '—'}</div>
      {years && <div className="nt-card-years">{years}</div>}
      {(place || flag) && (
        <div className="nt-card-place">
          {flag && (
            <img src={`https://flagcdn.com/16x12/${flag}.png`} alt="" width={14} height={11}
              style={{ verticalAlign: 'middle', marginInlineEnd: 4, borderRadius: 1 }} />
          )}
          {place}
        </div>
      )}
    </div>
  );
});

interface TreeCanvasProps {
  persons: TreePerson[];
  focusedId: string | null;
  onOpen: (id: string) => void;
  onClearFocus?: () => void;
  immersive?: boolean;
  onToggleImmersive?: () => void;
}

/**
 * Positioned, pannable family graph. Reuses the proven `computeTreeLayout`
 * geometry, rendered with the new premium cards, parent→child connectors,
 * marriage links, generation rails and click-to-focus lineage illumination.
 */
export function TreeCanvas({
  persons, focusedId, onOpen, onClearFocus, immersive, onToggleImmersive,
}: TreeCanvasProps) {
  const layout = useMemo(() => {
    // Relative-to-spine generations so married-in branches land in their true
    // band instead of floating to the top.
    const genOf = assignRelativeGenerations(persons);
    return computeTreeLayout(persons, { genOf, hGap: H_GAP, genH: GEN_H, coupleGap: COUPLE_GAP });
  }, [persons]);
  const spineIds = useMemo(() => new Set(getHeritageSpine(persons).map(p => p.id)), [persons]);
  const bloodIds = useMemo(() => getBloodlineIds(persons), [persons]);
  const unitOf = useMemo(() => {
    const m = new Map<string, TreeUnit>();
    layout.units.forEach(u => u.members.forEach(p => m.set(p.id, u)));
    return m;
  }, [layout]);
  const lit = useMemo(
    () => (focusedId ? computeFocus(focusedId, persons).lit : null),
    [focusedId, persons],
  );

  // Lineage path (founder → focused) for the breadcrumb / focus indicator.
  const breadcrumb = useMemo(() => {
    if (!focusedId) return [] as TreePerson[];
    const byId = new Map(persons.map(p => [p.id, p]));
    const chain: TreePerson[] = [];
    const seen = new Set<string>();
    let cur = byId.get(focusedId);
    while (cur && !seen.has(cur.id)) {
      chain.unshift(cur);
      seen.add(cur.id);
      cur = (cur.fatherId && byId.get(cur.fatherId)) || (cur.motherId && byId.get(cur.motherId)) || undefined;
    }
    return chain.length > 1 ? chain : [];
  }, [focusedId, persons]);

  // ── Pan / zoom — refs + direct DOM transform (no React rerenders) ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const view = useRef({ scale: 1, x: 60, y: 60 });
  const dims = useRef({ width: 0, height: 0 });
  dims.current = { width: layout.width, height: layout.height };

  // ── Minimap geometry ──
  const MM_W = 172, MM_H = 124;
  const mm = useMemo(() => {
    const s = Math.min(MM_W / Math.max(layout.width, 1), MM_H / Math.max(layout.height, 1));
    return { s, w: layout.width * s, h: layout.height * s };
  }, [layout.width, layout.height]);
  const mmScaleRef = useRef(1);
  mmScaleRef.current = mm.s;
  const minimapRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // ── Quick-jump search ──
  const [query, setQuery] = useState('');

  const applyTransform = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const v = view.current;
    el.style.transform = `matrix(${v.scale},0,0,${v.scale},${v.x},${v.y})`;
    // Keep the minimap viewport rectangle in sync with the pan/zoom.
    const vp = wrapRef.current, rect = viewportRef.current, s = mmScaleRef.current;
    if (vp && rect) {
      rect.style.left = `${(-v.x / v.scale) * s}px`;
      rect.style.top = `${(-v.y / v.scale) * s}px`;
      rect.style.width = `${(vp.clientWidth / v.scale) * s}px`;
      rect.style.height = `${(vp.clientHeight / v.scale) * s}px`;
    }
  }, []);

  const fitView = useCallback(() => {
    const vp = wrapRef.current;
    if (!vp) return;
    const vpW = vp.clientWidth, vpH = vp.clientHeight;
    const { width: cW, height: cH } = dims.current;
    if (!vpW || !vpH || !cW || !cH) return;
    const pad = 28;
    const scale = Math.min(1, Math.max(0.12, Math.min((vpW - pad * 2) / cW, (vpH - pad * 2) / cH)));
    view.current = { scale, x: (vpW - cW * scale) / 2, y: pad };
    applyTransform();
  }, [applyTransform]);

  // Re-fit on first paint, when the layout changes, and whenever the viewport
  // resizes — including entering/leaving immersive (which grows the container)
  // and window resizes. Without the immersive refit the tree keeps the
  // transform computed for the smaller viewport and ends up clipped.
  useLayoutEffect(() => {
    let raf = 0, tries = 0;
    const attempt = () => {
      const vp = wrapRef.current;
      if (vp && vp.clientWidth && vp.clientHeight) { fitView(); return; }
      if (tries++ < 20) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [layout.width, layout.height, immersive, fitView]);

  // Keep the tree fitted when the browser window resizes.
  useEffect(() => {
    const onResize = () => fitView();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitView]);

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
    const onMouseUp = () => { drag = null; vp.classList.remove('grabbing'); };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.12 : -0.12;
      const rect = vp.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const prev = view.current.scale;
      view.current.scale = Math.min(2.5, Math.max(0.12, prev + delta));
      const ratio = view.current.scale / prev;
      view.current.x = mx - ratio * (mx - view.current.x);
      view.current.y = my - ratio * (my - view.current.y);
      applyTransform();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if ((e.target as HTMLElement).closest('.nt-card')) return;
        touches = { t: 1, sx: e.touches[0].clientX, sy: e.touches[0].clientY, px: view.current.x, py: view.current.y };
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

  // Zoom around the viewport centre (like the wheel zooms around the cursor),
  // so +/− keep what you're looking at on screen instead of drifting to a corner.
  const zoomBy = (delta: number) => {
    const v = view.current;
    const prev = v.scale;
    v.scale = Math.min(2.5, Math.max(0.12, prev + delta));
    const vp = wrapRef.current;
    if (vp) {
      const ratio = v.scale / prev;
      const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
      v.x = cx - (cx - v.x) * ratio;
      v.y = cy - (cy - v.y) * ratio;
    }
    applyTransform();
  };

  // Smoothly center a content-space point in the viewport (search / minimap).
  const centerOnPoint = useCallback((cx: number, cy: number) => {
    const vp = wrapRef.current;
    if (!vp) return;
    const v = view.current;
    v.x = vp.clientWidth / 2 - cx * v.scale;
    v.y = vp.clientHeight / 2 - cy * v.scale;
    const el = contentRef.current;
    if (el) {
      el.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1)';
      applyTransform();
      window.setTimeout(() => { if (el) el.style.transition = ''; }, 480);
    } else {
      applyTransform();
    }
  }, [applyTransform]);

  const goTo = (id: string) => {
    const pos = layout.positions[id];
    if (pos) centerOnPoint(pos.x + CARD_W / 2, pos.y + CARD_VIS_H / 2);
    onOpen(id);
    setQuery('');
  };

  const onMinimapClick = (e: React.MouseEvent) => {
    const box = minimapRef.current;
    if (!box) return;
    const r = box.getBoundingClientRect();
    centerOnPoint((e.clientX - r.left) / mm.s, (e.clientY - r.top) / mm.s);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return persons
      .filter(p =>
        (p.nameHe || '').toLowerCase().includes(q) ||
        (p.nameLatin || '').toLowerCase().includes(q) ||
        (p.nickname || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, persons]);

  // ── Generation rails (distinct rows of the layout) ──
  const rows = useMemo(() => {
    const ys = new Set<number>();
    Object.values(layout.positions).forEach(p => ys.add(p.y));
    return [...ys].sort((a, b) => a - b);
  }, [layout]);

  // ── Connectors ──
  const connectors = useMemo(() => {
    const els: React.ReactNode[] = [];
    const { positions, units } = layout;
    const unitCx = (u: TreeUnit) => {
      const ps = u.members.map(m => positions[m.id]).filter(Boolean);
      if (!ps.length) return 0;
      return (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x)) + CARD_W) / 2;
    };
    const unitTopY = (u: TreeUnit) => positions[u.members[0].id]?.y ?? 0;
    const unitLit = (u: TreeUnit) => !lit || u.members.some(m => lit.has(m.id));

    // Marriage links
    units.forEach((u, ui) => {
      if (u.members.length < 2) return;
      const p1 = positions[u.members[0].id], p2 = positions[u.members[1].id];
      if (!p1 || !p2) return;
      const ly = p1.y + CARD_VIS_H * 0.42;
      const x1 = p1.x + CARD_W, x2 = p2.x;
      const dimC = !!lit && !unitLit(u);
      els.push(
        <line key={`sp-${ui}`} className={cn('nt-conn-spouse', dimC && 'dim')} x1={x1} y1={ly} x2={x2} y2={ly} />,
        <text key={`hh-${ui}`} className={cn('nt-conn-heart', dimC && 'dim')} x={(x1 + x2) / 2} y={ly - 6} textAnchor="middle">♥</text>,
      );
    });

    const actualChildCx = (pu: TreeUnit, cu: TreeUnit) => {
      const pids = pu.members.map(m => m.id);
      const actual = cu.members.find(m => pids.includes(m.fatherId || '') || pids.includes(m.motherId || '')) || cu.members[0];
      const p = positions[actual.id];
      return p ? p.x + CARD_W / 2 : unitCx(cu);
    };

    // Parent → child curves
    units.forEach((u, ui) => {
      if (!u.childUnits.length) return;
      const pcx = unitCx(u);
      const pbot = unitTopY(u) + CARD_VIS_H;
      const isSpineParent = u.members.some(m => spineIds.has(m.id));
      u.childUnits
        .filter(cu => cu.members[0] && positions[cu.members[0].id])
        .forEach((cu, ci) => {
          const cx = actualChildCx(u, cu);
          const childTop = unitTopY(cu);
          const midY = pbot + (childTop - pbot) * 0.5;
          const spineConn = isSpineParent && cu.members.some(m => spineIds.has(m.id));
          const dimC = !!lit && !(unitLit(u) && unitLit(cu));
          els.push(
            <path
              key={`c-${ui}-${ci}`}
              className={cn(spineConn ? 'nt-conn-spine' : 'nt-conn', dimC && 'dim')}
              d={`M${pcx},${pbot} C${pcx},${midY} ${cx},${midY} ${cx},${childTop}`}
            />,
          );
        });
    });
    return els;
  }, [layout, spineIds, lit]);

  return (
    <div className="nt-graph-wrap" ref={wrapRef}>
      {/* Breadcrumb / current-focus indicator */}
      {breadcrumb.length > 0 && (
        <nav className="nt-breadcrumb" aria-label="מסלול שושלת" onMouseDown={e => e.stopPropagation()}>
          {breadcrumb.map((p, i) => (
            <React.Fragment key={p.id}>
              {i > 0 && <span className="nt-bc-sep" aria-hidden="true">‹</span>}
              <button
                className={cn('nt-bc-item', i === breadcrumb.length - 1 && 'current')}
                onClick={() => onOpen(p.id)}
              >
                {p.nameHe || p.nameLatin || '?'}
              </button>
            </React.Fragment>
          ))}
          {onClearFocus && (
            <button className="nt-bc-clear" onClick={onClearFocus} aria-label="נקה מיקוד" title="נקה מיקוד">✕</button>
          )}
        </nav>
      )}

      <div className="nt-graph" ref={contentRef} style={{ width: layout.width, height: layout.height }}>
        {rows.map(y => {
          const g = Math.round(y / GEN_H);
          return (
            <div key={y} className={cn('nt-rail', g % 2 === 1 && 'alt')} style={{ top: y - (GEN_H - CARD_VIS_H) / 2, height: GEN_H }}>
              <span className="nt-rail-label">דור {g + 1}</span>
            </div>
          );
        })}
        <svg className="nt-graph-svg" width={layout.width} height={layout.height} aria-hidden="true">
          {connectors}
        </svg>
        {persons.map(p => {
          const pos = layout.positions[p.id];
          if (!pos) return null;
          const unit = unitOf.get(p.id);
          const partner = unit?.members.find(m => m.id !== p.id);
          const inLaw = !bloodIds.has(p.id) && !!partner && bloodIds.has(partner.id);
          return (
            <PositionedCard
              key={p.id}
              person={p}
              x={pos.x}
              y={pos.y}
              spine={spineIds.has(p.id)}
              inLaw={inLaw}
              dim={!!lit && !lit.has(p.id)}
              focused={focusedId === p.id}
              onOpen={onOpen}
            />
          );
        })}
      </div>

      {/* Quick-jump search */}
      <div className="nt-search" onMouseDown={e => e.stopPropagation()}>
        <input
          className="nt-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חיפוש בן משפחה…"
          aria-label="חיפוש בן משפחה"
        />
        {results.length > 0 && (
          <ul className="nt-search-results" role="listbox">
            {results.map(r => (
              <li key={r.id}>
                <button className="nt-search-item" onClick={() => goTo(r.id)}>
                  <span className="nt-search-name">{r.nameHe || r.nameLatin || '—'}</span>
                  {(r.birthYear || r.deathYear) && (
                    <span className="nt-search-years" dir="ltr">
                      {[r.birthYear, r.deathYear].filter(Boolean).join(' – ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Minimap */}
      <div
        className="nt-minimap" ref={minimapRef}
        style={{ width: mm.w, height: mm.h }}
        onMouseDown={e => e.stopPropagation()}
        onClick={onMinimapClick}
        role="presentation"
      >
        {persons.map(p => {
          const pos = layout.positions[p.id];
          if (!pos) return null;
          return (
            <span
              key={p.id}
              className={cn('nt-mm-dot', spineIds.has(p.id) && 'spine')}
              style={{ left: pos.x * mm.s, top: pos.y * mm.s }}
            />
          );
        })}
        <div className="nt-mm-viewport" ref={viewportRef} />
      </div>

      <div className="nt-zoom" role="group" aria-label="פקדי מרחק">
        <button className="nt-zoom-btn" onClick={() => zoomBy(0.18)} aria-label="הגדל תצוגה">+</button>
        <button className="nt-zoom-btn" onClick={() => zoomBy(-0.18)} aria-label="הקטן תצוגה">−</button>
        <button className="nt-zoom-btn" onClick={fitView} aria-label="מרכז עץ" title="מרכז">⊙</button>
        {onToggleImmersive && (
          <button
            className="nt-zoom-btn nt-zoom-max" onClick={onToggleImmersive}
            aria-label={immersive ? 'יציאה ממסך מלא' : 'מסך מלא'}
            title={immersive ? 'יציאה ממסך מלא' : 'מסך מלא'}
          >
            {immersive ? '✕' : '⛶'}
          </button>
        )}
      </div>
    </div>
  );
}
