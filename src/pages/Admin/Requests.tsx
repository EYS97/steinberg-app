import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, X, Clock } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { AdminTabs } from './AdminTabs';
import { useToast } from '@/components/ui/Toast';
import { useSeudot, useSeudahRegistrations } from '@/hooks/useSeudot';
import { useFamilies } from '@/hooks/useFamilies';
import { useActiveEvent } from '@/hooks/useActiveEvent';
import { useAllEventMealConfigs } from '@/hooks/useEventMealConfig';
import { useCalendarMode } from '@/hooks/useCalendarMode';
import { formatDateByMode } from '@/lib/dates';
import {
  effectiveLimit,
  effectiveStatus,
  countApprovedGuestFamilies,
  sortPendingFifo,
} from '@/lib/familyLimit';
import { adminApproveRequest, adminRejectRequest } from '@/lib/mealLimitOps';
import { SEUDAH_ICONS, MEAL_REQUEST_STATUS_LABELS, seudotForEvent } from '@/types';
import type { MealRequestStatus, SeudahRegistration, SeudahType } from '@/types';
import type { User } from 'firebase/auth';

interface RequestsProps { user: User | null; isAdmin: boolean; }

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';
type TypeFilter = 'all' | 'shabbat' | 'holiday';

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'pending',  label: 'ממתינות' },
  { id: 'approved', label: 'מאושרות' },
  { id: 'rejected', label: 'נדחו' },
  { id: 'all',      label: 'הכל' },
];

const STATUS_VARIANT: Record<MealRequestStatus, 'success' | 'warning' | 'error' | 'default'> = {
  approved: 'success',
  pendingAdminApproval: 'warning',
  rejected: 'error',
  cancelled: 'default',
};

/**
 * Admin-only queue of hosting requests created by the guest-family limit —
 * complete families with children whose meal was already at capacity. Full
 * limit/capacity context is visible here only. Approve/reject re-verify the
 * request status inside a transaction (two admins can't double-apply).
 */
