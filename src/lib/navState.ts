/**
 * Shared navigation active-state logic for the sidebar, header and mobile nav.
 *
 * IMPORTANT — path-boundary matching.
 * A naive `pathname.startsWith(item.path)` check lights up the WRONG item when
 * one route is a string prefix of another. e.g. on `/family-tree` the check
 * `"/family-tree".startsWith("/family")` is `true`, so BOTH "משפחה" (`/family`)
 * and "עץ משפחה" (`/family-tree`) appeared selected.
 *
 * The fix: a child route only matches when the next character is a "/" segment
 * boundary (so `/admin/activity` still activates `/admin`, but `/family-tree`
 * does NOT activate `/family`).
 */

export interface NavMatchable {
  path: string;
}

/** True when `itemPath` is the active route for the given `pathname`. */
export function isNavItemActive(pathname: string, itemPath: string): boolean {
  // Root is only active on an exact match — every path starts with "/".
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(itemPath + '/');
}

/**
 * Pick the single best-matching nav item for a pathname.
 *
 * When several items match (e.g. `/admin` and `/admin/activity` both match
 * `/admin/activity`), the MOST SPECIFIC one — the longest matching path — wins,
 * so exactly one item is ever selected regardless of declaration order.
 */
export function findActiveNavItem<T extends NavMatchable>(
  items: readonly T[],
  pathname: string,
): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (isNavItemActive(pathname, item.path)) {
      if (!best || item.path.length > best.path.length) best = item;
    }
  }
  return best;
}
