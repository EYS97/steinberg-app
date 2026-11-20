import { describe, it, expect } from 'vitest';
import { isNavItemActive, findActiveNavItem } from './navState';
import { NAV_ITEMS } from '@/types';

describe('isNavItemActive', () => {
  it('matches a route exactly', () => {
    expect(isNavItemActive('/family', '/family')).toBe(true);
    expect(isNavItemActive('/family-tree', '/family-tree')).toBe(true);
  });

  it('does NOT treat a prefix without a segment boundary as a match', () => {
    // The original bug: /family-tree must not activate /family.
    expect(isNavItemActive('/family-tree', '/family')).toBe(false);
    expect(isNavItemActive('/seudothing', '/seudot')).toBe(false);
  });

  it('matches nested child routes via the segment boundary', () => {
    expect(isNavItemActive('/admin/activity', '/admin')).toBe(true);
    expect(isNavItemActive('/family/123', '/family')).toBe(true);
  });

  it('only activates root on an exact match', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/family', '/')).toBe(false);
    expect(isNavItemActive('/family-tree', '/')).toBe(false);
  });
});

describe('findActiveNavItem', () => {
  it('selects exactly one item for every real route — never two', () => {
    // Regression guard: walk every nav route and assert a single match,
    // and that no OTHER item also reports active for that route.
    for (const target of NAV_ITEMS) {
      const matches = NAV_ITEMS.filter(i => isNavItemActive(target.path, i.path));
      expect(matches, `route ${target.path} matched ${matches.map(m => m.path).join(', ')}`).toHaveLength(1);
      expect(findActiveNavItem(NAV_ITEMS, target.path)?.id).toBe(target.id);
    }
  });

  it('on /family-tree selects only the family-tree item', () => {
    const active = findActiveNavItem(NAV_ITEMS, '/family-tree');
    expect(active?.id).toBe('family-tree');
    expect(active?.path).toBe('/family-tree');
  });

  it('prefers the most specific item when several match', () => {
    // /admin and (hypothetically) /admin/activity both match — longest wins.
    const items = [{ id: 'a', path: '/admin' }, { id: 'b', path: '/admin/activity' }];
    expect(findActiveNavItem(items, '/admin/activity')?.id).toBe('b');
  });

  it('returns undefined when nothing matches', () => {
    expect(findActiveNavItem(NAV_ITEMS, '/nonexistent')).toBeUndefined();
  });
});
