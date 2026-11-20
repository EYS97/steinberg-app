import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import {
  MEMBER_ROLE_LABELS, MEMBER_ROLE_EMOJI,
} from '@/types/august';
import type { AugustMember, AugustMemberRole } from '@/types/august';

const ROLE_OPTIONS = (Object.keys(MEMBER_ROLE_LABELS) as AugustMemberRole[])
  .map(r => ({ value: r, label: `${MEMBER_ROLE_EMOJI[r]} ${MEMBER_ROLE_LABELS[r]}` }));

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `m_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
}

interface MembersEditorProps {
  open: boolean;
  onClose: () => void;
  members: AugustMember[];
  onSave: (members: AugustMember[]) => Promise<void>;
}

/** Manage the family members (parents + named children) stored on the plan. */
export function MembersEditor({ open, onClose, members, onSave }: MembersEditorProps) {
  const [draft, setDraft] = useState<AugustMember[]>(members);
  const [saving, setSaving] = useState(false);

  // Re-seed the draft whenever the editor (re)opens.
  React.useEffect(() => { if (open) setDraft(members); }, [open, members]);

  function add() {
    setDraft(d => [...d, { id: newId(), name: '', role: d.length < 2 ? 'parent' : 'child' }]);
  }
  function update(id: string, patch: Partial<AugustMember>) {
    setDraft(d => d.map(m => (m.id === id ? { ...m, ...patch } : m)));
  }
  function remove(id: string) {
    setDraft(d => d.filter(m => m.id !== id));
  }

  async function save() {
    const cleaned = draft
      .map(m => ({ ...m, name: m.name.trim() }))
      .filter(m => m.name.length > 0);
    setSaving(true);
    try {
      await onSave(cleaned);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="👨‍👩‍👧‍👦 בני המשפחה"
      size="lg"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={save} loading={saving}>שמירה</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-muted">
          הוסיפו את ההורים והילדים. הילדים הם מי שעבורם המערכת בודקת כיסוי רצוף.
        </p>

        {draft.length === 0 && (
          <p className="text-sm text-text-muted py-4 text-center">עדיין אין בני משפחה — הוסיפו את הראשון 👇</p>
        )}

        <div className="space-y-2">
          {draft.map(m => (
            <div key={m.id} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="שם"
                  value={m.name}
                  onChange={e => update(m.id, { name: e.target.value })}
                  placeholder="שם פרטי"
                />
              </div>
              <div className="w-40">
                <Select
                  label="תפקיד"
                  options={ROLE_OPTIONS}
                  value={m.role}
                  onChange={e => update(m.id, { role: e.target.value as AugustMemberRole })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(m.id)}
                aria-label="הסר"
                className="mb-0.5 text-text-muted hover:text-error"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="outline" onClick={add} className="w-full">
          <Plus size={16} /> הוסף בן משפחה
        </Button>
      </div>
    </Modal>
  );
}
