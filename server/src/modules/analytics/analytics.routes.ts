import { Router } from 'express';
import {
  analyticsQuerySchema,
  trendQuerySchema,
  type AnalyticsQuery,
  type TrendQuery,
} from '@savoney/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { query, validate } from '../../middleware/validate.js';
import * as service from './analytics.service.js';

const router = Router();
router.use(authenticate);

router.get(
  '/summary',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getSummary(requireUser(req)._id, query<AnalyticsQuery>(req)));
  }),
);

router.get(
  '/breakdown',
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getBreakdown(requireUser(req)._id, query<AnalyticsQuery>(req)));
  }),
);

router.get(
  '/trend',
  validate({ query: trendQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ points: await service.getTrend(requireUser(req)._id, query<TrendQuery>(req)) });
  }),
);

export default router;
