import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight,
  ChartPie,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PiggyBank,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme, type ThemePreference } from '@/lib/use-theme';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/analytics', label: 'Analytics', icon: ChartPie },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; icon: typeof Sun; label: string }> = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
];

const ThemeToggle = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex gap-0.5 rounded-lg border border-[var(--border-subtle)] p-0.5"
    >
      {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setPreference(value)}
          className={cn(
            'grid size-7 place-items-center rounded-md transition-colors',
            preference === value
              ? 'bg-[var(--surface-hover)] text-primary'
              : 'text-muted hover:text-secondary',
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
};

const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2.5 px-2 pt-2">
        <div className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">
          <Sparkles className="size-4" aria-hidden="true" />
        </div>
        <span className="text-base font-semibold tracking-tight text-primary">Savoney</span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300'
                  : 'text-secondary hover:bg-[var(--surface-hover)] hover:text-primary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
                {/* Active state is conveyed to assistive tech, not just by colour. */}
                {isActive && <span className="sr-only">(current page)</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-medium text-muted">Theme</span>
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <div
            className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-200"
            aria-hidden="true"
          >
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-primary">{user?.name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sign out">
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export const AppShell = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Keyboard users should not have to tab through the whole nav on every
          page load to reach the content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen border-r border-[var(--border-subtle)] surface lg:block">
        <SidebarContent />
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white">
            <Sparkles className="size-3.5" aria-hidden="true" />
          </div>
          <span className="font-semibold text-primary">Savoney</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
        >
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 w-72 surface shadow-xl animate-fade-rise">
            <div className="flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main id="main-content" className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Re-keying on pathname replays the entry animation per navigation. */}
        <div key={location.pathname} className="animate-fade-rise">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
