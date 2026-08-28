import { Router, text } from 'express';
import { z } from 'zod';
import {
  bulkDeleteSchema,
  createTransactionSchema,
  objectIdSchema,
  transactionQuerySchema,
  updateTransactionSchema,
  type BulkDeleteInput,
  type CreateTransactionInput,
  type Currency,
  type TransactionQuery,
  type UpdateTransactionInput,
} from '@savoney/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { writeLimiter } from '../../middleware/rate-limit.js';
import { body, params, query, validate } from '../../middleware/validate.js';
import { exportTransactionsCsv, importTransactionsCsv } from './transaction.io.js';
import * as service from './transaction.service.js';

const router = Router();
router.use(authenticate);

const idParams = z.object({ id: objectIdSchema });
type IdParams = z.infer<typeof idParams>;

router.get(
  '/',
  validate({ query: transactionQuerySchema }),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    // Bring any due recurring entries into existence before reading, so the
    // list the user sees is current without a background scheduler.
    await service.materialiseDueRecurrences(user._id);
    const result = await service.listTransactions(user._id, query<TransactionQuery>(req));
    res.json(result);
  }),
);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const csv = await exportTransactionsCsv(user._id, user.currency as Currency);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="savoney-transactions-${stamp}.csv"`,
    );
    res.send(csv);
  }),
);

router.post(
  '/import',
  writeLimiter,
  // The body arrives as raw CSV rather than JSON, so it needs its own parser.
  text({ type: ['text/csv', 'text/plain'], limit: '2mb' }),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    const csv = typeof req.body === 'string' ? req.body : '';
    const summary = await importTransactionsCsv(user._id, csv, user.currency as Currency);
    res.status(summary.imported > 0 ? 201 : 200).json(summary);
  }),
);

router.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const transaction = await service.getTransaction(
      requireUser(req)._id,
      params<IdParams>(req).id,
    );
    res.json({ transaction });
  }),
);

router.post(
  '/',
  writeLimiter,
  validate({ body: createTransactionSchema }),
  asyncHandler(async (req, res) => {
    const transaction = await service.createTransaction(
      requireUser(req)._id,
      body<CreateTransactionInput>(req),
    );
    res.status(201).json({ transaction });
  }),
);

router.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParams, body: updateTransactionSchema }),
  asyncHandler(async (req, res) => {
    const transaction = await service.updateTransaction(
      requireUser(req)._id,
      params<IdParams>(req).id,
      body<UpdateTransactionInput>(req),
    );
    res.json({ transaction });
  }),
);

router.post(
  '/bulk-delete',
  writeLimiter,
  validate({ body: bulkDeleteSchema }),
  asyncHandler(async (req, res) => {
    const deleted = await service.bulkDeleteTransactions(
      requireUser(req)._id,
      body<BulkDeleteInput>(req).ids,
    );
    res.json({ deleted });
  }),
);

router.delete(
  '/:id',
  writeLimiter,
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await service.deleteTransaction(requireUser(req)._id, params<IdParams>(req).id);
    res.status(204).end();
  }),
);

export default router;
