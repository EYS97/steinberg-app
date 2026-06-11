import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, MapPin, Users, CheckCircle, XCircle, Clock, Star } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import {
  useHosting, createHostingAvailability, cancelHostingAvailability,
  createHostingRequest, approveRequestAsHost, approveRequestAsAdmin,
  rejectRequest, cancelRequest
} from '@/hooks/useHosting';
import { useEvents } from '@/hooks/useEvents';
import { useFamilies } from '@/hooks/useFamilies';
import { useToast } from '@/components/ui/Toast';
import { REQUEST_STATUS_LABELS } from '@/types';
import type { HostingAvailability, HostingRequest, HostingType } from '@/types';
import type { User } from 'firebase/auth';

interface HostingProps { user: User | null; isAdmin: boolean; }

type Tab = 'open' | 'myRequests' | 'incoming' | 'admin';

const HOSTING_TYPE_LABELS: Record<HostingType, string> = {
  meal: '🍽 ארוחה בלבד',
  sleep: '🛏 לינה בלבד',
  full: '✨ שבת מלאה',
};

const CITY_OPTIONS = ['כרמיאל', 'תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'אחר'];

export function Hosting({ user, isAdmin }: HostingProps) {
  const { showToast } = useToast();
  const { availability, requests, loading } = useHosting();
  const { data: events } = useEvents();
  const { data: families } = useFamilies();

  // Deep links from the Home action bar: { tab } or { openWizard }
  const navState = (useLocation().state ?? {}) as { tab?: Tab; openWizard?: boolean };
  const [tab, setTab] = useState<Tab>(navState.tab && navState.tab !== 'admin' ? navState.tab : 'open');
  const [filterEventId, setFilterEventId] = useState('');
  const [hostWizard, setHostWizard] = useState(!!navState.openWizard);
  const [guestModal, setGuestModal] = useState(false);
  const [selectedAvail, setSelectedAvail] = useState<HostingAvailability | null>(null);

  // Host wizard state
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardForm, setWizardForm] = useState({
    eventId: '', city: '', type: 'full' as HostingType,
    beds: 1, mattresses: 0, maxFamilySize: 4,
    capacityMode: 'singleFamily' as 'singleFamily' | 'multipleFamilies',
    meals: [] as string[],
    notes: '',
  });

  // Guest request form
  const [guestForm, setGuestForm] = useState({
    adults: 2, children: 0, needsSleep: false, meals: [] as string[], notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const upcomingEvents = events.filter(e => e.date?.toDate?.() >= new Date());
  const eventOptions = upcomingEvents.map(e => ({ value: e.id, label: e.title }));

  const myFamilyId = user?.uid || '';
  const myFamily = families.find(f => f.createdBy === myFamilyId || f.husband === (user?.displayName?.split(' ')[0] || ''));
  const myFamilyName = myFamily
    ? [myFamily.husband, myFamily.wife].filter(Boolean).join(' ו')
    : user?.displayName || 'ממשפחתנו';

  // Filter by event
  const filtered = useMemo(() => {
    if (!filterEventId) return availability;
    return availability.filter(h => h.eventId === filterEventId);
  }, [availability, filterEventId]);

  // Open slots
  const openSlots = filtered.filter(h => h.status === 'available');

  // My requests (as guest)
  const myRequests = requests.filter(r => r.createdBy === myFamilyId);

  // Incoming requests (as host)
  const myAvailIds = availability.filter(h => h.createdBy === myFamilyId).map(h => h.id);
  const incomingRequests = requests.filter(r => myAvailIds.includes(r.availabilityId));

  // Toggle meal
  const toggleMeal = (meal: string, field: 'wizardForm' | 'guestForm') => {
    if (field === 'wizardForm') {
      setWizardForm(f => ({
        ...f,
        meals: f.meals.includes(meal) ? f.meals.filter(m => m !== meal) : [...f.meals, meal],
      }));
    } else {
      setGuestForm(f => ({
        ...f,
        meals: f.meals.includes(meal) ? f.meals.filter(m => m !== meal) : [...f.meals, meal],
      }));
    }
  };

  async function handlePublishHosting() {
    if (!wizardForm.eventId) { showToast('נא לבחור אירוע', 'error'); return; }
    if (!wizardForm.city) { showToast('נא להזין עיר', 'error'); return; }
    setSubmitting(true);
    try {
      const ev = events.find(e => e.id === wizardForm.eventId);
      await createHostingAvailability({
        ...wizardForm,
        eventTitle: ev?.title || '',
        familyId: myFamilyId,
        familyName: myFamilyName,
        createdBy: myFamilyId,
      });
      showToast('האירוח פורסם ✓');
      setHostWizard(false);
      setWizardStep(1);
      setWizardForm({ eventId: '', city: '', type: 'full', beds: 1, mattresses: 0, maxFamilySize: 4, capacityMode: 'singleFamily', meals: [], notes: '' });
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGuestRequest() {
    if (!selectedAvail) return;
    setSubmitting(true);
    try {
      await createHostingRequest({
        availabilityId: selectedAvail.id,
        guestFamilyId: myFamilyId,
        guestFamilyName: myFamilyName,
        adults: guestForm.adults,
        children: guestForm.children,
        needsSleep: guestForm.needsSleep,
        meals: guestForm.meals,
        notes: guestForm.notes,
        eventId: selectedAvail.eventId,
        eventTitle: selectedAvail.eventTitle,
        hostFamilyId: selectedAvail.familyId,
        hostFamilyName: selectedAvail.familyName,
        createdBy: myFamilyId,
      });
      showToast('הבקשה נשלחה ✓');
      setGuestModal(false);
      setGuestForm({ adults: 2, children: 0, needsSleep: false, meals: [], notes: '' });
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function openGuestRequest(avail: HostingAvailability) {
    setSelectedAvail(avail);
    setGuestModal(true);
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'accent' | 'warning' | 'error' | 'default'> = {
      confirmed: 'success',
      host_approved: 'accent',
      admin_approved: 'accent',
      pending: 'warning',
      rejected: 'error',
      cancelled: 'default',
    };
    return <Badge variant={variants[status] || 'default'}>{REQUEST_STATUS_LABELS[status as keyof typeof REQUEST_STATUS_LABELS] || status}</Badge>;
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'open',       label: 'אירוחים פתוחים', count: openSlots.length },
    { id: 'myRequests', label: 'הבקשות שלי',      count: myRequests.length },
    { id: 'incoming',   label: 'בקשות אליי',       count: incomingRequests.filter(r => r.status === 'pending').length },
    ...(isAdmin ? [{ id: 'admin' as Tab, label: 'ניהול' }] : []),
  ];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">🏡 אירוחים</h1>
          <p className="text-text-muted text-sm mt-0.5">חיבור בין מארחים לאורחים</p>
        </div>
        <Button onClick={() => { setHostWizard(true); setWizardStep(1); }}>
          <Plus size={16} /> הצע אירוח
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Select
              options={eventOptions}
              value={filterEventId}
              onChange={e => setFilterEventId(e.target.value)}
              placeholder="כל האירועים"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 border-b border-border">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                tab === t.id
                  ? 'text-accent border-b-2 border-accent -mb-px'
                  : 'text-text-muted hover:text-text-base'
              }`}
            >
              {t.label}
              {!!t.count && t.count > 0 && (
                <span className="ml-1.5 bg-error text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Tab content */}
      <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        {tab === 'open' && (
          loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1,2,3].map(i => <SkeletonCard key={i} />)}
            </div>
          ) : openSlots.length === 0 ? (
            <EmptyState
              icon="🏡"
              title="אין אירוחים פתוחים"
              description="היה הראשון לאחסן משפחה!"
              action={{ label: 'הצע אירוח', onClick: () => setHostWizard(true) }}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {openSlots.map(h => {
                const isMine = h.createdBy === myFamilyId;
                return (
                  <Card key={h.id} hover={!isMine}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-card bg-accent/10 flex items-center justify-center text-2xl shrink-0">
                        🏡
                      </div>
                      <Badge variant="success">פתוח</Badge>
                    </div>
                    <h3 className="font-bold text-primary">{h.familyName}</h3>
                    <div className="flex items-center gap-1.5 text-text-muted text-sm mt-1">
                      <MapPin size={13} /> {h.city}
                    </div>
                    <p className="text-sm text-text-muted mt-0.5">📅 {h.eventTitle}</p>

                    <div className="mt-3 space-y-1 text-sm">
                      <p>{HOSTING_TYPE_LABELS[h.type]}</p>
                      <p className="flex items-center gap-1">
                        <Users size={13} className="text-text-muted" />
                        עד {h.maxFamilySize} אנשים · {h.beds} מיטות{h.mattresses > 0 ? ` · ${h.mattresses} מזרנים` : ''}
                      </p>
                      {h.meals.length > 0 && (
                        <p className="text-text-muted">🍽 {h.meals.join(', ')}</p>
                      )}
                      {h.notes && <p className="text-text-muted text-xs">{h.notes}</p>}
                    </div>

                    <div className="mt-4 flex gap-2">
                      {isMine ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-error border-error/40 hover:bg-red-50"
                          onClick={() => cancelHostingAvailability(h.id).then(() => showToast('האירוח בוטל'))}
                        >
                          בטל אירוח
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => openGuestRequest(h)}>
                          🙏 בקש אירוח
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )
        )}

        {tab === 'myRequests' && (
          myRequests.length === 0 ? (
            <EmptyState icon="🙏" title="לא שלחת בקשות אירוח עדיין" />
          ) : (
            <div className="space-y-3">
              {myRequests.map(r => {
                const avail = availability.find(h => h.id === r.availabilityId);
                return (
                  <Card key={r.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-text-base">{avail?.familyName || 'מארח'}</p>
                        <p className="text-sm text-text-muted">{avail?.city} · {r.eventTitle}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {r.adults} מבוגרים{r.children > 0 ? ` · ${r.children} ילדים` : ''}
                          {r.needsSleep ? ' · לינה נדרשת' : ''}
                        </p>
                      </div>
                      {statusBadge(r.status)}
                    </div>
                    {r.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 text-error border-error/40 hover:bg-red-50"
                        onClick={() => cancelRequest(r.id).then(() => showToast('הבקשה בוטלה'))}
                      >
                        בטל בקשה
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        )}

        {tab === 'incoming' && (
          incomingRequests.length === 0 ? (
            <EmptyState icon="📬" title="אין בקשות אירוח אליך" />
          ) : (
            <div className="space-y-3">
              {incomingRequests.map(r => (
                <Card key={r.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-text-base">{r.guestFamilyName}</p>
                      <p className="text-sm text-text-muted">{r.eventTitle}</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {r.adults} מבוגרים{r.children > 0 ? ` · ${r.children} ילדים` : ''}
                        {r.needsSleep ? ' · לינה נדרשת' : ''}
                        {r.notes ? ` · ${r.notes}` : ''}
                      </p>
                    </div>
                    {statusBadge(r.status)}
                  </div>
                  {r.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => approveRequestAsHost(r.id).then(() => showToast('אושר ✓'))}
                      >
                        <CheckCircle size={14} /> אשר
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => rejectRequest(r.id, 'host', '').then(() => showToast('נדחה'))}
                      >
                        <XCircle size={14} /> דחה
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        )}

        {tab === 'admin' && isAdmin && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-primary mb-3">ניהול בקשות</h2>
            {requests.filter(r => r.status === 'host_approved').map(r => {
              const avail = availability.find(h => h.id === r.availabilityId);
              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{r.guestFamilyName} ← {r.hostFamilyName}</p>
                      <p className="text-sm text-text-muted">{r.eventTitle}</p>
                    </div>
                    {statusBadge(r.status)}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => approveRequestAsAdmin(r.id, r.availabilityId, avail?.capacityMode || 'singleFamily').then(() => showToast('אושר סופית ✓'))}
                    >
                      <Star size={14} /> אשר סופית
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => rejectRequest(r.id, 'admin', '').then(() => showToast('נדחה'))}
                    >
                      <XCircle size={14} /> דחה
                    </Button>
                  </div>
                </Card>
              );
            })}
            {requests.filter(r => r.status === 'host_approved').length === 0 && (
              <EmptyState icon="✓" title="אין בקשות ממתינות לאישור מנהל" />
            )}
          </div>
        )}
      </motion.div>

      {/* Host Wizard */}
      <Modal
        open={hostWizard}
        onClose={() => setHostWizard(false)}
        title={`הצע אירוח — שלב ${wizardStep} מתוך 4`}
        footer={
          <div className="flex gap-2 justify-between">
            <Button
              variant="outline"
              onClick={() => wizardStep > 1 ? setWizardStep(w => w - 1) : setHostWizard(false)}
            >
              {wizardStep > 1 ? 'הקודם' : 'ביטול'}
            </Button>
            {wizardStep < 4 ? (
              <Button onClick={() => setWizardStep(w => w + 1)}>הבא</Button>
            ) : (
              <Button onClick={handlePublishHosting} loading={submitting}>פרסם אירוח 🚀</Button>
            )}
          </div>
        }
      >
        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {[1,2,3,4].map(s => (
            <React.Fragment key={s}>
              <div className={`wizard-step-indicator ${
                s < wizardStep ? 'bg-accent text-white' :
                s === wizardStep ? 'bg-primary text-white' :
                'bg-surface-alt text-text-muted border border-border'
              }`}>
                {s < wizardStep ? '✓' : s}
              </div>
              {s < 4 && <div className={`flex-1 h-0.5 ${s < wizardStep ? 'bg-accent' : 'bg-border'}`} />}
            </React.Fragment>
          ))}
        </div>

        {wizardStep === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-text-base">בחר אירוע</h3>
            <Select
              label="אירוע"
              options={eventOptions}
              value={wizardForm.eventId}
              onChange={e => setWizardForm(f => ({ ...f, eventId: e.target.value }))}
              placeholder="-- בחר אירוע --"
            />
          </div>
        )}

        {wizardStep === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-text-base">סוג אירוח ועיר</h3>
            <Select
              label="עיר"
              options={CITY_OPTIONS.map(c => ({ value: c, label: c }))}
              value={wizardForm.city}
              onChange={e => setWizardForm(f => ({ ...f, city: e.target.value }))}
              placeholder="-- בחר עיר --"
            />
            <div className="grid grid-cols-3 gap-2">
              {(['meal', 'sleep', 'full'] as HostingType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWizardForm(f => ({ ...f, type: t }))}
                  className={`p-3 rounded-card text-sm border text-center transition-all ${
                    wizardForm.type === t
                      ? 'border-accent bg-accent/10 text-accent font-semibold'
                      : 'border-border text-text-muted hover:border-accent/40'
                  }`}
                >
                  {HOSTING_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            {wizardForm.type !== 'sleep' && (
              <div>
                <label className="text-sm font-medium text-text-mid mb-2 block">ארוחות</label>
                <div className="flex gap-2">
                  {['ליל שישי', 'צהריים שבת'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMeal(m, 'wizardForm')}
                      className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                        wizardForm.meals.includes(m)
                          ? 'bg-accent text-white border-accent'
                          : 'border-border text-text-muted hover:border-accent/50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {wizardStep === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-text-base">קיבולת</h3>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="מיטות"
                type="number"
                min={0}
                value={wizardForm.beds}
                onChange={e => setWizardForm(f => ({ ...f, beds: Number(e.target.value) }))}
              />
              <Input
                label="מזרנים"
                type="number"
                min={0}
                value={wizardForm.mattresses}
                onChange={e => setWizardForm(f => ({ ...f, mattresses: Number(e.target.value) }))}
              />
              <Input
                label="מקס׳ אנשים"
                type="number"
                min={1}
                value={wizardForm.maxFamilySize}
                onChange={e => setWizardForm(f => ({ ...f, maxFamilySize: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-mid mb-2 block">מצב קיבולת</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'singleFamily', label: 'משפחה אחת' },
                  { value: 'multipleFamilies', label: 'מספר משפחות' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWizardForm(f => ({ ...f, capacityMode: opt.value as 'singleFamily' | 'multipleFamilies' }))}
                    className={`p-3 rounded-card text-sm border text-center transition-all ${
                      wizardForm.capacityMode === opt.value
                        ? 'border-accent bg-accent/10 text-accent font-semibold'
                        : 'border-border text-text-muted hover:border-accent/40'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {wizardStep === 4 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-text-base">סקירה ופרסום</h3>
            <div className="bg-surface-alt rounded-card p-4 space-y-2 text-sm">
              <p><strong>אירוע:</strong> {events.find(e => e.id === wizardForm.eventId)?.title || '—'}</p>
              <p><strong>עיר:</strong> {wizardForm.city}</p>
              <p><strong>סוג:</strong> {HOSTING_TYPE_LABELS[wizardForm.type]}</p>
              <p><strong>קיבולת:</strong> עד {wizardForm.maxFamilySize} אנשים · {wizardForm.beds} מיטות · {wizardForm.mattresses} מזרנים</p>
              {wizardForm.meals.length > 0 && <p><strong>ארוחות:</strong> {wizardForm.meals.join(', ')}</p>}
            </div>
            <TextArea
              label="הערות נוספות"
              value={wizardForm.notes}
              onChange={e => setWizardForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="כל מידע שתרצה להוסיף..."
            />
          </div>
        )}
      </Modal>

      {/* Guest request modal */}
      <Modal
        open={guestModal}
        onClose={() => setGuestModal(false)}
        title={`בקשת אירוח — ${selectedAvail?.familyName}`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setGuestModal(false)}>ביטול</Button>
            <Button onClick={handleGuestRequest} loading={submitting}>שלח בקשה 🙏</Button>
          </div>
        }
      >
        {selectedAvail && (
          <div className="space-y-4">
            <div className="bg-surface-alt rounded-md p-3 text-sm">
              <p className="font-medium">{selectedAvail.familyName} · {selectedAvail.city}</p>
              <p className="text-text-muted">{selectedAvail.eventTitle} · {HOSTING_TYPE_LABELS[selectedAvail.type]}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="מבוגרים"
                type="number"
                min={1}
                value={guestForm.adults}
                onChange={e => setGuestForm(f => ({ ...f, adults: Number(e.target.value) }))}
              />
              <Input
                label="ילדים"
                type="number"
                min={0}
                value={guestForm.children}
                onChange={e => setGuestForm(f => ({ ...f, children: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="need-sleep"
                checked={guestForm.needsSleep}
                onChange={e => setGuestForm(f => ({ ...f, needsSleep: e.target.checked }))}
              />
              <label htmlFor="need-sleep" className="text-sm text-text-mid">אנחנו צריכים לינה</label>
            </div>
            <div>
              <label className="text-sm font-medium text-text-mid mb-2 block">ארוחות</label>
              <div className="flex gap-2">
                {['ליל שישי', 'צהריים שבת'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMeal(m, 'guestForm')}
                    className={`px-3 py-1.5 rounded-btn text-sm border transition-colors ${
                      guestForm.meals.includes(m)
                        ? 'bg-accent text-white border-accent'
                        : 'border-border text-text-muted hover:border-accent/50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <TextArea
              label="הערות"
              value={guestForm.notes}
              onChange={e => setGuestForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="צרכים מיוחדים, שאלות..."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
