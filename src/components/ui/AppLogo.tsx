import React from 'react';

interface AppLogoProps {
  /** 'full' = icon + wordmark text, 'icon' = icon only, 'watermark' = monochrome */
  variant?: 'full' | 'icon' | 'watermark';
  iconSize?: number;
  className?: string;
  /** Override alt text */
  alt?: string;
}

export function AppLogo({ variant = 'full', iconSize = 80, className, alt }: AppLogoProps) {
  const isWatermark = variant === 'watermark';

  const imgStyle: React.CSSProperties = isWatermark
    ? { filter: 'grayscale(100%)', opacity: 0.07, display: 'block', objectFit: 'contain', borderRadius: '22%' }
    : { display: 'block', objectFit: 'contain', borderRadius: '22%' };

  const img = (
    <img
      src="/assets/branding/logo.png"
      alt={alt ?? (isWatermark ? '' : 'Shteinberg App')}
      width={iconSize}
      height={iconSize}
      style={imgStyle}
      aria-hidden={isWatermark ? true : undefined}
    />
  );

  if (variant !== 'full') return <div className={className}>{img}</div>;

  return (
    <div className={`flex flex-col items-center gap-3 ${className ?? ''}`}>
      {img}
      <div className="text-center">
        <h1
          className="text-xl font-bold leading-tight"
          style={{ color: 'var(--primary)', direction: 'rtl' }}
        >
          משפחת שטיינברג
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          הבית הדיגיטלי שלנו – Family OS
        </p>
      </div>
    </div>
  );
}
