import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { Memorial } from '@/types';

export function useMemorials() {
  return useFirestoreCollection<Memorial>('memorials', [orderBy('createdAt')]);
}
