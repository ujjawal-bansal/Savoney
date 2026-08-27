import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Check, Coins, User as UserIcon } from 'lucide-react';
import { CURRENCIES, exponentOf, formatMoney, needsRescale, type Currency } from '@savoney/shared';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth, useCurrentUser } from '@/features/auth/auth-context';
import { DangerZone } from '@/features/auth/DangerZone';
import { useChangeCurrency, useUpdateProfile } from '@/features/auth/use-profile';
import { PageHeader } from '@/components/PageHeader';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  Field,
  Input,
  Select,
} from '@/components/ui';

const CURRENCY_LABELS: Record<Currency, string> = {
  INR: 'Indian Rupee',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
};

export const SettingsPage = () => (
  <>
    <PageHeader
      eyebrow="Account"
      title="Settings"
      description="Your profile and how amounts are displayed."
    />
    <div className="grid gap-6 lg:grid-cols-2">
      <ProfileCard />
      <CurrencyCard />
    </div>
    <div className="mt-6">
      <DangerZone />
    </div>
  </>
);

const ProfileCard = () => {
  const user = useCurrentUser();
  const { updateUser } = useAuth();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<{ name: string }>({ defaultValues: { name: user.name } });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UserIcon className="size-4 text-muted" aria-hidden="true" />
          <CardTitle>Profile</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit(async ({ name }) => {
            try {
              updateUser(await updateProfile.mutateAsync({ name: name.trim() }));
              toast.success('Profile updated');
            } catch (error) {
              toast.error(
                error instanceof ApiError ? error.message : 'Could not save your profile',
              );
            }
          })}
        >
          <Field label="Name" error={errors.name?.message} required>
            {({ id, invalid }) => (
              <Input
                id={id}
                aria-invalid={invalid}
                {...register('name', {
                  required: 'Name is required',
                  minLength: { value: 2, message: 'At least 2 characters' },
                })}
              />
            )}
          </Field>

          <Field label="Email" hint="Email cannot be changed yet.">
            {({ id, describedBy }) => (
              <Input id={id} value={user.email} aria-describedby={describedBy} disabled readOnly />
            )}
          </Field>

          <Button type="submit" isLoading={isSubmitting} loadingText="Saving…" disabled={!isDirty}>
            Save changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

const CurrencyCard = () => {
  const user = useCurrentUser();
  const { updateUser } = useAuth();
  const changeCurrency = useChangeCurrency();

  const current = user.currency as Currency;
  const [selected, setSelected] = useState<Currency>(current);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const isChanged = selected !== current;
  // Only a differing exponent forces the ledger to be rewritten.
  const willRewrite = isChanged && needsRescale(current, selected);

  // A worked example beats a paragraph: show the user exactly what happens to
  // a real amount before they commit.
  const sample = 123_456;
  const sampleAfter = willRewrite
    ? Math.round(sample * 10 ** (exponentOf(selected) - exponentOf(current)))
    : sample;

  const apply = async () => {
    try {
      const result = await changeCurrency.mutateAsync(selected);
      updateUser(result.user);
      toast.success(
        result.rescaled
          ? `Currency set to ${selected} · ${result.transactionsUpdated} transactions rewritten`
          : `Currency set to ${selected}`,
      );
      setIsConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not change your currency');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-muted" aria-hidden="true" />
            <CardTitle>Currency</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Display currency" hint="Used everywhere amounts appear.">
            {({ id, describedBy }) => (
              <Select
                id={id}
                value={selected}
                aria-describedby={describedBy}
                onChange={(event) => setSelected(event.target.value as Currency)}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency} · {CURRENCY_LABELS[currency]}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {isChanged && (
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                willRewrite
                  ? 'border-[var(--color-caution)]/40 bg-[var(--color-caution-soft)]'
                  : 'border-[var(--border-subtle)] surface-sunken',
              )}
            >
              <div className="flex items-start gap-2">
                {willRewrite ? (
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-[var(--color-caution)]"
                    aria-hidden="true"
                  />
                ) : (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[var(--color-positive)]"
                    aria-hidden="true"
                  />
                )}
                <div className="space-y-2">
                  <p className={willRewrite ? 'text-[var(--color-caution)]' : 'text-secondary'}>
                    {willRewrite
                      ? `${selected} has no decimal places, so every stored amount will be rewritten to keep its value.`
                      : `${current} and ${selected} both use two decimals, so only the symbol changes.`}
                  </p>
                  <p className="tabular flex items-center gap-2 font-medium text-primary">
                    {formatMoney(sample, current)}
                    <ArrowRight className="size-3.5 text-muted" aria-hidden="true" />
                    {formatMoney(sampleAfter, selected)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-muted">
            Amounts are <strong>relabelled, not converted</strong>. Savoney does not apply exchange
            rates, because a real conversion needs a dated rate for every transaction.
          </p>

          <div className="flex gap-2">
            <Button
              onClick={() => (willRewrite ? setIsConfirmOpen(true) : void apply())}
              disabled={!isChanged}
              isLoading={changeCurrency.isPending && !isConfirmOpen}
              loadingText="Applying…"
            >
              Change currency
            </Button>
            {isChanged && (
              <Button variant="ghost" onClick={() => setSelected(current)}>
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={`Switch to ${selected}?`}
        className="w-[min(28rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsConfirmOpen(false)}
              disabled={changeCurrency.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void apply()}
              isLoading={changeCurrency.isPending}
              loadingText="Rewriting…"
            >
              Yes, change it
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-secondary">
          <p>
            Every transaction, budget and goal will be rewritten so its value is preserved.{' '}
            <span className="tabular font-medium text-primary">
              {formatMoney(sample, current)} becomes {formatMoney(sampleAfter, selected)}
            </span>
            .
          </p>
          {exponentOf(selected) < exponentOf(current) && (
            <p className="rounded-lg bg-[var(--color-caution-soft)] px-3 py-2 text-[var(--color-caution)]">
              {selected} has no sub-unit, so amounts are rounded to whole {selected}. Switching back
              later will not recover the lost cents.
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
};
