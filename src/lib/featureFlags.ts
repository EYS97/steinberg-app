/**
 * Lightweight client feature flags.
 *
 * Resolution order (first match wins):
 *   1. URL query — `?newtree=1` / `?newtree=0` (one-off override for testing)
 *   2. localStorage — persisted per-device toggle
 *   3. build-time env — `VITE_NEW_FAMILY_TREE=1`
 *   4. default OFF
 *
 * Keeping the new Family-Tree experience behind a flag lets the existing tree
 * stay the live default until the redesign is fully validated.
 */

const NEW_TREE_KEY = 'ff_newFamilyTree';

function readQuery(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function isNewFamilyTreeEnabled(): boolean {
  const q = readQuery('newtree');
  if (q === '1') return true;
  if (q === '0') return false;

  const ls = readStorage(NEW_TREE_KEY);
  if (ls === '1') return true;
  if (ls === '0') return false;

  return import.meta.env.VITE_NEW_FAMILY_TREE === '1';
}

/** Persist a per-device override (used by the in-app toggle). */
export function setNewFamilyTreeEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(NEW_TREE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/**
 * Persist a `?newtree=1`/`?newtree=0` URL override to localStorage so the
 * choice survives in-app navigation (React Router drops the query string).
 * Without this the flag reverts to its default the moment you leave the page.
 */
export function syncNewFamilyTreeFlag(): void {
  const q = readQuery('newtree');
  if (q === '1') setNewFamilyTreeEnabled(true);
  else if (q === '0') setNewFamilyTreeEnabled(false);
}
