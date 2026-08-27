import type { ResetDataInput, ResetDataResult } from '@savoney/shared';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../lib/api-error.js';
import { verifyPassword } from '../../lib/password.js';
import { Budget } from '../budgets/budget.model.js';
import { Category } from '../categories/category.model.js';
import { seedDefaultCategories } from '../categories/category.service.js';
import { Goal } from '../goals/goal.model.js';
import { Transaction } from '../transactions/transaction.model.js';
import { PasswordReset } from './password-reset.model.js';
import { RefreshToken } from './refresh-token.model.js';
import { User, type UserDocument } from './user.model.js';

/**
 * Re-authenticate before anything destructive.
 *
 * A stolen access token should not be enough to erase someone's financial
 * history. Requiring the password again puts data destruction behind a factor
 * the attacker is far less likely to hold.
 */
const requirePassword = async (user: UserDocument, password: string): Promise<void> => {
  const withHash = await User.findById(user._id).select('+passwordHash');
  if (!withHash) throw ApiError.notFound('User');

  const valid = await verifyPassword(withHash.passwordHash, password);
  if (!valid) throw ApiError.badRequest('That password is not correct');
};

/**
 * Erase the ledger while keeping the account.
 *
 * For someone who has been trialling the app with junk data and wants a clean
 * start without losing their login. Categories are restored by default,
 * because an account with none cannot record a transaction at all.
 */
export const resetAccountData = async (
  user: UserDocument,
  input: ResetDataInput,
): Promise<ResetDataResult> => {
  await requirePassword(user, input.password);

  // Transactions reference categories, so they go first; a failure partway
  // then leaves orphaned categories rather than orphaned transactions.
  const transactions = await Transaction.deleteMany({ user: user._id });
  const [budgets, goals] = await Promise.all([
    Budget.deleteMany({ user: user._id }),
    Goal.deleteMany({ user: user._id }),
  ]);
  await Category.deleteMany({ user: user._id });

  if (input.keepCategories) {
    await seedDefaultCategories(user._id);
  }

  logger.warn(
    {
      userId: user._id.toString(),
      transactions: transactions.deletedCount,
      budgets: budgets.deletedCount,
      goals: goals.deletedCount,
    },
    'account data reset by user',
  );

  return {
    transactionsDeleted: transactions.deletedCount,
    budgetsDeleted: budgets.deletedCount,
    goalsDeleted: goals.deletedCount,
    categoriesRestored: input.keepCategories,
  };
};

/**
 * Delete the account and everything belonging to it.
 *
 * A hard delete rather than a soft flag: someone asking to be forgotten should
 * be forgotten, and a `deletedAt` column that keeps every transaction on disk
 * does not honour that. The user row is removed last so a partial failure
 * leaves an account that can still sign in and retry, rather than orphaned
 * data with no owner.
 */
export const deleteAccount = async (user: UserDocument, password: string): Promise<void> => {
  await requirePassword(user, password);

  const userId = user._id;

  await Transaction.deleteMany({ user: userId });
  await Promise.all([
    Budget.deleteMany({ user: userId }),
    Goal.deleteMany({ user: userId }),
    Category.deleteMany({ user: userId }),
    RefreshToken.deleteMany({ user: userId }),
    PasswordReset.deleteMany({ user: userId }),
  ]);
  await User.deleteOne({ _id: userId });

  logger.warn({ userId: userId.toString() }, 'account deleted by user');
};
