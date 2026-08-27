import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const passwordResetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /**
     * SHA-256 of the token that was emailed, never the token itself. A dump of
     * this collection therefore yields nothing an attacker can redeem.
     */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    /** Set the moment it is redeemed, making the token single use. */
    usedAt: { type: Date, default: null },
    requestedIp: { type: String, default: '' },
  },
  { timestamps: true },
);

/** Mongo reaps expired tokens on its own; no cleanup job to forget to run. */
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetAttributes = InferSchemaType<typeof passwordResetSchema>;
export type PasswordResetDocument = HydratedDocument<PasswordResetAttributes>;

export const PasswordReset = model('PasswordReset', passwordResetSchema);
