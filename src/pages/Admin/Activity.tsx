import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { AdminTabs } from './AdminTabs';
import {
  useActivityKpis,
  useActivityUsers,
  userStatus,
  daysSinceLastVisit,
  effectiveSort,
  ACTIVE_WINDOW_DAYS,
  type ActivityStatusFilter,
  type ActivitySort,
  type UserStatus,
} from '@/hooks/useUserAnalytics';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { formatDateByMode } from '@/lib/dates';
import { cn, initials, avatarColor } from '@/lib/utils';
import type { UserAnalytics } from '@/types';
import type { Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth';

interface ActivityProps { user: User | null; isAdmin: boolean; }

// ── Labels ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<UserStatus, { label: string; variant: 'success' | 'warning' | 'default' }> = {
  active:   { label: 'פעיל',            variant: 'success' },
  inactive: { label: 'לא פעיל',         variant: 'warning' },
  never:    { label: 'מעולם לא ביקר', variant: 'default' },
};

const STATUS_FILTERS: { id: ActivityStatusFilter; label: string }[] = [
  { id: 'all',      label: 'כל המשתמשים' },
  { id: 'active',   label: `פעילים (${ACTIVE_WINDOW_DAYS} יום)` },
  { id: 'inactive', label: `לא פעילים (${ACTIVE_WINDOW_DAYS} יום)` },
  { id: 'never',    label: 'מעולם לא ביקרו' },
];

const SORT_OPTIONS: { value: ActivitySort; label: string }[] = [
  { value: 'lastVisit', label: 'ביקור אחרון' },
  { value: 'visits',    label: 'סה״כ ביקורים' },
  { value: 'regDate',   label: 'תאריך הרשמה' },
  { value: 'name',      label: 'שם' },
];

function relativeDays(days: number | null): string {
  if (days === null) return 'מעולם לא';
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

// ── Small building blocks ──────────────────────────────────────────────────

function KpiCard({ value, label, description }: {
  value: number | null; label: string; description: string;
}) {
  return (
    <Card padding="sm" className="flex flex-col gap-0.5">
      <span className="text-2xl font-bold text-primary tabular-nums">
        {value === null ? '…' : value}
      </span>
      <span className="text-sm font-semibold text-text-base">{label}</span>
      <span className="text-xs text-text-muted">{description}</span>
    </Card>
  );
}

function FilterChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap',
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-surface text-text-mid border-border hover:bg-surface-alt'
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ u }: { u: UserAnalytics }) {
  const s = STATUS_LABELS[userStatus(u)];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function UserAvatar({ u, size = 36 }: { u: UserAnalytics; size?: number }) {
  const display = u.name || u.email || u.uid;
  return (
    <span
      className="rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ width: size, height: size, background: avatarColor(display) }}
      aria-hidden="true"
    >
      {initials(display)}
    </span>
  );
}

// ── Detail drawer (read-only) ──────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-border last:border-0">
      <span className="text-sm text-text-muted shrink-0">{label}</span>
      <span className="text-sm font-medium text-text-base text-left">{children}</span>
    </div>
  );
}

