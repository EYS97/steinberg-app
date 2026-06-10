import React from 'react';
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '@/types';
import { initials, avatarColor } from '@/lib/utils';
import { LogoIcon } from '@/components/ui/LogoIcon';
import type { User } from 'firebase/auth';

interface HeaderProps {
  user: User | null;
  onUserClick: () => void;
}

export function Header({ user, onUserClick }: HeaderProps) {
  const location = useLocation();
  const page = NAV_ITEMS.find(n =>
    n.path === location.pathname ||
    (n.path !== '/' && location.pathname.startsWith(n.path))
  );
  const name = user?.displayName || user?.email || '';
  const titleName = user?.displayName?.split(' ')[0] || '';

  return (
    <header className="glass-warm border-b border-border sticky top-0 z-40 flex items-center px-4 sm:px-6 h-14">
      {/* Logo icon (mobile only — sidebar is hidden on mobile) */}
      <div className="lg:hidden flex-shrink-0 ml-3">
        <LogoIcon size={30} />
      </div>

      {/* Page title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {page && (
          <>
            <span className="text-lg hidden sm:inline" aria-hidden="true">{page.icon}</span>
            <h2 className="font-semibold text-primary text-base truncate">
              {location.pathname === '/' && titleName
                ? `שלום ${titleName} 👋`
                : page.label}
            </h2>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onUserClick}
          className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
          aria-label={user ? name : 'כניסה'}
        >
          {user ? (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: avatarColor(name) }}
            >
              {initials(name)}
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-btn bg-accent text-white text-xs font-semibold">
              כניסה
            </div>
          )}
        </button>
      </div>
    </header>
  );
}
