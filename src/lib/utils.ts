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

export function isoToHeDate(iso: string): string {
  if (!iso || typeof iso !== 'string') return '';
  const [, m, d] = iso.split('-').map(Number);
  const now = new Date();
  const date = new Date(now.getFullYear(), m - 1, d);
  if (date < now) date.setFullYear(now.getFullYear() + 1);
  return formatDate(date);
}

export function daysUntil(dateStr: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 999;
  const [, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), m - 1, d);
  if (target < now) target.setFullYear(now.getFullYear() + 1);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
