import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/**
 * Give every request a correlation id, reusing an upstream `x-request-id` when
 * a proxy already assigned one. It goes onto the log line, into error
 * responses, and back in the response header, so a user-reported failure can be
 * traced to exact log records.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const upstream = req.get('x-request-id');
  // Bound the accepted length: a header is attacker-controlled and this value
  // is written into logs.
  req.id = upstream && upstream.length <= 200 ? upstream : randomUUID();
  res.setHeader('x-request-id', req.id);
  req.validated ??= {};
  next();
};
