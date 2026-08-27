import { describe, expect, it } from 'vitest';
import type { Goal } from '@savoney/shared';
import { authed, createUser, findCategory } from '../helpers/factories.js';

describe('savings goals', () => {
  const create = async (user: Awaited<ReturnType<typeof createUser>>, overrides = {}) =>
    (
      await authed(user)
        .post('/api/goals')
        .send({ name: 'New laptop', targetMinor: 200_000, ...overrides })
        .expect(201)
    ).body.goal as Goal;

  it('creates a goal and reports progress', async () => {
    const user = await createUser();
    const goal = await create(user);

    expect(goal).toMatchObject({
      targetMinor: 200_000,
      savedMinor: 0,
      remainingMinor: 200_000,
      percentComplete: 0,
      isComplete: false,
    });
  });

  it('accumulates contributions', async () => {
    const user = await createUser();
    const goal = await create(user);

    await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: 50_000 })
      .expect(200);
    const response = await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: 25_000 })
      .expect(200);

    expect(response.body.goal).toMatchObject({ savedMinor: 75_000, remainingMinor: 125_000 });
    expect(response.body.goal.percentComplete).toBeCloseTo(37.5, 5);
  });

  it('supports withdrawals but not overdrafts', async () => {
    const user = await createUser();
    const goal = await create(user);

    await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: 50_000 })
      .expect(200);

    const withdrawn = await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: -20_000 })
      .expect(200);
    expect(withdrawn.body.goal.savedMinor).toBe(30_000);

    await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: -99_999 })
      .expect(400);
  });

  it('refuses a contribution beyond the target', async () => {
    const user = await createUser();
    const goal = await create(user);
    await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: 500_000 })
      .expect(400);
  });

  it('marks a goal complete once fully funded', async () => {
    const user = await createUser();
    const goal = await create(user);
    const response = await authed(user)
      .post(`/api/goals/${goal.id}/contribute`)
      .send({ amountMinor: 200_000 })
      .expect(200);

    expect(response.body.goal.isComplete).toBe(true);
    expect(response.body.goal.percentComplete).toBe(100);
    // A funded goal has no monthly requirement left to report.
    expect(response.body.goal.requiredMonthlyMinor).toBeNull();
  });

  it('computes the monthly saving needed to hit a dated target', async () => {
    const user = await createUser();
    const targetDate = new Date(Date.now() + 120 * 86_400_000).toISOString();
    const goal = await create(user, { targetMinor: 120_000, targetDate });

    // ~4 months to save 1,200.00 — roughly 300.00 a month.
    expect(goal.requiredMonthlyMinor).toBeGreaterThan(25_000);
    expect(goal.requiredMonthlyMinor).toBeLessThanOrEqual(40_000);
  });

  it('keeps goals private to their owner', async () => {
    const owner = await createUser();
    const stranger = await createUser();
    const goal = await create(owner);

    await authed(stranger).patch(`/api/goals/${goal.id}`).send({ name: 'Stolen' }).expect(404);
    await authed(stranger).delete(`/api/goals/${goal.id}`).expect(404);
    expect((await authed(stranger).get('/api/goals').expect(200)).body.goals).toHaveLength(0);
  });
});

describe('CSV import and export', () => {
  const csvHeader = 'date,title,amount,type,category,notes';

  it('imports transactions and creates any missing categories', async () => {
    const user = await createUser();

    const response = await authed(user)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(
        [
          csvHeader,
          '2026-03-01,Coffee,4.50,expense,Groceries,',
          '2026-03-02,Bike repair,35.00,expense,Cycling,new tyre',
        ].join('\n'),
      )
      .expect(201);

    expect(response.body.imported).toBe(2);
    // "Cycling" did not exist; requiring it up front would make import unusable.
    expect(response.body.categoriesCreated).toContain('Cycling');

    const list = await authed(user).get('/api/transactions').expect(200);
    expect(list.body.items).toHaveLength(2);
    expect(
      list.body.items
        .map((t: { amountMinor: number }) => t.amountMinor)
        .sort((a: number, b: number) => a - b),
    ).toEqual([450, 3500]);
  });

  it('imports the good rows and reports the bad ones', async () => {
    const user = await createUser();
    const response = await authed(user)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(
        [
          csvHeader,
          '2026-03-01,Fine,4.50,expense,Groceries,',
          'bad-date,Broken,4.50,expense,Groceries,',
        ].join('\n'),
      )
      .expect(201);

    // A single malformed row must not cost the user the other 499.
    expect(response.body.imported).toBe(1);
    expect(response.body.errors).toHaveLength(1);
    expect(response.body.errors[0].line).toBe(3);
  });

  it('exports a CSV that round-trips back through the importer', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await authed(user)
      .post('/api/transactions')
      .send({
        title: 'Round trip, with comma',
        amountMinor: 1_234,
        type: 'expense',
        categoryId: groceries.id,
        occurredAt: new Date(Date.UTC(2026, 2, 1)).toISOString(),
      })
      .expect(201);

    const exported = await authed(user).get('/api/transactions/export').expect(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.headers['content-disposition']).toContain('attachment');

    const importer = await createUser();
    const reimported = await authed(importer)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(exported.text)
      .expect(201);

    expect(reimported.body.imported).toBe(1);
    const list = await authed(importer).get('/api/transactions').expect(200);
    // The comma in the title survived the round trip, and so did the amount.
    expect(list.body.items[0]).toMatchObject({
      title: 'Round trip, with comma',
      amountMinor: 1_234,
    });
  });
});

describe('import reporting accuracy', () => {
  it('reports the number actually written, not the number attempted', async () => {
    const user = await createUser();

    // Mongoose's `ordered: false` inserts drop failures silently rather than
    // throwing, so `imported` must be derived from what came back.
    const response = await authed(user)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send(
        [
          'date,title,amount,type,category,notes',
          '2026-03-01,First,4.50,expense,Groceries,',
          '2026-03-02,Second,6.00,expense,Groceries,',
        ].join('\n'),
      )
      .expect(201);

    const list = await authed(user).get('/api/transactions').expect(200);
    expect(response.body.imported).toBe(list.body.meta.total);
  });

  it('rejects a CSV whose header is missing required columns', async () => {
    const user = await createUser();
    const response = await authed(user)
      .post('/api/transactions/import')
      .set('Content-Type', 'text/csv')
      .send('date,title\n2026-03-01,Coffee')
      .expect(200);

    expect(response.body.imported).toBe(0);
    expect(response.body.errors[0].message).toContain('amount');
  });

  it('neutralises formula injection on export', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');

    await authed(user)
      .post('/api/transactions')
      .send({
        title: '=HYPERLINK("http://evil","click")',
        amountMinor: 500,
        type: 'expense',
        categoryId: groceries.id,
        occurredAt: new Date(Date.UTC(2026, 2, 1)).toISOString(),
      })
      .expect(201);

    const exported = await authed(user).get('/api/transactions/export').expect(200);
    // The leading apostrophe stops Excel and Sheets executing the cell.
    expect(exported.text).toContain('"\'=HYPERLINK');
    expect(exported.text).not.toMatch(/,"=HYPERLINK/);
  });
});
