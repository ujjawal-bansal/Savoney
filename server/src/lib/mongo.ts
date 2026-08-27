import mongoose from 'mongoose';

/**
 * Mark a query-operator object as originating from application code.
 *
 * `sanitizeFilter` is enabled globally (see `db/connect.ts`): it defends
 * against operator injection by wrapping any `{ $op: ... }` value in `$eq`, so
 * a request body of `{ email: { $ne: null } }` cannot turn a lookup into
 * "match anything". That protection cannot distinguish an attacker's operators
 * from ours, so filters we build ourselves must opt out explicitly.
 *
 * Only ever call this on an object built from validated or literal values —
 * never pass raw request input through it, which would defeat the guard.
 */
export const ops = <T extends Record<string, unknown>>(operators: T): T =>
  mongoose.trusted(operators) as T;
