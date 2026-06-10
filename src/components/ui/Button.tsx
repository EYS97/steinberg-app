import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        primary:   'bg-accent text-white hover:bg-accent-dark active:scale-95',
        secondary: 'bg-primary text-white hover:bg-primary-light active:scale-95',
        outline:   'bg-transparent border-2 border-border text-text-mid hover:bg-surface-alt active:scale-95',
        ghost:     'bg-transparent text-text-mid hover:bg-surface-alt',
        danger:    'bg-error text-white hover:opacity-90 active:scale-95',
        success:   'bg-success text-white hover:opacity-90 active:scale-95',
      },
      size: {
        sm:  'text-sm px-3 py-1.5 rounded-btn',
        md:  'text-sm px-5 py-2.5 rounded-btn',
        lg:  'text-base px-6 py-3 rounded-btn',
        icon:'w-9 h-9 p-0 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : null}
      {children}
    </button>
  );
}
