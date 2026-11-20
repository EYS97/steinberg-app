/**
 * Family-Tree read-only adapter layer.
 *
 * Pure, side-effect-free derivations over the existing `TreePerson[]` data.
 * This layer NEVER persists, mutates, or writes anything — it only *reads* the
 * family records and computes presentation-friendly structures:
 *
 *   • generational layers (structural depth + year-range bands)
 *   • the Shteinberg patrilineal bloodline + the narrative "heritage spine"
 *   • focus sets (ancestors / descendants / illuminated lineage)
 *   • relationship paths between any two people (with a Hebrew label)
 *   • family units (couple + their children)
 *   • a chronological timeline
 *   • aggregate "legacy" statistics
 *
 * Every input is treated as immutable. The functions return fresh objects.
 */

import type { TreePerson } from '@/types';

// ── Surname matching ──────────────────────────────────────────
// Tokens (lower-cased) that identify a person carrying the Shteinberg name.
const SHTEINBERG_TOKENS = ['שטיינברג', 'shteinberg', 'steinberg'];

/** True when a person's Hebrew or Latin name carries the Shteinberg surname. */
export function hasShteinbergSurname(p: TreePerson): boolean {
  const he = (p.nameHe || '').toLowerCase();
  const la = (p.nameLatin || '').toLowerCase();
  return SHTEINBERG_TOKENS.some(t => he.includes(t) || la.includes(t));
}

// ── Indexing ──────────────────────────────────────────────────
export interface PersonIndex {
  list: TreePerson[];
  byId: Map<string, TreePerson>;
  /** parentId → ids of that parent's children */
  childrenOf: Map<string, string[]>;
  /** Symmetric spouse links — resolves even when only one side recorded it. */
  spouseOf: Map<string, string>;
}

/** Build lookup maps once; downstream helpers take the index to stay O(n). */
export function indexPersons(persons: TreePerson[]): PersonIndex {
  const byId = new Map<string, TreePerson>();
  const childrenOf = new Map<string, string[]>();
  const spouseOf = new Map<string, string>();
  persons.forEach(p => byId.set(p.id, p));
  persons.forEach(p => {
    [p.fatherId, p.motherId].forEach(pid => {
      if (pid && byId.has(pid)) {
        const arr = childrenOf.get(pid);
        if (arr) arr.push(p.id);
        else childrenOf.set(pid, [p.id]);
      }
    });
    // Spouse links can be stored on either side only — mirror them so both
    // partners resolve each other.
    if (p.spouseId && byId.has(p.spouseId)) {
      spouseOf.set(p.id, p.spouseId);
      spouseOf.set(p.spouseId, p.id);
    }
  });
  return { list: persons, byId, childrenOf, spouseOf };
}

/** Parents of a person that actually exist in the dataset. */
function parentIdsOf(p: TreePerson | undefined, byId: Map<string, TreePerson>): string[] {
  if (!p) return [];
  return [p.fatherId, p.motherId].filter((x): x is string => !!x && byId.has(x));
}

// ── Generations ───────────────────────────────────────────────
/**
 * Structural generation index per person (0 = oldest known generation).
 *
 * Roots (no known parent in the set) are generation 0. Everyone else sits one
 * level below their *deepest* parent, so a person never appears above an
 * ancestor even when the two parents are themselves different depths.
 */
export function assignGenerations(idx: PersonIndex): Map<string, number> {
  const { list, byId, childrenOf } = idx;
  const gen = new Map<string, number>();

  const roots = list.filter(p => parentIdsOf(p, byId).length === 0);
  // BFS keeping the maximum depth seen for each node.
  const queue: Array<[string, number]> = roots.map(r => [r.id, 0]);
  while (queue.length) {
    const [id, g] = queue.shift()!;
    if ((gen.get(id) ?? -1) >= g) continue;
    gen.set(id, g);
    (childrenOf.get(id) || []).forEach(cid => queue.push([cid, g + 1]));
  }
  // Cycles / fully-disconnected members fall back to generation 0.
  list.forEach(p => { if (!gen.has(p.id)) gen.set(p.id, 0); });

  // A person who married into the family (no parents of their own) would
  // otherwise float to generation 0. Pull them down to sit beside the partner
  // who belongs by descent. Iterate so spouse-of-spouse chains converge.
  let changed = true;
  while (changed) {
    changed = false;
    list.forEach(p => {
      if (parentIdsOf(p, byId).length > 0) return; // anchored by their own descent
      const spId = idx.spouseOf.get(p.id);
      if (!spId) return;
      const partner = byId.get(spId);
      // Only inherit from a partner who is themselves anchored by descent.
      if (partner && parentIdsOf(partner, byId).length > 0) {
        const spGen = gen.get(spId);
        if (spGen !== undefined && spGen !== gen.get(p.id)) {
          gen.set(p.id, spGen);
          changed = true;
        }
      }
    });
  }
  return gen;
}

