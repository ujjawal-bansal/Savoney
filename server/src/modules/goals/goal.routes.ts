import { Router } from 'express';
import { z } from 'zod';
import {
  contributeGoalSchema,
  createGoalSchema,
  objectIdSchema,
  updateGoalSchema,
  type ContributeGoalInput,
  type CreateGoalInput,
  type UpdateGoalInput,
} from '@savoney/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, validate } from '../../middleware/validate.js';
import * as service from './goal.service.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: objectIdSchema });
type IdParams = z.infer<typeof idParams>;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ goals: await service.listGoals(requireUser(req)._id) });
  }),
);

router.post(
  '/',
  writeLimiter,
  validate({ body: createGoalSchema }),
  asyncHandler(async (req, res) => {
    const goal = await service.createGoal(requireUser(req)._id, body<CreateGoalInput>(req));
    res.status(201).json({ goal });
  }),
);

router.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParams, body: updateGoalSchema }),
  asyncHandler(async (req, res) => {
    const goal = await service.updateGoal(
      requireUser(req)._id,
      params<IdParams>(req).id,
      body<UpdateGoalInput>(req),
    );
    res.json({ goal });
  }),
);

router.post(
  '/:id/contribute',
  writeLimiter,
  validate({ params: idParams, body: contributeGoalSchema }),
  asyncHandler(async (req, res) => {
    const goal = await service.contributeToGoal(
      requireUser(req)._id,
      params<IdParams>(req).id,
      body<ContributeGoalInput>(req).amountMinor,
    );
    res.json({ goal });
  }),
);

router.delete(
  '/:id',
  writeLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await service.deleteGoal(requireUser(req)._id, params<IdParams>(req).id);
    res.status(204).end();
  }),
);

export default router;
