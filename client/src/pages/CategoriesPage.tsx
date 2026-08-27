import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { CATEGORY_ICONS, type Category } from '@savoney/shared';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '@/features/categories/use-categories';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
} from '@/components/ui';

export const CategoriesPage = () => {
  const [showArchived, setShowArchived] = useState(false);
  const query = useCategories({ includeArchived: showArchived });
  const archive = useArchiveCategory();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  const categories = query.data ?? [];
  const income = categories.filter((category) => category.type === 'income');
  const expense = categories.filter((category) => category.type === 'expense');

  const toggleArchive = async (category: Category) => {
    try {
      await archive.mutateAsync({ id: category.id, isArchived: !category.isArchived });
      toast.success(category.isArchived ? 'Category restored' : 'Category archived');
    } catch {
      toast.error('Could not update that category');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Categories"
        description="How your income and spending are classified."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowArchived((current) => !current)}
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setIsFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              New category
            </Button>
          </>
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="p-5">
              <Skeleton className="h-4 w-24" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 5 }).map((__, row) => (
                  <Skeleton key={row} className="h-12 w-full" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={Tags}
            title="No categories"
            description="Categories group your transactions so budgets and reports have something to work with."
            action={
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Add a category
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryGroup
            title="Spending"
            categories={expense}
            onEdit={(category) => {
              setEditing(category);
              setIsFormOpen(true);
            }}
            onArchive={toggleArchive}
            onDelete={setDeleting}
          />
          <CategoryGroup
            title="Income"
            categories={income}
            onEdit={(category) => {
              setEditing(category);
              setIsFormOpen(true);
            }}
            onArchive={toggleArchive}
            onDelete={setDeleting}
          />
        </div>
      )}

      <CategoryForm
        open={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditing(null);
        }}
        category={editing}
      />

      <DeleteCategoryDialog
        // Remount per category so the reassignment choice never carries over
        // from a previously opened dialog.
        key={deleting?.id ?? 'none'}
        category={deleting}
        allCategories={categories}
        onClose={() => setDeleting(null)}
      />
    </>
  );
};

interface CategoryGroupProps {
  title: string;
  categories: Category[];
  onEdit: (category: Category) => void;
  onArchive: (category: Category) => void;
  onDelete: (category: Category) => void;
}

const CategoryGroup = ({ title, categories, onEdit, onArchive, onDelete }: CategoryGroupProps) => (
  <Card>
    <CardContent className="pt-5">
      <h2 className="mb-3 text-sm font-semibold text-secondary">
        {title}
        <span className="ml-2 font-normal text-muted">{categories.length}</span>
      </h2>

      {categories.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {categories.map((category) => (
            <li
              key={category.id}
              className={cn('flex items-center gap-3 py-2.5', category.isArchived && 'opacity-55')}
            >
              <span
                className="size-8 shrink-0 rounded-lg"
                style={{
                  backgroundColor: `${category.color}26`,
                  border: `1px solid ${category.color}`,
                }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-primary">{category.name}</span>
                  {category.isArchived && <Badge>Archived</Badge>}
                </div>
                <p className="text-xs text-muted">
                  {category.transactionCount ?? 0} transaction
                  {category.transactionCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(category)}
                  aria-label={`Edit ${category.name}`}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onArchive(category)}
                  aria-label={
                    category.isArchived ? `Restore ${category.name}` : `Archive ${category.name}`
                  }
                >
                  {category.isArchived ? (
                    <ArchiveRestore className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Archive className="size-3.5" aria-hidden="true" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(category)}
                  aria-label={`Delete ${category.name}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

interface CategoryFormValues {
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon: (typeof CATEGORY_ICONS)[number];
}

const CategoryForm = ({
  open,
  onClose,
  category,
}: {
  open: boolean;
  onClose: () => void;
  category: Category | null;
}) => {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>();

  useEffect(() => {
    if (!open) return;
    reset({
      name: category?.name ?? '',
      type: category?.type ?? 'expense',
      color: category?.color ?? '#6366f1',
      icon: category?.icon ?? 'receipt',
    });
  }, [open, category, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (category) {
        // `type` is immutable after creation — changing it would invert every
        // historical transaction filed under this category.
        await update.mutateAsync({
          id: category.id,
          input: { name: values.name.trim(), color: values.color, icon: values.icon },
        });
        toast.success('Category updated');
      } else {
        await create.mutateAsync({ ...values, name: values.name.trim() });
        toast.success('Category created');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save that category');
    }
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button form="category-form" type="submit" isLoading={isSubmitting} loadingText="Saving…">
            {category ? 'Save changes' : 'Create'}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} noValidate className="space-y-4">
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
          <Field
            label="Type"
            hint={category ? 'Type cannot be changed after creation.' : undefined}
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                disabled={Boolean(category)}
                {...register('type')}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
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

        <Field label="Icon">
          {({ id }) => (
            <Select id={id} {...register('icon')}>
              {CATEGORY_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon.replace(/-/g, ' ')}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
};

/**
 * Deleting a category in use forces a choice, because the server refuses to
 * orphan transactions. The dialog offers only same-type destinations.
 */
const DeleteCategoryDialog = ({
  category,
  allCategories,
  onClose,
}: {
  category: Category | null;
  allCategories: Category[];
  onClose: () => void;
}) => {
  const remove = useDeleteCategory();
  // Fresh per category: the parent remounts this component via `key`.
  const [reassignTo, setReassignTo] = useState('');

  const inUse = (category?.transactionCount ?? 0) > 0;
  const destinations = allCategories.filter(
    (candidate) =>
      candidate.id !== category?.id && candidate.type === category?.type && !candidate.isArchived,
  );

  const confirm = async () => {
    if (!category) return;
    try {
      const result = await remove.mutateAsync({
        id: category.id,
        ...(reassignTo ? { reassignTo } : {}),
      });
      toast.success(
        result.reassigned > 0
          ? `Category deleted · ${result.reassigned} transactions moved`
          : 'Category deleted',
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not delete that category');
    }
  };

  return (
    <Dialog
      open={Boolean(category)}
      onClose={onClose}
      title="Delete category?"
      className="w-[min(28rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirm()}
            isLoading={remove.isPending}
            loadingText="Deleting…"
            disabled={inUse && !reassignTo}
          >
            Delete
          </Button>
        </>
      }
    >
      {inUse ? (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            <strong className="text-primary">{category?.name}</strong> is used by{' '}
            {category?.transactionCount} transaction
            {category?.transactionCount === 1 ? '' : 's'}. Choose where to move them, because
            deleting outright would erase that history.
          </p>

          {destinations.length === 0 ? (
            <p className="rounded-lg bg-[var(--color-caution-soft)] px-3 py-2 text-sm text-[var(--color-caution)]">
              There is no other {category?.type} category to move them to. Create one first, or
              archive this category instead.
            </p>
          ) : (
            <Field label="Move transactions to">
              {({ id }) => (
                <Select
                  id={id}
                  value={reassignTo}
                  onChange={(event) => setReassignTo(event.target.value)}
                >
                  <option value="">Select a category…</option>
                  {destinations.map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
      ) : (
        <p className="text-sm text-secondary">
          <strong className="text-primary">{category?.name}</strong> has no transactions and will be
          removed permanently.
        </p>
      )}
    </Dialog>
  );
};