export function AdminRequests({ user, isAdmin }: RequestsProps) {
  const { showToast } = useToast();
  const { events } = useActiveEvent();
  const { data: seudot } = useSeudot();
  const { data: registrations } = useSeudahRegistrations();
  const { data: families } = useFamilies();
  const configs = useAllEventMealConfigs();
  const [calMode] = useCalendarMode();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [eventFilter, setEventFilter] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const familiesById = useMemo(() => new Map(families.map(f => [f.id, f])), [families]);
  const eventsById = useMemo(() => new Map(events.map(e => [e.id, e])), [events]);

  // Only requests that ever entered the limit flow (status field exists) are
  // relevant here — legacy registrations were never requests.
  const limitRegs = useMemo(
    () => registrations.filter(r => r.status !== undefined),
    [registrations]
  );

  const filtered = useMemo(() => {
    const list = limitRegs.filter(r => {
      const st = effectiveStatus(r);
      if (statusFilter !== 'all' && !(
        (statusFilter === 'pending' && st === 'pendingAdminApproval') ||
        (statusFilter === 'approved' && st === 'approved') ||
        (statusFilter === 'rejected' && st === 'rejected')
      )) return false;
      if (eventFilter && r.eventId !== eventFilter) return false;
      if (typeFilter !== 'all') {
        const ev = eventsById.get(r.eventId);
        if (ev?.type !== typeFilter) return false;
      }
      return true;
    });
    return sortPendingFifo(list);
  }, [limitRegs, statusFilter, typeFilter, eventFilter, eventsById]);

  const pendingCount = useMemo(
    () => limitRegs.filter(r => effectiveStatus(r) === 'pendingAdminApproval').length,
    [limitRegs]
  );

  const eventOptions = useMemo(() => {
    const ids = [...new Set(limitRegs.map(r => r.eventId))];
    return ids.map(id => {
      const ev = eventsById.get(id);
      const reg = limitRegs.find(r => r.eventId === id);
      return { value: id, label: ev?.title || reg?.eventTitle || id };
    });
  }, [limitRegs, eventsById]);

  /** Approved counted families + configured limit for this request's meal. */
  function capacityInfo(r: SeudahRegistration): { approved: number; limit: number } {
    const config = configs[r.eventId] ?? null;
    const mealRegs = registrations.filter(x => x.seudahId === r.seudahId);
    return {
      approved: countApprovedGuestFamilies({
        mealRegs,
        familiesById,
        hostFamilyId: config?.hostFamilyId,
      }),
      limit: effectiveLimit(config, (r.seudahType ?? '') as SeudahType),
    };
  }

  function seudahLabel(r: SeudahRegistration): string {
    if (r.seudahType) return r.seudahType;
    const s = seudot.find(x => x.id === r.seudahId);
    if (s) return s.type;
    const ev = eventsById.get(r.eventId);
    const synthetic = seudotForEvent(ev, seudot).find(x => x.id === r.seudahId);
    return synthetic?.type ?? 'סעודה';
  }

  function hostLabel(r: SeudahRegistration): string {
    const hostId = configs[r.eventId]?.hostFamilyId;
    if (!hostId) return 'בני הבית';
    const f = familiesById.get(hostId);
    return f ? [f.husband, f.wife].filter(Boolean).join(' ו') : 'בני הבית';
  }

  async function handleApprove(r: SeudahRegistration) {
    if (!user) return;
    setActing(r.id);
    try {
      const applied = await adminApproveRequest(r, user.uid);
      showToast(applied ? 'הבקשה אושרה ✓' : 'הבקשה כבר טופלה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setActing(null);
    }
  }

  async function handleReject(r: SeudahRegistration) {
    if (!user) return;
    setActing(r.id);
    try {
      const applied = await adminRejectRequest(r, user.uid);
      showToast(applied ? 'הבקשה נדחתה' : 'הבקשה כבר טופלה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setActing(null);
    }
  }

  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-primary">🛡 ניהול</h1>
        <p className="text-text-muted text-sm mt-0.5">בקשות אירוח הממתינות לאישור</p>
      </div>
      <AdminTabs />

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-2 mb-3">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                statusFilter === f.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-border text-text-mid hover:border-accent/50'
              }`}
            >
              {f.label}
              {f.id === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="סוג אירוע"
            options={[
              { value: 'all',     label: 'שבתות וחגים' },
              { value: 'shabbat', label: 'שבתות בלבד' },
              { value: 'holiday', label: 'חגים בלבד' },
            ]}
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
          />
          <Select
            label="אירוע"
            options={eventOptions}
            value={eventFilter}
            placeholder="כל האירועים"
            onChange={e => setEventFilter(e.target.value)}
          />
        </div>
      </Card>

      {/* Requests */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="📭"
          title={statusFilter === 'pending' ? 'אין בקשות הממתינות לאישור' : 'אין בקשות תואמות'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const st = effectiveStatus(r);
            const ev = eventsById.get(r.eventId);
            const fam = familiesById.get(r.familyId);
            const { approved, limit } = capacityInfo(r);
            const requestedDate = (r.requestedAt ?? r.createdAt)?.toDate?.();
            return (
              <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-text-base">
                        משפחת {r.familyName}
                        <span className="text-text-muted font-normal"> · {r.adults} מבוגרים, {r.kids} ילדים</span>
                      </p>
                      <p className="text-xs text-text-mid mt-1">
                        {SEUDAH_ICONS[seudahLabel(r) as SeudahType] ?? '🍽'} {seudahLabel(r)}
                        {' · '}{ev?.title || r.eventTitle || r.eventId}
                        {ev?.date && ` · ${formatDateByMode(ev.date.toDate?.() ?? null, calMode, 'short')}`}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        מארח: {hostLabel(r)}
                        {' · '}משפחות מאושרות בסעודה: {approved} / מגבלה: {limit}
                      </p>
                      {fam && (fam.husband || fam.wife) && (
                        <p className="text-xs text-text-muted mt-0.5">
                          הורים: {[fam.husband, fam.wife].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {requestedDate && (
                        <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                          <Clock size={11} /> הוגשה: {formatDateByMode(requestedDate, calMode, 'short')}{' '}
                          {requestedDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Badge variant={STATUS_VARIANT[st]}>
                        {MEAL_REQUEST_STATUS_LABELS[st]}
                        {st === 'approved' && r.approvalSource === 'hostInvited' && ' · הוזמנה ע״י המארח'}
                        {st === 'approved' && r.promotedAfterWait && ' · התפנה מקום'}
                      </Badge>
                      {st === 'pendingAdminApproval' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r)}
                            loading={acting === r.id}
                            disabled={acting !== null && acting !== r.id}
                          >
                            <Check size={14} /> אשר
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(r)}
                            loading={acting === r.id}
                            disabled={acting !== null && acting !== r.id}
                          >
                            <X size={14} /> דחה
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
