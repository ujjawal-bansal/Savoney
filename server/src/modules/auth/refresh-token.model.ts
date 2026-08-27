import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /**
     * SHA-256 of the token's `jti`, never the token itself. A dump of this
     * collection therefore yields nothing an attacker can replay.
     */
    tokenHash: { type: String, required: true, unique: true },
    /**
     * Every token descended from one login shares a family id. Detecting reuse
     * of a rotated token lets us revoke the whole family — that is, the single
     * compromised session — instead of all of the user's devices.
     */
    family: { type: String, required: true, index: true },
    /** Session generation at mint time; a bump invalidates this record. */
    epoch: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    /** Set when this token is rotated, forming an audit chain. */
    replacedByHash: { type: String, default: null },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: true },
);

/** Mongo reaps expired sessions on its own; no cleanup job to forget to run. */
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenAttributes = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDocument = HydratedDocument<RefreshTokenAttributes>;

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
export { Types };
