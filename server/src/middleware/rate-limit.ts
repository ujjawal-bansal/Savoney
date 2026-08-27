import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { env, isTest } from '../config/env.js';
import { ApiError } from '../lib/api-error.js';

const base: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Route the rejection through the normal error pipeline so a 429 has the same
  // response envelope as every other error.
  handler: (_req, _res, next) => next(ApiError.tooManyRequests()),
  // Limits would make the test suite flaky and slow; correctness of the limiter
  // itself is covered by its own unit test.
  skip: () => isTest,
};

/** Broad ceiling applied to the whole API. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
});

/**
 * Credential endpoints get a far tighter budget, keyed by IP *and* the
 * submitted email. Keying on IP alone lets one attacker spray many accounts
 * from a botnet; keying on email alone lets them lock a victim out.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
    // `ipKeyGenerator` normalises IPv6 to its /64 prefix. Keying on the raw
    // address would be useless there: a single subscriber is routinely handed a
    // whole /64 and could rotate through addresses to reset the counter.
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${email}`;
  },
});

/** Writes are cheaper than auth but still worth bounding against runaway clients. */
export const writeLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 60,
});
