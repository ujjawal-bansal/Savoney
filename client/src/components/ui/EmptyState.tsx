import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * An empty state should tell the user why the space is blank and what to do
 * about it. "No data" alone leaves them guessing whether the app is broken.
 */
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => (
  <div
    className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
  >
    <div className="mb-4 grid size-12 place-items-center rounded-full bg-[var(--surface-hover)]">
      <Icon className="size-6 text-muted" aria-hidden="true" />
    </div>
    <h3 className="text-base font-semibold text-primary">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-secondary">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
