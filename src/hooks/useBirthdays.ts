import { useFirestoreCollection } from './useFirestoreCollection';
import type { Birthday } from '@/types';

export function useBirthdays() {
  return useFirestoreCollection<Birthday>('birthdays');
}
