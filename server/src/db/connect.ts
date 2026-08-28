import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Strict query filtering: an undefined value in a filter is a bug, not a
 * wildcard. Without this, a query like `{ user: undefined }` silently becomes
 * "match everything" — which in a multi-tenant app means returning another
 * user's records.
 */
mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

export const connectDatabase = async (uri: string = env.MONGO_URI): Promise<void> => {
  mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('mongodb reconnected'));
  mongoose.connection.on('error', (error) => logger.error({ err: error }, 'mongodb error'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    // Bound the pool so a burst of traffic cannot exhaust the database's
    // connection limit.
    maxPoolSize: 20,
    minPoolSize: 2,
    retryWrites: true,
  });

  logger.info(
    { host: mongoose.connection.host, name: mongoose.connection.name },
    'mongodb connected',
  );
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.connection.close();
};

export const isDatabaseReady = (): boolean => mongoose.connection.readyState === 1;
