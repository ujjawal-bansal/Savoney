import { describe, expect, it } from 'vitest';
import type { Transaction } from '@savoney/shared';
import { addTransaction, authed, createUser, findCategory } from '../helpers/factories.js';

const iso = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).toISOString();

describe('transaction CRUD', () => {
  it('creates a transaction and echoes the populated category', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    const response = await authed(user)
      .post('/api/transactions')
      .send({
        title: 'Weekly shop',
        amountMinor: 4599,
        type: 'expense',
        categoryId: groceries.id,
        occurredAt: iso(2026, 3, 14),
        tags: ['Food', 'food', ' WEEKLY '],
      })
      .expect(201);

    const transaction = response.body.transaction as Transaction;
    expect(transaction.amountMinor).toBe(4599);
    expect(transaction.category?.name).toBe('Groceries');
    // Tags are lowercased, trimmed and de-duplicated.
    expect(transaction.tags).toEqual(['food', 'weekly']);
  });

  it('rejects a fractional amount rather than rounding it', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    const response = await authed(user)
      .post('/api/transactions')
      .send({
        title: 'Fractional',
        amountMinor: 45.99,
        type: 'expense',
        categoryId: groceries.id,
        occurredAt: iso(2026, 3, 14),
      })
      .expect(422);

    expect(response.body.error.details.amountMinor).toBeDefined();
  });

  it('refuses an expense filed under an income category', async () => {
    const user = await createUser();
    const salary = await findCategory(user, 'Salary');

    const response = await authed(user)
      .post('/api/transactions')
      .send({
        title: 'Mismatched',
        amountMinor: 1000,
        type: 'expense',
        categoryId: salary.id,
        occurredAt: iso(2026, 3, 14),
      })
      .expect(400);

    expect(response.body.error.message).toContain('income category');
  });

  it('updates a transaction', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const created = await addTransaction(user, { categoryId: groceries.id, amountMinor: 1000 });

    const response = await authed(user)
      .patch(`/api/transactions/${created.id}`)
      .send({ title: 'Renamed', amountMinor: 2500 })
      .expect(200);

    expect(response.body.transaction).toMatchObject({ title: 'Renamed', amountMinor: 2500 });
  });

  it('deletes a transaction', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const created = await addTransaction(user, { categoryId: groceries.id });

    await authed(user).delete(`/api/transactions/${created.id}`).expect(204);
    await authed(user).get(`/api/transactions/${created.id}`).expect(404);
  });

  it('bulk deletes only the caller’s transactions', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const a = await addTransaction(user, { categoryId: groceries.id });
    const b = await addTransaction(user, { categoryId: groceries.id });

    const response = await authed(user)
      .post('/api/transactions/bulk-delete')
      .send({ ids: [a.id, b.id] })
      .expect(200);

    expect(response.body.deleted).toBe(2);
  });

  it('rejects a malformed id with 422 rather than a 500', async () => {
    const user = await createUser();
    await authed(user).get('/api/transactions/not-an-object-id').expect(422);
  });
});

describe('tenant isolation', () => {
  it('never returns or mutates another user’s transaction', async () => {
    const owner = await createUser();
    const intruder = await createUser();

    const groceries = await findCategory(owner, 'Groceries');
    const secret = await addTransaction(owner, { categoryId: groceries.id, title: 'Private' });

    // Reads, writes and deletes all report "not found" rather than "forbidden":
    // confirming existence would itself leak information.
    await authed(intruder).get(`/api/transactions/${secret.id}`).expect(404);
    await authed(intruder)
      .patch(`/api/transactions/${secret.id}`)
      .send({ title: 'Hacked' })
      .expect(404);
    await authed(intruder).delete(`/api/transactions/${secret.id}`).expect(404);

    const list = await authed(intruder).get('/api/transactions').expect(200);
    expect(list.body.items).toHaveLength(0);

    // And the record is untouched.
    const still = await authed(owner).get(`/api/transactions/${secret.id}`).expect(200);
    expect(still.body.transaction.title).toBe('Private');
  });

  it('will not file a transaction under another user’s category', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const ownerCategory = await findCategory(owner, 'Groceries');

    await authed(intruder)
      .post('/api/transactions')
      .send({
        title: 'Cross-tenant',
        amountMinor: 500,
        type: 'expense',
        categoryId: ownerCategory.id,
        occurredAt: iso(2026, 3, 1),
      })
      .expect(404);
  });
});

