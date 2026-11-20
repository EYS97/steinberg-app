import React from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { usePendingMealRequests } from '@/hooks/useEventMealConfig';

const TABS = [
  { to: '/admin',          label: 'ניהול',            icon: '🛡', end: true },
  { to: '/admin/requests', label: 'בקשות אירוח',     icon: '📨', end: false },
  { to: '/admin/activity', label: 'פעילות משתמשים', icon: '📊', end: false },
];

/** Tab bar shared by all pages under the admin area */
export function AdminTabs() {
  // Live badge: hosting requests waiting for admin approval (guest-family limit)
  const pending = usePendingMealRequests();

  return (
    // w-px + min-w-full: keep the nowrap tabs scrolling inside this container
    // instead of propagating their min-content width and widening the page on
    // narrow (mobile) viewports.
    <div className="flex gap-1 border-b border-border mb-5 overflow-x-auto w-px min-w-full" role="tablist">
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) => cn(
            'px-4 py-2.5 text-sm font-semibold -mb-px border-b-2 transition-colors whitespace-nowrap',
            isActive
              ? 'border-accent text-primary'
              : 'border-transparent text-text-muted hover:text-text-mid'
          )}
        >
          <span className="ml-1.5" aria-hidden="true">{t.icon}</span>
          {t.label}
          {t.to === '/admin/requests' && pending.length > 0 && (
            <span className="mr-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-bold align-middle">
              {pending.length}
            </span>
          )}
        </NavLink>
      ))}
    </div>
  );
}
