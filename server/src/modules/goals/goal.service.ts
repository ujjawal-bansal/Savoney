import type { Types } from 'mongoose';
import type { CreateGoalInput, Goal as GoalDto, UpdateGoalInput } from '@savoney/shared';
import { ApiError } from '../../lib/api-error.js';
import { ops } from '../../lib/mongo.js';
import { Goal, toGoalDto, type GoalDocument } from './goal.model.js';

const findOwned = async (userId: Types.ObjectId, id: string): Promise<GoalDocument> => {
  const goal = await Goal.findOne({ _id: id, user: userId });
  if (!goal) throw ApiError.notFound('Goal');
  return goal;
};

export const listGoals = async (userId: Types.ObjectId): Promise<GoalDto[]> => {
  const goals = await Goal.find({ user: userId }).sort({ createdAt: -1 });
  return goals.map((goal) => toGoalDto(goal));
};

export const createGoal = async (
  userId: Types.ObjectId,
  input: CreateGoalInput,
): Promise<GoalDto> => {
  const goal = await Goal.create({
    user: userId,
    name: input.name,
    targetMinor: input.targetMinor,
    savedMinor: input.savedMinor,
    targetDate: input.targetDate ?? null,
    color: input.color,
    notes: input.notes,
  });
  return toGoalDto(goal);
};

export const updateGoal = async (
  userId: Types.ObjectId,
  id: string,
  input: UpdateGoalInput,
): Promise<GoalDto> => {
  const goal = await findOwned(userId, id);

  if (input.name !== undefined) goal.name = input.name;
  if (input.targetMinor !== undefined) goal.targetMinor = input.targetMinor;
  if (input.savedMinor !== undefined) goal.savedMinor = input.savedMinor;
  if (input.targetDate !== undefined) goal.targetDate = input.targetDate ?? null;
  if (input.color !== undefined) goal.color = input.color;
  if (input.notes !== undefined) goal.notes = input.notes;

  // Lowering the target below what is already saved would otherwise leave the
  // goal reporting over 100% complete.
  if (goal.savedMinor > goal.targetMinor) {
    throw ApiError.badRequest('Saved amount cannot exceed the target');
  }

  await goal.save();
  return toGoalDto(goal);
};

/**
 * Add to (or withdraw from) a goal's balance.
 *
 * Uses an atomic `$inc` rather than read-modify-write: two contributions
 * arriving together would otherwise both read the same starting balance and one
 * would overwrite the other, quietly losing money.
 */
export const contributeToGoal = async (
  userId: Types.ObjectId,
  id: string,
  amountMinor: number,
): Promise<GoalDto> => {
  const goal = await findOwned(userId, id);

  const next = goal.savedMinor + amountMinor;
  if (next < 0) {
    throw ApiError.badRequest('Cannot withdraw more than the goal currently holds');
  }
  if (next > goal.targetMinor) {
    throw ApiError.badRequest('Contribution would exceed the goal target');
  }

  const updated = await Goal.findOneAndUpdate(
    { _id: goal._id, user: userId, savedMinor: ops({ $gte: -amountMinor }) },
    { $inc: { savedMinor: amountMinor } },
    { returnDocument: 'after' },
  );
  if (!updated) throw ApiError.notFound('Goal');

  return toGoalDto(updated);
};

export const deleteGoal = async (userId: Types.ObjectId, id: string): Promise<void> => {
  const result = await Goal.deleteOne({ _id: id, user: userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Goal');
};
