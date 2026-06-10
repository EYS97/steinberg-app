import React, { useState, useMemo } from 'react';
import { Search, Plus, Phone, Mail, MessageCircle, Users, Trash2, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useFamilies } from '@/hooks/useFamilies';
import { useToast } from '@/components/ui/Toast';
import { avatarColor, initials, openWhatsApp, openEmail, openPhone, familyDisplayName } from '@/lib/utils';
import type { Family } from '@/types';
import type { User } from 'firebase/auth';

interface FamilyPageProps {
  user: User | null;
  isAdmin: boolean;
}

const STATUS_OPTIONS = ['נשוי', 'נשואה', 'רווק', 'רווקה', 'מאורס', 'מאורסת', 'גרוש', 'גרושה', 'אחר'];

export function FamilyPage({ user, isAdmin }: FamilyPageProps) {
  const { showToast } = useToast();
  const { data: families, loading } = useFamilies();

  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [editFamily, setEditFamily] = useState<Family | null>(null);
  const [form, setForm] = useState({
    husband: '', wife: '', adults: 2, kids: 0,
    status: 'נשוי', needs: '', whatsapp: '', email: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return families;
    const q = search.toLowerCase();
    return families.filter(f =>
      f.husband?.toLowerCase().includes(q) ||
      f.wife?.toLowerCase().includes(q) ||
      f.status?.toLowerCase().includes(q)
    );
  }, [families, search]);

  function openAdd() {
    setEditFamily(null);
    setForm({ husband: '', wife: '', adults: 2, kids: 0, status: 'נשוי', needs: '', whatsapp: '', email: '' });
    setAddModal(true);
  }

  function openEdit(fam: Family) {
    setEditFamily(fam);
    setForm({
      husband: fam.husband || '',
      wife: fam.wife || '',
      adults: fam.adults || 2,
      kids: fam.kids || 0,
      status: fam.status || 'נשוי',
      needs: fam.needs || '',
      whatsapp: fam.whatsapp || '',
      email: fam.email || '',
    });
    setAddModal(true);
  }

  async function handleSave() {
    if (!form.husband && !form.wife) {
      showToast('נא להזין לפחות שם אחד', 'error'); return;
    }
    setSubmitting(true);
    try {
      const payload = { ...form };
      if (editFamily) {
        await updateDoc(doc(db, 'families', editFamily.id), payload);
        showToast('המשפחה עודכנה ✓');
      } else {
        await addDoc(collection(db, 'families'), { ...payload, createdAt: serverTimestamp() });
        showToast('המשפחה נוספה ✓');
      }
      setAddModal(false);
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDoc(doc(db, 'families', id));
      showToast('המשפחה נמחקה');
    } catch (e: unknown) {
      showToast((e as Error).message || 'שגיאה', 'error');
    }
  }

  const totalMembers = families.reduce((s, f) => s + (f.adults || 0) + (f.kids || 0), 0);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">👨‍👩‍👧‍👦 משפחה</h1>
          <p className="text-text-muted text-sm mt-0.5">
            {families.length} משפחות · {totalMembers} אנשים
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> הוסף משפחה
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם..."
          className="w-full pr-10 pl-4 py-2.5 rounded-input border border-border bg-surface text-sm focus:outline-none focus:border-accent"
          aria-label="חיפוש משפחות"
        />
      </div>

      {/* Family grid */}
      {loading ? (
        <SkeletonList count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="👨‍👩‍👧"
          title="לא נמצאו משפחות"
          description={search ? 'נסה חיפוש אחר' : 'הוסף משפחה ראשונה'}
          action={!search ? { label: 'הוסף משפחה', onClick: openAdd } : undefined}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        >
          {filtered.map(fam => {
            const displayName = familyDisplayName(fam);
            const memberCount = (fam.adults || 0) + (fam.kids || 0);
            const avatarName = fam.husband || fam.wife || '?';
            return (
              <motion.div
                key={fam.id}
                variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
              >
                <Card hover className="group">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-base shrink-0"
                      style={{ background: avatarColor(avatarName) }}
                      aria-hidden="true"
                    >
                      {initials(displayName)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-primary text-base leading-tight">{displayName}</h3>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {fam.status && <Badge variant="default">{fam.status}</Badge>}
                        <Badge variant="info">
                          <Users size={10} />
                          {fam.adults || 0} מבוגרים{fam.kids ? ` · ${fam.kids} ילדים` : ''}
                        </Badge>
                      </div>
                      {fam.needs && (
                        <p className="text-xs text-text-muted mt-1 truncate">{fam.needs}</p>
                      )}
                    </div>

                    {/* Admin actions */}
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(fam)}
                          className="p-1.5 text-text-muted hover:text-accent transition-colors rounded"
                          aria-label="ערוך"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(fam.id)}
                          className="p-1.5 text-text-muted hover:text-error transition-colors rounded"
                          aria-label="מחק"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  {(fam.whatsapp || fam.email) && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                      {fam.whatsapp && (
                        <button
                          onClick={() => openWhatsApp(fam.whatsapp)}
                          className="flex items-center gap-1.5 text-xs text-success hover:opacity-80 transition-opacity font-medium"
                          aria-label="WhatsApp"
                        >
                          <MessageCircle size={13} /> WhatsApp
                        </button>
                      )}
                      {fam.email && (
                        <button
                          onClick={() => openEmail(fam.email)}
                          className="flex items-center gap-1.5 text-xs text-info hover:opacity-80 transition-opacity font-medium"
                          aria-label="מייל"
                        >
                          <Mail size={13} /> מייל
                        </button>
                      )}
                    </div>
                  )}
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={addModal}
        onClose={() => setAddModal(false)}
        title={editFamily ? 'ערוך משפחה' : 'הוסף משפחה'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setAddModal(false)}>ביטול</Button>
            <Button onClick={handleSave} loading={submitting}>
              {editFamily ? 'שמור' : 'הוסף'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="שם בעל"
              value={form.husband}
              onChange={e => setForm(f => ({ ...f, husband: e.target.value }))}
              placeholder="שם פרטי"
            />
            <Input
              label="שם אישה"
              value={form.wife}
              onChange={e => setForm(f => ({ ...f, wife: e.target.value }))}
              placeholder="שם פרטי"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="סטטוס"
              options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))}
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            />
            <Input
              label="מבוגרים"
              type="number"
              min={0}
              value={form.adults}
              onChange={e => setForm(f => ({ ...f, adults: Number(e.target.value) }))}
            />
            <Input
              label="ילדים"
              type="number"
              min={0}
              value={form.kids}
              onChange={e => setForm(f => ({ ...f, kids: Number(e.target.value) }))}
            />
          </div>
          <Input
            label="WhatsApp"
            value={form.whatsapp}
            onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
            placeholder="972501234567"
            type="tel"
          />
          <Input
            label="מייל"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="email@example.com"
            type="email"
          />
          <Input
            label="צרכים מיוחדים"
            value={form.needs}
            onChange={e => setForm(f => ({ ...f, needs: e.target.value }))}
            placeholder="כשר, צמחוני, אלרגיות..."
          />
        </div>
      </Modal>
    </div>
  );
}
