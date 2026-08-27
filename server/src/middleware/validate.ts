import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { type ZodError, type ZodType } from 'zod';
import { ApiError } from '../lib/api-error.js';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** Collapse Zod issues into `{ 'field.path': ['message', ...] }` for the client. */
export const formatZodError = (error: ZodError): Record<string, string[]> => {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    (details[key] ??= []).push(issue.message);
  }
  return details;
};

/**
 * Validate request parts against Zod schemas, writing the parsed results to
 * `req.validated`. Handlers downstream can treat that bag as trusted and
 * correctly typed; anything else on the request is still raw input.
 *
 * All three parts are validated before failing so the client receives every
 * problem at once instead of discovering them one round-trip at a time.
 */
export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.validated ??= {};
    const details: Record<string, string[]> = {};

    for (const part of ['body', 'query', 'params'] as const) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part]);
      if (result.success) {
        req.validated[part] = result.data;
        continue;
      }

      for (const [field, messages] of Object.entries(formatZodError(result.error))) {
        // Namespace query/param issues so `id` in params never collides with
        // an `id` in the body.
        const key = part === 'body' ? field : `${part}.${field}`;
        (details[key] ??= []).push(...messages);
      }
    }

    if (Object.keys(details).length > 0) {
      next(ApiError.validation(details));
      return;
    }

    next();
  };
};

/** Typed accessors — the cast is safe because `validate` ran the matching schema. */
export const body = <T>(req: Request): T => req.validated.body as T;
export const query = <T>(req: Request): T => req.validated.query as T;
export const params = <T>(req: Request): T => req.validated.params as T;
