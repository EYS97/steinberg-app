import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: string | number;
  width?: string | number;
}

export function Skeleton({ className, height, width, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton rounded-md', className)}
      style={{ height, width, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-card shadow-card border border-border p-5 space-y-3">
      <Skeleton height={20} width="60%" />
      <Skeleton height={14} width="80%" />
      <Skeleton height={14} width="50%" />
      <div className="flex gap-2 mt-4">
        <Skeleton height={32} width={80} className="rounded-btn" />
        <Skeleton height={32} width={80} className="rounded-btn" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
          <Skeleton width={40} height={40} className="rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton height={14} width="50%" />
            <Skeleton height={12} width="70%" />
          </div>
        </div>
      ))}
    </div>
  );
}
