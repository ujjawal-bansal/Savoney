import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';

const ISSUER = 'savoney';
const AUDIENCE = 'savoney-client';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface AccessTokenClaims {
  sub: string;
  type: 'access';
  /** Session generation this token was minted under. */
  epoch: number;
}

export interface RefreshTokenClaims {
  sub: string;
  type: 'refresh';
  jti: string;
  family: string;
}

/**
 * Access tokens are short-lived and stateless — checking one costs a signature
 * verification and no database round trip. That is the whole point of the split:
 * the expensive, revocable check happens only at refresh time.
 */
export const signAccessToken = async (userId: string, epoch: number): Promise<string> =>
  new SignJWT({ type: 'access', epoch })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessSecret);

export const signRefreshToken = async (
  userId: string,
  family: string,
): Promise<{ token: string; jti: string; expiresAt: Date }> => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  const token = await new SignJWT({ type: 'refresh', family })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setJti(jti)
    .setExpirationTime(expiresAt)
    .sign(refreshSecret);

  return { token, jti, expiresAt };
};

/** Verify and narrow an access token. Throws on any signature/claim failure. */
export const verifyAccessToken = async (token: string): Promise<AccessTokenClaims> => {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  // A refresh token is signed with a different key and cannot reach here, but
  // asserting the claim keeps the invariant local and obvious.
  if (
    payload.type !== 'access' ||
    typeof payload.sub !== 'string' ||
    typeof payload.epoch !== 'number'
  ) {
    throw new Error('Not an access token');
  }
  return { sub: payload.sub, type: 'access', epoch: payload.epoch };
};

export const verifyRefreshToken = async (token: string): Promise<RefreshTokenClaims> => {
  const { payload } = await jwtVerify(token, refreshSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (
    payload.type !== 'refresh' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string' ||
    typeof payload.family !== 'string'
  ) {
    throw new Error('Not a refresh token');
  }
  return { sub: payload.sub, type: 'refresh', jti: payload.jti, family: payload.family };
};

/** Refresh tokens are stored only as a digest — see RefreshToken.tokenHash. */
export const hashJti = (jti: string): string => createHash('sha256').update(jti).digest('hex');

export const newFamilyId = (): string => randomUUID();
