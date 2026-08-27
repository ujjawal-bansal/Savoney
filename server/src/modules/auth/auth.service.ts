import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@savoney/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../lib/api-error.js';
import { fakeVerify, hashPassword, verifyPassword } from '../../lib/password.js';
import {
  hashJti,
  newFamilyId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/tokens.js';
import { RefreshToken } from './refresh-token.model.js';
import { User, toPublicUser, type UserDocument } from './user.model.js';
import { seedDefaultCategories } from '../categories/category.service.js';

export interface SessionContext {
  userAgent: string;
  ip: string;
}

/** Mint an access/refresh pair and persist the refresh token's digest. */
const issueSession = async (
  user: UserDocument,
  family: string,
  context: SessionContext,
): Promise<{ auth: AuthResponse; refreshToken: string; refreshExpiresAt: Date }> => {
  const userId = user._id.toString();
  const [accessToken, refresh] = await Promise.all([
    signAccessToken(userId, user.sessionEpoch),
    signRefreshToken(userId, family),
  ]);

  await RefreshToken.create({
    user: user._id,
    tokenHash: hashJti(refresh.jti),
    family,
    epoch: user.sessionEpoch,
    expiresAt: refresh.expiresAt,
    userAgent: context.userAgent.slice(0, 300),
    ip: context.ip.slice(0, 64),
  });

  return {
    auth: {
      user: toPublicUser(user),
      accessToken,
      expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    },
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
  };
};

export const register = async (input: RegisterInput, context: SessionContext) => {
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing) {
    // Registration cannot avoid disclosing that an address is taken — the
    // account simply cannot be created twice. Login and reset flows, where
    // disclosure *is* avoidable, stay generic.
    throw ApiError.conflict('An account with that email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash,
    currency: input.currency,
    lastLoginAt: new Date(),
  });

  // A brand-new account with no categories cannot record a transaction, so the
  // starter set is part of registration rather than a later prompt.
  await seedDefaultCategories(user._id);

  logger.info({ userId: user._id.toString() }, 'user registered');
  return issueSession(user, newFamilyId(), context);
};

export const login = async (input: LoginInput, context: SessionContext) => {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');

  if (!user) {
    // Spend the hashing time anyway so response latency does not reveal
    // whether the address exists.
    await fakeVerify(input.password);
    throw ApiError.unauthorized('Invalid email or password');
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  logger.info({ userId: user._id.toString() }, 'user logged in');
  return issueSession(user, newFamilyId(), context);
};

/**
 * Rotate a refresh token.
 *
 * Rotation means a refresh token is single-use: presenting one returns a new
 * pair and immediately revokes the old. If a *already-rotated* token is
 * presented, either it was stolen and replayed or the legitimate client is
 * replaying — both are indistinguishable, so we revoke the entire family. That
 * kills the compromised session on both the attacker's and victim's side while
 * leaving the user's other devices signed in.
 */
export const refresh = async (token: string, context: SessionContext) => {
  let claims;
  try {
    claims = await verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  const stored = await RefreshToken.findOne({ tokenHash: hashJti(claims.jti) });

  if (!stored || stored.revokedAt) {
    logger.warn(
      { userId: claims.sub, family: claims.family, reused: Boolean(stored) },
      'refresh token reuse detected, revoking session family',
    );
    await RefreshToken.updateMany(
      { family: claims.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  const user = await User.findById(claims.sub);
  if (!user) {
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  // Honour a global logout or password change that happened after this token
  // was minted.
  if (stored.epoch !== user.sessionEpoch) {
    throw ApiError.unauthorized('Session expired. Please sign in again.');
  }

  const session = await issueSession(user, claims.family, context);

  stored.revokedAt = new Date();
  stored.replacedByHash = hashJti((await verifyRefreshToken(session.refreshToken)).jti);
  await stored.save();

  return session;
};

export const logout = async (token: string | undefined): Promise<void> => {
  if (!token) return;
  try {
    const claims = await verifyRefreshToken(token);
    await RefreshToken.updateMany(
      { family: claims.family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  } catch {
    // An unparseable token on logout is not an error worth surfacing: the
    // caller's intent (end the session) is satisfied either way.
  }
};

export const logoutEverywhere = async (user: UserDocument): Promise<void> => {
  // Bumping the epoch invalidates every access token immediately; revoking the
  // refresh records stops new ones being minted.
  user.sessionEpoch += 1;
  await user.save();
  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
};

export const updateProfile = async (user: UserDocument, input: UpdateProfileInput) => {
  if (input.name !== undefined) user.name = input.name;
  if (input.monthlyIncomeTargetMinor !== undefined) {
    user.monthlyIncomeTargetMinor = input.monthlyIncomeTargetMinor;
  }
  await user.save();
  return toPublicUser(user);
};

export const changePassword = async (userId: string, input: ChangePasswordInput): Promise<void> => {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');

  const valid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!valid) throw ApiError.badRequest('Your current password is incorrect');

  user.passwordHash = await hashPassword(input.newPassword);
  // A password change must end every existing session; otherwise a thief who
  // already holds a token keeps their access after the user "secures" the
  // account.
  user.sessionEpoch += 1;
  await user.save();

  await RefreshToken.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  logger.info({ userId }, 'password changed; all sessions revoked');
};
