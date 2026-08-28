import { Router } from 'express';
import { z } from 'zod';
import {
  categoryQuerySchema,
  createCategorySchema,
  objectIdSchema,
  reassignTargetSchema,
  updateCategorySchema,
  type CategoryQuery,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@savoney/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, query, validate } from '../../middleware/validate.js';
import * as service from './category.service.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: objectIdSchema });
type IdParams = z.infer<typeof idParams>;

router.get(
  '/',
  validate({ query: categoryQuerySchema }),
  asyncHandler(async (req, res) => {
    const categories = await service.listCategories(
      requireUser(req)._id,
      query<CategoryQuery>(req),
    );
    res.json({ categories });
  }),
);

router.post(
  '/',
  writeLimiter,
  validate({ body: createCategorySchema }),
  asyncHandler(async (req, res) => {
    const category = await service.createCategory(
      requireUser(req)._id,
      body<CreateCategoryInput>(req),
    );
    res.status(201).json({ category });
  }),
);

router.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParams, body: updateCategorySchema }),
  asyncHandler(async (req, res) => {
    const category = await service.updateCategory(
      requireUser(req)._id,
      params<IdParams>(req).id,
      body<UpdateCategoryInput>(req),
    );
    res.json({ category });
  }),
);

router.post(
  '/:id/archive',
  writeLimiter,
  validate({ params: idParams, body: z.object({ isArchived: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => {
    const category = await service.setArchived(
      requireUser(req)._id,
      params<IdParams>(req).id,
      body<{ isArchived: boolean }>(req).isArchived,
    );
    res.json({ category });
  }),
);

router.delete(
  '/:id',
  writeLimiter,
  validate({ params: idParams, query: reassignTargetSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.deleteCategory(
      requireUser(req)._id,
      params<IdParams>(req).id,
      query<{ reassignTo?: string }>(req).reassignTo,
    );
    res.json(result);
  }),
);

export default router;
