import { z } from 'zod';
import { CURRENCIES, DEFAULT_CURRENCY } from '../money.js';

export const emailSchema = z
  .email('Please provide a valid email address')
  .trim()
  .toLowerCase()
  .max(254, 'Email address is too long');

/**
 * Password policy: length is the control that actually matters, so we require
 * 10 characters rather than the usual 6, and reject the handful of passwords
 * that dominate every breach corpus. We deliberately do *not* mandate symbol
 * classes — they push users toward `Password1!` and measurably reduce entropy.
 */
const WORST_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'iloveyou123',
  'admin12345',
]);

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200, 'Password must be at most 200 characters')
  .refine((v) => !WORST_PASSWORDS.has(v.toLowerCase()), {
    message: 'That password appears in known breach lists. Please choose another.',
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: emailSchema,
  password: passwordSchema,
  currency: z.enum(CURRENCIES).default(DEFAULT_CURRENCY),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Login intentionally uses a loose password rule: policy is enforced at
  // registration, and applying it here would leak which accounts are legacy.
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    monthlyIncomeTargetMinor: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No changes supplied' });

/**
 * Changing currency is deliberately its own operation rather than a field on
 * the profile form. Every stored amount is an integer in the account's
 * currency, so switching to a currency with a different exponent has to rewrite
 * the whole ledger — that is a migration, and it should not be reachable by
 * accident from a form that also renames the user.
 */
export const changeCurrencySchema = z.object({
  currency: z.enum(CURRENCIES),
  /**
   * The client must acknowledge that this relabels amounts rather than
   * converting them at an exchange rate.
   */
  confirmRelabel: z.literal(true, {
    error: 'You must confirm that amounts are relabelled, not converted',
  }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeCurrencyInput = z.infer<typeof changeCurrencySchema>;

/** Step one of recovery: ask for a reset link. */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/**
 * Step two: redeem the emailed token.
 *
 * The token is opaque to the client and single use. A successful reset revokes
 * every session, on the assumption that the account may have been compromised.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'That reset link is not valid').max(200),
  newPassword: passwordSchema,
});

/**
 * Destructive account actions re-ask for the password.
 *
 * An access token alone must not be enough to erase someone's financial
 * history: if a token is ever stolen, the blast radius should stop short of
 * data destruction. Re-authentication is the standard guard.
 */
export const resetDataSchema = z.object({
  password: z.string().min(1, 'Your password is required to confirm'),
  /** Recreate the starter categories so the account stays usable afterwards. */
  keepCategories: z.boolean().default(true),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Your password is required to confirm'),
  /** Typing the word is a deliberate speed bump against a misclick. */
  confirmation: z.literal('DELETE', {
    error: 'Type DELETE to confirm',
  }),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetDataInput = z.infer<typeof resetDataSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export interface ResetDataResult {
  transactionsDeleted: number;
  budgetsDeleted: number;
  goalsDeleted: number;
  categoriesRestored: boolean;
}

export interface ChangeCurrencyResult {
  user: PublicUser;
  /** True when stored amounts had to be rewritten (differing exponents). */
  rescaled: boolean;
  transactionsUpdated: number;
  budgetsUpdated: number;
  goalsUpdated: number;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  currency: (typeof CURRENCIES)[number];
  monthlyIncomeTargetMinor: number;
  createdAt: string;
}

/**
 * The access token is returned in the body and held in memory by the client;
 * the refresh token travels only as an httpOnly cookie and never appears here.
 */
export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
}
