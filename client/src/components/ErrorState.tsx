import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

/**
 * A failed query should say what went wrong and offer a way forward. An
 * ApiError carries a message written for users; anything else is an unexpected
 * fault whose raw text would only confuse, so it gets a generic line.
 */
export const ErrorState = ({ error, onRetry, title = 'Could not load this' }: ErrorStateProps) => {
  const message =
    error instanceof ApiError
      ? error.message
      : 'Something went wrong while fetching your data. Check your connection and try again.';

  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-[var(--color-negative-soft)]">
        <AlertTriangle className="size-5 text-[var(--color-negative)]" aria-hidden="true" />
      </div>
      <div>
        <h3 className="font-semibold text-primary">{title}</h3>
        <p className="mt-1 max-w-sm text-sm text-secondary">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
    </Card>
  );
};
