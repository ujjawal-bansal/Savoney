import {
  exponentOf,
  needsRescale,
  type ChangeCurrencyResult,
  type Currency,
} from '@savoney/shared';
import { logger } from '../../config/logger.js';
import { Budget } from '../budgets/budget.model.js';
import { Goal } from '../goals/goal.model.js';
import { Transaction } from '../transactions/transaction.model.js';
import { toPublicUser, type UserDocument } from './user.model.js';

/**
 * Rounding that matches `Math.round` in `@savoney/shared`.
 *
 * MongoDB's `$round` rounds halves to even, while JavaScript rounds them up.
 * All amounts here are positive, so adding a half and flooring reproduces the
 * shared helper exactly — which means a client-side preview of the change and
 * the value the server actually writes can never disagree.
 */
const scaledField = (field: string, factor: number, floor: number) => ({
  $max: [floor, { $floor: { $add: [{ $multiply: [field, factor] }, 0.5] } }],
});

/**
 * Switch the account's currency, rewriting stored amounts when necessary.
 *
 * Amounts are integers in the account's currency, so the meaning of a stored
 * `1234` depends entirely on that currency's exponent — $12.34 under USD but
 * ¥1,234 under JPY. Changing the label without rewriting the data would
 * silently multiply every figure in the user's history by 100.
 *
 * The rewrite is a relabel: the major-unit number the user typed is preserved
 * (12.34 stays 12.34). It is not a foreign-exchange conversion — that needs a
 * dated rate per transaction, and inventing one would falsify the ledger.
 *
 * Between two 2-decimal currencies — six of the seven we support — nothing is
 * rewritten at all and this is a pure label change.
 */
export const changeCurrency = async (
  user: UserDocument,
  next: Currency,
): Promise<ChangeCurrencyResult> => {
  const current = user.currency as Currency;

  if (current === next) {
    return {
      user: toPublicUser(user),
      rescaled: false,
      transactionsUpdated: 0,
      budgetsUpdated: 0,
      goalsUpdated: 0,
    };
  }

  if (!needsRescale(current, next)) {
    user.currency = next;
    await user.save();
    logger.info({ userId: user._id.toString(), from: current, to: next }, 'currency relabelled');
    return {
      user: toPublicUser(user),
      rescaled: false,
      transactionsUpdated: 0,
      budgetsUpdated: 0,
      goalsUpdated: 0,
    };
  }

  const factor = 10 ** (exponentOf(next) - exponentOf(current));

  /**
   * Each `updateMany` is atomic per document, but the set of them is not one
   * transaction: MongoDB multi-document transactions require a replica set, and
   * a standalone deployment cannot provide one. The currency field is therefore
   * written *last* — if a rewrite fails partway, the account keeps its old
   * currency and the failure is visible rather than silently half-applied.
   */
  const [transactions, budgets, goals] = await Promise.all([
    Transaction.updateMany(
      { user: user._id },
      [
        // Floor of 1: a $0.40 expense cannot become a ¥0 one, and the schema
        // forbids zero. Sub-unit precision is genuinely lost moving to a
        // zero-decimal currency; the smallest representable amount is the least
        // wrong answer.
        { $set: { amountMinor: scaledField('$amountMinor', factor, 1) } },
      ],
      // Mongoose 9 requires this opt-in before it will treat an array as an
      // aggregation pipeline rather than a malformed update document.
      { updatePipeline: true },
    ),
    Budget.updateMany(
      { user: user._id },
      [{ $set: { amountMinor: scaledField('$amountMinor', factor, 1) } }],
      { updatePipeline: true },
    ),
    Goal.updateMany(
      { user: user._id },
      [
        {
          $set: {
            targetMinor: scaledField('$targetMinor', factor, 1),
            // Contributions may legitimately be zero.
            savedMinor: scaledField('$savedMinor', factor, 0),
          },
        },
      ],
      { updatePipeline: true },
    ),
  ]);

  user.monthlyIncomeTargetMinor = Math.max(0, Math.round(user.monthlyIncomeTargetMinor * factor));
  user.currency = next;
  await user.save();

  logger.info(
    {
      userId: user._id.toString(),
      from: current,
      to: next,
      factor,
      transactions: transactions.modifiedCount,
    },
    'currency changed and amounts rescaled',
  );

  return {
    user: toPublicUser(user),
    rescaled: true,
    transactionsUpdated: transactions.modifiedCount,
    budgetsUpdated: budgets.modifiedCount,
    goalsUpdated: goals.modifiedCount,
  };
};
