import { indexPersons } from '@/lib/familyTree/adapter';
import type { TreePerson, Family } from '@/types';
import type { AugustMember } from '@/types/august';

// ── Auto-match family members from the family tree ──────────────────────────
// The `families` record only stores the parents' names + a kids COUNT, so the
// named children live in the family tree. We match the family's husband/wife
// names to tree people, then pull their children straight from the tree links.
// Tolerant matching (the family record may hold a first name while the tree
// holds the full name); falls back to the family-record names if no tree match.

function norm(s?: string): string {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Tolerant name match: equal, or one name's tokens contain the other. */
export function nameMatches(personName?: string, famName?: string): boolean {
  const a = norm(personName);
  const b = norm(famName);
  if (!a || !b) return false;
  if (a === b) return true;
  const at = a.split(' ');
  const bt = b.split(' ');
  return at.includes(b) || bt.includes(a) || a.includes(b) || b.includes(a);
}

function findPerson(persons: TreePerson[], famName?: string): TreePerson | undefined {
  if (!norm(famName)) return undefined;
  return persons.find(p => nameMatches(p.nameHe, famName))
      ?? persons.find(p => nameMatches(p.nameLatin, famName));
}

/**
 * Derive the nuclear family's members (parents + named children) from the tree.
 * Returns parents first, then children oldest-first. If neither parent is found
 * in the tree, falls back to the family-record names as parents (no children).
 */
export function deriveMembersFromTree(
  family: Pick<Family, 'id' | 'husband' | 'wife'>,
  persons: TreePerson[],
): AugustMember[] {
  const husband = findPerson(persons, family.husband);
  const wife = findPerson(persons, family.wife);
  const parents = [husband, wife].filter(Boolean) as TreePerson[];

  if (parents.length === 0) {
    const out: AugustMember[] = [];
    if (family.husband?.trim()) out.push({ id: `fam_h_${family.id}`, name: family.husband.trim(), role: 'parent' });
    if (family.wife?.trim()) out.push({ id: `fam_w_${family.id}`, name: family.wife.trim(), role: 'parent' });
    return out;
  }

  const idx = indexPersons(persons);
  const childIds = new Set<string>();
  for (const p of parents) (idx.childrenOf.get(p.id) ?? []).forEach(id => childIds.add(id));

  const children = [...childIds]
    .map(id => idx.byId.get(id))
    .filter((c): c is TreePerson => !!c)
    .sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999)); // oldest first

  return [
    ...parents.map(p => ({ id: p.id, name: p.nameHe || p.nameLatin || 'הורה', role: 'parent' as const })),
    ...children.map(c => ({ id: c.id, name: c.nameHe || c.nameLatin || 'ילד/ה', role: 'child' as const })),
  ];
}