/**
 * Generation level for every person, anchored to the heritage spine and
 * propagated across the *whole* relationship graph: a spouse shares their
 * partner's level (Δ0), a child sits one below a parent (Δ+1), a parent one
 * above (Δ−1). Levels are normalised so the minimum is 0.
 *
 * Unlike {@link assignGenerations} (which roots anyone lacking parents at 0
 * and only pulls direct spouses down), this also places a married-in spouse's
 * own parents one generation up and handles in-laws of in-laws — so nobody is
 * dumped at the top of the tree just for lacking parents in the data.
 */
export function assignRelativeGenerations(persons: TreePerson[]): Map<string, number> {
  const idx = indexPersons(persons);
  const { byId, childrenOf, spouseOf } = idx;
  const level = new Map<string, number>();

  const neighbours = (id: string): Array<[string, number]> => {
    const p = byId.get(id);
    const out: Array<[string, number]> = [];
    if (p?.fatherId && byId.has(p.fatherId)) out.push([p.fatherId, -1]);
    if (p?.motherId && byId.has(p.motherId)) out.push([p.motherId, -1]);
    (childrenOf.get(id) || []).forEach(cid => out.push([cid, +1]));
    const sp = spouseOf.get(id);
    if (sp) out.push([sp, 0]);
    return out;
  };

  // BFS flood from seeds; first assignment wins (consistent within a tree).
  const flood = (seeds: Array<[string, number]>) => {
    const q: Array<[string, number]> = [];
    seeds.forEach(([id, lv]) => { if (byId.has(id) && !level.has(id)) { level.set(id, lv); q.push([id, lv]); } });
    while (q.length) {
      const [id, lv] = q.shift()!;
      neighbours(id).forEach(([nid, d]) => {
        if (!level.has(nid)) { level.set(nid, lv + d); q.push([nid, lv + d]); }
      });
    }
  };

  // Anchor on the spine (its index === generation depth), then any component
  // not connected to the spine anchors its first member at 0.
  flood(getHeritageSpine(persons).map((p, i) => [p.id, i] as [string, number]));
  persons.forEach(p => { if (!level.has(p.id)) flood([[p.id, 0]]); });

  if (level.size === 0) return level;
  const min = Math.min(...level.values());
  const norm = new Map<string, number>();
  level.forEach((lv, id) => norm.set(id, lv - min));
  return norm;
}

export interface GenerationBand {
  /** 1-based label index — "Generation 1" is the oldest. */
  index: number;
  members: TreePerson[];
  /** Birth-year range derived from the band's members (null when unknown). */
  fromYear: number | null;
  toYear: number | null;
}

/**
 * Group people into ordered generation bands with a derived birth-year range.
 * The range is computed from real data — never hardcoded — so it stays correct
 * as the family grows.
 */
export function buildGenerationBands(persons: TreePerson[]): GenerationBand[] {
  const idx = indexPersons(persons);
  const gen = assignGenerations(idx);
  const groups = new Map<number, TreePerson[]>();
  persons.forEach(p => {
    const g = gen.get(p.id) ?? 0;
    const arr = groups.get(g);
    if (arr) arr.push(p);
    else groups.set(g, [p]);
  });
  return [...groups.keys()].sort((a, b) => a - b).map((g, i) => {
    const members = groups.get(g)!;
    const years = members.map(m => m.birthYear).filter((y): y is number => !!y);
    return {
      index: i + 1,
      members,
      fromYear: years.length ? Math.min(...years) : null,
      toYear: years.length ? Math.max(...years) : null,
    };
  });
}

// ── Bloodline & heritage spine ────────────────────────────────
/**
 * Everyone in the Shteinberg *bloodline*: a person carrying the surname, plus
 * anyone descended from a surname-bearer through any parent path (so daughters
 * and their descendants are blood, while married-in spouses are not).
 */
export function getBloodlineIds(persons: TreePerson[]): Set<string> {
  const idx = indexPersons(persons);
  const blood = new Set<string>();
  // Seed with explicit surname-bearers, then flood down to all descendants.
  const seeds = persons.filter(hasShteinbergSurname).map(p => p.id);
  const stack = [...seeds];
  seeds.forEach(id => blood.add(id));
  while (stack.length) {
    const id = stack.pop()!;
    (idx.childrenOf.get(id) || []).forEach(cid => {
      if (!blood.has(cid)) { blood.add(cid); stack.push(cid); }
    });
  }
  return blood;
}

