import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@savoney/shared';
import { ApiError } from '@/lib/api';
import { Button, Card, CardContent, Field, Input } from '@/components/ui';
import { useResetPassword } from '@/features/auth/use-profile';

/**
 * Redeem a reset link.
 *
 * The token arrives in the query string, so the page has to cope with it being
 * absent or already spent, both of which are ordinary rather than exceptional.
 */
export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const resetPassword = useResetPassword();
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  const shell = (children: React.ReactNode) => (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">{children}</CardContent>
      </Card>
    </div>
  );

  if (!token) {
    return shell(
      <div className="space-y-4 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-negative-soft)]">
          <XCircle className="size-6 text-[var(--color-negative)]" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-primary">This link is incomplete</h1>
        <p className="text-sm text-secondary">
          Open the link from your email exactly as it was sent, or request a new one.
        </p>
        <Button className="w-full" onClick={() => navigate('/auth')}>
          Back to sign in
        </Button>
      </div>,
    );
  }

  if (done) {
    return shell(
      <div className="space-y-4 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-positive-soft)]">
          <CheckCircle2 className="size-6 text-[var(--color-positive)]" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-primary">Password updated</h1>
        <p className="text-sm text-secondary">
          For safety, every device that was signed in has been signed out.
        </p>
        <Link
          to="/auth"
          className="block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Sign in
        </Link>
      </div>,
    );
  }

  return shell(
    <form
      noValidate
      className="space-y-5"
      onSubmit={handleSubmit(async (values) => {
        try {
          await resetPassword.mutateAsync(values);
          setDone(true);
          toast.success('Password updated');
        } catch (error) {
          if (error instanceof ApiError) {
            const fieldErrors = error.fieldErrors;
            if (fieldErrors.newPassword)
              setError('newPassword', { message: fieldErrors.newPassword });
            else setError('newPassword', { message: error.message });
          } else {
            setError('newPassword', { message: 'Could not reset your password. Try again.' });
          }
        }
      })}
    >
      <header className="text-center">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-brand-50 dark:bg-brand-950">
          <KeyRound className="size-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold text-primary">Choose a new password</h1>
        <p className="mt-1 text-sm text-secondary">This link can only be used once.</p>
      </header>

      <input type="hidden" {...register('token')} />

      <Field
        label="New password"
        error={errors.newPassword?.message}
        hint="At least 10 characters. Length beats symbols."
        required
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...register('newPassword')}
          />
        )}
      </Field>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        isLoading={isSubmitting}
        loadingText="Updating…"
      >
        Update password
      </Button>

      <Link
        to="/auth"
        className="block text-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        Back to sign in
      </Link>
    </form>,
  );
};
