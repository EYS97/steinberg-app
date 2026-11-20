import { describe, it, expect } from 'vitest';
import type { TreePerson } from '@/types';
import {
  hasShteinbergSurname,
  indexPersons,
  assignGenerations,
  assignRelativeGenerations,
  buildGenerationBands,
  getBloodlineIds,
  getHeritageSpine,
  getAncestors,
  getDescendants,
  computeFocus,
  relationshipPath,
  buildFamilyUnits,
  buildTimeline,
  computeLegacyStats,
} from './adapter';

// ── Fixtures ──────────────────────────────────────────────────
// Synthetic, throwaway data — never the real family records.
//   Shaya ♥ (Sarah, married-in)
//     └─ Asher ♥ (Rivka, married-in)
//          ├─ Haim ♥ (Leah, married-in)
//          │    ├─ Yaakov ♥ (Tamar, married-in)
//          │    │    └─ Eliad
//          │    └─ Dina (daughter — bloodline, no surname)
//          │         └─ Noa (Dina's child — bloodline)
//          └─ Moshe (Haim's brother)
const p = (o: Partial<TreePerson> & { id: string }): TreePerson => ({ ...o });

const FAMILY: TreePerson[] = [
  p({ id: 'shaya',  nameHe: 'שעיה שטיינברג',  gender: 'm', birthYear: 1846, originCountry: 'אוקראינה', deathYear: 1910 }),
  p({ id: 'sarah',  nameHe: 'שרה',            gender: 'f', birthYear: 1850, spouseId: 'shaya', deathYear: 1915 }),
  p({ id: 'asher',  nameHe: 'אשר שטיינברג',   gender: 'm', birthYear: 1873, fatherId: 'shaya', motherId: 'sarah', originCountry: 'רומניה', deathYear: 1940 }),
  p({ id: 'rivka',  nameHe: 'רבקה',           gender: 'f', birthYear: 1878, spouseId: 'asher' }),
  p({ id: 'haim',   nameHe: 'חיים שטיינברג',  gender: 'm', birthYear: 1905, fatherId: 'asher', motherId: 'rivka', originCountry: 'ישראל', deathYear: 1980 }),
  p({ id: 'leah',   nameHe: 'לאה',            gender: 'f', birthYear: 1910, spouseId: 'haim' }),
  p({ id: 'moshe',  nameHe: 'משה שטיינברג',   gender: 'm', birthYear: 1908, fatherId: 'asher', motherId: 'rivka' }),
  p({ id: 'yaakov', nameHe: 'יעקב זאב שטיינברג', gender: 'm', birthYear: 1946, fatherId: 'haim', motherId: 'leah', originCountry: 'ישראל' }),
  p({ id: 'tamar',  nameHe: 'תמר',            gender: 'f', birthYear: 1950, spouseId: 'yaakov' }),
  p({ id: 'dina',   nameHe: 'דינה',           gender: 'f', birthYear: 1948, fatherId: 'haim', motherId: 'leah' }),
  p({ id: 'eliad',  nameHe: 'אליעד שטיינברג', gender: 'm', birthYear: 1997, fatherId: 'yaakov', motherId: 'tamar' }),
  p({ id: 'noa',    nameHe: 'נועה',           gender: 'f', birthYear: 1975, motherId: 'dina' }),
];

describe('hasShteinbergSurname', () => {
  it('matches Hebrew and Latin spellings', () => {
    expect(hasShteinbergSurname(p({ id: 'a', nameHe: 'חיים שטיינברג' }))).toBe(true);
    expect(hasShteinbergSurname(p({ id: 'b', nameLatin: 'David Steinberg' }))).toBe(true);
    expect(hasShteinbergSurname(p({ id: 'c', nameLatin: 'Eliad Shteinberg' }))).toBe(true);
  });
  it('does not match married-in spouses', () => {
    expect(hasShteinbergSurname(p({ id: 'd', nameHe: 'שרה' }))).toBe(false);
  });
});

describe('assignGenerations', () => {
  it('places founders at 0 and descends by deepest parent', () => {
    const gen = assignGenerations(indexPersons(FAMILY));
    expect(gen.get('shaya')).toBe(0);
    expect(gen.get('sarah')).toBe(0);   // married-in root
    expect(gen.get('asher')).toBe(1);
    expect(gen.get('haim')).toBe(2);
    expect(gen.get('yaakov')).toBe(3);
    expect(gen.get('eliad')).toBe(4);
  });
  it('keeps siblings on the same generation', () => {
    const gen = assignGenerations(indexPersons(FAMILY));
    expect(gen.get('haim')).toBe(gen.get('moshe'));
    expect(gen.get('yaakov')).toBe(gen.get('dina'));
  });
});

