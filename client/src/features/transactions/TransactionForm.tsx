import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  type RECURRENCE_FREQUENCIES,
  toInputValue,
  toMinor,
  type Currency,
  type Transaction,
} from '@savoney/shared';
import { toDateInputValue } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { useCategories } from '@/features/categories/use-categories';
import { useCreateTransaction, useUpdateTransaction } from './use-transactions';

interface FormValues {
  title: string;
  /** Major units as typed by the user; converted to minor on submit. */
  amount: string;
  type: 'income' | 'expense';
  categoryId: string;
  occurredAt: string;
  notes: string;
  tags: string;
  frequency: (typeof RECURRENCE_FREQUENCIES)[number];
  interval: string;
}

interface TransactionFormProps {
  open: boolean;
  onClose: () => void;
  currency: Currency;
  /** Present when editing; absent when creating. */
  transaction?: Transaction | null;
}

const emptyValues = (): FormValues => ({
  title: '',
  amount: '',
  type: 'expense',
  categoryId: '',
  occurredAt: toDateInputValue(new Date()),
  notes: '',
  tags: '',
  frequency: 'none',
  interval: '1',
});

export const TransactionForm = ({ open, onClose, currency, transaction }: TransactionFormProps) => {
  const isEditing = Boolean(transaction);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: emptyValues() });

  // `useWatch` subscribes through `control` and re-renders only this component
  // on change; `watch()` cannot be memoized and re-renders on every keystroke
  // in any field.
  const type = useWatch({ control, name: 'type' });
  const frequency = useWatch({ control, name: 'frequency' });

  // Only categories matching the selected flow type are valid; the server
  // enforces this too, but offering an impossible choice is a poor form.
  const { data: categories = [] } = useCategories({ type });

  useEffect(() => {
    if (!open) return;
    reset(
      transaction
        ? {
            title: transaction.title,
            amount: toInputValue(transaction.amountMinor, currency),
            type: transaction.type,
            categoryId: transaction.category?.id ?? '',
            occurredAt: toDateInputValue(transaction.occurredAt),
            notes: transaction.notes,
            tags: transaction.tags.join(', '),
            frequency: transaction.recurrence?.frequency ?? 'none',
            interval: String(transaction.recurrence?.interval ?? 1),
          }
        : emptyValues(),
    );
  }, [open, transaction, currency, reset]);

  const onSubmit = handleSubmit(async (values) => {
    let amountMinor: number;
    try {
      amountMinor = toMinor(values.amount, currency);
    } catch {
      setError('amount', { message: 'Enter a valid amount, for example 12.34' });
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
      title: values.title.trim(),
      amountMinor,
      type: values.type,
      categoryId: values.categoryId,
      occurredAt: new Date(`${values.occurredAt}T12:00:00Z`),
      notes: values.notes.trim(),
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      ...(values.frequency !== 'none'
        ? { recurrence: { frequency: values.frequency, interval: Number(values.interval) || 1 } }
        : {}),
    };

    try {
      if (transaction) {
        await update.mutateAsync({ id: transaction.id, input: payload });
        toast.success('Transaction updated');
      } else {
        await create.mutateAsync(payload);
        toast.success('Transaction added');
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors;
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field in emptyValues()) setError(field as keyof FormValues, { message });
        }
        if (Object.keys(fieldErrors).length === 0) toast.error(error.message);
      } else {
        toast.error('Could not save the transaction');
      }
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit transaction' : 'New transaction'}
      description={isEditing ? undefined : 'Record money coming in or going out.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            form="transaction-form"
            type="submit"
            isLoading={isSubmitting}
            loadingText="Saving…"
          >
            {isEditing ? 'Save changes' : 'Add transaction'}
          </Button>
        </>
      }
    >
      <form id="transaction-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" error={errors.type?.message}>
            {({ id }) => (
              <Select id={id} {...register('type')}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
            )}
          </Field>

          <Field label={`Amount (${currency})`} error={errors.amount?.message} required>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...register('amount', { required: 'Amount is required' })}
              />
            )}
          </Field>
        </div>

        <Field label="Description" error={errors.title?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              placeholder="Weekly groceries"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...register('title', {
                required: 'Description is required',
                minLength: { value: 2, message: 'At least 2 characters' },
              })}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={errors.categoryId?.message} required>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                {...register('categoryId')}
              >
                <option value="">Select…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Date" error={errors.occurredAt?.message} required>
            {({ id }) => (
              <Input
                id={id}
                type="date"
                {...register('occurredAt', { required: 'Date is required' })}
              />
            )}
          </Field>
        </div>

        <Field label="Tags" hint="Comma separated, e.g. commute, work">
          {({ id, describedBy }) => (
            <Input
              id={id}
              placeholder="commute, work"
              aria-describedby={describedBy}
              {...register('tags')}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeats">
            {({ id }) => (
              <Select id={id} {...register('frequency')}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </Select>
            )}
          </Field>

          {frequency !== 'none' && (
            <Field label="Every" hint={`${frequency.replace('ly', '')} interval`}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={365}
                  aria-describedby={describedBy}
                  {...register('interval')}
                />
              )}
            </Field>
          )}
        </div>

        <Field label="Notes">
          {({ id }) => <Textarea id={id} rows={2} placeholder="Optional" {...register('notes')} />}
        </Field>
      </form>
    </Dialog>
  );
};
