import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { FoodItem } from '@/types';

export function useFood() {
  return useFirestoreCollection<FoodItem>('food', [orderBy('createdAt')]);
}
