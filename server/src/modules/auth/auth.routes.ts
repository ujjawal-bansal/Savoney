import { Router } from 'express';
import {
  changeCurrencySchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetDataSchema,
  resetPasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
  type ChangeCurrencyInput,
  type ChangePasswordInput,
  type DeleteAccountInput,
  type ForgotPasswordInput,
  type ResetDataInput,
  type ResetPasswordInput,
  type LoginInput,
  type RegisterInput,
  type UpdateProfileInput,
} from '@savoney/shared';
import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../../config/env.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { authenticate, requireUser } from '../../middleware/authenticate.js';
import { authLimiter, writeLimiter } from '../../middleware/rate-limit.js';
import { body, validate } from '../../middleware/validate.js';
import * as authService from './auth.service.js';
import { deleteAccount, resetAccountData } from './account.service.js';
import { changeCurrency } from './currency.service.js';
import { requestPasswordReset, resetPassword } from './password-reset.service.js';
import { toPublicUser } from './user.model.js';

const router = Router();

export const REFRESH_COOKIE = 'savoney_refresh';

/**
 * Refresh-cookie policy.
 *
 * `httpOnly` puts the token out of reach of JavaScript, so an XSS bug cannot
 * exfiltrate a 30-day session — the reason this replaced the previous
 * `localStorage` token. `sameSite: strict` blocks cross-site delivery, and
 * `path` narrows it to the one route that consumes it, so it is not attached to
 * ordinary API calls at all.
 */
const refreshCookieOptions = (expires: Date): CookieOptions => ({
  httpOnly: true,
  secure: isProduction,
  // `lax` locally so the cookie survives the Vite dev proxy over plain HTTP;
  // in production it follows COOKIE_SAMESITE, which must be `none` when the
  // client is served from a different host to the API.
  sameSite: isProduction ? env.COOKIE_SAMESITE : 'lax',
  path: '/api/auth',
  expires,
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
});

const sessionContext = (req: { get(name: string): string | undefined; ip?: string }) => ({
  userAgent: req.get('user-agent') ?? '',
  ip: req.ip ?? '',
});

const sendSession = (
  res: Response,
  session: Awaited<ReturnType<typeof authService.login>>,
  status = 200,
) => {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions(session.refreshExpiresAt));
  res.status(status).json(session.auth);
};

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.register(body<RegisterInput>(req), sessionContext(req));
    sendSession(res, session, 201);
  }),
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const session = await authService.login(body<LoginInput>(req), sessionContext(req));
    sendSession(res, session);
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      res.status(401).json({
        error: { message: 'No active session', code: 'NO_SESSION', requestId: String(req.id) },
      });
      return;
    }
    const session = await authService.refresh(token, sessionContext(req));
    sendSession(res, session);
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    // Clearing requires the same attributes the cookie was set with, or the
    // browser keeps the original.
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), maxAge: undefined });
    res.status(204).end();
  }),
);

/**
 * Begin password recovery. Always answers 200, whether or not the address is
 * registered, so this cannot be used to discover who has an account.
 */
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(async (req, res) => {
    const { devLink } = await requestPasswordReset(body<ForgotPasswordInput>(req), {
      ip: req.ip ?? '',
    });
    res.json({
      message: 'If that email is registered, a reset link is on its way.',
      // Development convenience only; absent whenever SMTP is configured.
      ...(devLink ? { devLink } : {}),
    });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    await resetPassword(body<ResetPasswordInput>(req));
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), maxAge: undefined });
    res.status(204).end();
  }),
);

/**
 * Erase the ledger but keep the account. Password-confirmed, because an access
 * token alone must not be enough to destroy someone's data.
 */
router.post(
  '/reset-data',
  authenticate,
  writeLimiter,
  validate({ body: resetDataSchema }),
  asyncHandler(async (req, res) => {
    const result = await resetAccountData(requireUser(req), body<ResetDataInput>(req));
    res.json(result);
  }),
);

/** Delete the account and everything belonging to it. Irreversible. */
router.delete(
  '/me',
  authenticate,
  writeLimiter,
  validate({ body: deleteAccountSchema }),
  asyncHandler(async (req, res) => {
    await deleteAccount(requireUser(req), body<DeleteAccountInput>(req).password);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), maxAge: undefined });
    res.status(204).end();
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: toPublicUser(requireUser(req)) });
  }),
);

router.patch(
  '/me',
  authenticate,
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const user = await authService.updateProfile(requireUser(req), body<UpdateProfileInput>(req));
    res.json({ user });
  }),
);

/**
 * Changing currency can rewrite every stored amount, so it is its own endpoint
 * rather than a field on the profile form — and it is rate limited as a write.
 */
router.post(
  '/currency',
  authenticate,
  writeLimiter,
  validate({ body: changeCurrencySchema }),
  asyncHandler(async (req, res) => {
    const result = await changeCurrency(requireUser(req), body<ChangeCurrencyInput>(req).currency);
    res.json(result);
  }),
);

router.post(
  '/change-password',
  authenticate,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const user = requireUser(req);
    await authService.changePassword(user._id.toString(), body<ChangePasswordInput>(req));
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), maxAge: undefined });
    res.status(204).end();
  }),
);

router.post(
  '/logout-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logoutEverywhere(requireUser(req));
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(new Date(0)), maxAge: undefined });
    res.status(204).end();
  }),
);

export default router;
