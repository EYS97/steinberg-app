import { describe, it, expect } from 'vitest';
import { deriveMembersFromTree, nameMatches } from './members';
import type { TreePerson, Family } from '@/types';

const persons: TreePerson[] = [
  { id: 'd', nameHe: 'אבי כהן', gender: 'm', birthYear: 1985 },
  { id: 'm', nameHe: 'דנה כהן', gender: 'f', birthYear: 1987, spouseId: 'd' },
  { id: 'k1', nameHe: 'יותם כהן', gender: 'm', birthYear: 2015, fatherId: 'd', motherId: 'm' },
  { id: 'k2', nameHe: 'נועה כהן', gender: 'f', birthYear: 2018, fatherId: 'd', motherId: 'm' },
  { id: 'x', nameHe: 'דוד אחר', gender: 'm', birthYear: 1950 }, // unrelated
];

const family = { id: 'fam1', husband: 'אבי', wife: 'דנה' } as Family;

describe('nameMatches', () => {
  it('matches a first name against a full tree name', () => {
    expect(nameMatches('אבי כהן', 'אבי')).toBe(true);
  });
  it('rejects unrelated names and blanks', () => {
    expect(nameMatches('דוד אחר', 'אבי')).toBe(false);
    expect(nameMatches('', 'אבי')).toBe(false);
  });
});

describe('deriveMembersFromTree', () => {
  it('pulls parents + their children, parents first, kids oldest-first', () => {
    const members = deriveMembersFromTree(family, persons);
    expect(members.map(m => [m.role, m.name])).toEqual([
      ['parent', 'אבי כהן'],
      ['parent', 'דנה כהן'],
      ['child', 'יותם כהן'], // 2015 (older)
      ['child', 'נועה כהן'],  // 2018
    ]);
  });

  it('uses stable tree ids so timeline items keep referencing the right person', () => {
    const members = deriveMembersFromTree(family, persons);
    expect(members.map(m => m.id)).toEqual(['d', 'm', 'k1', 'k2']);
  });

  it('falls back to the family-record names when no tree match', () => {
    const unknown = { id: 'fam9', husband: 'פלוני', wife: 'אלמונית' } as Family;
    const members = deriveMembersFromTree(unknown, persons);
    expect(members).toEqual([
      { id: 'fam_h_fam9', name: 'פלוני', role: 'parent' },
      { id: 'fam_w_fam9', name: 'אלמונית', role: 'parent' },
    ]);
  });
});
