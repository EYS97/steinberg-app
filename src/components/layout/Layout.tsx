import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { Header } from './Header';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { signInWithGoogle, signOut } from '@/hooks/useAuth';
import type { User } from 'firebase/auth';

interface LayoutProps {
  user: User | null;
  isAdmin: boolean;
}

export function Layout({ user, isAdmin }: LayoutProps) {
  const location = useLocation();
  const [showUserModal, setShowUserModal] = useState(false);
  const name = user?.displayName || user?.email || 'אורח';
  const email = user?.email || '';

  return (
    <div className="app-layout">
      {/* Desktop Sidebar */}
      <div className="app-sidebar">
        <Sidebar
          user={user}
          isAdmin={isAdmin}
          onSignIn={signInWithGoogle}
          onSignOut={() => { setShowUserModal(false); signOut(); }}
        />
      </div>

      {/* Main content */}
      <main className="app-content">
        <Header user={user} onUserClick={() => setShowUserModal(true)} />
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* User modal */}
      <Modal
        open={showUserModal}
        onClose={() => setShowUserModal(false)}
        title="פרטי משתמש"
        size="sm"
      >
        {user ? (
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="font-semibold text-text-base">{name}</p>
              <p className="text-sm text-text-muted">{email}</p>
              {isAdmin && <span className="inline-block mt-1 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-badge font-medium">מנהל</span>}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setShowUserModal(false); signOut(); }}
            >
              התנתק
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-center py-2">
            <p className="text-text-muted text-sm">כנס עם חשבון Google שלך</p>
            <Button className="w-full" onClick={signInWithGoogle}>
              🔑 כניסה עם Google
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
