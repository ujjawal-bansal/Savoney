import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { useForgotPassword } from './use-profile';

/**
 * Request a reset link.
 *
 * The success screen is shown whether or not the address is registered, because
 * the API deliberately answers identically either way. Saying "no such account"
 * would let anyone test which addresses have Savoney accounts.
 */
export const ForgotPasswordForm = ({ onBack }: { onBack: () => void }) => {
  const forgot = useForgotPassword();
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Present only when the API runs in development without SMTP configured.
  const [devLink, setDevLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>();

  if (sentTo) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-positive-soft)]">
          <MailCheck className="size-6 text-[var(--color-positive)]" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-primary">Check your inbox</h2>
          <p className="mt-2 text-sm text-secondary">
            If <span className="font-medium text-primary">{sentTo}</span> has an account, a reset
            link is on its way. It expires in an hour and can only be used once.
          </p>
        </div>
        {devLink && (
          <div className="rounded-lg border border-[var(--color-caution)]/40 bg-[var(--color-caution-soft)] p-3 text-left">
            <p className="text-xs font-medium text-[var(--color-caution)]">
              Development mode: no email was sent
            </p>
            <a
              href={devLink}
              className="mt-1 block text-xs break-all text-brand-600 underline dark:text-brand-400"
            >
              {devLink}
            </a>
          </div>
        )}

        <Button variant="secondary" className="w-full" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit(async ({ email }) => {
        try {
          const result = await forgot.mutateAsync(email);
          setDevLink(result.devLink ?? null);
          setSentTo(email);
        } catch (error) {
          if (error instanceof ApiError && error.fieldErrors.email) {
            setError('email', { message: error.fieldErrors.email });
          } else {
            setError('email', { message: 'Could not send the link. Try again in a moment.' });
          }
        }
      })}
    >
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-primary">
          Forgot your password?
        </h2>
        <p className="mt-1 text-sm text-secondary">
          Enter your email and we will send you a link to choose a new one.
        </p>
      </header>

      <Field label="Email" error={errors.email?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...register('email', { required: 'Email is required' })}
          />
        )}
      </Field>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        isLoading={isSubmitting}
        loadingText="Sending…"
      >
        Send reset link
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="mx-auto flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to sign in
      </button>
    </form>
  );
};
