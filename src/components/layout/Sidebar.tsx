import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '@/types';
import { cn, initials, avatarColor } from '@/lib/utils';
import { LogoIcon } from '@/components/ui/LogoIcon';
import type { User } from 'firebase/auth';

interface SidebarProps {
  user: User | null;
  isAdmin: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  collapsed?: boolean;
}

export function Sidebar({ user, isAdmin, onSignIn, onSignOut, collapsed = false }: SidebarProps) {
  const location = useLocation();
  const items = NAV_ITEMS.filter(n => !n.adminOnly || isAdmin);
  const name = user?.displayName || user?.email || 'אורח';

  return (
    <aside className="h-full flex flex-col bg-surface border-l border-border">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        {collapsed ? (
          <div className="flex justify-center">
            <LogoIcon size={36} />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <LogoIcon size={40} />
            <div>
              <h1 className="text-sm font-bold text-primary leading-tight">משפחת שטיינברג</h1>
              <p className="text-xs text-text-muted">Family OS</p>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-none" aria-label="ניווט ראשי">
        <ul className="space-y-0.5 px-2">
          {items.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold'
                      : 'text-text-mid hover:bg-surface-alt hover:text-primary'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="text-base w-5 text-center shrink-0" aria-hidden="true">
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* User */}
      <div className="p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: avatarColor(name) }}
              aria-hidden="true"
            >
              {initials(name)}
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-base truncate">{name}</p>
                  {isAdmin && (
                    <p className="text-xs text-accent font-medium">מנהל</p>
                  )}
                </div>
                <button
                  onClick={onSignOut}
                  className="text-xs text-text-muted hover:text-error transition-colors px-2 py-1 rounded"
                  aria-label="התנתק"
                >
                  יציאה
                </button>
              </>
            )}
          </div>
        ) : (
          !collapsed && (
            <button
              onClick={onSignIn}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-btn text-sm font-semibold text-white bg-accent hover:bg-accent-dark transition-colors"
            >
              כניסה עם Google
            </button>
          )
        )}
      </div>
    </aside>
  );
}