describe('assignRelativeGenerations', () => {
  it('keeps the spine in order, founder at 0', () => {
    const gen = assignRelativeGenerations(FAMILY);
    expect(gen.get('shaya')).toBe(0);
    expect(gen.get('asher')).toBe(1);
    expect(gen.get('haim')).toBe(2);
    expect(gen.get('yaakov')).toBe(3);
    expect(gen.get('eliad')).toBe(4);
  });
  it('places married-in spouses beside their partner, NOT at the top', () => {
    const gen = assignRelativeGenerations(FAMILY);
    expect(gen.get('tamar')).toBe(gen.get('yaakov')); // gen 3, not 0
    expect(gen.get('leah')).toBe(gen.get('haim'));    // gen 2
    expect(gen.get('rivka')).toBe(gen.get('asher'));  // gen 1
    expect(gen.get('sarah')).toBe(gen.get('shaya'));  // gen 0
  });
  it("places a married-in spouse's parents one generation above the spouse", () => {
    // Tamar (gen 3) gains parents → they must land at gen 2, beside Haim/Leah.
    const data = [
      ...FAMILY,
      p({ id: 'tamar-dad', nameHe: 'אבי תמר', gender: 'm', birthYear: 1922 }),
    ].map(x => (x.id === 'tamar' ? { ...x, fatherId: 'tamar-dad' } : x));
    const gen = assignRelativeGenerations(data);
    expect(gen.get('tamar')).toBe(3);
    expect(gen.get('tamar-dad')).toBe(2);
  });
  it('normalises so an ancestor above the founder shifts everyone down', () => {
    // Give Shaya a father → min level becomes the father; founder moves to 1.
    const data = [
      ...FAMILY,
      p({ id: 'great', nameHe: 'אב שעיה שטיינברג', gender: 'm', birthYear: 1820 }),
    ].map(x => (x.id === 'shaya' ? { ...x, fatherId: 'great' } : x));
    const gen = assignRelativeGenerations(data);
    expect(gen.get('great')).toBe(0);
    expect(gen.get('shaya')).toBe(1);
    expect(gen.get('eliad')).toBe(5);
  });
});

describe('buildGenerationBands', () => {
  it('returns ordered bands with derived year ranges', () => {
    const bands = buildGenerationBands(FAMILY);
    expect(bands[0].index).toBe(1);
    expect(bands[0].fromYear).toBe(1846); // Shaya
    expect(bands.map(b => b.index)).toEqual([...bands.keys()].map(i => i + 1));
    // Generation containing Shaya holds both him and his wife.
    expect(bands[0].members.map(m => m.id).sort()).toEqual(['sarah', 'shaya']);
  });
});

describe('getBloodlineIds', () => {
  it('includes surname-bearers and all their descendants, including daughters', () => {
    const blood = getBloodlineIds(FAMILY);
    expect(blood.has('shaya')).toBe(true);
    expect(blood.has('dina')).toBe(true);   // daughter, no surname
    expect(blood.has('noa')).toBe(true);    // daughter's child
    expect(blood.has('eliad')).toBe(true);
  });
  it('excludes married-in spouses', () => {
    const blood = getBloodlineIds(FAMILY);
    expect(blood.has('sarah')).toBe(false);
    expect(blood.has('tamar')).toBe(false);
    expect(blood.has('leah')).toBe(false);
  });
});

describe('getHeritageSpine', () => {
  it('returns the deepest patrilineal chain, founder first', () => {
    const spine = getHeritageSpine(FAMILY).map(x => x.id);
    expect(spine).toEqual(['shaya', 'asher', 'haim', 'yaakov', 'eliad']);
  });
  it('excludes married-in partners from the spine', () => {
    const spine = getHeritageSpine(FAMILY).map(x => x.id);
    expect(spine).not.toContain('sarah');
    expect(spine).not.toContain('tamar');
  });
});

describe('getAncestors / getDescendants', () => {
  const idx = indexPersons(FAMILY);
  it('walks both parent lines up', () => {
    expect([...getAncestors('eliad', idx)].sort())
      .toEqual(['asher', 'haim', 'leah', 'rivka', 'shaya', 'sarah', 'tamar', 'yaakov'].sort());
  });
  it('collects all descendants', () => {
    expect([...getDescendants('haim', idx)].sort())
      .toEqual(['dina', 'eliad', 'noa', 'yaakov'].sort());
  });
});

describe('computeFocus', () => {
  it('lights the lineage and keeps spouses, fades everyone else', () => {
    const focus = computeFocus('yaakov', FAMILY);
    expect(focus.lit.has('yaakov')).toBe(true);
    expect(focus.lit.has('haim')).toBe(true);   // ancestor
    expect(focus.lit.has('eliad')).toBe(true);  // descendant
    expect(focus.lit.has('tamar')).toBe(true);  // spouse of lit person
    expect(focus.lit.has('moshe')).toBe(false); // unrelated branch (uncle)
  });
});