function UserDrawer({ user, onClose, fmtDate }: {
  user: UserAnalytics | null;
  onClose: () => void;
  fmtDate: (t: Timestamp | null) => string;
}) {
  useEffect(() => {
    if (!user) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [user, onClose]);

  const days = user ? daysSinceLastVisit(user) : null;

  return (
    <AnimatePresence>
      {user && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 left-0 w-full max-w-md bg-surface shadow-modal overflow-y-auto"
            role="dialog" aria-modal="true" aria-label="פרטי משתמש"
          >
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface z-10">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar u={user} size={44} />
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-primary truncate">
                    {user.name || user.email || user.uid}
                  </h2>
                  <StatusBadge u={user} />
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
                <X size={18} />
              </Button>
            </div>
            <div className="p-5">
              <DetailRow label="שם מלא">{user.name || '—'}</DetailRow>
              <DetailRow label="אימייל">
                {user.email ? <span dir="ltr">{user.email}</span> : '—'}
              </DetailRow>
              <DetailRow label="טלפון">
                {user.phone ? <span dir="ltr">{user.phone}</span> : '—'}
              </DetailRow>
              <DetailRow label="תאריך הרשמה">{fmtDate(user.registrationDate)}</DetailRow>
              <DetailRow label="ביקור אחרון">
                {user.lastHomeVisitAt
                  ? <>{relativeDays(days)} · {fmtDate(user.lastHomeVisitAt)}</>
                  : <Badge>מעולם לא</Badge>}
              </DetailRow>
              <DetailRow label="סה״כ ביקורים בדף הבית">{user.totalHomeVisits}</DetailRow>
              <DetailRow label="ימים מאז הביקור האחרון">
                {days === null ? '—' : days}
              </DetailRow>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function AdminActivity({ isAdmin }: ActivityProps) {
  const [calMode] = useCalendarMode();
  const [status, setStatus] = useState<ActivityStatusFilter>('all');
  const [newOnly, setNewOnly] = useState(false);
  const [sort, setSort] = useState<ActivitySort>('lastVisit');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<UserAnalytics | null>(null);

  // Debounce the search box → server query
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { kpis, error: kpiError } = useActivityKpis(isAdmin);
  const { users, loading, loadingMore, hasMore, totalMatching, loadMore, error } =
    useActivityUsers(isAdmin, status, newOnly, sort, search);

  // The claim-admin card lives on /admin — non-admins go there
  if (!isAdmin) return <Navigate to="/admin" replace />;

  const fmtDate = (t: Timestamp | null) =>
    t ? formatDateByMode(t.toDate(), calMode, 'short') : '—';

  const activeSort = effectiveSort(status, sort);
  const hasAnyFilter = status !== 'all' || newOnly || search.trim() !== '';
  const noUsersAtAll = !loading && users.length === 0 && !hasAnyFilter && (kpis?.total ?? 0) === 0;

  const sortableHeader = (key: ActivitySort, label: string) => (
    <th
      className="px-3 py-2.5 font-semibold text-text-mid cursor-pointer select-none hover:text-primary whitespace-nowrap"
      onClick={() => setSort(key)}
      aria-sort={activeSort === key ? 'descending' : undefined}
    >
      {label}
      {activeSort === key && <ChevronDown size={12} className="inline mr-1" />}
    </th>
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-primary">📊 פעילות משתמשים</h1>
        <p className="text-text-muted text-sm mt-0.5">
          מי משתמש באפליקציה, מתי ביקרו לאחרונה ומי עדיין לא התחיל
        </p>
      </div>

      <AdminTabs />

      {(kpiError || error) && (
        <Card padding="sm" className="mb-4 border-error/40">
          <p className="text-sm text-error">שגיאה בטעינת הנתונים: {kpiError || error}</p>
        </Card>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <KpiCard value={kpis?.total ?? null} label="סה״כ משתמשים"
          description="כל מי שנרשם לאפליקציה" />
        <KpiCard value={kpis?.everVisited ?? null} label="משתמשים פעילים"
          description="ביקרו בדף הבית לפחות פעם אחת" />
        <KpiCard value={kpis?.active30 ?? null} label={`פעילים ב־${ACTIVE_WINDOW_DAYS} הימים האחרונים`}
          description="ביקרו בדף הבית בחודש האחרון" />
        <KpiCard value={kpis?.inactive30 ?? null} label={`לא פעילים מעל ${ACTIVE_WINDOW_DAYS} יום`}
          description="ביקרו בעבר, אך לא בחודש האחרון" />
        <KpiCard value={kpis?.new30 ?? null} label={`חדשים ב־${ACTIVE_WINDOW_DAYS} הימים האחרונים`}
          description="הצטרפו לאפליקציה בחודש האחרון" />
        <KpiCard value={kpis?.neverVisited ?? null} label="מעולם לא ביקרו"
          description="נרשמו אך טרם נכנסו לדף הבית" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {STATUS_FILTERS.map(f => (
          <FilterChip key={f.id} active={status === f.id} onClick={() => setStatus(f.id)}>
            {f.label}
          </FilterChip>
        ))}
        <span className="w-px h-5 bg-border mx-1" aria-hidden="true" />
        <FilterChip active={newOnly} onClick={() => setNewOnly(v => !v)}>
          + חדשים ב־{ACTIVE_WINDOW_DAYS} יום
        </FilterChip>
      </div>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="חיפוש לפי שם, אימייל או טלפון..."
            className="pr-10"
            aria-label="חיפוש משתמשים"
          />
        </div>
        <div className="sm:w-48">
          <Select
            value={sort}
            onChange={e => setSort(e.target.value as ActivitySort)}
            options={SORT_OPTIONS.map(o => ({ value: o.value, label: `מיון: ${o.label}` }))}
            aria-label="מיון"
          />
        </div>
      </div>

      {totalMatching !== null && !noUsersAtAll && (
        <p className="text-xs text-text-muted mb-2">{totalMatching} משתמשים</p>
      )}

      {/* Results */}
      {loading ? (
        <Card><p className="text-sm text-text-muted py-8 text-center">טוען נתונים…</p></Card>
      ) : noUsersAtAll ? (
        <Card padding="none">
          <EmptyState
            icon="👥"
            title="עדיין אין נתוני שימוש"
            description="ברגע שבני המשפחה יתחילו להיכנס לאפליקציה, סטטיסטיקות השימוש יופיעו כאן."
          />
        </Card>
      ) : users.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon="🔍"
            title="אין משתמשים התואמים את הסינון שנבחר"
            description="נסו לשנות את הסינון או את החיפוש."
          />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card padding="none" className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="border-b border-border bg-surface-alt/50">
                <tr>
                  {sortableHeader('name', 'שם')}
                  <th className="px-3 py-2.5 font-semibold text-text-mid">אימייל</th>
                  <th className="px-3 py-2.5 font-semibold text-text-mid">טלפון</th>
                  {sortableHeader('regDate', 'תאריך הרשמה')}
                  <th className="px-3 py-2.5 font-semibold text-text-mid">סטטוס</th>
                  {sortableHeader('visits', 'ביקורים')}
                  {sortableHeader('lastVisit', 'ביקור אחרון')}
                  <th className="px-3 py-2.5 font-semibold text-text-mid whitespace-nowrap">פעיל ב־30 יום</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr
                    key={u.uid}
                    onClick={() => setSelected(u)}
                    className="border-b border-border last:border-0 hover:bg-surface-alt/60 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar u={u} size={30} />
                        <span className="font-medium text-text-base truncate">{u.name || '—'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-text-mid truncate max-w-[180px]" dir="ltr">{u.email || '—'}</td>
                    <td className="px-3 py-2.5 text-text-mid" dir="ltr">{u.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-text-mid whitespace-nowrap">{fmtDate(u.registrationDate)}</td>
                    <td className="px-3 py-2.5"><StatusBadge u={u} /></td>
                    <td className="px-3 py-2.5 tabular-nums">{u.totalHomeVisits}</td>
                    <td className="px-3 py-2.5 text-text-mid whitespace-nowrap">
                      {u.lastHomeVisitAt ? relativeDays(daysSinceLastVisit(u)) : <Badge>מעולם לא</Badge>}
                    </td>
                    <td className="px-3 py-2.5">{userStatus(u) === 'active' ? 'כן' : 'לא'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2.5">
            {users.map(u => (
              <Card key={u.uid} padding="sm" hover onClick={() => setSelected(u)}>
                <div className="flex items-center gap-3">
                  <UserAvatar u={u} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-text-base truncate">{u.name || u.email || u.uid}</p>
                    {u.email && <p className="text-xs text-text-muted truncate" dir="ltr">{u.email}</p>}
                  </div>
                  <StatusBadge u={u} />
                </div>
                <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-border text-xs text-text-mid">
                  <span>{u.totalHomeVisits} ביקורים</span>
                  <span>
                    ביקור אחרון: {u.lastHomeVisitAt ? relativeDays(daysSinceLastVisit(u)) : 'מעולם לא'}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-4">
              <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                טען עוד
              </Button>
            </div>
          )}
        </>
      )}

      <UserDrawer user={selected} onClose={() => setSelected(null)} fmtDate={fmtDate} />
    </div>
  );
}
