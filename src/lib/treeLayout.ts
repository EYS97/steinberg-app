import type { TreePerson } from '@/types';

// Geometry constants — identical to the original standalone tree page
export const CARD_W = 140;
export const CARD_H = 110;
export const COUPLE_GAP = 14;
export const H_GAP = 24;
export const GEN_H = 175;

export interface TreeUnit {
  members: TreePerson[];
  childUnits: TreeUnit[];
  _w: number;
  _done?: boolean;
}

export interface TreePosition { x: number; y: number; }

export interface TreeLayout {
  positions: Record<string, TreePosition>;
  units: TreeUnit[];
  /** Canvas size that contains every card plus padding */
  width: number;
  height: number;
}

/** People carrying the Steinberg family name — the highlighted "spine" of the tree */
export function getSpineIds(persons: TreePerson[]): Set<string> {
  const s = new Set<string>();
  persons.forEach(p => {
    const he = (p.nameHe || '').toLowerCase();
    const la = (p.nameLatin || '').toLowerCase();
    if (he.includes('שטיינברג') || la.includes('shteinberg') || la.includes('steinberg')) s.add(p.id);
  });
  return s;
}

export function computeAncestors(id: string, byId: Record<string, TreePerson>): Set<string> {
  const out = new Set<string>();
  const visit = (pid?: string | null) => {
    if (!pid || out.has(pid)) return;
    out.add(pid);
    const p = byId[pid];
    if (p) { visit(p.fatherId); visit(p.motherId); }
  };
  const p = byId[id];
  if (p) { visit(p.fatherId); visit(p.motherId); }
  return out;
}

export function computeDescendants(id: string, persons: TreePerson[]): Set<string> {
  const kids: Record<string, string[]> = {};
  persons.forEach(p => {
    [p.fatherId, p.motherId].forEach(pid => {
      if (pid) (kids[pid] = kids[pid] || []).push(p.id);
    });
  });
  const out = new Set<string>();
  const visit = (pid: string) => {
    if (out.has(pid)) return;
    out.add(pid);
    (kids[pid] || []).forEach(visit);
  };
  (kids[id] || []).forEach(visit);
  return out;
}

export interface LayoutOptions {
  /** Per-person generation level (relative-to-spine); overrides BFS depth for y. */
  genOf?: Map<string, number>;
  /** Horizontal gap between sibling units. */
  hGap?: number;
  /** Vertical distance between generations. */
  genH?: number;
  /** Gap between the two members of a couple. */
  coupleGap?: number;
}

