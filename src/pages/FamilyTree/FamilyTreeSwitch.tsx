import type { User } from 'firebase/auth';
import { NewFamilyTree } from './NewFamilyTree';

/**
 * Routes `/family-tree` to the redesigned experience for all users.
 *
 * The classic tree (`./index`) is retained in the codebase but is no longer
 * reachable from the UI — the redesign is now the single, universal view.
 */
export function FamilyTreeSwitch(props: { user: User | null; isAdmin: boolean }) {
  return <NewFamilyTree {...props} />;
}
