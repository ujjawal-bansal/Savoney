import type { RequestHandler } from 'express';
import { ApiError } from '../lib/api-error.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../modules/auth/user.model.js';

const bearerFrom = (header: string | undefined): string | null => {
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
};

/**
 * Authenticate via the `Authorization: Bearer` access token.
 *
 * The refresh cookie is deliberately *not* accepted here. If a long-lived
 * cookie could authorise ordinary requests, every state-changing endpoint would
 * be exposed to CSRF, since browsers attach cookies automatically. Requiring a
 * header the browser will not send on its own makes the API CSRF-safe by
 * construction, and confines the cookie to the single `/auth/refresh` route.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  void (async () => {
    const token = bearerFrom(req.get('authorization'));
    if (!token) {
      throw ApiError.unauthorized('Authentication required');
    }

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      // A distinct code lets the client tell "refresh me" apart from "sign in
      // again" and retry transparently.
      throw new ApiError(401, 'Access token expired or invalid', 'TOKEN_EXPIRED');
    }

    const user = await User.findById(claims.sub);
    if (!user) {
      throw ApiError.unauthorized('Account no longer exists');
    }

    /**
     * Honour the account's session generation.
     *
     * Revoking refresh tokens on a password change or reset is not enough on
     * its own: an access token already in an attacker's hands stays
     * cryptographically valid until it expires, so "secure my account" would
     * otherwise leave them signed in for up to another token lifetime. Checking
     * the epoch closes that window the instant the password changes.
     */
    if (claims.epoch !== user.sessionEpoch) {
      throw new ApiError(401, 'Session ended. Please sign in again.', 'SESSION_REVOKED');
    }

    req.user = user;
    next();
  })().catch(next);
};

/** Narrow `req.user` for handlers mounted behind `authenticate`. */
export const requireUser = (req: { user?: unknown }) => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user as NonNullable<Express.Request['user']>;
};
