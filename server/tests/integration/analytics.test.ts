import { describe, expect, it } from 'vitest';
import type { AnalyticsSummary, CategoryBreakdownEntry, TrendPoint } from '@savoney/shared';
import { addTransaction, authed, createUser, findCategory } from '../helpers/factories.js';

/** A date `daysAgo` before now, so fixtures land inside relative presets. */
const ago = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);

const seedLedger = async () => {
  const user = await createUser();
  const groceries = await findCategory(user, 'Groceries');
  const transport = await findCategory(user, 'Transport');
  const salary = await findCategory(user, 'Salary');

  await addTransaction(user, {
    categoryId: salary.id,
    type: 'income',
    amountMinor: 500_000,
    occurredAt: ago(5),
  });
  await addTransaction(user, { categoryId: groceries.id, amountMinor: 12_050, occurredAt: ago(4) });
  await addTransaction(user, { categoryId: groceries.id, amountMinor: 7_025, occurredAt: ago(3) });
  await addTransaction(user, { categoryId: transport.id, amountMinor: 3_200, occurredAt: ago(2) });

  return { user, groceries, transport, salary };
};

describe('GET /api/analytics/summary', () => {
  it('sums income and expense exactly, with no floating-point drift', async () => {
    const { user } = await seedLedger();
    const response = await authed(user)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);
    const summary = response.body as AnalyticsSummary;

    // 12050 + 7025 + 3200 — integer arithmetic, so this is exact rather than
    // approximately right.
    expect(summary.expenseMinor).toBe(22_275);
    expect(summary.incomeMinor).toBe(500_000);
    expect(summary.netMinor).toBe(477_725);
    expect(summary.transactionCount).toBe(4);
  });

  it('computes a savings rate, and reports null when there is no income', async () => {
    const { user } = await seedLedger();
    const withIncome = await authed(user)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);
    expect(withIncome.body.savingsRate).toBeCloseTo((477_725 / 500_000) * 100, 5);

    const emptyUser = await createUser();
    const noIncome = await authed(emptyUser)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);
    // Not 0 — there is no rate to report, and 0% would read as "saved nothing".
    expect(noIncome.body.savingsRate).toBeNull();
  });

  it('returns zeroed totals for an account with no transactions', async () => {
    const user = await createUser();
    const response = await authed(user)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);

    expect(response.body).toMatchObject({
      incomeMinor: 0,
      expenseMinor: 0,
      netMinor: 0,
      transactionCount: 0,
    });
    expect(response.body.largestExpense).toBeNull();
    expect(response.body.deltas.income).toBeNull();
  });

  it('identifies the largest single expense', async () => {
    const { user } = await seedLedger();
    const response = await authed(user)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);
    expect(response.body.largestExpense.amountMinor).toBe(12_050);
  });

  it('ranks top expense categories by spend', async () => {
    const { user } = await seedLedger();
    const response = await authed(user)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);
    const top = response.body.topExpenseCategories as CategoryBreakdownEntry[];

    expect(top[0]).toMatchObject({ name: 'Groceries', amountMinor: 19_075 });
    expect(top[1]).toMatchObject({ name: 'Transport', amountMinor: 3_200 });
    // Percentages are shares of total expense for the range (22,275 here),
    // not of the truncated top-N subset.
    expect(top[0]!.percentage).toBeCloseTo((19_075 / 22_275) * 100, 5);
    expect(top[1]!.percentage).toBeCloseTo((3_200 / 22_275) * 100, 5);
  });

  it('excludes transactions outside the requested range', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 999_99,
      occurredAt: ago(200),
    });

    const recent = await authed(user).get('/api/analytics/summary?preset=last_7_days').expect(200);
    expect(recent.body.expenseMinor).toBe(0);

    const allTime = await authed(user).get('/api/analytics/summary?preset=all_time').expect(200);
    expect(allTime.body.expenseMinor).toBe(999_99);
  });

  it('compares against the preceding window of equal length', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    // Inside the last 7 days.
    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 10_000,
      occurredAt: ago(2),
    });
    // Inside the 7 days before that.
    await addTransaction(user, {
      categoryId: groceries.id,
      amountMinor: 5_000,
      occurredAt: ago(9),
    });

    const response = await authed(user)
      .get('/api/analytics/summary?preset=last_7_days')
      .expect(200);
    expect(response.body.expenseMinor).toBe(10_000);
    expect(response.body.previous.expenseMinor).toBe(5_000);
    // Spending doubled.
    expect(response.body.deltas.expense).toBeCloseTo(100, 5);
  });

  it('rejects a custom range missing its bounds', async () => {
    const user = await createUser();
    await authed(user).get('/api/analytics/summary?preset=custom').expect(422);
  });

  it('scopes analytics to the requesting user', async () => {
    const { user } = await seedLedger();
    const stranger = await createUser();

    const response = await authed(stranger)
      .get('/api/analytics/summary?preset=all_time')
      .expect(200);
    expect(response.body.expenseMinor).toBe(0);
    void user;
  });
});

