import React from 'react';
import type { AugustMemberRole } from '@/types/august';

// ── Family member avatar ────────────────────────────────────────────────────
// Real profile photo from the family tree when we have one, otherwise a colored
// initials circle. Color encodes role (children stand apart from parents) and is
// never the only signal — the name always sits beside it.

interface AvatarProps {
  name: string;
  role: AugustMemberRole;
  photo?: string | null;
  /** pixel diameter — default 28 */
  size?: number;
  className?: string;
}

const ROLE_RING: Record<AugustMemberRole, string> = {
  child:       'bg-accent/15 text-accent-dark',
  parent:      'bg-primary/10 text-primary',
  grandparent: 'bg-memorial/15 text-memorial',
  sitter:      'bg-info/10 text-info',
  other:       'bg-surface-alt text-text-mid',
};

/** First grapheme of the name — works for Hebrew and Latin alike. */
function initial(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed ? Array.from(trimmed)[0] : '?';
}

export function Avatar({ name, role, photo, size = 28, className = '' }: AvatarProps) {
  const dim = { width: size, height: size };
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        style={dim}
        className={`rounded-full object-cover shrink-0 ring-1 ring-border ${className}`}
      />
    );
  }
  return (
    <span
      style={{ ...dim, fontSize: Math.round(size * 0.42) }}
      className={`rounded-full shrink-0 flex items-center justify-center font-bold ${ROLE_RING[role]} ${className}`}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}
