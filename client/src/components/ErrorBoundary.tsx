import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken component does not blank the whole app.
 *
 * Without a boundary React unmounts the entire tree on an uncaught render
 * error, leaving a white page with no explanation and no way forward. This must
 * be a class component: there is still no hook equivalent of
 * `componentDidCatch`.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Where an error reporter (Sentry and similar) would be notified. Logging
    // to the console at least preserves the stack for a bug report.
    console.error('Unhandled render error', error, info.componentStack);
  }

  private readonly reload = () => {
    window.location.assign('/');
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[var(--color-negative-soft)]">
            <AlertTriangle className="size-6 text-[var(--color-negative)]" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-primary">Something broke on this page</h1>
          <p className="mt-2 text-sm text-secondary">
            The error has been logged. Your data is safe: nothing is saved until you submit a form.
          </p>

          {import.meta.env.DEV && (
            // The message is useful while developing and a liability in
            // production, where it can expose internals to a user.
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-[var(--surface-hover)] p-3 text-left text-xs text-secondary">
              {error.message}
            </pre>
          )}

          <Button className="mt-6" onClick={this.reload}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Back to the dashboard
          </Button>
        </div>
      </div>
    );
  }
}
