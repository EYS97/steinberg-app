import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { Seudah, SeudahRegistration } from '@/types';

export function useSeudot() {
  return useFirestoreCollection<Seudah>('seudot', [orderBy('createdAt')]);
}

export function useSeudahRegistrations() {
  return useFirestoreCollection<SeudahRegistration>('seudahRegistrations', [orderBy('createdAt')]);
}