/**
 * The narrative backbone: the deepest patrilineal (father-line) chain of
 * bloodline members, ordered founder → latest generation.
 *
 * A "founder" is a bloodline person whose father is not himself in the
 * bloodline. From each founder we walk down father-links, always extending
 * toward the deepest reachable descendant; the longest resulting chain wins.
 */
export function getHeritageSpine(persons: TreePerson[]): TreePerson[] {
  const idx = indexPersons(persons);
  const blood = getBloodlineIds(persons);
  const { byId, childrenOf } = idx;

  const isBloodFatherLink = (childId: string, parentId: string) => {
    const c = byId.get(childId);
    return !!c && c.fatherId === parentId && blood.has(childId);
  };

  // Memoised deepest father-line path starting at a given person.
  const memo = new Map<string, TreePerson[]>();
  const deepestFrom = (id: string, guard: Set<string>): TreePerson[] => {
    if (memo.has(id)) return memo.get(id)!;
    if (guard.has(id)) return [];
    guard.add(id);
    const self = byId.get(id)!;
    const sons = (childrenOf.get(id) || []).filter(cid => isBloodFatherLink(cid, id));
    let best: TreePerson[] = [];
    for (const son of sons) {
      const sub = deepestFrom(son, guard);
      // Prefer longer chains; tie-break on earlier birth year for stability.
      if (
        sub.length > best.length ||
        (sub.length === best.length && best[0] && sub[0] &&
          (sub[0].birthYear ?? Infinity) < (best[0].birthYear ?? Infinity))
      ) best = sub;
    }
    guard.delete(id);
    const chain = [self, ...best];
    memo.set(id, chain);
    return chain;
  };

  const founders = persons.filter(p =>
    blood.has(p.id) && !(p.fatherId && blood.has(p.fatherId))
  );
  let spine: TreePerson[] = [];
  for (const f of founders) {
    const chain = deepestFrom(f.id, new Set());
    if (
      chain.length > spine.length ||
      (chain.length === spine.length && spine[0] && chain[0] &&
        (chain[0].birthYear ?? Infinity) < (spine[0].birthYear ?? Infinity))
    ) spine = chain;
  }
  return spine;
}

// ── Ancestors / descendants ───────────────────────────────────
/** All ancestor ids of `id` (excludes the person). */
export function getAncestors(id: string, idx: PersonIndex): Set<string> {
  const out = new Set<string>();
  const visit = (pid?: string | null) => {
    if (!pid || out.has(pid) || !idx.byId.has(pid)) return;
    out.add(pid);
    const p = idx.byId.get(pid)!;
    visit(p.fatherId);
    visit(p.motherId);
  };
  const p = idx.byId.get(id);
  if (p) { visit(p.fatherId); visit(p.motherId); }
  return out;
}

/** All descendant ids of `id` (excludes the person). */
export function getDescendants(id: string, idx: PersonIndex): Set<string> {
  const out = new Set<string>();
  const visit = (pid: string) => {
    (idx.childrenOf.get(pid) || []).forEach(cid => {
      if (!out.has(cid)) { out.add(cid); visit(cid); }
    });
  };
  visit(id);
  return out;
}

// ── Focus mode ────────────────────────────────────────────────
export interface FocusResult {
  /** The selected person. */
  rootId: string;
  ancestors: Set<string>;
  descendants: Set<string>;
  /** Everything that should stay illuminated (self + lineage + their spouses). */
  lit: Set<string>;
}

/**
 * Focus a person: light up their direct ancestors and descendants (plus the
 * spouses of anyone lit, so couples stay together) and report the set so the
 * UI can fade everything else.
 */
export function computeFocus(id: string, persons: TreePerson[]): FocusResult {
  const idx = indexPersons(persons);
  const ancestors = getAncestors(id, idx);
  const descendants = getDescendants(id, idx);
  const lit = new Set<string>([id, ...ancestors, ...descendants]);
  // Keep married-in partners of lit bloodline visible so units don't split.
  [...lit].forEach(pid => {
    const partner = idx.spouseOf.get(pid);
    if (partner) lit.add(partner);
  });
  return { rootId: id, ancestors, descendants, lit };
}

