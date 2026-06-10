import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { AppLogo } from '@/components/ui/AppLogo';
import { signInWithGoogle } from '@/hooks/useAuth';

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="flex flex-col items-center gap-4"
      >
        <AppLogo variant="icon" iconSize={96} />
        <p className="text-text-muted text-sm animate-pulse">טוען...</p>
      </motion.div>
    </div>
  );
}

export function LoginScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface rounded-modal shadow-modal border border-border p-8 max-w-sm w-full text-center"
      >
        <div className="flex justify-center mb-6">
          <AppLogo variant="full" iconSize={96} />
        </div>
        <Button className="w-full" size="lg" onClick={signInWithGoogle}>
          <span>G</span> כניסה עם Google
        </Button>
        <p className="text-xs text-text-muted mt-4">
          גישה מוגבלת לבני המשפחה בלבד
        </p>
      </motion.div>
    </div>
  );
}

export function PendingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface rounded-modal shadow-modal border border-border p-8 max-w-sm w-full text-center"
      >
        <div className="flex justify-center mb-5">
          <AppLogo variant="icon" iconSize={64} />
        </div>
        <h1 className="text-xl font-bold text-primary mb-2">ממתין לאישור</h1>
        <p className="text-text-muted text-sm">
          בקשת הגישה שלך נשלחה למנהל המשפחה.<br />
          תקבל גישה לאחר האישור.
        </p>
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={() => window.location.reload()}
        >
          רענן
        </Button>
      </motion.div>
    </div>
  );
}
