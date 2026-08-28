import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CheckCircle2, Minus, Plus, Target, Trash2 } from 'lucide-react';
import type { Currency, Goal } from '@savoney/shared';
import { formatMoney, toInputValue, toMinor } from '@savoney/shared';
import { formatDate, toDateInputValue } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { useCurrentUser } from '@/features/auth/auth-context';
import {
  useContributeToGoal,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useUpdateGoal,
} from '@/features/goals/use-goals';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Progress,
  SkeletonCard,
  Textarea,
} from '@/components/ui';

export const GoalsPage = () => {
  const user = useCurrentUser();
  const currency = user.currency as Currency;

  const query = useGoals();
  const remove = useDeleteGoal();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Goal | null>(null);

  const goals = query.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Saving"
        title="Goals"
        description="What you are putting money aside for."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setIsFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            New goal
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
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="No goals yet"
            description="Set a target like an emergency fund, a trip or a new laptop, then track what you have put aside."
            action={
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Create a goal
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => (
            <Card key={goal.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-4 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: goal.color }}
                        aria-hidden="true"
                      />
                      <h3 className="truncate font-semibold text-primary">{goal.name}</h3>
                    </div>
                    {goal.targetDate && (
                      <p className="mt-0.5 text-xs text-muted">by {formatDate(goal.targetDate)}</p>
                    )}
                  </div>
                  {goal.isComplete && (
                    <Badge tone="positive">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      Funded
                    </Badge>
                  )}
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="tabular text-xl font-semibold text-primary">
                      {formatMoney(goal.savedMinor, currency)}
                    </span>
                    <span className="tabular text-sm text-muted">
                      of {formatMoney(goal.targetMinor, currency)}
                    </span>
                  </div>
                  <Progress
                    className="mt-2"
                    value={goal.percentComplete}
                    tone={goal.isComplete ? 'positive' : 'brand'}
                    label={`${goal.name}: ${goal.percentComplete.toFixed(0)} percent funded`}
                  />
                  <p className="tabular mt-1.5 text-xs text-secondary">
                    {goal.isComplete
                      ? 'Target reached'
                      : `${formatMoney(goal.remainingMinor, currency)} to go`}
                    {goal.requiredMonthlyMinor !== null &&
                      ` · ${formatMoney(goal.requiredMonthlyMinor, currency)}/month needed`}
                  </p>
                </div>

                {goal.notes && <p className="text-xs text-muted">{goal.notes}</p>}
              </CardContent>

              <div className="flex items-center justify-between gap-1 border-t border-[var(--border-subtle)] px-3 py-2">
                <Button variant="ghost" size="sm" onClick={() => setContributing(goal)}>
                  <Plus className="size-3.5" aria-hidden="true" />
                  Contribute
                </Button>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(goal);
                      setIsFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setPendingDelete(goal)}
                    aria-label={`Delete ${goal.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <GoalForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditing(null);
        }}
        currency={currency}
        goal={editing}
      />

      <ContributeDialog
        // Keying on the goal remounts the dialog with fresh state for each
        // goal, instead of resetting it from an effect after the fact.
        key={contributing?.id ?? 'none'}
        goal={contributing}
        currency={currency}
        onClose={() => setContributing(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete goal?"
        description={`"${pendingDelete?.name ?? ''}" and its saved progress will be removed.`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          try {
            await remove.mutateAsync(pendingDelete.id);
            toast.success('Goal deleted');
          } catch {
            toast.error('Could not delete that goal');
          } finally {
            setPendingDelete(null);
          }
        }}
      />
    </>
  );
};

interface GoalFormValues {
  name: string;
  target: string;
  saved: string;
  targetDate: string;
  color: string;
  notes: string;
}

const GoalForm = ({
  open,
  onClose,
  currency,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  currency: Currency;
  goal: Goal | null;
}) => {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      name: goal?.name ?? '',
      target: goal ? toInputValue(goal.targetMinor, currency) : '',
      saved: goal ? toInputValue(goal.savedMinor, currency) : '0',
      targetDate: goal?.targetDate ? toDateInputValue(goal.targetDate) : '',
      color: goal?.color ?? '#0ea5e9',
      notes: goal?.notes ?? '',
    });
  }, [open, goal, currency, reset]);

  const onSubmit = handleSubmit(async (values) => {
    let targetMinor: number;
    let savedMinor: number;
    try {
      targetMinor = toMinor(values.target, currency);
      savedMinor = toMinor(values.saved || '0', currency);
    } catch {
      setError('target', { message: 'Enter valid amounts' });
      return;
    }
    if (targetMinor <= 0) {
      setError('target', { message: 'Target must be greater than zero' });
      return;
    }
    if (savedMinor > targetMinor) {
      setError('saved', { message: 'Saved cannot exceed the target' });
      return;
    }

    const payload = {
      name: values.name.trim(),
      targetMinor,
      savedMinor,
      color: values.color,
      notes: values.notes.trim(),
      ...(values.targetDate ? { targetDate: new Date(`${values.targetDate}T12:00:00Z`) } : {}),
    };

    try {
      if (goal) {
        await update.mutateAsync({ id: goal.id, input: payload });
        toast.success('Goal updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Goal created');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that goal');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New goal'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button form="goal-form" type="submit" isLoading={isSubmitting} loadingText="Saving…">
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Name" error={errors.name?.message} required>
          {({ id, invalid }) => (
            <Input
              id={id}
              placeholder="Emergency fund"
              aria-invalid={invalid}
              {...register('name', { required: 'Name is required' })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Target (${currency})`} error={errors.target?.message} required>
            {({ id, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="10000.00"
                aria-invalid={invalid}
                {...register('target', { required: 'Target is required' })}
              />
            )}
          </Field>

          <Field label={`Already saved (${currency})`} error={errors.saved?.message}>
            {({ id, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={invalid}
                {...register('saved')}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target date" hint="Optional. Drives the monthly figure.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="date"
                aria-describedby={describedBy}
                {...register('targetDate')}
              />
            )}
          </Field>

          <Field label="Colour">
            {({ id }) => (
              <Input
                id={id}
                type="color"
                className="h-10 cursor-pointer p-1"
                {...register('color')}
              />
            )}
          </Field>
        </div>

        <Field label="Notes">
          {({ id }) => <Textarea id={id} rows={2} placeholder="Optional" {...register('notes')} />}
        </Field>
      </form>
    </Dialog>
  );
};

const ContributeDialog = ({
  goal,
  currency,
  onClose,
}: {
  goal: Goal | null;
  currency: Currency;
  onClose: () => void;
}) => {
  const contribute = useContributeToGoal();
  // Fresh per goal: the parent remounts this component via `key`.
  const [amount, setAmount] = useState('');
  const [error, setErrorMessage] = useState<string>();

  const submit = async (direction: 1 | -1) => {
    if (!goal) return;
    let amountMinor: number;
    try {
      amountMinor = toMinor(amount, currency);
    } catch {
      setErrorMessage('Enter a valid amount');
      return;
    }
    if (amountMinor <= 0) {
      setErrorMessage('Amount must be greater than zero');
      return;
    }

    try {
      await contribute.mutateAsync({ id: goal.id, amountMinor: amountMinor * direction });
      toast.success(direction === 1 ? 'Contribution added' : 'Withdrawal recorded');
      onClose();
    } catch (caught) {
      setErrorMessage(caught instanceof ApiError ? caught.message : 'Could not update that goal');
    }
  };

  return (
    <Dialog
      open={Boolean(goal)}
      onClose={onClose}
      title={goal ? `Contribute to ${goal.name}` : ''}
      description={
        goal
          ? `${formatMoney(goal.savedMinor, currency)} saved of ${formatMoney(goal.targetMinor, currency)}.`
          : undefined
      }
      className="w-[min(24rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => void submit(-1)}
            disabled={contribute.isPending}
          >
            <Minus className="size-3.5" aria-hidden="true" />
            Withdraw
          </Button>
          <Button
            onClick={() => void submit(1)}
            isLoading={contribute.isPending}
            loadingText="Saving…"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Add
          </Button>
        </>
      }
    >
      <Field label={`Amount (${currency})`} error={error}>
        {({ id, invalid }) => (
          <Input
            id={id}
            inputMode="decimal"
            placeholder="100.00"
            value={amount}
            aria-invalid={invalid}
            onChange={(event) => {
              setAmount(event.target.value);
              setErrorMessage(undefined);
            }}
            autoFocus
          />
        )}
      </Field>
    </Dialog>
  );
};
