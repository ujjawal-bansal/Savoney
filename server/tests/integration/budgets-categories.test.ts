import { describe, expect, it } from 'vitest';
import type { BudgetWithProgress, Category } from '@savoney/shared';
import { addTransaction, authed, createUser, findCategory } from '../helpers/factories.js';

describe('categories', () => {
  it('creates a category', async () => {
    const user = await createUser();
    const response = await authed(user)
      .post('/api/categories')
      .send({ name: 'Hobbies', type: 'expense', color: '#ff8800', icon: 'dumbbell' })
      .expect(201);

    expect(response.body.category).toMatchObject({ name: 'Hobbies', color: '#ff8800' });
  });

  it('refuses a duplicate name regardless of casing', async () => {
    const user = await createUser();
    await authed(user)
      .post('/api/categories')
      .send({ name: 'Hobbies', type: 'expense' })
      .expect(201);

    // "Hobbies" and "hobbies" are the same category to a person; allowing both
    // would split reporting totals in two.
    const response = await authed(user)
      .post('/api/categories')
      .send({ name: 'hobbies', type: 'expense' })
      .expect(409);
    expect(response.body.error.code).toBe('DUPLICATE_KEY');
  });

  it('rejects a malformed colour', async () => {
    const user = await createUser();
    await authed(user)
      .post('/api/categories')
      .send({ name: 'Bad Colour', type: 'expense', color: 'red' })
      .expect(422);
  });

  it('reports how many transactions use each category', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id });
    await addTransaction(user, { categoryId: groceries.id });

    const response = await authed(user).get('/api/categories').expect(200);
    const found = (response.body.categories as Category[]).find((c) => c.id === groceries.id);
    expect(found?.transactionCount).toBe(2);
  });

  it('deletes an unused category outright', async () => {
    const user = await createUser();
    const created = await authed(user)
      .post('/api/categories')
      .send({ name: 'Unused', type: 'expense' })
      .expect(201);

    const response = await authed(user)
      .delete(`/api/categories/${created.body.category.id}`)
      .expect(200);
    expect(response.body).toMatchObject({ deleted: true, reassigned: 0 });
  });

  it('refuses to delete a category still in use without a destination', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id });

    // Deleting silently would destroy history; the caller must decide.
    const response = await authed(user).delete(`/api/categories/${groceries.id}`).expect(409);
    expect(response.body.error.code).toBe('CATEGORY_IN_USE');
  });

  it('reassigns transactions when a destination is supplied', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const dining = await findCategory(user, 'Dining Out');
    await addTransaction(user, { categoryId: groceries.id });
    await addTransaction(user, { categoryId: groceries.id });

    const response = await authed(user)
      .delete(`/api/categories/${groceries.id}?reassignTo=${dining.id}`)
      .expect(200);
    expect(response.body.reassigned).toBe(2);

    const remaining = await authed(user)
      .get(`/api/transactions?categoryId=${dining.id}`)
      .expect(200);
    expect(remaining.body.items).toHaveLength(2);
  });

  it('refuses to reassign expenses into an income category', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const salary = await findCategory(user, 'Salary');
    await addTransaction(user, { categoryId: groceries.id });

    // This would invert the sign of every moved row in category reporting.
    await authed(user)
      .delete(`/api/categories/${groceries.id}?reassignTo=${salary.id}`)
      .expect(400);
  });

  it('archives a category instead of deleting it', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    await authed(user)
      .post(`/api/categories/${groceries.id}/archive`)
      .send({ isArchived: true })
      .expect(200);

    const active = await authed(user).get('/api/categories').expect(200);
    expect((active.body.categories as Category[]).some((c) => c.id === groceries.id)).toBe(false);

    const all = await authed(user).get('/api/categories?includeArchived=true').expect(200);
    expect((all.body.categories as Category[]).some((c) => c.id === groceries.id)).toBe(true);
  });
});

