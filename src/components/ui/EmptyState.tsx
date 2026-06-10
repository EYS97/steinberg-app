import React from 'react';
import { Button } from './Button';
import { AppLogo } from './AppLogo';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Show the logo watermark behind the empty state content */
  withWatermark?: boolean;
}

export function EmptyState({ icon = '📭', title, description, action, withWatermark = false }: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center py-16 px-6 text-center overflow-hidden">
      {withWatermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <AppLogo variant="watermark" iconSize={160} />
        </div>
      )}
      <div className="relative z-10">
        <div className="text-5xl mb-4" aria-hidden="true">{icon}</div>
        <h3 className="text-lg font-semibold text-primary mb-1">{title}</h3>
        {description && (
          <p className="text-text-muted text-sm max-w-sm mb-5">{description}</p>
        )}
        {action && (
          <Button onClick={action.onClick} size="md">
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
