import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  startAt,
  endAt,
  setDoc,
  writeBatch,
  serverTimestamp,
  increment,
  Timestamp,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import type { User } from 'firebase/auth';
import type { UserAnalytics } from '@/types';

const COLLECTION = 'userActivity';

/** A user is "active" when they visited the Home screen within this window */
export const ACTIVE_WINDOW_DAYS = 30;
export const PAGE_SIZE = 20;

function windowCutoff(): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86400000));
}

function toAnalytics(snap: QueryDocumentSnapshot<DocumentData>): UserAnalytics {
  const v = snap.data();
  return {
    uid: v.uid || snap.id,
    name: v.name ?? null,
    email: v.email ?? null,
    phone: v.phone ?? null,
    nameLower: v.nameLower ?? null,
    emailLower: v.emailLower ?? null,
    phoneDigits: v.phoneDigits ?? null,
    registrationDate: v.registrationDate ?? null,
    totalHomeVisits: typeof v.totalHomeVisits === 'number' ? v.totalHomeVisits : 0,
    lastHomeVisitAt: v.lastHomeVisitAt ?? null,
    lastSeen: v.lastSeen,
  };
}

// ── Visit tracking ─────────────────────────────────────────────────────────

let lastTrackedUid: string | null = null;
let lastTrackedAt = 0;

/**
 * Counts a Home screen visit: increments totalHomeVisits and stamps
 * lastHomeVisitAt on the user's own userActivity doc. A short module-level
 * guard absorbs StrictMode double-mounts so a visit isn't counted twice.
 */
export function useTrackHomeVisit(user: User | null): void {
  useEffect(() => {
    if (!user) return;
    if (user.uid === lastTrackedUid && Date.now() - lastTrackedAt < 5000) return;
    lastTrackedUid = user.uid;
    lastTrackedAt = Date.now();

    const creation = user.metadata.creationTime
      ? Timestamp.fromDate(new Date(user.metadata.creationTime))
      : null;
    const payload: Record<string, unknown> = {
      uid: user.uid,
      email: user.email ?? null,
      emailLower: user.email?.toLowerCase() ?? null,
      nameLower: (user.displayName || user.email || user.uid).toLowerCase(),
      phone: user.phoneNumber ?? null,
      phoneDigits: user.phoneNumber?.replace(/\D/g, '') ?? null,
      registrationDate: creation,
      totalHomeVisits: increment(1),
      lastHomeVisitAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    };
    if (user.displayName) payload.name = user.displayName;
    setDoc(doc(db, COLLECTION, user.uid), payload, { merge: true }).catch(() => {});
  }, [user]);
}

// ── Legacy doc backfill ────────────────────────────────────────────────────

let backfillPromise: Promise<void> | null = null;

/**
 * Normalizes legacy userActivity docs so server-side queries see every user
 * with complete history. Two jobs:
 *
 *  1. Field shape — missing counters become 0, missing dates become explicit
 *     nulls (orderBy / == null only match fields that exist), registration
 *     date falls back to the old UI's `firstSeen`, and search keys are derived.
 *  2. Legacy activity merge — the original vanilla-JS app recorded visits as
 *     `loginCount` / `lastSeen` (not the new totalHomeVisits / lastHomeVisitAt).
 *     We fold that real history in ONCE, guarded by `legacyMerged`, so heavy
 *     old-app users aren't shown as "never visited" and aren't double-counted
 *     on re-runs. New visits keep accruing via increment() on top of it.
 *
 * Admin-only by rules; runs at most once per page load and only writes docs
 * that actually need a change.
 */
export function ensureAnalyticsBackfill(): Promise<void> {
  if (!backfillPromise) {
    backfillPromise = (async () => {
      try {
        const snap = await getDocs(collection(db, COLLECTION));
        const batch = writeBatch(db);
        let dirty = 0;
        for (const d of snap.docs) {
          if (dirty >= 450) break; // stay under the 500-op batch limit
          const v = d.data();
          const patch: Record<string, unknown> = {};

          // Old vanilla-JS UI stored firstSeen — the best registration date we have
          if (v.registrationDate === undefined || (v.registrationDate === null && v.firstSeen)) {
            patch.registrationDate = v.firstSeen ?? null;
          }
          if (v.nameLower === undefined) patch.nameLower = String(v.name || v.email || d.id).toLowerCase();
          if (v.emailLower === undefined) patch.emailLower = v.email ? String(v.email).toLowerCase() : null;
          if (v.phone === undefined) patch.phone = null;
          if (v.phoneDigits === undefined) patch.phoneDigits = v.phone ? String(v.phone).replace(/\D/g, '') : null;

          // Fold the old UI's loginCount/lastSeen into the new counters, once.
          const hasLegacyActivity = typeof v.loginCount === 'number' || v.lastSeen !== undefined;
          if (!v.legacyMerged && hasLegacyActivity) {
            const baseVisits = typeof v.totalHomeVisits === 'number' ? v.totalHomeVisits : 0;
            const legacyVisits = typeof v.loginCount === 'number' ? v.loginCount : 0;
            patch.totalHomeVisits = baseVisits + legacyVisits;
            // Last home visit = the more recent of the new stamp and the old lastSeen
            const lastVisitMs = v.lastHomeVisitAt?.toMillis?.() ?? 0;
            const lastSeenMs = v.lastSeen?.toMillis?.() ?? 0;
            if (lastSeenMs > lastVisitMs) patch.lastHomeVisitAt = v.lastSeen;
            else if (v.lastHomeVisitAt === undefined) patch.lastHomeVisitAt = null;
            patch.legacyMerged = true;
          } else {
            // No legacy data to merge — just ensure the base fields exist
            if (v.totalHomeVisits === undefined) patch.totalHomeVisits = 0;
            if (v.lastHomeVisitAt === undefined) patch.lastHomeVisitAt = null;
          }

          if (Object.keys(patch).length > 0) {
            batch.update(d.ref, patch);
            dirty++;
          }
        }
        if (dirty > 0) await batch.commit();
      } catch { /* offline or rules denied — queries still work for normalized docs */ }
    })();
  }
  return backfillPromise;
}

