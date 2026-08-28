import type { UserDocument } from '../modules/auth/user.model.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `authenticate`; present on every protected route. */
      user?: UserDocument;
      /** Correlation id echoed to the client and attached to every log line. */
      id: string;
      /**
       * Parsed, coerced, type-safe input produced by `validate`.
       *
       * Express 5 exposes `req.query` as a getter with no setter, so validated
       * values cannot be written back over the originals the way Express 4
       * allowed. Keeping them in a dedicated bag is both compatible and
       * clearer: handlers read `req.validated.query`, which is *known* to have
       * been through a schema, instead of raw untrusted input.
       */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
