import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, PiggyBank, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import type { z } from 'zod';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '@savoney/shared';
import { ApiError } from '@/lib/api';
import { Button, Field, Input, Select } from '@/components/ui';
import { useAuth } from './auth-context';
import { ForgotPasswordForm } from './ForgotPasswordForm';

type Mode = 'login' | 'register' | 'forgot';

const HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: 'See where it actually goes',
    body: 'Category breakdowns and trends computed over your full history.',
  },
  {
    icon: PiggyBank,
    title: 'Budgets that keep up',
    body: 'Live spend, projections and a safe daily allowance for every category.',
  },
  {
    icon: ShieldCheck,
    title: 'Built to keep secrets',
    body: 'Argon2id hashing, rotating sessions, and tokens that never touch storage.',
  },
];

export const AuthPage = () => {
  const { user, isBootstrapping, login, register: registerUser } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  if (isBootstrapping) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Marketing panel is decorative and heavy; hidden below lg rather than
          stacked, so the form is the first thing on a phone. */}
      <aside className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-32 size-[32rem] rounded-full bg-brand-600/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -left-24 size-[28rem] rounded-full bg-indigo-500/20 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-white/10 backdrop-blur">
            <Sparkles className="size-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Savoney</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Know exactly where your money went.
          </h1>
          <p className="mt-4 text-brand-200">
            A personal finance ledger that treats your numbers as exact figures, not floating-point
            approximations.
          </p>

          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-brand-300">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-brand-300">
          Demo account · demo@savoney.app · savoney-demo-2026
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {mode === 'forgot' ? (
            <ForgotPasswordForm onBack={() => setMode('login')} />
          ) : mode === 'login' ? (
            <LoginForm
              onSubmit={login}
              onSwitch={() => setMode('register')}
              onForgot={() => setMode('forgot')}
            />
          ) : (
            <RegisterForm onSubmit={registerUser} onSwitch={() => setMode('login')} />
          )}
        </div>
      </main>
    </div>
  );
};

/**
 * Surface a server-side validation failure on the field that caused it.
 *
 * The server returns per-field messages; showing them only in a toast would
 * make the user hunt for which input to fix. `applyField` is supplied by each
 * form so the field name stays type-checked against that form's own values.
 */
const showServerError = (
  error: unknown,
  fallback: string,
  applyField: (field: string, message: string) => void,
): void => {
  if (error instanceof ApiError) {
    const fieldErrors = error.fieldErrors;
    const fields = Object.keys(fieldErrors);
    if (fields.length > 0) {
      for (const field of fields) applyField(field, fieldErrors[field]!);
      return;
    }
    toast.error(error.message);
    return;
  }
  toast.error(fallback);
};

const LoginForm = ({
  onSubmit,
  onSwitch,
  onForgot,
}: {
  onSubmit: (input: LoginInput) => Promise<void>;
  onSwitch: () => void;
  onForgot: () => void;
}) => {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(values);
          toast.success('Welcome back');
        } catch (error) {
          showServerError(error, 'Could not sign you in', (field, message) => {
            if (field === 'email' || field === 'password') setError(field, { message });
          });
        }
      })}
      className="space-y-5"
    >
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-primary">Welcome back</h2>
        <p className="mt-1 text-sm text-secondary">Sign in to pick up where you left off.</p>
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
            {...register('email')}
          />
        )}
      </Field>

      <div className="space-y-1.5">
        <Field label="Password" error={errors.password?.message} required>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              aria-invalid={invalid}
              aria-describedby={describedBy}
              {...register('password')}
            />
          )}
        </Field>
        <button
          type="button"
          onClick={onForgot}
          className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Forgot your password?
        </button>
      </div>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        isLoading={isSubmitting}
        loadingText="Signing in…"
      >
        Sign in
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      <p className="text-center text-sm text-secondary">
        New here?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Create an account
        </button>
      </p>
    </form>
  );
};

const RegisterForm = ({
  onSubmit,
  onSwitch,
}: {
  onSubmit: (input: RegisterInput) => Promise<void>;
  onSwitch: () => void;
}) => {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
    // `z.input` is the shape the form holds; `RegisterInput` (z.output) is
    // what the resolver produces once defaults are applied.
  } = useForm<z.input<typeof registerSchema>, unknown, RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { currency: DEFAULT_CURRENCY },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(values);
          toast.success('Account created. Welcome to Savoney');
        } catch (error) {
          showServerError(error, 'Could not create your account', (field, message) => {
            if (
              field === 'name' ||
              field === 'email' ||
              field === 'password' ||
              field === 'currency'
            ) {
              setError(field, { message });
            }
          });
        }
      })}
      className="space-y-5"
    >
      <header>
        <h2 className="text-2xl font-semibold tracking-tight text-primary">Create your account</h2>
        <p className="mt-1 text-sm text-secondary">Starter categories are set up for you.</p>
      </header>

      <Field label="Name" error={errors.name?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            autoComplete="name"
            placeholder="Ada Lovelace"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...register('name')}
          />
        )}
      </Field>

      <Field label="Email" error={errors.email?.message} required>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={invalid}
            aria-describedby={describedBy}
            {...register('email')}
          />
        )}
      </Field>

      <Field
        label="Password"
        error={errors.password?.message}
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
            {...register('password')}
          />
        )}
      </Field>

      <Field label="Currency" error={errors.currency?.message}>
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} {...register('currency')}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Button
        type="submit"
        className="w-full"
        size="lg"
        isLoading={isSubmitting}
        loadingText="Creating…"
      >
        Create account
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>

      <p className="text-center text-sm text-secondary">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitch}
          className="font-medium text-brand-600 hover:underline dark:text-brand-400"
        >
          Sign in
        </button>
      </p>
    </form>
  );
};
