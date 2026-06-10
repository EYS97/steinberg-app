import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { AppLogo } from '@/components/ui/AppLogo';
import { signInWithGoogle, signInWithEmail } from '@/hooks/useAuth';

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
  const [showQA, setShowQA] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
    } catch {
      setError('אימייל או סיסמה שגויים');
    } finally {
      setLoading(false);
    }
  }

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

        <button
          type="button"
          onClick={() => setShowQA(v => !v)}
          className="mt-6 text-xs text-text-muted/50 hover:text-text-muted transition-colors"
        >
          {showQA ? '▲ סגור' : '▼ כניסת QA'}
        </button>

        {showQA && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            onSubmit={handleEmailLogin}
            className="mt-3 flex flex-col gap-2 text-right"
          >
            <input
              type="email"
              placeholder="אימייל"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
            <input
              type="password"
              placeholder="סיסמה"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" variant="outline" size="sm" className="w-full" disabled={loading}>
              {loading ? 'מתחבר...' : 'כניסה'}
            </Button>
          </motion.form>
        )}
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
