import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import type { ApiErrorBody } from '@savoney/shared';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../lib/api-error.js';
import { formatZodError } from './validate.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Cannot ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
};

/** Translate a driver/ODM error into our ApiError vocabulary, or null if unrecognised. */
const normalise = (err: unknown): ApiError | null => {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.validation(formatZodError(err));
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details: Record<string, string[]> = {};
    for (const [field, issue] of Object.entries(err.errors)) {
      (details[field] ??= []).push(issue.message);
    }
    return ApiError.validation(details);
  }

  if (err instanceof mongoose.Error.CastError) {
    // A malformed ObjectId in a path is a client mistake, not a server fault.
    return ApiError.badRequest(`Invalid value for "${err.path}"`);
  }

  // body-parser rejects malformed JSON and oversized payloads before any
  // handler runs. Both are the client's problem, not a server fault.
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      return ApiError.badRequest('Request body is not valid JSON');
    }
    if (type === 'entity.too.large') {
      return new ApiError(413, 'Request body is too large', 'PAYLOAD_TOO_LARGE');
    }
  }

  if (typeof err === 'object' && err !== null && 'code' in err && err.code === 11000) {
    const key = Object.keys((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {})[0];
    return ApiError.conflict(
      key ? `That ${key} is already in use` : 'That record already exists',
      'DUPLICATE_KEY',
    );
  }

  return null;
};

/**
 * The single place an error becomes a response.
 *
 * Recognised failures keep their message; anything unrecognised is logged in
 * full and reported to the client as a generic 500. Internal messages routinely
 * contain connection strings, file paths, and query fragments, so echoing them
 * back is an information leak — the `requestId` is what ties the user's report
 * to the real stack trace in the logs.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const apiError = normalise(err);

  if (apiError) {
    // 5xx means we mishandled something even if it was thrown deliberately.
    const level = apiError.status >= 500 ? 'error' : 'warn';
    logger[level](
      {
        requestId: String(req.id),
        status: apiError.status,
        code: apiError.code,
        err: apiError.message,
      },
      'request failed',
    );
  } else {
    logger.error({ requestId: String(req.id), err }, 'unhandled error');
  }

  const status = apiError?.status ?? 500;
  const body: ApiErrorBody = {
    error: {
      message: apiError?.message ?? 'Something went wrong on our end',
      code: apiError?.code ?? 'INTERNAL_ERROR',
      requestId: String(req.id),
      ...(apiError?.details ? { details: apiError.details } : {}),
    },
  };

  /**
   * Stacks are a local-development affordance only, gated on an explicit
   * `development` rather than "not production". A stack embeds the error
   * message, which routinely carries connection strings and credentials — so if
   * NODE_ENV were ever unset or misspelled in a deployment, `!isProduction`
   * would quietly start leaking them to clients. Opt in, never opt out.
   */
  if (env.NODE_ENV === 'development' && !apiError && err instanceof Error) {
    (body.error as Record<string, unknown>).stack = err.stack;
  }

  res.status(status).json(body);
};
