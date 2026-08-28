import { Router } from 'express';
import { z } from 'zod';
import {
  createBudgetSchema,
  objectIdSchema,
  updateBudgetSchema,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from '@savoney/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, validate } from '../../middleware/validate.js';
import * as service from './budget.service.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: objectIdSchema });
type IdParams = z.infer<typeof idParams>;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ budgets: await service.listBudgets(requireUser(req)._id) });
  }),
);

router.post(
  '/',
  writeLimiter,
  validate({ body: createBudgetSchema }),
  asyncHandler(async (req, res) => {
    const budget = await service.createBudget(requireUser(req)._id, body<CreateBudgetInput>(req));
    res.status(201).json({ budget });
  }),
);

router.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParams, body: updateBudgetSchema }),
  asyncHandler(async (req, res) => {
    const budget = await service.updateBudget(
      requireUser(req)._id,
      params<IdParams>(req).id,
      body<UpdateBudgetInput>(req),
    );
    res.json({ budget });
  }),
);

router.delete(
  '/:id',
  writeLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await service.deleteBudget(requireUser(req)._id, params<IdParams>(req).id);
    res.status(204).end();
  }),
);

export default router;
