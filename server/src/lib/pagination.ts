import type { PageMeta, Paginated } from '@savoney/shared';

export const buildPageMeta = (page: number, limit: number, total: number): PageMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && total > 0,
  };
};

export const paginate = <T>(
  items: T[],
  page: number,
  limit: number,
  total: number,
): Paginated<T> => ({
  items,
  meta: buildPageMeta(page, limit, total),
});

export const skipFor = (page: number, limit: number): number => (page - 1) * limit;

/**
 * Escape user input before it reaches a `$regex`.
 *
 * Without this, a search for "c++" is a syntax error and a search for
 * "(a+)+$" is a catastrophic-backtracking denial of service against the
 * database. Every metacharacter becomes a literal.
 */
export const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
