import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { MONGO_VERSION } from './global-setup.js';

/**
 * Environment must be populated before anything imports `src/config/env.ts`,
 * which validates and exits on failure at module load. Vitest runs setup files
 * ahead of the test module graph, so this is the only safe place for it.
 */
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/savoney-test-placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough-32';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-different-32';
process.env.LOG_LEVEL = 'silent';
process.env.ENABLE_DOCS = 'false';
process.env.ACCESS_TOKEN_TTL_SECONDS = '900';

let memoryServer: MongoMemoryServer;

/**
 * A dedicated in-memory MongoDB per test file.
 *
 * Sharing one instance across parallel forks proved subtly unstable — files
 * intermittently saw missing documents under load. A private instance per file
 * costs a little startup time and buys complete isolation: no shared server
 * state, no cross-fork locking, no interference of any kind. The binary itself
 * is resolved once in `global-setup.ts`, so nothing races to download it.
 *
 * These are real aggregation pipelines, real indexes and real unique
 * constraints — a mocked Mongoose would happily pass tests for pipelines that
 * cannot actually run.
 */
beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create({ binary: { version: MONGO_VERSION } });
  await mongoose.connect(memoryServer.getUri('savoney-test'), {
    // Tests are sequential within a file; a large pool serves no purpose.
    maxPoolSize: 5,
    minPoolSize: 1,
  });
});

/**
 * Clear data between tests rather than dropping the database, so the indexes
 * Mongoose built on first connect survive. Dropping would silently disable the
 * unique constraints several tests depend on.
 */
afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await memoryServer?.stop();
});
