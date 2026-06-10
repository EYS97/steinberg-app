import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-badge',
  {
    variants: {
      variant: {
        default:  'bg-surface-alt text-text-mid',
        success:  'bg-green-100 text-green-700',
        warning:  'bg-amber-100 text-amber-700',
        error:    'bg-red-100 text-red-700',
        info:     'bg-blue-100 text-blue-700',
        primary:  'bg-orange-100 text-primary',
        accent:   'bg-teal-100 text-accent-dark',
        memorial: 'bg-purple-100 text-purple-700',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
