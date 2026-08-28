import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Environment contract.
 *
 * The process refuses to boot on an invalid environment rather than failing
 * later at the first request that happens to touch a missing value. A typo in
 * a deploy variable should surface as a clear startup error, not a 500 at 3am.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    HOST: z.string().default('0.0.0.0'),

    MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

    /**
     * Secrets are separate so that rotating the refresh secret (invalidating
     * every session) does not have to invalidate in-flight access tokens, and
     * so a leaked access secret cannot be used to mint refresh tokens.
     */
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),

    /** Comma-separated list of browser origins allowed to send credentials. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),

    /**
     * SameSite policy for the refresh cookie.
     *
     * `strict` is correct when the browser reaches the API on the same origin
     * as the app, which is the recommended deployment (a proxy or rewrite in
     * front of both). If the client is served from a *different* host to the
     * API, a strict cookie is simply never sent and session restore silently
     * fails on every reload, so such a deployment must set `none`.
     *
     * `none` is safe here: the API authorises requests by `Authorization`
     * header only and never by cookie, so an attacker's cross-site request can
     * trigger a refresh but cannot read the response past CORS.
     */
    COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),

    /** Set behind a reverse proxy so rate limiting reads the real client IP. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    /**
     * Where password-reset links point. This is the browser-facing origin, not
     * the API's, because the link is opened by a person.
     */
    APP_URL: z.string().default('http://localhost:5173'),

    /**
     * SMTP connection string, e.g. smtps://user:pass@smtp.example.com:465
     * Leave unset in development: reset links are then written to the log
     * instead of sent, so the flow is fully usable without a mail account.
     */
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default('Savoney <no-reply@savoney.app>'),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
    ENABLE_DOCS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    // Guard-rails that only make sense once real user data is involved.
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'Access and refresh secrets must differ in production',
      });
    }
    if (!value.SMTP_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_URL'],
        message: 'SMTP_URL is required in production, or password reset emails cannot be delivered',
      });
    }
    // `SameSite=None` is only honoured on a Secure cookie, which needs HTTPS.
    if (value.COOKIE_SAMESITE === 'none' && !value.APP_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SAMESITE'],
        message: 'SameSite=None requires HTTPS; set APP_URL to an https:// origin',
      });
    }
    if (value.CORS_ORIGINS.includes('localhost')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Refusing to allow a localhost origin in production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  • ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
  // Bypass the logger: it depends on this module, and a config failure must be
  // legible even when nothing else has initialised.
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  console.error('Copy server/.env.example to server/.env and fill in the blanks.\n');
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