// ── Relationship intelligence ─────────────────────────────────
export interface RelationshipResult {
  /** Ordered chain from A up to the common ancestor and down to B. */
  path: TreePerson[];
  /** Lowest-common-ancestor id (null when the two share no ancestor). */
  commonAncestorId: string | null;
  /** Steps from A up to the common ancestor. */
  upFromA: number;
  /** Steps from B up to the common ancestor. */
  upFromB: number;
  /** Hebrew label describing B *relative to* A (e.g. "דוד", "בן דוד"). */
  label: string;
}

/** Map of ancestorId → minimum distance from `id` (id itself is distance 0). */
function ancestorDistances(id: string, idx: PersonIndex): Map<string, number> {
  const dist = new Map<string, number>([[id, 0]]);
  const queue: string[] = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    parentIdsOf(idx.byId.get(cur), idx.byId).forEach(pid => {
      if (!dist.has(pid) || dist.get(pid)! > d + 1) {
        dist.set(pid, d + 1);
        queue.push(pid);
      }
    });
  }
  return dist;
}

/** Walk from a person up to a target ancestor, returning the id chain. */
function pathUpTo(fromId: string, ancestorId: string, idx: PersonIndex): string[] {
  if (fromId === ancestorId) return [fromId];
  // BFS so we follow the shortest parent path to the ancestor.
  const prev = new Map<string, string>();
  const queue: string[] = [fromId];
  const seen = new Set([fromId]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === ancestorId) break;
    parentIdsOf(idx.byId.get(cur), idx.byId).forEach(pid => {
      if (!seen.has(pid)) { seen.add(pid); prev.set(pid, cur); queue.push(pid); }
    });
  }
  if (!seen.has(ancestorId)) return [];
  const chain: string[] = [];
  let c: string | undefined = ancestorId;
  while (c) { chain.unshift(c); c = prev.get(c); }
  return chain; // fromId … ancestorId
}

function relationshipLabel(upA: number, upB: number, b: TreePerson): string {
  const female = b.gender === 'f';
  const g = (m: string, f: string) => (female ? f : m);

  if (upA === 0 && upB === 0) return g('אותו אדם', 'אותו אדם');

  // B is a direct ancestor of A.
  if (upB === 0) {
    if (upA === 1) return g('אב', 'אם');
    if (upA === 2) return g('סבא', 'סבתא');
    if (upA === 3) return g('סבא רבא', 'סבתא רבתא');
    return g('אב קדמון', 'אם קדומה');
  }
  // B is a direct descendant of A.
  if (upA === 0) {
    if (upB === 1) return g('בן', 'בת');
    if (upB === 2) return g('נכד', 'נכדה');
    if (upB === 3) return g('נין', 'נינה');
    return g('צאצא', 'צאצאית');
  }
  // Siblings.
  if (upA === 1 && upB === 1) return g('אח', 'אחות');
  // B is A's uncle/aunt.
  if (upA >= 2 && upB === 1) {
    if (upA === 2) return g('דוד', 'דודה');
    return g('דוד רבא', 'דודה רבתא');
  }
  // B is A's niece/nephew.
  if (upA === 1 && upB >= 2) {
    if (upB === 2) return g('אחיין', 'אחיינית');
    return g('נכד אח', 'נכדת אח');
  }
  // Cousins (both sides ≥ 2). Degree + removal.
  const degree = Math.min(upA, upB) - 1;
  const removed = Math.abs(upA - upB);
  const base = g('בן דוד', 'בת דודה');
  const degreeWord = degree === 1 ? '' : degree === 2 ? ' שני' : ` מדרגה ${degree}`;
  const removedWord = removed === 0 ? '' : ` (${removed} דורות הפרש)`;
  return `${base}${degreeWord}${removedWord}`.trim();
}

/**
 * Explain how two people are related: the connecting path through their lowest
 * common ancestor and a Hebrew label for B relative to A. Returns null when the
 * two share no common ancestor in the dataset.
 */
