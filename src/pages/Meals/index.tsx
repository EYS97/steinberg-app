import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Select, TextArea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { useEvents } from '@/hooks/useEvents';
import { useFood } from '@/hooks/useFood';
import { useGuests } from '@/hooks/useGuests';
import { useFamilies } from '@/hooks/useFamilies';
import { useToast } from '@/components/ui/Toast';
import type { FoodCategory, MealType } from '@/types';
import type { User } from 'firebase/auth';

interface MealsProps {
  user: User | null;
  isAdmin: boolean;
}

const CATEGORIES: FoodCategory[] = ['מנות ראשונות', 'עיקריות', 'קינוחים', 'שתייה', 'כללי'];
const MEAL_TYPES: MealType[] = ['ליל שישי', 'צהריים שבת'];
const CATEGORY_ICONS: Record<string, string> = {
  'מנות ראשונות': '🥗',
  'עיקריות':      '🍲',
  'קינוחים':      '🍰',
  'שתייה':        '🥤',
  'כללי':         '🍽',
};
const DEFAULT_DINERS = 4;

export function Meals({ user, isAdmin }: MealsProps) {
  const { showToast } = useToast();
  const { data: events } = useEvents();
  const { data: food, loading } = useFood();
  const { data: guests } = useGuests();
  const { data: families } = useFamilies();

  const upcomingEvents = events.filter(e => e.date?.toDate?.() >= new Date());
  const [selectedEventId, setSelectedEventId] = useState('');
  const eventId = selectedEventId || upcomingEvents[0]?.id || '';
  const event = events.find(e => e.id === eventId);

  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({
    dish: '',
    category: 'עיקריות' as FoodCategory,
    mealType: 'ליל שישי' as MealType,
    familyId: '',
    familyName: '',
    headcount: 0,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Filter food for this event
  const eventFood = useMemo(
    () => food.filter(f => f.eventId === eventId),
    [food, eventId]
  );

  // Guest count for this event
  const guestCount = useMemo(() => {
    const eventGuests = guests.filter(g => g.eventId === eventId && !g.isPermanent);
    const permanentGuests = guests.filter(g => g.isPermanent);
    const total = [...eventGuests, ...permanentGuests].reduce((sum, g) => sum + (g.count || 1), 0);
    return DEFAULT_DINERS + total;
  }, [guests, eventId]);

  // Group food by meal type then category
  const grouped = useMemo(() => {
    const byMeal: Record<string, Record<string, typeof eventFood>> = {};
    MEAL_TYPES.forEach(mt => {
      byMeal[mt] = {};
      CATEGORIES.forEach(cat => {
        const items = eventFood.filter(f => f.mealType === mt && f.category === cat);
        if (items.length) byMeal[mt][cat] = items;
      });
    });
    return byMeal;
  }, [eventFood]);

  const totalServings = eventFood.reduce((s, f) => s + (f.headcount || 0), 0);

  async function handleAdd() {
    if (!form.dish.trim()) { showToast('נא להזין שם המנה', 'error'); return; }
    if (!form.familyName) { showToast('נא לבחור משפחה', 'error'); return; }
    if (!eventId) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'food'), {
        ...form,
        eventId,
        eventTitle: event?.title || '',
        createdAt: serverTimestamp(),
      });
      showToast('המנה נוספה ✓');
      setAddModal(false);
      setForm({ dish: '', category: 'עיקריות', mealType: 'ליל שישי', familyId: '', familyName: '', headcount: 0, notes: '' });
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDoc(doc(db, 'food', id));
      showToast('המנה הוסרה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  const familyOptions = families.map(f => ({
    value: f.id,
    label: [f.husband, f.wife].filter(Boolean).join(' ו') || f.id,
  }));

  const eventOptions = upcomingEvents.map(e => ({
    value: e.id,
    label: `${e.title} — ${e.date?.toDate?.().toLocaleDateString('he-IL') || ''}`,
  }));

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">🍲 ארוחות</h1>
          <p className="text-text-muted text-sm mt-0.5">תיאום אוכל משפחתי</p>
        </div>
        <Button onClick={() => setAddModal(true)} disabled={!eventId}>
          <Plus size={16} /> הוסף מנה
        </Button>
      </div>

      {/* Event + stats */}
      <Card className="mb-5">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <Select
              label="בחר אירוע"
              options={eventOptions}
              value={eventId}
              onChange={e => setSelectedEventId(e.target.value)}
              placeholder="-- בחר אירוע --"
            />
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-primary">{guestCount}</p>
              <p className="text-xs text-text-muted">סועדים</p>
            </div>
            <div>
              <p className="text-xl font-bold text-accent">{eventFood.length}</p>
              <p className="text-xs text-text-muted">מנות</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Food by meal */}
      {!eventId ? (
        <EmptyState icon="🍽" title="בחר אירוע כדי לצפות בארוחות" />
      ) : eventFood.length === 0 ? (
        <EmptyState
          icon="🍽"
          title="אין מנות עדיין"
          description="הוסף מנה לארוחת שבת!"
          action={{ label: 'הוסף מנה', onClick: () => setAddModal(true) }}
        />
      ) : (
        <div className="space-y-6">
          {MEAL_TYPES.map(mt => {
            const mtFood = eventFood.filter(f => f.mealType === mt);
            if (!mtFood.length) return null;
            return (
              <motion.div
                key={mt}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card padding="none">
                  <div className="px-5 py-3 bg-primary/5 border-b border-border rounded-t-card">
                    <h2 className="font-bold text-primary text-base">🕯 {mt}</h2>
                    <p className="text-xs text-text-muted">{mtFood.length} מנות · {mtFood.reduce((s, f) => s + (f.headcount || 0), 0)} מנות הגשה</p>
                  </div>
                  <div className="p-4 space-y-4">
                    {CATEGORIES.filter(cat => grouped[mt]?.[cat]?.length).map(cat => (
                      <div key={cat}>
                        <h3 className="text-sm font-semibold text-text-mid flex items-center gap-1.5 mb-2">
                          <span>{CATEGORY_ICONS[cat]}</span> {cat}
                        </h3>
                        <div className="space-y-2">
                          {grouped[mt][cat].map(item => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 p-3 bg-surface-alt rounded-md border border-border hover:border-border/70 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-text-base">{item.dish}</p>
                                <p className="text-xs text-text-muted">
                                  {item.family}
                                  {item.headcount > 0 && ` · ${item.headcount} מנות`}
                                  {item.notes && ` · ${item.notes}`}
                                </p>
                              </div>
                              {(isAdmin || item.familyId === user?.uid) && (
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="p-1.5 text-text-muted hover:text-error transition-colors rounded"
                                  aria-label="מחק"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title="הוסף מנה"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAddModal(false)}>ביטול</Button>
            <Button onClick={handleAdd} loading={submitting}>הוסף</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="ארוחה"
              options={MEAL_TYPES.map(m => ({ value: m, label: m }))}
              value={form.mealType}
              onChange={e => setForm(f => ({ ...f, mealType: e.target.value as MealType }))}
            />
            <Select
              label="קטגוריה"
              options={CATEGORIES.map(c => ({ value: c, label: c }))}
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as FoodCategory }))}
            />
          </div>
          <Input
            label="שם המנה"
            value={form.dish}
            onChange={e => setForm(f => ({ ...f, dish: e.target.value }))}
            placeholder="למשל: קוגל, עוף בתנור..."
          />
          <Select
            label="משפחה"
            options={familyOptions}
            value={form.familyId}
            placeholder="-- בחר משפחה --"
            onChange={e => {
              const fam = families.find(f => f.id === e.target.value);
              setForm(f => ({
                ...f,
                familyId: e.target.value,
                familyName: fam ? [fam.husband, fam.wife].filter(Boolean).join(' ו') : '',
              }));
            }}
          />
          <Input
            label="מספר מנות"
            type="number"
            min={0}
            value={form.headcount}
            onChange={e => setForm(f => ({ ...f, headcount: Number(e.target.value) }))}
          />
          <TextArea
            label="הערות"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="כשר, ללא גלוטן, חריף..."
          />
        </div>
      </Modal>
    </div>
  );
}
