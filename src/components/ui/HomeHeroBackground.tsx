import React from 'react';
import { cn } from '@/lib/utils';

interface HomeHeroBackgroundProps {
  /** Background image URL */
  image: string;
  /** CSS object-position for the image crop focus */
  objectPosition?: string;
  /** Overlay gradient (any CSS background value) */
  overlay?: string;
  /** Desktop-only (≥1024px) overlay replacing `overlay` — mobile keeps `overlay` */
  overlayLg?: string;
  /** Extra frosted layer over the image, behind the content */
  blurOverlay?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Full-width hero banner with a background photo, a darkening gradient for
 * text contrast, and free-form RTL content on top. Used as the Home screen
 * identity — keep other pages on plain backgrounds.
 */
// Darker on the right (inline-start in RTL) where the welcome text sits
const DEFAULT_OVERLAY =
  'linear-gradient(270deg, rgba(0,0,0,0.18), rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.68)), linear-gradient(0deg, rgba(0,0,0,0.45), rgba(0,0,0,0) 40%)';

export function HomeHeroBackground({
  image,
  objectPosition = 'center 42%',
  overlay = DEFAULT_OVERLAY,
  overlayLg,
  blurOverlay = false,
  className,
  children,
}: HomeHeroBackgroundProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover select-none"
        style={{ objectPosition }}
        draggable={false}
      />
      <div
        className={cn('absolute inset-0', overlayLg && 'lg:hidden')}
        style={{ background: overlay }}
      />
      {overlayLg && (
        <div className="absolute inset-0 hidden lg:block" style={{ background: overlayLg }} />
      )}
      {blurOverlay && (
        <div
          className="absolute inset-0"
          style={{ backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}
        />
      )}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