export function relationshipPath(
  aId: string,
  bId: string,
  persons: TreePerson[],
): RelationshipResult | null {
  const idx = indexPersons(persons);
  if (!idx.byId.has(aId) || !idx.byId.has(bId)) return null;
  if (aId === bId) {
    return {
      path: [idx.byId.get(aId)!],
      commonAncestorId: aId,
      upFromA: 0,
      upFromB: 0,
      label: 'אותו אדם',
    };
  }

  const distA = ancestorDistances(aId, idx); // includes A at 0
  const distB = ancestorDistances(bId, idx); // includes B at 0

  // Lowest common ancestor minimises the combined distance.
  let lca: string | null = null;
  let best = Infinity;
  distA.forEach((da, id) => {
    const db = distB.get(id);
    if (db !== undefined && da + db < best) { best = da + db; lca = id; }
  });
  if (!lca) return null;

  const upA = distA.get(lca)!;
  const upB = distB.get(lca)!;
  const upChain = pathUpTo(aId, lca, idx);            // A … LCA
  const downChain = pathUpTo(bId, lca, idx).slice().reverse(); // LCA … B
  const ids = [...upChain, ...downChain.slice(1)];    // avoid duplicating LCA
  const path = ids.map(id => idx.byId.get(id)!).filter(Boolean);

  return {
    path,
    commonAncestorId: lca,
    upFromA: upA,
    upFromB: upB,
    label: relationshipLabel(upA, upB, idx.byId.get(bId)!),
  };
}

// ── Family units ──────────────────────────────────────────────
export interface FamilyUnit {
  /** Stable id derived from the member ids. */
  id: string;
  /** 1 (single) or 2 (couple) adults heading the unit. */
  members: TreePerson[];
  /** Children whose father or mother is in this unit. */
  children: TreePerson[];
}

/**
 * Collapse the person graph into family units (a couple — or single parent —
 * plus their children). Reduces visual connector overload: one unit per card
 * cluster instead of person-to-person edges.
 */
export function buildFamilyUnits(persons: TreePerson[]): FamilyUnit[] {
  const idx = indexPersons(persons);
  const { byId, childrenOf } = idx;
  const used = new Set<string>();
  const units: FamilyUnit[] = [];

  persons.forEach(p => {
    if (used.has(p.id)) return;
    used.add(p.id);
    const members = [p];
    const spouseId = idx.spouseOf.get(p.id);
    const spouse = spouseId && byId.has(spouseId) && !used.has(spouseId)
      ? byId.get(spouseId)! : null;
    if (spouse) { used.add(spouse.id); members.push(spouse); }

    const memberIds = new Set(members.map(m => m.id));
    const childIds = new Set<string>();
    members.forEach(m => (childrenOf.get(m.id) || []).forEach(cid => childIds.add(cid)));
    const children = [...childIds]
      .map(cid => byId.get(cid)!)
      .filter(c => c && (memberIds.has(c.fatherId || '') || memberIds.has(c.motherId || '')))
      .sort((a, b) => (a.birthYear ?? Infinity) - (b.birthYear ?? Infinity));

    units.push({ id: members.map(m => m.id).join('+'), members, children });
  });
  return units;
}

// ── Timeline ──────────────────────────────────────────────────
export interface TimelineEvent {
  year: number;
  type: 'birth' | 'death';
  person: TreePerson;
}

/** Chronological list of births and deaths, oldest first. */
export function buildTimeline(persons: TreePerson[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  persons.forEach(p => {
    if (p.birthYear) events.push({ year: p.birthYear, type: 'birth', person: p });
    if (p.deathYear) events.push({ year: p.deathYear, type: 'death', person: p });
  });
  return events.sort((a, b) =>
    a.year - b.year || (a.type === 'birth' ? -1 : 1));
}

// ── Legacy statistics ─────────────────────────────────────────
export interface LegacyStats {
  /** Earliest known birth year across the family. */
  founded: number | null;
  /** Number of structural generations present. */
  generations: number;
  /** Distinct countries of origin. */
  countries: number;
  countryList: string[];
  /** Total people in the tree. */
  members: number;
  /** People with no recorded death year. */
  living: number;
  /** Bloodline descendants of the heritage-spine founder. */
  descendants: number;
}

/** Aggregate "House of Shteinberg" headline figures for the Legacy view. */
export function computeLegacyStats(persons: TreePerson[]): LegacyStats {
  const idx = indexPersons(persons);
  const births = persons.map(p => p.birthYear).filter((y): y is number => !!y);
  const gens = assignGenerations(idx);
  const genCount = persons.length ? Math.max(...[...gens.values()]) + 1 : 0;

  const countrySet = new Set<string>();
  persons.forEach(p => {
    const c = (p.originCountry || '').trim();
    if (c) countrySet.add(c);
  });

  const spine = getHeritageSpine(persons);
  const founderId = spine[0]?.id;
  const descendants = founderId ? getDescendants(founderId, idx).size : 0;

  return {
    founded: births.length ? Math.min(...births) : null,
    generations: genCount,
    countries: countrySet.size,
    countryList: [...countrySet],
    members: persons.length,
    living: persons.filter(p => !p.deathYear).length,
    descendants,
  };
}