describe('budgets', () => {
  const thisMonth = (day: number) => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 12));
  };

  it('creates a budget and reports zero spend initially', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    const response = await authed(user)
      .post('/api/budgets')
      .send({
        name: 'Food budget',
        amountMinor: 50_000,
        categoryId: groceries.id,
        period: 'monthly',
      })
      .expect(201);

    const budget = response.body.budget as BudgetWithProgress;
    expect(budget).toMatchObject({ spentMinor: 0, remainingMinor: 50_000, status: 'on_track' });
  });

  it('computes live spend from transactions in the current period', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    await authed(user)
      .post('/api/budgets')
      .send({
        name: 'Food budget',
        amountMinor: 50_000,
        categoryId: groceries.id,
        period: 'monthly',
      })
      .expect(201);

    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 20_000,
      occurredAt: thisMonth(2),
    });
    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 5_000,
      occurredAt: thisMonth(3),
    });

    const response = await authed(user).get('/api/budgets').expect(200);
    const budget = (response.body.budgets as BudgetWithProgress[])[0]!;

    expect(budget.spentMinor).toBe(25_000);
    expect(budget.remainingMinor).toBe(25_000);
    expect(budget.percentUsed).toBeCloseTo(50, 5);
  });

  it('recomputes spend after a transaction is deleted', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Food budget', amountMinor: 50_000, categoryId: groceries.id })
      .expect(201);

    const tx = await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 20_000,
      occurredAt: thisMonth(2),
    });
    await authed(user).delete(`/api/transactions/${tx.id}`).expect(204);

    // A denormalised counter would have gone stale here; recomputing cannot.
    const response = await authed(user).get('/api/budgets').expect(200);
    expect((response.body.budgets as BudgetWithProgress[])[0]!.spentMinor).toBe(0);
  });

  it('flags at_risk once spend crosses the alert threshold', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Food', amountMinor: 10_000, categoryId: groceries.id, alertThreshold: 0.8 })
      .expect(201);

    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 8_500,
      occurredAt: thisMonth(1),
    });

    const response = await authed(user).get('/api/budgets').expect(200);
    expect((response.body.budgets as BudgetWithProgress[])[0]!.status).toBe('at_risk');
  });

  it('flags over_budget and reports zero safe daily spend', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Food', amountMinor: 10_000, categoryId: groceries.id })
      .expect(201);

    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 15_000,
      occurredAt: thisMonth(1),
    });

    const budget = (await authed(user).get('/api/budgets').expect(200)).body
      .budgets[0] as BudgetWithProgress;
    expect(budget.status).toBe('over_budget');
    expect(budget.remainingMinor).toBe(-5_000);
    expect(budget.safeDailySpendMinor).toBe(0);
  });

  it('ignores spend from other categories', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const transport = await findCategory(user, 'Transport');
    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Food', amountMinor: 10_000, categoryId: groceries.id })
      .expect(201);

    await addTransaction(user, {
      categoryId: transport.id,
      amountMinor: 9_000,
      occurredAt: thisMonth(1),
    });

    const budget = (await authed(user).get('/api/budgets').expect(200)).body
      .budgets[0] as BudgetWithProgress;
    expect(budget.spentMinor).toBe(0);
  });

  it('refuses a second budget for the same category and period', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const payload = {
      name: 'Food',
      amountMinor: 10_000,
      categoryId: groceries.id,
      period: 'monthly',
    };

    await authed(user).post('/api/budgets').send(payload).expect(201);
    // Two budgets over one category would each report the same spend.
    const response = await authed(user)
      .post('/api/budgets')
      .send({ ...payload, name: 'Food 2' })
      .expect(409);
    expect(response.body.error.code).toBe('BUDGET_EXISTS');
  });

  it('refuses a budget over an income category', async () => {
    const user = await createUser();
    const salary = await findCategory(user, 'Salary');
    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Nonsense', amountMinor: 10_000, categoryId: salary.id })
      .expect(400);
  });
});
