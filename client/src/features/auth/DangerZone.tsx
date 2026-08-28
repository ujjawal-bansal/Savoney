import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  Field,
  Input,
} from '@/components/ui';
import { useAuth } from './auth-context';
import { useDeleteAccount, useResetData } from './use-profile';

type Action = 'reset' | 'delete' | null;

/**
 * Irreversible account actions, kept together and visually separated.
 *
 * Both re-ask for the password. An access token alone must not be enough to
 * destroy someone's financial history, so a stolen session cannot reach these.
 */
export const DangerZone = () => {
  const [action, setAction] = useState<Action>(null);

  return (
    <>
      <Card className="border-[var(--color-negative)]/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[var(--color-negative)]" aria-hidden="true" />
            <CardTitle className="text-[var(--color-negative)]">Danger zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Reset my data</p>
              <p className="text-xs text-secondary">
                Delete every transaction, budget and goal. Your account and sign-in stay.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAction('reset')}
              className="shrink-0"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Reset data
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Delete my account</p>
              <p className="text-xs text-secondary">
                Permanently remove your account and everything in it. This cannot be undone.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setAction('delete')}
              className="shrink-0"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResetDataDialog open={action === 'reset'} onClose={() => setAction(null)} />
      <DeleteAccountDialog open={action === 'delete'} onClose={() => setAction(null)} />
    </>
  );
};

const ResetDataDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const resetData = useResetData();
  const [password, setPassword] = useState('');
  const [keepCategories, setKeepCategories] = useState(true);
  const [error, setError] = useState<string>();

  const submit = async () => {
    try {
      const result = await resetData.mutateAsync({ password, keepCategories });
      toast.success(
        `Deleted ${result.transactionsDeleted} transactions, ${result.budgetsDeleted} budgets and ${result.goalsDeleted} goals`,
      );
      onClose();
      setPassword('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reset your data');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reset your data?"
      className="w-[min(28rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={resetData.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            isLoading={resetData.isPending}
            loadingText="Resetting…"
            disabled={!password}
          >
            Reset data
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-secondary">
          Every transaction, budget and goal will be permanently deleted. Your account, email and
          password stay exactly as they are.
        </p>

        <label className="flex items-start gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={keepCategories}
            onChange={(event) => setKeepCategories(event.target.checked)}
            className="mt-0.5 size-4 rounded border-[var(--border-strong)]"
          />
          <span>
            Restore the starter categories
            <span className="block text-xs text-muted">
              Leave this on unless you want to build your categories from scratch. An account with
              none cannot record a transaction.
            </span>
          </span>
        </label>

        <Field label="Confirm your password" error={error} required>
          {({ id, invalid }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              aria-invalid={invalid}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
};

const DeleteAccountDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const deleteAccount = useDeleteAccount();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();

  const submit = async () => {
    try {
      await deleteAccount.mutateAsync(password);
      toast.success('Your account has been deleted');
      // The account is gone, so clear local state and leave the app rather than
      // letting the router bounce off a dead session.
      await logout();
      navigate('/auth', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not delete your account');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete your account?"
      className="w-[min(28rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={deleteAccount.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            isLoading={deleteAccount.isPending}
            loadingText="Deleting…"
            disabled={!password || confirmation !== 'DELETE'}
          >
            Delete forever
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--color-negative-soft)] px-3 py-2 text-sm text-[var(--color-negative)]">
          This permanently deletes your account, every transaction, budget, goal and category. It
          cannot be undone, and Savoney keeps no copy.
        </div>

        <p className="text-sm text-secondary">
          Want to keep your history? Export it from the Transactions page first.
        </p>

        <Field label="Confirm your password" required>
          {({ id }) => (
            <Input
              id={id}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>

        <Field label="Type DELETE to confirm" error={error} required>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={confirmation}
              placeholder="DELETE"
              aria-invalid={invalid}
              autoComplete="off"
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError(undefined);
              }}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
};
