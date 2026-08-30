import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ForgotPasswordInput, ResetPasswordInput } from '@savoney/shared';
import { env, isProduction } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../lib/api-error.js';
import { passwordResetEmail, sendMail } from '../../lib/mailer.js';
import { ops } from '../../lib/mongo.js';
import { hashPassword } from '../../lib/password.js';
import { PasswordReset } from './password-reset.model.js';
import { RefreshToken } from './refresh-token.model.js';
import { User } from './user.model.js';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Begin password recovery.
 *
 * Always resolves successfully, whether or not the address is registered.
 * Reporting "no such account" here would turn this endpoint into a free
 * membership oracle, letting anyone test which addresses have Savoney accounts.
 */
export const requestPasswordReset = async (
  input: ForgotPasswordInput,
  context: { ip: string },
): Promise<{ devLink?: string }> => {
  /**
   * Without a transport there is no way to deliver a link, and answering "check
   * your inbox" would strand the user waiting for mail that will never arrive.
   * Say so plainly instead. This check precedes the account lookup so the
   * response cannot vary by whether the address exists.
   */
  if (isProduction && !env.SMTP_URL) {
    throw new ApiError(
      503,
      'Password recovery is not available on this deployment. Contact the site owner.',
      'EMAIL_NOT_CONFIGURED',
    );
  }

  const user = await User.findOne({ email: input.email });

  if (!user) {
    logger.info({ email: input.email }, 'password reset requested for unknown address');
    return {};
  }

  // Any earlier link becomes useless the moment a new one is issued, so a
  // forwarded or intercepted old email cannot be redeemed later.
  await PasswordReset.updateMany(
    { user: user._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  // 32 bytes of CSPRNG output: far beyond guessing, and URL-safe.
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000);

  await PasswordReset.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt,
    requestedIp: context.ip.slice(0, 64),
  });

  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    ...passwordResetEmail(user.name, link, env.PASSWORD_RESET_TTL_MINUTES),
  });

  logger.info({ userId: user._id.toString() }, 'password reset email dispatched');

  /**
   * Hand the link straight back when there is no mail transport.
   *
   * Without this a developer running locally has no way to complete the flow
   * short of grepping logs.
   *
   * Gated on an explicit `development`, not merely "not production": returning
   * the link for a registered address while returning nothing for an unknown
   * one makes the response shape itself an account oracle. Keeping it out of
   * the test environment means the suite verifies the real, indistinguishable
   * behaviour rather than a relaxed local variant.
   */
  if (env.NODE_ENV === 'development' && !env.SMTP_URL) {
    return { devLink: link };
  }

  return {};
};

/** Constant-time comparison, so redemption cannot be probed byte by byte. */
const hashesMatch = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Redeem a reset token and set a new password.
 *
 * Every session is revoked on success. If the account was compromised, the
 * attacker's tokens must die with the old password, otherwise "securing" the
 * account would leave them signed in.
 */
export const resetPassword = async (input: ResetPasswordInput): Promise<void> => {
  const candidate = hashToken(input.token);
  const record = await PasswordReset.findOne({ tokenHash: candidate });

  const invalid = ApiError.badRequest(
    'That reset link is invalid or has expired. Request a new one.',
  );

  if (!record || record.usedAt || record.expiresAt < new Date()) throw invalid;
  if (!hashesMatch(record.tokenHash, candidate)) throw invalid;

  const user = await User.findById(record.user).select('+passwordHash');
  if (!user) throw invalid;

  user.passwordHash = await hashPassword(input.newPassword);
  user.sessionEpoch += 1;
  await user.save();

  record.usedAt = new Date();
  await record.save();

  await Promise.all([
    // Any other outstanding link for this account is now moot.
    PasswordReset.updateMany({ user: user._id, usedAt: null }, { $set: { usedAt: new Date() } }),
    RefreshToken.updateMany(
      { user: user._id, revokedAt: ops({ $eq: null }) },
      { $set: { revokedAt: new Date() } },
    ),
  ]);

  logger.info({ userId: user._id.toString() }, 'password reset; all sessions revoked');
};
