import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatGregorianDate, daysUntilOccurrence } from '@/lib/dates';

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
  return formatGregorianDate(date, 'long');
}

export function formatDateShort(date: Date | null | undefined): string {
  return formatGregorianDate(date, 'short');
}

export function formatDateFull(date: Date | null | undefined): string {
  return formatGregorianDate(date, 'full');
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

/** @deprecated legacy Gregorian-only path — prefer daysUntilOccurrence from '@/lib/dates' */
export function daysUntil(dateInput: unknown): number {
  return daysUntilOccurrence({ date: dateInput });
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
