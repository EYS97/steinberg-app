import type { AugustItemType } from '@/types/august';

// Tailwind tone (bg + text) per timeline-item type. Shared by the family
// timeline blocks and the personal-card item rows so colors stay consistent.
// Color is never the only signal — every block also shows an icon + label.
export const AUGUST_TYPE_TONE: Record<AugustItemType, string> = {
  'עבודה':          'bg-blue-100 text-blue-800',
  'חופש מהעבודה':   'bg-teal-100 text-teal-800',
  'קייטנה':         'bg-amber-100 text-amber-800',
  'בייביסיטר':      'bg-indigo-100 text-indigo-800',
  'סבתא':           'bg-purple-100 text-purple-800',
  'סבא':            'bg-purple-100 text-purple-800',
  'הורה':           'bg-green-100 text-green-800',
  'בית':            'bg-green-100 text-green-800',
  'חופשה משפחתית':  'bg-cyan-100 text-cyan-800',
  'מבחן':           'bg-rose-100 text-rose-800',
  'אירוע':          'bg-orange-100 text-orange-800',
  'נסיעה':          'bg-slate-100 text-slate-800',
  'אחר':            'bg-surface-alt text-text-mid',
};
