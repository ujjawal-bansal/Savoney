import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui';
import { Skeleton } from '@/components/ui/Skeleton';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'brand' | 'positive' | 'negative' | 'neutral';
  /** Percentage change vs. the previous period; null when there is no basis. */
  delta?: number | null;
  /** For spending, a rise is bad — this flips how the delta is coloured. */
  deltaInverted?: boolean;
  caption?: string;
  isLoading?: boolean;
}

const TONE_ICON: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400',
  positive: 'bg-[var(--color-positive-soft)] text-[var(--color-positive)] dark:text-emerald-400',
  negative: 'bg-[var(--color-negative-soft)] text-[var(--color-negative)] dark:text-rose-400',
  neutral: 'bg-[var(--surface-hover)] text-secondary',
};

export const StatCard = ({
  label,
  value,
  icon: Icon,
  tone = 'neutral',
  delta,
  deltaInverted = false,
  caption,
  isLoading,
}: StatCardProps) => {
  if (isLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-3 h-3 w-24" />
      </Card>
    );
  }

  const hasDelta = delta !== undefined && delta !== null;
  const isRise = hasDelta && delta > 0;
  const isFlat = hasDelta && Math.abs(delta) < 0.05;
  // "Good" is not the same as "up": spending more is a worse outcome.
  const isGood = deltaInverted ? !isRise : isRise;
  const DeltaIcon = isFlat ? Minus : isRise ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-secondary">{label}</p>
        <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONE_ICON[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>

      <p className="tabular mt-3 text-2xl font-semibold tracking-tight text-primary">{value}</p>

      <div className="mt-2 flex items-center gap-2 text-xs">
        {hasDelta && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              isFlat
                ? 'text-muted'
                : isGood
                  ? 'text-[var(--color-positive)] dark:text-emerald-400'
                  : 'text-[var(--color-negative)] dark:text-rose-400',
            )}
          >
            <DeltaIcon className="size-3" aria-hidden="true" />
            {/* The arrow is decorative; the sign carries the meaning for
                anyone who cannot distinguish the colours. */}
            {`${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
          </span>
        )}
        {caption && <span className="text-muted">{caption}</span>}
      </div>
    </Card>
  );
};
