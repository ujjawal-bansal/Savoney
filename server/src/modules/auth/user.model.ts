import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CURRENCIES, DEFAULT_CURRENCY, type PublicUser } from '@savoney/shared';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * `select: false` keeps the hash out of every query result by default, so
     * it cannot leak through a handler that forgot to project it away. The two
     * places that need it opt in explicitly with `.select('+passwordHash')`.
     */
    passwordHash: { type: String, required: true, select: false },
    currency: { type: String, enum: CURRENCIES, default: DEFAULT_CURRENCY },
    monthlyIncomeTargetMinor: { type: Number, default: 0, min: 0 },
    /**
     * Session generation. Every token carries the epoch it was minted under;
     * incrementing this invalidates all of them at once.
     *
     * An integer rather than a timestamp because JWT `iat` has one-second
     * granularity: a time-based cutoff cannot distinguish a token issued in the
     * same second as the revocation, so either it leaks a one-second window or
     * it rejects the user's very next login. Comparing exact integers has
     * neither problem.
     */
    sessionEpoch: { type: Number, default: 0 },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserAttributes = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserAttributes>;

/** Project a user document down to the fields the client is allowed to see. */
export const toPublicUser = (user: UserDocument): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  currency: user.currency as PublicUser['currency'],
  monthlyIncomeTargetMinor: user.monthlyIncomeTargetMinor,
  createdAt: (user.get('createdAt') as Date).toISOString(),
});

export const User = model('User', userSchema);
