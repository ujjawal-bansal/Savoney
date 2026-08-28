import { createServer, type Server } from 'node:http';
import request from 'supertest';
import type { Category } from '@savoney/shared';
import { afterAll, beforeAll } from 'vitest';
import { createApp } from '../../src/app.js';

/**
 * One long-lived HTTP server for the whole test file.
 *
 * Handing supertest an Express app makes it call `app.listen(0)` before every
 * request and `server.close()` after it — hundreds of listen/close cycles per
 * file, multiplied by parallel workers. That churn produced intermittent
 * `socket hang up` errors and stray 401/404s that looked like application bugs
 * but were purely transport-level. Given a server that is already listening,
 * supertest reuses its address and never closes it.
 */
export const app: Server = createServer(createApp());

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    app.listen(0, resolve);
  });
});

afterAll(async () => {
  // Keep-alive sockets would otherwise hold `close()` open until they time out.
  app.closeAllConnections();
  await new Promise<void>((resolve) => {
    app.close(() => resolve());
  });
});

export interface TestUser {
  token: string;
  userId: string;
  email: string;
  agent: ReturnType<typeof request.agent>;
}

let counter = 0;

/** Register a user and return an authenticated agent that carries its cookies. */
export const createUser = async (
  overrides: Partial<{ email: string; password: string }> = {},
): Promise<TestUser> => {
  counter += 1;
  const email = overrides.email ?? `user${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? 'correct-horse-battery';

  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/register')
    .send({ name: `Test User ${counter}`, email, password })
    .expect(201);

  return { token: response.body.accessToken, userId: response.body.user.id, email, agent };
};

export const authed = (user: TestUser) => ({
  get: (url: string) => user.agent.get(url).set('Authorization', `Bearer ${user.token}`),
  post: (url: string) => user.agent.post(url).set('Authorization', `Bearer ${user.token}`),
  patch: (url: string) => user.agent.patch(url).set('Authorization', `Bearer ${user.token}`),
  delete: (url: string) => user.agent.delete(url).set('Authorization', `Bearer ${user.token}`),
});

/** Look up one of the categories seeded at registration, by name. */
export const findCategory = async (user: TestUser, name: string): Promise<Category> => {
  const response = await authed(user).get('/api/categories').expect(200);
  const category = (response.body.categories as Category[]).find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
  if (!category) throw new Error(`Seeded category "${name}" not found`);
  return category;
};

export interface TransactionSeed {
  title?: string;
  amountMinor?: number;
  type?: 'income' | 'expense';
  categoryId: string;
  occurredAt?: string | Date;
  notes?: string;
  tags?: string[];
}

export const addTransaction = async (user: TestUser, seed: TransactionSeed) => {
  const response = await authed(user)
    .post('/api/transactions')
    .send({
      title: seed.title ?? 'Test transaction',
      amountMinor: seed.amountMinor ?? 1000,
      type: seed.type ?? 'expense',
      categoryId: seed.categoryId,
      occurredAt: (seed.occurredAt instanceof Date
        ? seed.occurredAt
        : new Date(seed.occurredAt ?? Date.now())
      ).toISOString(),
      notes: seed.notes ?? '',
      tags: seed.tags ?? [],
    })
    .expect(201);
  return response.body.transaction;
};
