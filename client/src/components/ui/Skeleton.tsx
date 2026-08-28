import { cn } from '@/lib/cn';

/**
 * A shape-matched loading placeholder.
 *
 * Skeletons rather than a spinner because they preserve layout: the page does
 * not jump when data lands, and the user can see what is coming.
 */
export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('skeleton rounded-md', className)} aria-hidden="true" {...props} />
);

export const SkeletonText = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton
        key={index}
        className="h-3.5"
        // A ragged last line reads as text rather than as a solid block.
        style={{ width: index === lines - 1 ? '60%' : '100%' }}
      />
    ))}
  </div>
);

export const SkeletonCard = () => (
  <div className="surface-raised rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-5 space-y-3">
    <Skeleton className="h-3 w-24" />
    <Skeleton className="h-8 w-36" />
    <Skeleton className="h-3 w-20" />
  </div>
);
