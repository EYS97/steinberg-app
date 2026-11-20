import React, { useState, useEffect } from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import type { AugustTask } from '@/types/august';

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `t_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
}

interface DayTasksProps {
  tasks: AugustTask[];
  onSave: (tasks: AugustTask[]) => void;
}

/** "✅ משימות היום" — per-day to-dos with complete / edit / delete. */
export function DayTasks({ tasks, onSave }: DayTasksProps) {
  const [draft, setDraft] = useState<AugustTask[]>(tasks);
  const [adding, setAdding] = useState('');

  useEffect(() => { setDraft(tasks); }, [tasks]);

  function commit(next: AugustTask[]) {
    setDraft(next);
    onSave(next);
  }
  function toggle(id: string) {
    commit(draft.map(t => (t.id === id ? { ...t, done: !t.done } : t)));
  }
  function edit(id: string, text: string) {
    setDraft(d => d.map(t => (t.id === id ? { ...t, text } : t)));
  }
  function remove(id: string) {
    commit(draft.filter(t => t.id !== id));
  }
  function add() {
    const text = adding.trim();
    if (!text) return;
    commit([...draft, { id: newId(), text, done: false }]);
    setAdding('');
  }

  return (
    <div className="rounded-card border border-border bg-surface p-3">
      <h4 className="font-bold text-primary flex items-center gap-1.5 mb-2">
        <CheckSquare size={16} className="text-accent" /> משימות היום
      </h4>

      <ul className="space-y-1.5 mb-2">
        {draft.map(t => (
          <li key={t.id} className="flex items-center gap-2 group">
            <input
              type="checkbox"
              checked={t.done}
              onChange={() => toggle(t.id)}
              className="w-4 h-4 accent-accent shrink-0"
              aria-label={t.text}
            />
            <input
              value={t.text}
              onChange={e => edit(t.id, e.target.value)}
              onBlur={() => onSave(draft)}
              className={`flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-border ${t.done ? 'line-through text-text-muted' : 'text-text-base'}`}
            />
            <button onClick={() => remove(t.id)} aria-label="מחק משימה" className="p-1 text-text-muted hover:text-error opacity-60 group-hover:opacity-100">
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <input
          value={adding}
          onChange={e => setAdding(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="משימה חדשה..."
          className="flex-1 px-2.5 py-1.5 rounded-input border border-border bg-surface text-sm focus:outline-none focus:border-accent"
          aria-label="הוסף משימה"
        />
        <button onClick={add} aria-label="הוסף" className="p-2 rounded-md bg-surface-alt text-text-mid hover:text-accent">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
