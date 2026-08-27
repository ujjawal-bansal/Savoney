import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CalendarClock, PiggyBank, Plus, Trash2, TrendingUp } from 'lucide-react';
import type { BudgetPeriod, BudgetWithProgress, Currency } from '@savoney/shared';
import { formatMoney, toInputValue, toMinor } from '@savoney/shared';
import { ApiError } from '@/lib/api';
import { useCurrentUser } from '@/features/auth/auth-context';
import { useCategories } from '@/features/categories/use-categories';
import {
  useBudgets,
  useCreateBudget,
  useDeleteBudget,
  useUpdateBudget,
} from '@/features/budgets/use-budgets';
import { BudgetStatusBadge } from '@/features/budgets/BudgetStatusBadge';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import {
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Progress,
  SkeletonCard,
} from '@/components/ui';

export const BudgetsPage = () => {
  const user = useCurrentUser();
  const currency = user.currency as Currency;

  const query = useBudgets();
  const remove = useDeleteBudget();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetWithProgress | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BudgetWithProgress | null>(null);

  const budgets = query.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Planning"
        title="Budgets"
        description="Spending limits with live progress and projections."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            New budget
          </Button>
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={PiggyBank}
            title="No budgets yet"
            description="Set a monthly limit on a spending category and Savoney will track it against your actual transactions."
            action={
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Create your first budget
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              currency={currency}
              onEdit={() => {
                setEditing(budget);
                setIsFormOpen(true);
              }}
              onDelete={() => setPendingDelete(budget)}
            />
          ))}
        </div>
      )}

      <BudgetForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditing(null);
        }}
        currency={currency}
        budget={editing}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete budget?"
        description={`"${pendingDelete?.name ?? ''}" will be removed. Your transactions are not affected.`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success('Budget deleted');
          } catch {
            toast.error('Could not delete that budget');
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </>
  );
};

interface BudgetCardProps {
  budget: BudgetWithProgress;
  currency: Currency;
  onEdit: () => void;
  onDelete: () => void;
}

const BudgetCard = ({ budget, currency, onEdit, onDelete }: BudgetCardProps) => {
  const isOver = budget.remainingMinor < 0;
  // A projection only says something useful once it exceeds the limit.
  const projectedOver = budget.projectedSpendMinor > budget.amountMinor && !isOver;

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: budget.category?.color ?? '#94a3b8' }}
                aria-hidden="true"
              />
              <h3 className="truncate font-semibold text-primary">{budget.name}</h3>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">
              {budget.category?.name ?? 'Uncategorised'} · {budget.period}
            </p>
          </div>
          <BudgetStatusBadge status={budget.status} />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="tabular text-xl font-semibold text-primary">
              {formatMoney(budget.spentMinor, currency)}
            </span>
            <span className="tabular text-sm text-muted">
              of {formatMoney(budget.amountMinor, currency)}
            </span>
          </div>

          <Progress
            className="mt-2"
            value={budget.percentUsed}
            tone={
              budget.status === 'over_budget'
                ? 'negative'
                : budget.status === 'at_risk'
                  ? 'caution'
                  : 'positive'
            }
            label={`${budget.name}: ${budget.percentUsed.toFixed(0)} percent used`}
          />

          <p className="tabular mt-1.5 text-xs text-secondary">
            {isOver
              ? `${formatMoney(Math.abs(budget.remainingMinor), currency)} over budget`
              : `${formatMoney(budget.remainingMinor, currency)} remaining`}
          </p>
        </div>

        <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3 text-xs">
          <div>
            <dt className="flex items-center gap-1 text-muted">
              <CalendarClock className="size-3" aria-hidden="true" />
              Safe daily
            </dt>
            <dd className="tabular mt-0.5 font-medium text-primary">
              {formatMoney(budget.safeDailySpendMinor, currency)}
              <span className="ml-1 font-normal text-muted">· {budget.daysRemaining}d left</span>
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted">
              <TrendingUp className="size-3" aria-hidden="true" />
              Projected
            </dt>
            <dd
              className={
                projectedOver
                  ? 'tabular mt-0.5 font-medium text-[var(--color-caution)]'
                  : 'tabular mt-0.5 font-medium text-primary'
              }
            >
              {formatMoney(budget.projectedSpendMinor, currency)}
            </dd>
          </div>
        </dl>
      </CardContent>

      <div className="flex justify-end gap-1 border-t border-[var(--border-subtle)] px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label={`Delete ${budget.name}`}>
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
};

interface BudgetFormValues {
  name: string;
  amount: string;
  categoryId: string;
  period: BudgetPeriod;
  alertThreshold: string;
}

const BudgetForm = ({
  open,
  onClose,
  currency,
  budget,
}: {
  open: boolean;
  onClose: () => void;
  currency: Currency;
  budget: BudgetWithProgress | null;
}) => {
  const create = useCreateBudget();
  const update = useUpdateBudget();
  // Budgets cap spending, so only expense categories are offered.
  const { data: categories = [] } = useCategories({ type: 'expense' });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BudgetFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      name: budget?.name ?? '',
      amount: budget ? toInputValue(budget.amountMinor, currency) : '',
      categoryId: budget?.category?.id ?? '',
      period: budget?.period ?? 'monthly',
      alertThreshold: String(budget?.alertThreshold ?? 0.8),
    });
  }, [open, budget, currency, reset]);

  const onSubmit = handleSubmit(async (values) => {
    let amountMinor: number;
    try {
      amountMinor = toMinor(values.amount, currency);
    } catch {
      setError('amount', { message: 'Enter a valid amount' });
      return;
    }
    if (amountMinor <= 0) {
      setError('amount', { message: 'Amount must be greater than zero' });
      return;
    }
    if (!values.categoryId) {
      setError('categoryId', { message: 'Choose a category' });
      return;
    }

    const payload = {
      name: values.name.trim(),
      amountMinor,
      categoryId: values.categoryId,
      period: values.period,
      alertThreshold: Number(values.alertThreshold),
    };

    try {
      if (budget) {
        await update.mutateAsync({ id: budget.id, input: payload });
        toast.success('Budget updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Budget created');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that budget');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={budget ? 'Edit budget' : 'New budget'}
      description="Spend is calculated from your transactions in the current period."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button form="budget-form" type="submit" isLoading={isSubmitting} loadingText="Saving…">
            {budget ? 'Save changes' : 'Create budget'}
          </Button>
        </>
      }
    >
      <form id="budget-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" error={errors.name?.message} required>
          {({ id, invalid }) => (
            <Input
              id={id}
              placeholder="Groceries"
              aria-invalid={invalid}
              {...register('name', {
                required: 'Name is required',
                minLength: { value: 2, message: 'At least 2 characters' },
              })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Limit (${currency})`} error={errors.amount?.message} required>
            {({ id, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="500.00"
                aria-invalid={invalid}
                {...register('amount', { required: 'Limit is required' })}
              />
            )}
          </Field>

          <Field label="Period">
            {({ id }) => (
              <Select id={id} {...register('period')}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </Select>
            )}
          </Field>
        </div>

        <Field label="Category" error={errors.categoryId?.message} required>
          {({ id, invalid }) => (
            <Select id={id} aria-invalid={invalid} {...register('categoryId')}>
              <option value="">Select…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Warn me at"
          hint="Flags the budget as at risk once spending reaches this share."
        >
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} {...register('alertThreshold')}>
              <option value="0.5">50%</option>
              <option value="0.7">70%</option>
              <option value="0.8">80%</option>
              <option value="0.9">90%</option>
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
};
