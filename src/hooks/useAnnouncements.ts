import { orderBy } from 'firebase/firestore';
import { useFirestoreCollection } from './useFirestoreCollection';
import type { Announcement } from '@/types';

export function useAnnouncements() {
  return useFirestoreCollection<Announcement>('announcements', [orderBy('createdAt', 'desc')]);
}
