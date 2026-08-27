import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpDown,
  Download,
  Pencil,
  Plus,
  Receipt,
  Repeat,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Currency, Transaction } from '@savoney/shared';
import { formatDate, formatSigned } from '@/lib/format';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/cn';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useCategories } from '@/features/categories/use-categories';
import {
  downloadTransactionsCsv,
  useBulkDeleteTransactions,
  useDeleteTransaction,
  useImportTransactions,
  useTransactions,
  type TransactionFilters,
} from '@/features/transactions/use-transactions';
import { TransactionForm } from '@/features/transactions/TransactionForm';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Select,
  Skeleton,
} from '@/components/ui';

const PAGE_SIZE = 20;

export const TransactionsPage = () => {
  const user = useCurrentUser();
  const currency = user.currency as Currency;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | 'income' | 'expense'>('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState<TransactionFilters['sort']>('occurredAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<Transaction | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounced so typing does not fire a request per keystroke.
  const debouncedSearch = useDebounced(search, 300);

  const filters = useMemo<TransactionFilters>(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(type ? { type } : {}),
      ...(categoryId ? { categoryId } : {}),
      sort,
      order,
    }),
    [page, debouncedSearch, type, categoryId, sort, order],
  );

  const query = useTransactions(filters);
  const { data: categories = [] } = useCategories();
  const deleteOne = useDeleteTransaction();
  const bulkDelete = useBulkDeleteTransactions();
  const importCsv = useImportTransactions();

  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  const hasFilters = Boolean(search || type || categoryId);

  const resetFilters = () => {
    setSearch('');
    setType('');
    setCategoryId('');
    setPage(1);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (field: NonNullable<TransactionFilters['sort']>) => {
    if (sort === field) setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  };

  const handleImport = async (file: File) => {
    const text = await file.text();
    try {
      const result = await importCsv.mutateAsync(text);
      if (result.imported > 0) {
        toast.success(
          `Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'}` +
            (result.categoriesCreated.length > 0
              ? ` · created ${result.categoriesCreated.length} categor${result.categoriesCreated.length === 1 ? 'y' : 'ies'}`
              : ''),
        );
      }
      if (result.errors.length > 0) {
        // Naming the first bad line makes the failure actionable.
        toast.warning(
          `${result.errors.length} row${result.errors.length === 1 ? '' : 's'} skipped. Line ${result.errors[0]!.line}: ${result.errors[0]!.message}`,
          { duration: 8000 },
        );
      }
      if (result.imported === 0 && result.errors.length === 0) {
        toast.info('That file contained no transactions');
      }
    } catch {
      toast.error('Could not read that CSV file');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Ledger"
        title="Transactions"
        description={meta ? `${meta.total.toLocaleString()} recorded` : 'Every entry, searchable.'}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
                // Reset so selecting the same file twice re-triggers change.
                event.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              isLoading={importCsv.isPending}
              loadingText="Importing…"
            >
              <Download className="size-3.5" aria-hidden="true" />
              Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void downloadTransactionsCsv().catch(() => toast.error('Export failed'));
              }}
            >
              <Upload className="size-3.5" aria-hidden="true" />
              Export
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setIsFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search descriptions, notes and tags…"
              className="pl-9"
              aria-label="Search transactions"
            />
          </div>

          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value as '' | 'income' | 'expense');
              setPage(1);
            }}
            aria-label="Filter by type"
            className="sm:w-36"
          >
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </Select>

          <Select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            aria-label="Filter by category"
            className="sm:w-44"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="size-3.5" aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--surface-hover)] px-3 py-2">
            <span className="text-sm text-secondary">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => setIsBulkConfirmOpen(true)}>
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </Card>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          {/* Horizontal scroll is confined to the table so the page body never
              scrolls sideways on a phone. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <caption className="sr-only">
                Transactions, sorted by {sort} {order === 'asc' ? 'ascending' : 'descending'}
              </caption>
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left">
                  <th scope="col" className="w-10 px-4 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <SortableHeader
                    label="Description"
                    field="title"
                    sort={sort}
                    order={order}
                    onSort={toggleSort}
                  />
                  <th scope="col" className="px-4 py-3 text-xs font-semibold text-muted">
                    Category
                  </th>
                  <SortableHeader
                    label="Date"
                    field="occurredAt"
                    sort={sort}
                    order={order}
                    onSort={toggleSort}
                  />
                  <SortableHeader
                    label="Amount"
                    field="amountMinor"
                    sort={sort}
                    order={order}
                    onSort={toggleSort}
                    align="right"
                  />
                  <th scope="col" className="w-24 px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[var(--border-subtle)]">
                {query.isPending ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon={Receipt}
                        title={hasFilters ? 'No matches' : 'No transactions yet'}
                        description={
                          hasFilters
                            ? 'Try a different search or clear the filters.'
                            : 'Add your first transaction, or import a CSV of your history.'
                        }
                        action={
                          hasFilters ? (
                            <Button variant="secondary" size="sm" onClick={resetFilters}>
                              Clear filters
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => setIsFormOpen(true)}>
                              <Plus className="size-4" aria-hidden="true" />
                              Add transaction
                            </Button>
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className={cn(
                        'transition-colors hover:bg-[var(--surface-hover)]',
                        selected.has(transaction.id) && 'bg-brand-50/60 dark:bg-brand-950/40',
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(transaction.id)}
                          onChange={() => toggleSelected(transaction.id)}
                          aria-label={`Select ${transaction.title}`}
                          className="size-4 rounded border-[var(--border-strong)] accent-[var(--color-brand-600,#4f46e5)]"
                        />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-primary">{transaction.title}</span>
                          {transaction.recurrence && (
                            <Repeat className="size-3.5 text-muted" aria-label="Recurring" />
                          )}
                        </div>
                        {transaction.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {transaction.tags.map((tag) => (
                              <Badge key={tag}>{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-secondary">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: transaction.category?.color ?? '#94a3b8' }}
                            aria-hidden="true"
                          />
                          {transaction.category?.name ?? 'Uncategorised'}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-secondary">
                        {formatDate(transaction.occurredAt)}
                      </td>

                      <td
                        className={cn(
                          'tabular px-4 py-3 text-right font-semibold whitespace-nowrap',
                          transaction.type === 'income'
                            ? 'text-[var(--color-positive)] dark:text-emerald-400'
                            : 'text-primary',
                        )}
                      >
                        {formatSigned(transaction.amountMinor, transaction.type, currency)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${transaction.title}`}
                            onClick={() => {
                              setEditing(transaction);
                              setIsFormOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${transaction.title}`}
                            onClick={() => setPendingDelete(transaction)}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {meta && meta.totalPages > 1 && (
            <nav
              aria-label="Pagination"
              className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] px-4 py-3"
            >
              <p className="text-xs text-muted">
                Page {meta.page} of {meta.totalPages} · {meta.total.toLocaleString()} total
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!meta.hasPreviousPage}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!meta.hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </Card>
      )}

      <TransactionForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditing(null);
        }}
        currency={currency}
        transaction={editing}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete transaction?"
        description={`"${pendingDelete?.title ?? ''}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        isPending={deleteOne.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await deleteOne.mutateAsync(pendingDelete.id);
            toast.success('Transaction deleted');
          } catch {
            toast.error('Could not delete that transaction');
          } finally {
            setPendingDelete(null);
          }
        }}
      />

      <ConfirmDialog
        open={isBulkConfirmOpen}
        onClose={() => setIsBulkConfirmOpen(false)}
        title={`Delete ${selected.size} transactions?`}
        description="These will be permanently removed. This cannot be undone."
        confirmLabel={`Delete ${selected.size}`}
        isPending={bulkDelete.isPending}
        onConfirm={async () => {
          try {
            const result = await bulkDelete.mutateAsync([...selected]);
            toast.success(`Deleted ${result.deleted} transactions`);
            setSelected(new Set());
          } catch {
            toast.error('Could not delete those transactions');
          } finally {
            setIsBulkConfirmOpen(false);
          }
        }}
      />
    </>
  );
};

interface SortableHeaderProps {
  label: string;
  field: NonNullable<TransactionFilters['sort']>;
  sort: TransactionFilters['sort'];
  order: 'asc' | 'desc';
  onSort: (field: NonNullable<TransactionFilters['sort']>) => void;
  align?: 'left' | 'right';
}

const SortableHeader = ({
  label,
  field,
  sort,
  order,
  onSort,
  align = 'left',
}: SortableHeaderProps) => {
  const isActive = sort === field;

  return (
    <th
      scope="col"
      // `aria-sort` is what tells a screen reader the column is sorted and how.
      aria-sort={isActive ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-3', align === 'right' && 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-semibold transition-colors hover:text-primary',
          isActive ? 'text-primary' : 'text-muted',
        )}
      >
        {label}
        <ArrowUpDown className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
};
