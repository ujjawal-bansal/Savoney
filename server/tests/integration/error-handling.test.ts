import { createServer, type Server } from 'node:http';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { ZodError, z } from 'zod';
import { afterAll, describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/api-error.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js';
import { requestId } from '../../src/middleware/request-id.js';
import { app, authed, createUser } from '../helpers/factories.js';

/**
 * A minimal app that throws whatever a test hands it, then runs the real
 * handler. Wrapped in a server that is listening before use, for the same
 * reason as the shared app in `factories.ts`: supertest otherwise starts and
 * stops one per request.
 */
const appThatThrows = async (error: unknown): Promise<Server> => {
  const testApp = express();
  testApp.use(requestId);
  testApp.get('/boom', () => {
    throw error;
  });
  testApp.use(notFoundHandler);
  testApp.use(errorHandler);

  const server = createServer(testApp);
  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });
  throwawayServers.push(server);
  return server;
};

const throwawayServers: Server[] = [];

afterAll(() => {
  for (const server of throwawayServers) {
    server.closeAllConnections();
    server.close();
  }
});

describe('error handler', () => {
  it('preserves the status, code and details of a deliberate ApiError', async () => {
    const response = await request(
      await appThatThrows(ApiError.validation({ email: ['Required'] })),
    )
      .get('/boom')
      .expect(422);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { email: ['Required'] },
    });
  });

  it('translates a Zod error into a 422 with field details', async () => {
    const zodError = new ZodError(
      z.object({ amount: z.number() }).safeParse({ amount: 'nope' }).error!.issues,
    );
    const response = await request(await appThatThrows(zodError))
      .get('/boom')
      .expect(422);
    expect(response.body.error.details.amount).toBeDefined();
  });

  it('translates a Mongoose CastError into a 400, not a 500', async () => {
    // A malformed ObjectId is the client's mistake, not a server fault.
    const castError = new mongoose.Error.CastError('ObjectId', 'not-an-id', 'category');
    const response = await request(await appThatThrows(castError))
      .get('/boom')
      .expect(400);
    expect(response.body.error.message).toContain('category');
  });

  it('translates a duplicate-key violation into a 409', async () => {
    const duplicate = Object.assign(new Error('E11000 duplicate key'), {
      code: 11000,
      keyPattern: { email: 1 },
    });
    const response = await request(await appThatThrows(duplicate))
      .get('/boom')
      .expect(409);
    expect(response.body.error).toMatchObject({ code: 'DUPLICATE_KEY' });
    expect(response.body.error.message).toContain('email');
  });

  it('translates a Mongoose ValidationError into a 422', async () => {
    const validationError = new mongoose.Error.ValidationError();
    validationError.addError(
      'amountMinor',
      new mongoose.Error.ValidatorError({ message: 'Amount is required', path: 'amountMinor' }),
    );
    const response = await request(await appThatThrows(validationError))
      .get('/boom')
      .expect(422);
    expect(response.body.error.details.amountMinor).toContain('Amount is required');
  });

  it('never leaks an unexpected error message to the client', async () => {
    // Internal messages routinely contain connection strings and query
    // fragments, so an unrecognised fault must become a generic 500.
    const leaky = new Error('connect ECONNREFUSED mongodb://admin:hunter2@10.0.0.5:27017');
    const response = await request(await appThatThrows(leaky))
      .get('/boom')
      .expect(500);

    expect(response.body.error.message).toBe('Something went wrong on our end');
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
  });

  it('returns a correlation id on every error, and echoes it in the header', async () => {
    const response = await request(await appThatThrows(new Error('anything')))
      .get('/boom')
      .expect(500);
    // The id is what ties a user's report to the real stack trace in the logs.
    expect(response.body.error.requestId).toBeTruthy();
    expect(response.headers['x-request-id']).toBe(response.body.error.requestId);
  });

  it('reuses an upstream x-request-id so a trace survives across services', async () => {
    const response = await request(await appThatThrows(new Error('x')))
      .get('/boom')
      .set('x-request-id', 'upstream-trace-42')
      .expect(500);
    expect(response.body.error.requestId).toBe('upstream-trace-42');
  });

  it('ignores an absurdly long upstream id rather than writing it to logs', async () => {
    const response = await request(await appThatThrows(new Error('x')))
      .get('/boom')
      .set('x-request-id', 'a'.repeat(500))
      .expect(500);
    expect(response.body.error.requestId).not.toHaveLength(500);
  });

  it('returns a 404 with the method and path for an unknown route', async () => {
    const response = await request(await appThatThrows(new Error('unused')))
      .get('/no-such-route')
      .expect(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(response.body.error.message).toContain('GET /no-such-route');
  });
});

describe('health and readiness', () => {
  it('reports liveness', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'savoney-api' });
  });

  it('reports readiness separately, reflecting database connectivity', async () => {
    // Split from liveness so an orchestrator restarts a wedged process but only
    // stops routing to one that briefly cannot reach the database.
    const response = await request(app).get('/api/ready').expect(200);
    expect(response.body).toMatchObject({ status: 'ready', database: true });
  });

  it('404s an unknown API route through the real app', async () => {
    const response = await request(app).get('/api/does-not-exist').expect(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('request validation', () => {
  it('reports body, query and param problems together in one response', async () => {
    const user = await createUser();
    const response = await authed(user)
      .patch('/api/transactions/not-a-valid-id')
      .send({ amountMinor: 12.5, type: 'sideways' })
      .expect(422);

    const details = response.body.error.details;
    // One round trip, every problem — rather than fixing them one at a time.
    expect(details['params.id']).toBeDefined();
    expect(details.amountMinor).toBeDefined();
    expect(details.type).toBeDefined();
  });

  it('rejects an unparseable JSON body without crashing', async () => {
    const user = await createUser();
    const response = await authed(user)
      .post('/api/transactions')
      .set('Content-Type', 'application/json')
      .send('{"title": "broken"')
      .expect(400);

    expect(response.body.error).toBeDefined();
  });
});
