import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { AuthPage } from '@/features/auth/AuthPage';
import { useAuth } from '@/features/auth/auth-context';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { BudgetsPage } from '@/pages/BudgetsPage';
import { CategoriesPage } from '@/pages/CategoriesPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { GoalsPage } from '@/pages/GoalsPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TransactionsPage } from '@/pages/TransactionsPage';

const FullPageSpinner = () => (
  <div className="grid min-h-screen place-items-center" role="status" aria-live="polite">
    <Loader2 className="size-6 animate-spin text-brand-500" aria-hidden="true" />
    <span className="sr-only">Loading</span>
  </div>
);

/**
 * Gate the app on the session-restore attempt.
 *
 * Rendering the redirect before bootstrapping finishes would bounce a
 * legitimately signed-in user to the login screen on every page refresh, since
 * the in-memory access token is always absent at that moment.
 */
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, isBootstrapping } = useAuth();

  if (isBootstrapping) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

export const App = () => (
  <Routes>
    <Route path="/auth" element={<AuthPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route
      element={
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      }
    >
      <Route index element={<DashboardPage />} />
      <Route path="transactions" element={<TransactionsPage />} />
      <Route path="budgets" element={<BudgetsPage />} />
      <Route path="goals" element={<GoalsPage />} />
      <Route path="analytics" element={<AnalyticsPage />} />
      <Route path="categories" element={<CategoriesPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