// ── KPI aggregations (server-side count queries) ───────────────────────────

export interface ActivityKpis {
  total: number;
  everVisited: number;
  active30: number;
  inactive30: number;
  new30: number;
  neverVisited: number;
}

export function useActivityKpis(enabled: boolean): { kpis: ActivityKpis | null; error: string | null } {
  const [kpis, setKpis] = useState<ActivityKpis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      await ensureAnalyticsBackfill();
      const col = collection(db, COLLECTION);
      const cutoff = windowCutoff();
      const cnt = async (...c: QueryConstraint[]) =>
        (await getCountFromServer(query(col, ...c))).data().count;
      const [total, everVisited, active30, inactive30, new30, neverVisited] = await Promise.all([
        cnt(),
        cnt(where('totalHomeVisits', '>', 0)),
        cnt(where('lastHomeVisitAt', '>=', cutoff)),
        cnt(where('lastHomeVisitAt', '<', cutoff)),
        cnt(where('registrationDate', '>=', cutoff)),
        cnt(where('lastHomeVisitAt', '==', null)),
      ]);
      if (!cancelled) setKpis({ total, everVisited, active30, inactive30, new30, neverVisited });
    })().catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [enabled]);

  return { kpis, error };
}

// ── Paginated user list (server-side filter + sort + cursor pagination) ────

export type ActivityStatusFilter = 'all' | 'active' | 'inactive' | 'never';
export type ActivitySort = 'lastVisit' | 'visits' | 'regDate' | 'name';

const SORT_FIELDS: Record<ActivitySort, { field: string; dir: 'asc' | 'desc' }> = {
  lastVisit: { field: 'lastHomeVisitAt', dir: 'desc' },
  visits:    { field: 'totalHomeVisits', dir: 'desc' },
  regDate:   { field: 'registrationDate', dir: 'desc' },
  name:      { field: 'nameLower', dir: 'asc' },
};

function filterConstraints(status: ActivityStatusFilter, newOnly: boolean): QueryConstraint[] {
  const cutoff = windowCutoff();
  const out: QueryConstraint[] = [];
  if (status === 'active') out.push(where('lastHomeVisitAt', '>=', cutoff));
  if (status === 'inactive') out.push(where('lastHomeVisitAt', '<', cutoff));
  if (status === 'never') out.push(where('lastHomeVisitAt', '==', null));
  if (newOnly) out.push(where('registrationDate', '>=', cutoff));
  return out;
}

/** Firestore can't order by a field under an == filter, and "last visit" is
 *  meaningless for never-visited users — fall back to registration date. */
export function effectiveSort(status: ActivityStatusFilter, sort: ActivitySort): ActivitySort {
  return status === 'never' && sort === 'lastVisit' ? 'regDate' : sort;
}

function clientCompare(sort: ActivitySort) {
  const { field, dir } = SORT_FIELDS[sort];
  const mul = dir === 'asc' ? 1 : -1;
  return (a: UserAnalytics, b: UserAnalytics) => {
    const av = a[field as keyof UserAnalytics];
    const bv = b[field as keyof UserAnalytics];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1; // nulls last
    if (bv === null || bv === undefined) return -1;
    if (av instanceof Timestamp && bv instanceof Timestamp) return mul * (av.toMillis() - bv.toMillis());
    if (typeof av === 'number' && typeof bv === 'number') return mul * (av - bv);
    return mul * String(av).localeCompare(String(bv), 'he');
  };
}

