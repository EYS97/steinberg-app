import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const AVATAR_COLORS = [
  '#8B5E3C', '#0EA5A4', '#6B5094', '#C4614A',
  '#4A7C9E', '#7A8C5C', '#C49A3C', '#5C6BC0',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateShort(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

export function formatDateFull(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function relativeDate(date: Date): string {
  const now = new Date();
  const diff = Math.floor((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'היום';
  if (diff === 1) return 'מחר';
  if (diff === -1) return 'אתמול';
  if (diff > 0 && diff < 7) return `בעוד ${diff} ימים`;
  if (diff < 0 && diff > -7) return `לפני ${-diff} ימים`;
  return formatDateShort(date);
}

// Normalise a birthday/memorial date to a JS Date (month+day only, next occurrence).
// Accepts: ISO string "YYYY-MM-DD", Firestore Timestamp (has .toDate()), or plain Date.
function normaliseBdayDate(input: unknown): Date | null {
  if (!input) return null;
  let base: Date | null = null;
  if (typeof input === 'string') {
    const parts = input.split('-').map(Number);
    const m = parts[parts.length - 2];
    const d = parts[parts.length - 1];
    if (!m || !d) return null;
    base = new Date(new Date().getFullYear(), m - 1, d);
  } else if (typeof (input as any).toDate === 'function') {
    base = (input as any).toDate() as Date;
  } else if (input instanceof Date) {
    base = input;
  } else {
    return null;
  }
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const occ = new Date(now.getFullYear(), base.getMonth(), base.getDate());
  if (occ < now) occ.setFullYear(now.getFullYear() + 1);
  return occ;
}

export function isoToHeDate(iso: unknown): string {
  const d = normaliseBdayDate(iso);
  return d ? formatDate(d) : '';
}

export function daysUntil(dateInput: unknown): number {
  const d = normaliseBdayDate(dateInput);
  if (!d) return 999;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function familyDisplayName(family: { husband: string; wife: string }): string {
  const parts = [family.husband, family.wife].filter(Boolean);
  return parts.join(' ו');
}

export function openWhatsApp(phone: string, message?: string): void {
  const clean = phone.replace(/\D/g, '');
  const url = message
    ? `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${clean}`;
  window.open(url, '_blank');
}

export function openEmail(email: string): void {
  window.open(`mailto:${email}`, '_blank');
}

export function openPhone(phone: string): void {
  window.open(`tel:${phone}`, '_blank');
}

export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function sortByDate<T>(arr: T[], getDate: (item: T) => Date | null): T[] {
  return [...arr].sort((a, b) => {
    const da = getDate(a)?.getTime() ?? 0;
    const db = getDate(b)?.getTime() ?? 0;
    return da - db;
  });
}
