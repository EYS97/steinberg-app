import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
          <div>
            <img src="/assets/branding/logo.png" alt="" aria-hidden="true" width={64} height={64} className="mx-auto mb-4 opacity-50" style={{ borderRadius: '22%' }} />
            <h2 className="text-xl font-bold text-primary mb-2">משהו השתבש</h2>
            <p className="text-text-muted text-sm mb-4">{(this.state.error as Error).message}</p>
            <button
              className="px-4 py-2 bg-accent text-white rounded-btn text-sm"
              onClick={() => window.location.reload()}
            >רענן</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';
import { Layout } from '@/components/layout/Layout';
import { LoadingScreen, LoginScreen, PendingScreen } from '@/components/auth/AuthGate';
import { ToastProvider } from '@/components/ui/Toast';

// Pages — lazy loaded for code splitting
import { Home }         from '@/pages/Home';
import { Calendar }     from '@/pages/Calendar';
import { Rooms }        from '@/pages/Rooms';
import { Seudot }       from '@/pages/Seudot';
import { Hosting }      from '@/pages/Hosting';
import { FamilyPage }   from '@/pages/Family';
import { FamilyTree }   from '@/pages/FamilyTree';
import { Notifications } from '@/pages/Notifications';
import { Settings }     from '@/pages/Settings';

function AppRoutes() {
  const { user, loading, isApproved, isPending } = useAuth();
  const isAdmin = useAdmin(user);

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;
  if (isPending) return <PendingScreen />;

  const props = { user, isAdmin };

  return (
    <Routes>
      <Route element={<Layout user={user} isAdmin={isAdmin} />}>
        <Route path="/"             element={<Home {...props} />} />
        <Route path="/calendar"     element={<Calendar {...props} />} />
        <Route path="/rooms"        element={<Rooms {...props} />} />
        <Route path="/seudot"       element={<Seudot {...props} />} />
        <Route path="/meals"        element={<Navigate to="/seudot" replace />} />
        <Route path="/hosting"      element={<Hosting {...props} />} />
        <Route path="/family"       element={<FamilyPage {...props} />} />
        <Route path="/family-tree"  element={<FamilyTree />} />
        <Route path="/notifications" element={<Notifications {...props} />} />
        <Route path="/settings"     element={<Settings {...props} />} />
        <Route path="*"             element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