describe('GET /api/analytics/breakdown', () => {
  it('splits totals by category for both income and expense', async () => {
    const { user } = await seedLedger();
    const response = await authed(user).get('/api/analytics/breakdown?preset=all_time').expect(200);

    expect(response.body.income).toHaveLength(1);
    expect(response.body.expense).toHaveLength(2);
    expect(response.body.expense[0]).toMatchObject({ name: 'Groceries', transactionCount: 2 });
    // Category presentation metadata travels with the numbers so the chart can
    // colour itself without a second request.
    expect(response.body.expense[0].color).toMatch(/^#[\da-f]{6}$/i);
  });
});

describe('GET /api/analytics/trend', () => {
  it('buckets by day and fills gaps with zeroes', async () => {
    const { user } = await seedLedger();
    const response = await authed(user)
      .get('/api/analytics/trend?preset=last_7_days&granularity=day')
      .expect(200);

    const points = response.body.points as TrendPoint[];
    expect(points).toHaveLength(7);

    // A chart that omitted empty days would draw a misleading slope between
    // the days that remain.
    expect(points.every((p) => typeof p.incomeMinor === 'number')).toBe(true);
    const total = points.reduce((sum, p) => sum + p.expenseMinor, 0);
    expect(total).toBe(22_275);
  });

  it('buckets by month when asked', async () => {
    const { user } = await seedLedger();
    const response = await authed(user)
      .get('/api/analytics/trend?preset=last_30_days&granularity=month')
      .expect(200);

    const points = response.body.points as TrendPoint[];
    expect(points.length).toBeLessThanOrEqual(2);
    expect(points.every((p) => p.date.endsWith('-01'))).toBe(true);
  });
});

describe('top-category percentages', () => {
  it('reports each category as a share of all spending, not of the top N', async () => {
    const user = await createUser();
    const names = [
      'Groceries',
      'Transport',
      'Dining Out',
      'Utilities',
      'Healthcare',
      'Entertainment',
    ];

    // Six spending categories, but the summary returns only the top five.
    for (const [index, name] of names.entries()) {
      const category = await findCategory(user, name);
      await addTransaction(user, {
        categoryId: category.id,
        amountMinor: (names.length - index) * 1_000,
        occurredAt: ago(1),
      });
    }

    const response = await authed(user)
      .get('/api/analytics/summary?preset=last_30_days')
      .expect(200);
    const top = response.body.topExpenseCategories as CategoryBreakdownEntry[];
    expect(top).toHaveLength(5);

    // 6+5+4+3+2+1 = 21 units of spend; the visible five cover 20 of them.
    const shown = top.reduce((sum, entry) => sum + entry.percentage, 0);
    expect(shown).toBeCloseTo((20 / 21) * 100, 5);
    expect(shown).toBeLessThan(100);
  });
});
