import React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ className, label, error, hint, id, ...props }: InputProps) {
  const inputId = id || label?.replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-mid">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-3.5 py-2.5 border border-border rounded-input text-sm text-text-base',
          'bg-surface placeholder:text-text-muted',
          'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
          'transition-colors duration-150',
          error && 'border-error focus:border-error focus:ring-error',
          className
        )}
        {...props}
      />
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function TextArea({ className, label, error, id, ...props }: TextAreaProps) {
  const inputId = id || label?.replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-mid">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={3}
        className={cn(
          'w-full px-3.5 py-2.5 border border-border rounded-input text-sm text-text-base',
          'bg-surface placeholder:text-text-muted resize-none',
          'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
          'transition-colors duration-150',
          error && 'border-error',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ className, label, error, options, placeholder, id, ...props }: SelectProps) {
  const inputId = id || label?.replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-mid">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={cn(
          'w-full px-3.5 py-2.5 border border-border rounded-input text-sm text-text-base',
          'bg-surface',
          'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
          'transition-colors duration-150 cursor-pointer',
          error && 'border-error',
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