/** Server-side prefix search on name / email / phone search keys */
async function searchUsers(term: string): Promise<UserAnalytics[]> {
  const col = collection(db, COLLECTION);
  const t = term.trim().toLowerCase();
  const queries = [];
  const digits = t.replace(/\D/g, '');
  const isPhoneTerm = digits.length >= 3 && /^[\d\s+-]+$/.test(t);

  if (isPhoneTerm) {
    const variants = new Set([digits]);
    if (digits.startsWith('0')) variants.add('972' + digits.slice(1)); // local → E.164
    for (const v of variants) {
      queries.push(query(col, orderBy('phoneDigits'), startAt(v), endAt(v + '\uf8ff'), limit(50)));
    }
  } else {
    queries.push(query(col, orderBy('nameLower'), startAt(t), endAt(t + '\uf8ff'), limit(50)));
    queries.push(query(col, orderBy('emailLower'), startAt(t), endAt(t + '\uf8ff'), limit(50)));
  }

  const snaps = await Promise.all(queries.map(q => getDocs(q)));
  const byId = new Map<string, UserAnalytics>();
  snaps.forEach(s => s.docs.forEach(d => byId.set(d.id, toAnalytics(d))));
  return [...byId.values()];
}

interface UseActivityUsersResult {
  users: UserAnalytics[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** Total matching the current filters (null while loading) */
  totalMatching: number | null;
  loadMore: () => void;
  error: string | null;
}

export function useActivityUsers(
  enabled: boolean,
  status: ActivityStatusFilter,
  newOnly: boolean,
  sort: ActivitySort,
  search: string,
): UseActivityUsersResult {
  const [users, setUsers] = useState<UserAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalMatching, setTotalMatching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const requestIdRef = useRef(0);

  const sortKey = effectiveSort(status, sort);
  const searchTerm = search.trim();

  const load = useCallback(async (append: boolean) => {
    const reqId = ++requestIdRef.current;
    const stale = () => reqId !== requestIdRef.current;
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      await ensureAnalyticsBackfill();
      const col = collection(db, COLLECTION);
      const wheres = filterConstraints(status, newOnly);

      if (searchTerm) {
        // Prefix search server-side, then refine by the active quick filters
        const matches = await searchUsers(searchTerm);
        if (stale()) return;
        const cutoffMs = Date.now() - ACTIVE_WINDOW_DAYS * 86400000;
        const refined = matches.filter(u => {
          if (status === 'active' && !(u.lastHomeVisitAt && u.lastHomeVisitAt.toMillis() >= cutoffMs)) return false;
          if (status === 'inactive' && !(u.lastHomeVisitAt && u.lastHomeVisitAt.toMillis() < cutoffMs)) return false;
          if (status === 'never' && u.lastHomeVisitAt !== null) return false;
          if (newOnly && !(u.registrationDate && u.registrationDate.toMillis() >= cutoffMs)) return false;
          return true;
        }).sort(clientCompare(sortKey));
        setUsers(refined);
        setTotalMatching(refined.length);
        setHasMore(false);
        cursorRef.current = null;
        return;
      }

      const { field, dir } = SORT_FIELDS[sortKey];
      const constraints: QueryConstraint[] = [...wheres, orderBy(field, dir), limit(PAGE_SIZE)];
      if (append && cursorRef.current) constraints.push(startAfter(cursorRef.current));

      const [snap, countSnap] = await Promise.all([
        getDocs(query(col, ...constraints)),
        append ? Promise.resolve(null) : getCountFromServer(query(col, ...wheres)),
      ]);
      if (stale()) return;

      const page = snap.docs.map(toAnalytics);
      cursorRef.current = snap.docs[snap.docs.length - 1] ?? cursorRef.current;
      setUsers(prev => (append ? [...prev, ...page] : page));
      setHasMore(snap.docs.length === PAGE_SIZE);
      if (countSnap) setTotalMatching(countSnap.data().count);
    } catch (e: unknown) {
      if (!stale()) setError((e as Error).message);
    } finally {
      if (!stale()) { setLoading(false); setLoadingMore(false); }
    }
  }, [status, newOnly, sortKey, searchTerm]);

  useEffect(() => {
    if (!enabled) return;
    cursorRef.current = null;
    load(false);
  }, [enabled, load]);

  const loadMore = useCallback(() => { load(true); }, [load]);

  return { users, loading, loadingMore, hasMore, totalMatching, loadMore, error };
}

// ── Display helpers ────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'inactive' | 'never';

export function userStatus(u: UserAnalytics): UserStatus {
  if (!u.lastHomeVisitAt) return 'never';
  const cutoffMs = Date.now() - ACTIVE_WINDOW_DAYS * 86400000;
  return u.lastHomeVisitAt.toMillis() >= cutoffMs ? 'active' : 'inactive';
}

export function daysSinceLastVisit(u: UserAnalytics): number | null {
  if (!u.lastHomeVisitAt) return null;
  return Math.floor((Date.now() - u.lastHomeVisitAt.toMillis()) / 86400000);
}
