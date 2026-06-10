import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { Family } from '@/types';

export function useFamilies() {
  return useFirestoreCollection<Family>('families', [orderBy('createdAt')]);
}