export function computeTreeLayout(persons: TreePerson[], opts: LayoutOptions = {}): TreeLayout {
  if (!persons.length) return { positions: {}, units: [], width: 0, height: 0 };
  // Local spacing (shadow the module defaults) so callers can request more room
  // without affecting the classic tree, which passes no options.
  const COUPLE_GAP = opts.coupleGap ?? 14;
  const H_GAP = opts.hGap ?? 24;
  const GEN_H = opts.genH ?? 175;
  const byId = Object.fromEntries(persons.map(p => [p.id, p]));

  const units: TreeUnit[] = [];
  const p2u: Record<string, TreeUnit> = {};
  const used = new Set<string>();
  persons.forEach(p => {
    if (used.has(p.id)) return;
    used.add(p.id);
    const u: TreeUnit = { members: [p], childUnits: [], _w: 0 };
    p2u[p.id] = u;
    const sp = p.spouseId && byId[p.spouseId] && !used.has(p.spouseId) ? byId[p.spouseId] : null;
    if (sp) {
      used.add(sp.id);
      const pHasParents = !!(p.fatherId || p.motherId);
      const spHasParents = !!(sp.fatherId || sp.motherId);
      if (spHasParents && !pHasParents) u.members.unshift(sp);
      else if (!pHasParents && !spHasParents && sp.gender === 'm') u.members.unshift(sp);
      else u.members.push(sp);
      p2u[sp.id] = u;
    }
    units.push(u);
  });

  const childSet = new Set<TreeUnit>();
  persons.forEach(p => {
    const cu = p2u[p.id];
    [p.fatherId, p.motherId].forEach(pid => {
      if (!pid || !p2u[pid]) return;
      const pu = p2u[pid];
      if (pu !== cu && !pu.childUnits.includes(cu)) { pu.childUnits.push(cu); childSet.add(cu); }
    });
  });

  units.forEach(u => {
    if (u.childUnits.length < 2) return;
    const parentIds = new Set(u.members.map(m => m.id));
    u.childUnits.sort((a, b) => {
      const directChild = (cu: TreeUnit) =>
        cu.members.find(m => parentIds.has(m.fatherId || '') || parentIds.has(m.motherId || ''));
      const ay = directChild(a)?.birthYear ?? Infinity;
      const by = directChild(b)?.birthYear ?? Infinity;
      return ay - by;
    });
  });

  const roots = units.filter(u => !childSet.has(u));
  const genMap = new Map<TreeUnit, number>();
  const q: Array<[TreeUnit, number]> = roots.map(u => [u, 0]);
  while (q.length) {
    const [u, g] = q.shift()!;
    if ((genMap.get(u) ?? -1) >= g) continue;
    genMap.set(u, g);
    u.childUnits.forEach(cu => q.push([cu, g + 1]));
  }
  units.forEach(u => { if (!genMap.has(u)) genMap.set(u, 0); });

  // Optional external generation levels override the BFS depth so married-in
  // branches sit in their true generation band instead of floating to the top.
  if (opts.genOf) {
    units.forEach(u => {
      const lvls = u.members
        .map(m => opts.genOf!.get(m.id))
        .filter((x): x is number => x != null);
      if (lvls.length) genMap.set(u, Math.min(...lvls));
    });
  }

  const unitOwnW = (u: TreeUnit) => (u.members.length === 2 ? CARD_W * 2 + COUPLE_GAP : CARD_W);
  function calcW(u: TreeUnit): number {
    if (u._done) return u._w;
    u._done = true;
    if (!u.childUnits.length) { u._w = unitOwnW(u); return u._w; }
    const sum = u.childUnits.reduce((s, c) => s + calcW(c), 0) + H_GAP * (u.childUnits.length - 1);
    u._w = Math.max(unitOwnW(u), sum);
    return u._w;
  }
  units.forEach(u => calcW(u));

  const positions: Record<string, TreePosition> = {};
  const placedUnits = new Set<TreeUnit>();
  function place(u: TreeUnit, leftX: number) {
    if (placedUnits.has(u)) return;
    placedUnits.add(u);
    const g = genMap.get(u) ?? 0;
    const y = g * GEN_H;
    const ow = unitOwnW(u);
    const cx = leftX + (u._w - ow) / 2;
    if (u.members.length === 2) {
      positions[u.members[0].id] = { x: cx, y };
      positions[u.members[1].id] = { x: cx + CARD_W + COUPLE_GAP, y };
    } else {
      positions[u.members[0].id] = { x: cx, y };
    }
    let childX = leftX;
    u.childUnits.forEach(cu => { place(cu, childX); childX += cu._w + H_GAP; });
  }
  const countMembers = (u: TreeUnit, vis = new Set<TreeUnit>()): number => {
    if (vis.has(u)) return 0;
    vis.add(u);
    return u.members.length + u.childUnits.reduce((s, c) => s + countMembers(c, vis), 0);
  };
  roots.sort((a, b) => countMembers(b) - countMembers(a));

  let rx = 0;
  if (roots.length > 0) { place(roots[0], 0); rx = roots[0]._w + H_GAP; }
  roots.slice(1).forEach(r => {
    const alreadyPlacedChildren = r.childUnits.filter(cu => cu.members.some(m => positions[m.id]));
    if (alreadyPlacedChildren.length) {
      const ownW = r.members.length === 2 ? CARD_W * 2 + COUPLE_GAP : CARD_W;
      const childXs = alreadyPlacedChildren.flatMap(cu =>
        cu.members.map(m => positions[m.id]).filter(Boolean).map(p => p.x)
      );
      const leftmostChildX = Math.min(...childXs);
      const rg = genMap.get(r) ?? 0;
      const sameGenXs = Object.values(positions).filter(p => p.y === rg * GEN_H).map(p => p.x);
      const minSameGenX = sameGenXs.length ? Math.min(...sameGenXs) : Infinity;
      let targetLeftX = leftmostChildX - ownW - H_GAP * 2;
      if (isFinite(minSameGenX) && targetLeftX + ownW > minSameGenX - H_GAP) {
        targetLeftX = minSameGenX - ownW - H_GAP * 2;
      }
      if (!placedUnits.has(r)) {
        placedUnits.add(r);
        const y = rg * GEN_H;
        if (r.members.length === 2) {
          positions[r.members[0].id] = { x: targetLeftX, y };
          positions[r.members[1].id] = { x: targetLeftX + CARD_W + COUPLE_GAP, y };
        } else {
          positions[r.members[0].id] = { x: targetLeftX, y };
        }
      }
    } else {
      place(r, rx); rx += r._w + H_GAP;
    }
  });
  units.forEach(u => {
    if (!placedUnits.has(u)) { place(u, rx); rx += u._w + H_GAP; }
  });

  // Nudge leaf nodes
  units.forEach(parent => {
    if (parent.childUnits.length < 2) return;
    const isLeaf = (cu: TreeUnit) => cu.childUnits.length === 0 && cu.members.length === 1;
    const leafKids = parent.childUnits.filter(cu => isLeaf(cu) && positions[cu.members[0].id]);
    const nonLeafKids = parent.childUnits.filter(cu => !isLeaf(cu) && cu.members.some(m => positions[m.id]));
    if (!leafKids.length || !nonLeafKids.length) return;
    const nonLeafMaxX = Math.max(...nonLeafKids.flatMap(cu =>
      cu.members.map(m => positions[m.id]).filter(Boolean).map(p => p.x)
    ));
    leafKids.sort((a, b) => positions[a.members[0].id].x - positions[b.members[0].id].x);
    let curX = nonLeafMaxX + CARD_W + H_GAP;
    leafKids.forEach(cu => {
      const pos = positions[cu.members[0].id];
      if (curX < pos.x) pos.x = curX;
      curX = pos.x + CARD_W + H_GAP;
    });
  });

  // Ensure no negative x
  const minX = Math.min(...Object.values(positions).map(p => p.x));
  if (minX < H_GAP) {
    const fix = H_GAP - minX;
    Object.values(positions).forEach(p => { p.x += fix; });
  }

  // Collision guard
  const coupleOf: Record<string, string> = {};
  units.forEach(u => {
    if (u.members.length === 2) {
      coupleOf[u.members[0].id] = u.members[1].id;
      coupleOf[u.members[1].id] = u.members[0].id;
    }
  });
  const byY: Record<number, Array<{ id: string; p: TreePosition }>> = {};
  Object.entries(positions).forEach(([id, p]) => {
    (byY[p.y] = byY[p.y] || []).push({ id, p });
  });
  Object.values(byY).forEach(row => {
    row.sort((a, b) => a.p.x - b.p.x);
    for (let i = 1; i < row.length; i++) {
      if (row[i].p.x < row[i - 1].p.x + CARD_W) {
        const delta = row[i - 1].p.x + CARD_W + H_GAP - row[i].p.x;
        row[i].p.x += delta;
        const partnerId = coupleOf[row[i].id];
        if (partnerId && positions[partnerId] && positions[partnerId].y === row[i].p.y) {
          const pi = row.findIndex(r => r.id === partnerId);
          if (pi !== -1) row[pi].p.x += delta;
        }
      }
    }
  });
  const occupiedSlots = new Map<string, number>();
  Object.entries(positions).forEach(([, p]) => {
    const key = `${Math.round(p.x)},${Math.round(p.y)}`;
    if (occupiedSlots.has(key)) p.x = occupiedSlots.get(key)! + CARD_W + H_GAP;
    occupiedSlots.set(`${Math.round(p.x)},${Math.round(p.y)}`, p.x);
  });

  const allPos = Object.values(positions);
  const width = Math.max(...allPos.map(p => p.x)) + CARD_W + 120;
  const height = Math.max(...allPos.map(p => p.y)) + CARD_H + 160;

  return { positions, units, width, height };
}

/** Country name → flagcdn country code, for the small flag on person cards */
export const FLAG_CC: Record<string, string> = {
  'ישראל': 'il', 'ארץ ישראל': 'il', 'פלסטין': 'il', 'ארץ-ישראל': 'il',
  'רומניה': 'ro', 'אוקראינה': 'ua', 'אוקריאינה': 'ua', 'רוסיה': 'ru',
  'ברית המועצות': 'ru', 'פולין': 'pl', 'פולניה': 'pl', 'הונגריה': 'hu',
  'גרמניה': 'de', 'אוסטריה': 'at', 'אמריקה': 'us', 'ארצות הברית': 'us',
  'ארה"ב': 'us', 'אנגליה': 'gb', 'בריטניה': 'gb', 'צרפת': 'fr',
  'מרוקו': 'ma', 'תוניסיה': 'tn', 'תורכיה': 'tr', 'טורקיה': 'tr',
  'בלארוס': 'by', 'ליטא': 'lt', 'לטביה': 'lv',
};
