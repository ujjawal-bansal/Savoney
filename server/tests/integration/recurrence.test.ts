import { describe, expect, it } from 'vitest';
import type { Transaction } from '@savoney/shared';
import { authed, createUser, findCategory } from '../helpers/factories.js';

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

const createRecurring = async (
  user: Awaited<ReturnType<typeof createUser>>,
  categoryId: string,
  frequency: 'daily' | 'weekly' | 'monthly',
  occurredAt: Date,
  interval = 1,
) =>
  (
    await authed(user)
      .post('/api/transactions')
      .send({
        title: 'Netflix',
        amountMinor: 1_599,
        type: 'expense',
        categoryId,
        occurredAt: occurredAt.toISOString(),
        recurrence: { frequency, interval },
      })
      .expect(201)
  ).body.transaction as Transaction;

describe('recurring transactions', () => {
  it('stores the rule and schedules the next occurrence', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');

    const created = await createRecurring(user, subs.id, 'monthly', daysAgo(0));

    expect(created.recurrence).toMatchObject({ frequency: 'monthly', interval: 1 });
    expect(created.recurrence?.nextOccurrenceAt).toBeTruthy();
  });

  it('materialises past-due occurrences on the next read', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');

    // A weekly rule started 3 weeks ago is due 3 times over.
    await createRecurring(user, subs.id, 'weekly', daysAgo(21));

    // Materialisation happens lazily when the ledger is read — no scheduler.
    const list = await authed(user).get('/api/transactions').expect(200);

    // Weekly from 21 days ago: due at day -14, -7 and 0 — three occurrences,
    // plus the original template.
    const generated = (list.body.items as Transaction[]).filter((t) => t.generatedFrom);
    expect(generated).toHaveLength(3);
    expect(list.body.meta.total).toBe(4);
    // Generated rows copy the template's money and category exactly.
    expect(generated[0]!.amountMinor).toBe(1_599);
    expect(generated[0]!.category?.name).toBe('Subscriptions');
  });

  it('is idempotent — reading twice does not duplicate occurrences', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');
    await createRecurring(user, subs.id, 'weekly', daysAgo(21));

    const first = await authed(user).get('/api/transactions').expect(200);
    const second = await authed(user).get('/api/transactions').expect(200);

    // The cursor advances past what was generated, so a second read is a no-op.
    expect(second.body.meta.total).toBe(first.body.meta.total);
  });

  it('does not generate anything before the first occurrence is due', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');
    await createRecurring(user, subs.id, 'monthly', daysAgo(1));

    const list = await authed(user).get('/api/transactions').expect(200);
    expect(list.body.meta.total).toBe(1);
  });

  it('honours the interval', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');

    // Every 2 weeks starting 4 weeks ago: due twice, not four times.
    await createRecurring(user, subs.id, 'weekly', daysAgo(28), 2);

    const list = await authed(user).get('/api/transactions').expect(200);
    const generated = (list.body.items as Transaction[]).filter((t) => t.generatedFrom);
    expect(generated).toHaveLength(2);
  });

  it('generated occurrences carry no rule of their own, so they cannot cascade', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');
    await createRecurring(user, subs.id, 'weekly', daysAgo(14));

    const list = await authed(user).get('/api/transactions').expect(200);
    for (const item of (list.body.items as Transaction[]).filter((t) => t.generatedFrom)) {
      expect(item.recurrence).toBeUndefined();
    }
  });

  it('stops recurring when the rule is cleared', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');
    const created = await createRecurring(user, subs.id, 'weekly', daysAgo(21));

    await authed(user)
      .patch(`/api/transactions/${created.id}`)
      .send({ recurrence: { frequency: 'none', interval: 1 } })
      .expect(200);

    const list = await authed(user).get('/api/transactions').expect(200);
    const generated = (list.body.items as Transaction[]).filter((t) => t.generatedFrom);
    expect(generated).toHaveLength(0);
  });

  it('counts generated occurrences in analytics totals', async () => {
    const user = await createUser();
    const subs = await findCategory(user, 'Subscriptions');
    await createRecurring(user, subs.id, 'weekly', daysAgo(21));

    // Force materialisation, then confirm the aggregation sees the new rows.
    await authed(user).get('/api/transactions').expect(200);
    const summary = await authed(user).get('/api/analytics/summary?preset=all_time').expect(200);

    // Template plus at least three generated occurrences, at 15.99 each.
    expect(summary.body.expenseMinor).toBeGreaterThanOrEqual(1_599 * 3);
    expect(summary.body.expenseMinor % 1_599).toBe(0);
  });
});
