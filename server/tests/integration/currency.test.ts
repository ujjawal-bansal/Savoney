import { DEFAULT_CURRENCY } from '@savoney/shared';
import { describe, expect, it } from 'vitest';
import { addTransaction, authed, createUser, findCategory } from '../helpers/factories.js';

const changeTo = (user: Awaited<ReturnType<typeof createUser>>, currency: string) =>
  authed(user).post('/api/auth/currency').send({ currency, confirmRelabel: true });

describe('changing account currency', () => {
  it('switches between two 2-decimal currencies without touching stored amounts', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    // $45.99
    const tx = await addTransaction(user, { categoryId: groceries.id, amountMinor: 4_599 });

    const response = await changeTo(user, 'EUR').expect(200);

    expect(response.body.user.currency).toBe('EUR');
    // USD and EUR share an exponent, so this is a pure label change.
    expect(response.body.rescaled).toBe(false);
    expect(response.body.transactionsUpdated).toBe(0);

    const after = await authed(user).get(`/api/transactions/${tx.id}`).expect(200);
    expect(after.body.transaction.amountMinor).toBe(4_599);
  });

  it('rescales every amount when moving to a zero-decimal currency', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const salary = await findCategory(user, 'Salary');

    await addTransaction(user, { categoryId: groceries.id, amountMinor: 4_599 }); // $45.99
    await addTransaction(user, { categoryId: salary.id, amountMinor: 500_000, type: 'income' }); // $5,000.00

    const response = await changeTo(user, 'JPY').expect(200);

    expect(response.body).toMatchObject({ rescaled: true, transactionsUpdated: 2 });

    const list = await authed(user).get('/api/transactions?sort=amountMinor&order=asc').expect(200);
    const amounts = list.body.items.map((t: { amountMinor: number }) => t.amountMinor);

    // The major-unit figure the user typed is preserved: $45.99 -> ¥46,
    // $5,000.00 -> ¥5,000. Without the rewrite these would have read as
    // ¥4,599 and ¥500,000 — a hundredfold inflation of the whole ledger.
    expect(amounts).toEqual([46, 5_000]);
  });

  it('rescales back out of a zero-decimal currency', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 4_599 });

    await changeTo(user, 'JPY').expect(200); // 4599 -> 46
    await changeTo(user, 'USD').expect(200); // 46 -> 4600

    const list = await authed(user).get('/api/transactions').expect(200);
    // Round-tripping through a zero-decimal currency genuinely loses the cents;
    // $45.99 comes back as $46.00. That is inherent, not a bug.
    expect(list.body.items[0].amountMinor).toBe(4_600);
  });

  it('never rounds a positive amount down to zero', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    // $0.40 — scaled to JPY this is 0.4, which rounds to zero.
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 40 });

    await changeTo(user, 'JPY').expect(200);

    const list = await authed(user).get('/api/transactions').expect(200);
    // Clamped to the smallest representable unit; a zero amount would violate
    // the schema and read as a transaction that never happened.
    expect(list.body.items[0].amountMinor).toBe(1);
  });

  it('rescales budgets alongside transactions so progress stays correct', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Food', amountMinor: 50_000, categoryId: groceries.id }) // $500.00
      .expect(201);

    const now = new Date();
    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 25_000, // $250.00 — half the budget
      occurredAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2, 12)),
    });

    const response = await changeTo(user, 'JPY').expect(200);
    expect(response.body.budgetsUpdated).toBe(1);

    const budgets = await authed(user).get('/api/budgets').expect(200);
    const budget = budgets.body.budgets[0];

    expect(budget.amountMinor).toBe(500);
    expect(budget.spentMinor).toBe(250);
    // The ratio is what the user actually reads; it must survive the change.
    expect(budget.percentUsed).toBeCloseTo(50, 5);
  });

  it('rescales goals, keeping saved within target', async () => {
    const user = await createUser();
    await authed(user)
      .post('/api/goals')
      .send({ name: 'Laptop', targetMinor: 200_000, savedMinor: 50_000 }) // $2000 / $500
      .expect(201);

    const response = await changeTo(user, 'JPY').expect(200);
    expect(response.body.goalsUpdated).toBe(1);

    const goals = await authed(user).get('/api/goals').expect(200);
    expect(goals.body.goals[0]).toMatchObject({ targetMinor: 2_000, savedMinor: 500 });
    expect(goals.body.goals[0].percentComplete).toBeCloseTo(25, 5);
  });

  it('keeps analytics totals proportionate after the change', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 10_000 });
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 20_000 });

    await changeTo(user, 'JPY').expect(200);

    const summary = await authed(user).get('/api/analytics/summary?preset=all_time').expect(200);
    expect(summary.body.expenseMinor).toBe(300);
  });

  it('is a no-op when the currency is unchanged', async () => {
    const user = await createUser();
    const response = await changeTo(user, DEFAULT_CURRENCY).expect(200);
    expect(response.body).toMatchObject({ rescaled: false, transactionsUpdated: 0 });
  });

  it('requires the caller to acknowledge that amounts are relabelled', async () => {
    const user = await createUser();
    const response = await authed(user)
      .post('/api/auth/currency')
      .send({ currency: 'JPY' })
      .expect(422);
    expect(response.body.error.details.confirmRelabel).toBeDefined();
  });

  it('rejects an unsupported currency', async () => {
    const user = await createUser();
    await authed(user)
      .post('/api/auth/currency')
      .send({ currency: 'XYZ', confirmRelabel: true })
      .expect(422);
  });

  it('requires authentication', async () => {
    const user = await createUser();
    await user.agent
      .post('/api/auth/currency')
      .send({ currency: 'EUR', confirmRelabel: true })
      .expect(401);
  });

  it('leaves other accounts untouched', async () => {
    const mover = await createUser();
    const bystander = await createUser();

    const groceries = await findCategory(bystander, 'Groceries');
    await addTransaction(bystander, { categoryId: groceries.id, amountMinor: 4_599 });

    await changeTo(mover, 'JPY').expect(200);

    const list = await authed(bystander).get('/api/transactions').expect(200);
    expect(list.body.items[0].amountMinor).toBe(4_599);
    const me = await authed(bystander).get('/api/auth/me').expect(200);
    expect(me.body.user.currency).toBe(DEFAULT_CURRENCY);
  });

  it('no longer accepts currency through the profile endpoint', async () => {
    const user = await createUser();
    // The old path set the field without rewriting amounts, which silently
    // inflated the whole ledger by 100x.
    await authed(user).patch('/api/auth/me').send({ currency: 'JPY' }).expect(422);

    const me = await authed(user).get('/api/auth/me').expect(200);
    expect(me.body.user.currency).toBe(DEFAULT_CURRENCY);
  });
});
