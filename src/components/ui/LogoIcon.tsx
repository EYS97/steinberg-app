import React from 'react';

interface LogoIconProps {
  size?: number;
  className?: string;
}

export function LogoIcon({ size = 32, className }: LogoIconProps) {
  return (
    <img
      src="/assets/branding/logo.png"
      alt="Shteinberg App"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', flexShrink: 0, objectFit: 'contain', borderRadius: '22%' }}
    />
  );
}
