import { cn } from '@/lib/cn';

interface ProgressProps {
  /** 0–100+; values above 100 are rendered as a full, over-budget bar. */
  value: number;
  tone?: 'brand' | 'positive' | 'caution' | 'negative';
  className?: string;
  label?: string;
}

const TONE_CLASS: Record<NonNullable<ProgressProps['tone']>, string> = {
  brand: 'bg-brand-500',
  positive: 'bg-[var(--color-positive)]',
  caution: 'bg-[var(--color-caution)]',
  negative: 'bg-[var(--color-negative)]',
};

export const Progress = ({ value, tone = 'brand', className, label }: ProgressProps) => {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      // Exposed as a real progressbar so assistive tech reads the value rather
      // than seeing two anonymous divs.
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', TONE_CLASS[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
