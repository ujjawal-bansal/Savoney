import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, letting later Tailwind utilities win over earlier ones.
 * Plain `clsx` would leave both `p-2` and `p-4` in the string and hand the
 * decision to CSS source order, which makes component overrides unreliable.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
