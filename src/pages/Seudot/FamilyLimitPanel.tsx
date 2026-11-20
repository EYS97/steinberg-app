import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus, UserPlus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { SEUDAH_ICONS } from '@/types';
import type { AppEvent, EventMealConfig, Family, Seudah } from '@/types';
import type { SeudahState } from '@/lib/eventState';
import {
  MIN_GUEST_FAMILIES_LIMIT,
  MAX_GUEST_FAMILIES_LIMIT,
  clampLimit,
  effectiveLimit,
  countApprovedGuestFamilies,
} from '@/lib/familyLimit';
import { saveMealLimit, hostInviteFamily } from '@/lib/mealLimitOps';

interface FamilyLimitPanelProps {
  event: AppEvent;
  config: EventMealConfig | null;
  perSeudah: SeudahState[];
  families: Family[];
  familiesById: Map<string, Family>;
  uid: string;
  familyLabel: (f: Family) => string;
}

/**
 * Host/admin-only configuration for the guest-family limit — how many complete
 * families with children are approved automatically per meal — plus direct
 * host invitations (approved even above the limit). Never rendered for
 * regular guests; nothing here leaks into the guest-facing UI.
 */
export function FamilyLimitPanel({
  event,
  config,
  perSeudah,
  families,
  familiesById,
  uid,
  familyLabel,
}: FamilyLimitPanelProps) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteFamilyId, setInviteFamilyId] = useState('');
  const [inviteSeudahIds, setInviteSeudahIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  const hostFamilyId = config?.hostFamilyId;

  const approvedCountFor = (s: SeudahState) =>
    countApprovedGuestFamilies({
      mealRegs: s.registrations,
      mealBookings: s.roomGuests,
      familiesById,
      hostFamilyId,
    });

  async function changeLimit(s: SeudahState, next: number) {
    const type = s.seudah.type;
    const previous = effectiveLimit(config, type);
    const value = clampLimit(next);
    if (value === previous) return;
    setSaving(type);
    try {
      const { promoted } = await saveMealLimit({
        eventId: event.id,
        seudahType: type,
        value,
        uid,
        previous,
        config,
        seudah: s.seudah,
        mealRegs: [...s.registrations, ...s.pendingRegistrations],
        mealBookings: s.roomGuests,
        familiesById,
      });
      showToast(
        promoted.length > 0
          ? `המגבלה עודכנה ✓ ${promoted.length === 1 ? 'משפחה אחת אושרה' : `${promoted.length} משפחות אושרו`} אוטומטית`
          : 'המגבלה עודכנה ✓'
      );
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSaving(null);
    }
  }

  async function handleInvite() {
    const family = families.find(f => f.id === inviteFamilyId);
    if (!family) { showToast('נא לבחור משפחה', 'error'); return; }
    const seudot: Seudah[] = perSeudah
      .filter(s => inviteSeudahIds.includes(s.seudah.id))
      .map(s => s.seudah);
    if (!seudot.length) { showToast('נא לבחור סעודה אחת לפחות', 'error'); return; }
    setInviting(true);
    try {
      await hostInviteFamily({ event, seudot, family, familyName: familyLabel(family), uid });
      showToast('המשפחה הוזמנה ואושרה ✓');
      setInviteModal(false);
      setInviteFamilyId('');
      setInviteSeudahIds([]);
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setInviting(false);
    }
  }

  const familyOptions = families.map(f => ({ value: f.id, label: familyLabel(f) }));

  return (
    <Card className="mb-5" padding="none">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-right"
        aria-expanded={open}
      >
        <span className="font-bold text-primary text-sm">👨‍👩‍👧‍👦 הגבלת משפחות מתארחות</span>
        <span className="text-text-muted">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {open && (
        <div className="px-5 pb-4 border-t border-border pt-3">
          <p className="text-xs text-text-muted mb-3 leading-relaxed">
            כמה משפחות שלמות עם ילדים יאושרו אוטומטית לכל סעודה.
            אורחים בודדים וזוגות ללא ילדים אינם נספרים במגבלה.
            מידע זה מוצג למארחים ולמנהלים בלבד.
          </p>

          <div className="space-y-2">
            {perSeudah.map(s => {
              const limit = effectiveLimit(config, s.seudah.type);
              const approved = approvedCountFor(s);
              const pending = s.pendingRegistrations.length;
              const over = approved > limit;
              return (
                <div key={s.seudah.id} className="p-3 bg-surface-alt rounded-md border border-border">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-text-base">
                        {SEUDAH_ICONS[s.seudah.type]} {s.seudah.type}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        משפחות מאושרות: {approved} · מגבלה: {limit}
                        {pending > 0 && ` · ממתינות לאישור מנהל: ${pending}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1" dir="ltr">
                      <button
                        type="button"
                        onClick={() => changeLimit(s, limit - 1)}
                        disabled={saving === s.seudah.type || limit <= MIN_GUEST_FAMILIES_LIMIT}
                        className="w-8 h-8 rounded-btn border border-border bg-surface flex items-center justify-center text-text-mid hover:border-accent/60 disabled:opacity-40"
                        aria-label={`הפחת מגבלה — ${s.seudah.type}`}
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={MIN_GUEST_FAMILIES_LIMIT}
                        max={MAX_GUEST_FAMILIES_LIMIT}
                        value={limit}
                        disabled={saving === s.seudah.type}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) void changeLimit(s, v);
                        }}
                        className="w-14 h-8 text-center text-sm font-semibold rounded-btn border border-border bg-surface text-text-base"
                        aria-label={`מגבלת משפחות — ${s.seudah.type}`}
                      />
                      <button
                        type="button"
                        onClick={() => changeLimit(s, limit + 1)}
                        disabled={saving === s.seudah.type || limit >= MAX_GUEST_FAMILIES_LIMIT}
                        className="w-8 h-8 rounded-btn border border-border bg-surface flex items-center justify-center text-text-mid hover:border-accent/60 disabled:opacity-40"
                        aria-label={`הגדל מגבלה — ${s.seudah.type}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  {over && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 leading-relaxed">
                      ⚠️ אושרו כבר יותר משפחות מהמגבלה החדשה. האישורים הקיימים נשמרים,
                      אך בקשות חדשות יחייבו אישור מנהל.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={() => setInviteModal(true)}>
              <UserPlus size={14} /> הזמן משפחה ישירות
            </Button>
            <p className="text-[11px] text-text-muted mt-1.5">
              הזמנה ישירה מאושרת מיד — גם מעבר למגבלה — ונספרת במניין המשפחות המאושרות.
            </p>
          </div>
        </div>
      )}

      {/* Host invitation modal */}
      <Modal
        open={inviteModal}
        onClose={() => setInviteModal(false)}
        title="הזמן משפחה ישירות"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setInviteModal(false)}>ביטול</Button>
            <Button onClick={handleInvite} loading={inviting}>הזמן ואשר ✓</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="משפחה"
            options={familyOptions}
            value={inviteFamilyId}
            placeholder="-- בחר משפחה --"
            onChange={e => setInviteFamilyId(e.target.value)}
          />
          <div>
            <label className="text-sm font-medium text-text-mid mb-2 block">לאילו סעודות?</label>
            <div className="flex flex-col gap-2">
              {perSeudah.map(s => {
                const selected = inviteSeudahIds.includes(s.seudah.id);
                return (
                  <button
                    key={s.seudah.id}
                    type="button"
                    onClick={() =>
                      setInviteSeudahIds(prev =>
                        selected ? prev.filter(x => x !== s.seudah.id) : [...prev, s.seudah.id]
                      )
                    }
                    className={`px-3 py-2 rounded-btn text-sm border text-right transition-colors ${
                      selected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-surface border-border text-text-mid hover:border-accent/50'
                    }`}
                  >
                    {SEUDAH_ICONS[s.seudah.type]} {s.seudah.type}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
