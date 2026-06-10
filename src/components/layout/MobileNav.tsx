import React from 'react';
import { NavLink } from 'react-router-dom';
import { MOBILE_NAV_ITEMS } from '@/types';
import { cn } from '@/lib/utils';

export function MobileNav() {
  return (
    <nav
      className="mobile-nav px-2 pb-safe"
      aria-label="ניווט תחתון"
    >
      {MOBILE_NAV_ITEMS.map(item => (
        <NavLink
          key={item.id}
          to={item.path}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 flex-1 py-2.5 text-center transition-colors rounded-lg',
              isActive ? 'text-accent' : 'text-text-muted'
            )
          }
          aria-label={item.label}
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'text-xl transition-transform duration-150',
                  isActive && 'scale-110'
                )}
                aria-hidden="true"
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
