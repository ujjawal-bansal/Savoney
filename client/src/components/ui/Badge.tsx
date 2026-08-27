import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-hover)] text-secondary',
        positive:
          'bg-[var(--color-positive-soft)] text-[var(--color-positive)] dark:text-emerald-300',
        negative: 'bg-[var(--color-negative-soft)] text-[var(--color-negative)] dark:text-rose-300',
        caution: 'bg-[var(--color-caution-soft)] text-[var(--color-caution)] dark:text-amber-300',
        brand: 'bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
);
