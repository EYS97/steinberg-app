import { describe, it, expect } from 'vitest';
import { isNewFamilyTreeEnabled } from './featureFlags';

// Runs in the node (no-window) vitest environment: query + localStorage
// overrides are unavailable, so resolution falls through to the build-time
// env default, which is unset → the flag is OFF by default.
describe('isNewFamilyTreeEnabled', () => {
  it('defaults to false when nothing opts in', () => {
    expect(isNewFamilyTreeEnabled()).toBe(false);
  });
});