describe('filtering, search and pagination', () => {
  const seed = async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    const transport = await findCategory(user, 'Transport');
    const salary = await findCategory(user, 'Salary');

    await addTransaction(user, {
      categoryId: groceries.id,
      title: 'Supermarket run',
      amountMinor: 5000,
      occurredAt: iso(2026, 1, 10),
    });
    await addTransaction(user, {
      categoryId: groceries.id,
      title: 'Corner shop',
      amountMinor: 1200,
      occurredAt: iso(2026, 2, 10),
    });
    await addTransaction(user, {
      categoryId: transport.id,
      title: 'Train ticket',
      amountMinor: 3200,
      occurredAt: iso(2026, 2, 20),
      tags: ['commute'],
    });
    await addTransaction(user, {
      categoryId: salary.id,
      title: 'March salary',
      amountMinor: 250000,
      type: 'income',
      occurredAt: iso(2026, 3, 1),
    });

    return { user, groceries, transport, salary };
  };

  it('filters by type', async () => {
    const { user } = await seed();
    const response = await authed(user).get('/api/transactions?type=income').expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe('March salary');
  });

  it('filters by category', async () => {
    const { user, groceries } = await seed();
    const response = await authed(user)
      .get(`/api/transactions?categoryId=${groceries.id}`)
      .expect(200);
    expect(response.body.items).toHaveLength(2);
  });

  it('filters by an inclusive date range', async () => {
    const { user } = await seed();
    const response = await authed(user)
      .get(`/api/transactions?from=${iso(2026, 2, 1)}&to=${iso(2026, 2, 20)}`)
      .expect(200);

    // The `to` bound covers the whole of the 20th, so the train ticket counts.
    expect(response.body.items.map((t: Transaction) => t.title).sort()).toEqual([
      'Corner shop',
      'Train ticket',
    ]);
  });

  it('searches titles by substring, mid-word', async () => {
    const { user } = await seed();
    // A token-based $text index would return nothing for a partial word.
    const response = await authed(user).get('/api/transactions?search=market').expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe('Supermarket run');
  });

  it('treats regex metacharacters in search as literal text', async () => {
    const { user } = await seed();
    // An unescaped ".*" would match everything; escaped, it matches nothing.
    const response = await authed(user).get('/api/transactions?search=.*').expect(200);
    expect(response.body.items).toHaveLength(0);
  });

  it('filters by tag', async () => {
    const { user } = await seed();
    const response = await authed(user).get('/api/transactions?tag=commute').expect(200);
    expect(response.body.items).toHaveLength(1);
  });

  it('filters by an amount window', async () => {
    const { user } = await seed();
    const response = await authed(user)
      .get('/api/transactions?minAmountMinor=1500&maxAmountMinor=6000')
      .expect(200);
    expect(response.body.items.map((t: Transaction) => t.title).sort()).toEqual([
      'Supermarket run',
      'Train ticket',
    ]);
  });

  it('paginates with accurate metadata', async () => {
    const { user } = await seed();
    const page1 = await authed(user).get('/api/transactions?page=1&limit=3').expect(200);

    expect(page1.body.items).toHaveLength(3);
    expect(page1.body.meta).toMatchObject({
      page: 1,
      limit: 3,
      total: 4,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });

    const page2 = await authed(user).get('/api/transactions?page=2&limit=3').expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.meta.hasNextPage).toBe(false);

    // No record may appear on both pages.
    const ids = new Set([...page1.body.items, ...page2.body.items].map((t: Transaction) => t.id));
    expect(ids.size).toBe(4);
  });

  it('sorts by amount ascending on request', async () => {
    const { user } = await seed();
    const response = await authed(user)
      .get('/api/transactions?sort=amountMinor&order=asc')
      .expect(200);

    const amounts = response.body.items.map((t: Transaction) => t.amountMinor);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it('rejects an inverted date range', async () => {
    const { user } = await seed();
    await authed(user)
      .get(`/api/transactions?from=${iso(2026, 3, 1)}&to=${iso(2026, 1, 1)}`)
      .expect(422);
  });

  it('caps the page size so a client cannot request an unbounded scan', async () => {
    const { user } = await seed();
    await authed(user).get('/api/transactions?limit=5000').expect(422);
  });
});
