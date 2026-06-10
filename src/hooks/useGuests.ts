import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { Guest } from '@/types';

export function useGuests() {
  return useFirestoreCollection<Guest>('guests', [orderBy('createdAt')]);
}