describe('relationshipPath', () => {
  it('labels a parent', () => {
    const r = relationshipPath('eliad', 'yaakov', FAMILY)!;
    expect(r.label).toBe('אב');
    expect(r.upFromA).toBe(1);
    expect(r.upFromB).toBe(0);
  });
  it('labels a grandchild', () => {
    expect(relationshipPath('haim', 'eliad', FAMILY)!.label).toBe('נכד'); // 2 down
  });
  it('labels siblings', () => {
    expect(relationshipPath('haim', 'moshe', FAMILY)!.label).toBe('אח');
  });
  it('labels an uncle', () => {
    expect(relationshipPath('yaakov', 'moshe', FAMILY)!.label).toBe('דוד');
  });
  it('labels cousins and traces the path through the common ancestor', () => {
    const r = relationshipPath('eliad', 'noa', FAMILY)!;
    expect(r.commonAncestorId).toBe('haim');
    expect(r.label).toContain('בת דודה');
    expect(r.path.map(x => x.id)).toEqual(['eliad', 'yaakov', 'haim', 'dina', 'noa']);
  });
  it('returns null for unrelated people', () => {
    const strangers = [p({ id: 'x' }), p({ id: 'y' })];
    expect(relationshipPath('x', 'y', strangers)).toBeNull();
  });
});

describe('buildFamilyUnits', () => {
  it('groups couples with their children', () => {
    const units = buildFamilyUnits(FAMILY);
    const haimUnit = units.find(u => u.members.some(m => m.id === 'haim'))!;
    expect(haimUnit.members.map(m => m.id).sort()).toEqual(['haim', 'leah']);
    expect(haimUnit.children.map(c => c.id)).toEqual(['yaakov', 'dina']); // birth order
  });
  it('handles single parents (no spouse record)', () => {
    const units = buildFamilyUnits(FAMILY);
    const dinaUnit = units.find(u => u.members.some(m => m.id === 'dina'))!;
    expect(dinaUnit.members).toHaveLength(1);
    expect(dinaUnit.children.map(c => c.id)).toEqual(['noa']);
  });
});

describe('buildTimeline', () => {
  it('orders births and deaths chronologically', () => {
    const tl = buildTimeline(FAMILY);
    const years = tl.map(e => e.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    expect(tl[0]).toMatchObject({ year: 1846, type: 'birth' });
  });
});

describe('computeLegacyStats', () => {
  it('computes founder year, generations, countries and counts', () => {
    const s = computeLegacyStats(FAMILY);
    expect(s.founded).toBe(1846);
    expect(s.generations).toBe(5);            // Shaya … Eliad
    expect(s.countries).toBe(3);              // אוקראינה, רומניה, ישראל
    expect(s.members).toBe(FAMILY.length);
    expect(s.living).toBe(FAMILY.filter(x => !x.deathYear).length);
    expect(s.descendants).toBe(getDescendants('shaya', indexPersons(FAMILY)).size);
  });
});

// ── Edge cases: missing data, empties, cycles ─────────────────
describe('robustness', () => {
  it('handles an empty dataset', () => {
    expect(buildGenerationBands([])).toEqual([]);
    expect(getHeritageSpine([])).toEqual([]);
    expect(buildTimeline([])).toEqual([]);
    const s = computeLegacyStats([]);
    expect(s).toMatchObject({ founded: null, generations: 0, members: 0, descendants: 0 });
  });
  it('handles people with no dates or photos', () => {
    const data = [p({ id: 'a', nameHe: 'פלוני שטיינברג' }), p({ id: 'b', nameHe: 'בן', fatherId: 'a' })];
    const bands = buildGenerationBands(data);
    expect(bands[0].fromYear).toBeNull();
    expect(getHeritageSpine(data).map(x => x.id)).toEqual(['a', 'b']);
  });
  it('ignores parent ids that point outside the dataset', () => {
    const data = [p({ id: 'a', nameHe: 'יתום', fatherId: 'ghost', motherId: 'phantom' })];
    const gen = assignGenerations(indexPersons(data));
    expect(gen.get('a')).toBe(0); // treated as a root
  });
  it('does not loop forever on a parent/child cycle', () => {
    const data = [
      p({ id: 'a', nameHe: 'א שטיינברג', fatherId: 'b' }),
      p({ id: 'b', nameHe: 'ב שטיינברג', fatherId: 'a' }),
    ];
    expect(() => {
      assignGenerations(indexPersons(data));
      getHeritageSpine(data);
      relationshipPath('a', 'b', data);
    }).not.toThrow();
  });
});
