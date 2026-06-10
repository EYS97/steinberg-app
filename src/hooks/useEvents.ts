import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { AppEvent } from '@/types';

export function useEvents() {
  return useFirestoreCollection<AppEvent>('events', [orderBy('date')]);
}
