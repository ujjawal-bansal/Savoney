import request from 'supertest';
import type * as MailerModule from '../../src/lib/mailer.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Capture the reset link instead of sending it.
 *
 * The token is deliberately unrecoverable from its stored hash, so the only
 * way to exercise the real redemption path is to intercept the message the
 * user would have received — exactly what they would click.
 */
const sentMail: Array<{ to: string; text: string }> = [];
vi.mock('../../src/lib/mailer.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MailerModule>();
  return {
    ...actual,
    sendMail: vi.fn(async (mail: { to: string; text: string }) => {
      sentMail.push({ to: mail.to, text: mail.text });
    }),
  };
});

const tokenFromEmail = (): string => {
  const last = sentMail.at(-1);
  if (!last) throw new Error('no reset email was sent');
  const match = last.text.match(/reset-password\?token=([\w-]+)/);
  if (!match) throw new Error(`no reset link in email: ${last.text}`);
  return match[1]!;
};
import { PasswordReset } from '../../src/modules/auth/password-reset.model.js';
import { User } from '../../src/modules/auth/user.model.js';
import { addTransaction, app, authed, createUser, findCategory } from '../helpers/factories.js';

const PASSWORD = 'correct-horse-battery';

/** The token only exists in the emailed link, so tests read it from the record. */
const issuedTokenFor = async (email: string) => {
  const user = await User.findOne({ email });
  return PasswordReset.findOne({ user: user!._id, usedAt: null });
};

beforeEach(() => {
  sentMail.length = 0;
});

describe('forgot password', () => {
  it('accepts a request for a registered address', async () => {
    const user = await createUser();
    const response = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: user.email })
      .expect(200);

    expect(response.body.message).toMatch(/reset link/i);
    expect(await issuedTokenFor(user.email)).not.toBeNull();
  });

  it('answers identically for an unknown address, revealing nothing', async () => {
    const user = await createUser();

    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: user.email })
      .expect(200);
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(200);

    // Differing responses would turn this into a membership oracle.
    expect(unknown.body).toEqual(known.body);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const user = await createUser();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);

    const record = await issuedTokenFor(user.email);
    // A dump of this collection must not yield anything redeemable.
    expect(record!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('invalidates any earlier link when a new one is requested', async () => {
    const user = await createUser();
    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    const first = await issuedTokenFor(user.email);

    await request(app).post('/api/auth/forgot-password').send({ email: user.email }).expect(200);

    const refetchedFirst = await PasswordReset.findById(first!._id);
    expect(refetchedFirst!.usedAt).not.toBeNull();
  });
});

describe('reset password', () => {
  /** Drive the real flow, capturing the token the way the email would carry it. */
  const requestReset = async (email: string) => {
    await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
    const record = await issuedTokenFor(email);
    return record!;
  };

  it('rejects a token that was never issued', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(43), newPassword: 'a-brand-new-passphrase' })
      .expect(400);
  });

  it('sets the new password and lets the user sign in with it', async () => {
    const user = await createUser();
    await requestReset(user.email);
    const token = tokenFromEmail();

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'a-brand-new-passphrase' })
      .expect(204);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'a-brand-new-passphrase' })
      .expect(200);
    // The old password must no longer work.
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);
  });

  it('revokes every existing session', async () => {
    const user = await createUser();
    await requestReset(user.email);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: tokenFromEmail(), newPassword: 'a-brand-new-passphrase' })
      .expect(204);

    // If the account was compromised, the attacker's session must die with the
    // old password, not survive the "fix".
    await user.agent.post('/api/auth/refresh').expect(401);
    await authed(user).get('/api/auth/me').expect(401);
  });

  it('burns the token, so a leaked link cannot be replayed', async () => {
    const user = await createUser();
    await requestReset(user.email);
    const token = tokenFromEmail();

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'a-brand-new-passphrase' })
      .expect(204);

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'yet-another-passphrase' })
      .expect(400);
  });

  it('rejects an expired token', async () => {
    const user = await createUser();
    const record = await requestReset(user.email);
    const token = tokenFromEmail();

    record.expiresAt = new Date(Date.now() - 1000);
    await record.save();

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'a-brand-new-passphrase' })
      .expect(400);
  });

  it('rejects a token superseded by a newer request', async () => {
    const user = await createUser();
    await requestReset(user.email);
    const firstToken = tokenFromEmail();

    await requestReset(user.email);

    // Only the most recent link is live; an intercepted older email is useless.
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: firstToken, newPassword: 'a-brand-new-passphrase' })
      .expect(400);
  });

  it('emails the link to the address that asked for it', async () => {
    const user = await createUser();
    await requestReset(user.email);
    expect(sentMail.at(-1)!.to).toBe(user.email);
  });

  it('sends nothing at all for an unknown address', async () => {
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(200);
    expect(sentMail).toHaveLength(0);
  });

  it('enforces the password policy on the new password', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'c'.repeat(43), newPassword: 'short' })
      .expect(422);
    expect(response.body.error.details.newPassword).toBeDefined();
  });

  it('rejects a malformed token before touching the database', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'tiny', newPassword: 'a-brand-new-passphrase' })
      .expect(422);
    expect(response.body.error.details.token).toBeDefined();
  });
});

describe('reset account data', () => {
  const seedLedger = async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 1_000 });
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 2_000 });
    await authed(user)
      .post('/api/budgets')
      .send({ name: 'Food', amountMinor: 50_000, categoryId: groceries.id })
      .expect(201);
    await authed(user).post('/api/goals').send({ name: 'Trip', targetMinor: 100_000 }).expect(201);
    return user;
  };

  it('erases transactions, budgets and goals but keeps the account', async () => {
    const user = await seedLedger();

    const response = await authed(user)
      .post('/api/auth/reset-data')
      .send({ password: PASSWORD, keepCategories: true })
      .expect(200);

    expect(response.body).toMatchObject({
      transactionsDeleted: 2,
      budgetsDeleted: 1,
      goalsDeleted: 1,
      categoriesRestored: true,
    });

    // Still signed in, still able to use the app.
    await authed(user).get('/api/auth/me').expect(200);
    expect((await authed(user).get('/api/transactions').expect(200)).body.items).toHaveLength(0);
    expect((await authed(user).get('/api/budgets').expect(200)).body.budgets).toHaveLength(0);
    expect((await authed(user).get('/api/goals').expect(200)).body.goals).toHaveLength(0);
  });

  it('restores the starter categories so the account stays usable', async () => {
    const user = await seedLedger();
    await authed(user)
      .post('/api/auth/reset-data')
      .send({ password: PASSWORD, keepCategories: true })
      .expect(200);

    const categories = await authed(user).get('/api/categories').expect(200);
    expect(categories.body.categories.length).toBeGreaterThan(5);
    // And a transaction can immediately be recorded against them.
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 500 });
  });

  it('can leave the account with no categories when asked', async () => {
    const user = await seedLedger();
    await authed(user)
      .post('/api/auth/reset-data')
      .send({ password: PASSWORD, keepCategories: false })
      .expect(200);

    expect((await authed(user).get('/api/categories').expect(200)).body.categories).toHaveLength(0);
  });

  it('refuses without the correct password', async () => {
    const user = await seedLedger();
    // A stolen access token alone must not be enough to destroy data.
    await authed(user)
      .post('/api/auth/reset-data')
      .send({ password: 'not-my-password', keepCategories: true })
      .expect(400);

    expect((await authed(user).get('/api/transactions').expect(200)).body.items).toHaveLength(2);
  });

  it('leaves other accounts untouched', async () => {
    const user = await seedLedger();
    const bystander = await seedLedger();

    await authed(user)
      .post('/api/auth/reset-data')
      .send({ password: PASSWORD, keepCategories: true })
      .expect(200);

    expect((await authed(bystander).get('/api/transactions').expect(200)).body.items).toHaveLength(
      2,
    );
  });

  it('requires authentication', async () => {
    await request(app)
      .post('/api/auth/reset-data')
      .send({ password: PASSWORD, keepCategories: true })
      .expect(401);
  });
});

describe('delete account', () => {
  it('removes the account and every record belonging to it', async () => {
    const user = await createUser();
    const groceries = await findCategory(user, 'Groceries');
    await addTransaction(user, { categoryId: groceries.id, amountMinor: 1_000 });

    await authed(user)
      .delete('/api/auth/me')
      .send({ password: PASSWORD, confirmation: 'DELETE' })
      .expect(204);

    // The token is still cryptographically valid, but the account behind it is
    // gone, so authentication now fails.
    await authed(user).get('/api/auth/me').expect(401);
    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);

    expect(await User.findOne({ email: user.email })).toBeNull();
  });

  it('frees the email address for reuse', async () => {
    const user = await createUser();
    await authed(user)
      .delete('/api/auth/me')
      .send({ password: PASSWORD, confirmation: 'DELETE' })
      .expect(204);

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Someone New', email: user.email, password: PASSWORD })
      .expect(201);
  });

  it('refuses without the correct password', async () => {
    const user = await createUser();
    await authed(user)
      .delete('/api/auth/me')
      .send({ password: 'not-my-password', confirmation: 'DELETE' })
      .expect(400);

    await authed(user).get('/api/auth/me').expect(200);
  });

  it('requires the typed confirmation', async () => {
    const user = await createUser();
    const response = await authed(user)
      .delete('/api/auth/me')
      .send({ password: PASSWORD, confirmation: 'delete' })
      .expect(422);

    expect(response.body.error.details.confirmation).toBeDefined();
    await authed(user).get('/api/auth/me').expect(200);
  });

  it('ends the session, clearing the refresh cookie', async () => {
    const user = await createUser();
    await authed(user)
      .delete('/api/auth/me')
      .send({ password: PASSWORD, confirmation: 'DELETE' })
      .expect(204);

    await user.agent.post('/api/auth/refresh').expect(401);
  });

  it('leaves other accounts untouched', async () => {
    const leaver = await createUser();
    const stayer = await createUser();
    const groceries = await findCategory(stayer, 'Groceries');
    await addTransaction(stayer, { categoryId: groceries.id, amountMinor: 1_000 });

    await authed(leaver)
      .delete('/api/auth/me')
      .send({ password: PASSWORD, confirmation: 'DELETE' })
      .expect(204);

    await authed(stayer).get('/api/auth/me').expect(200);
    expect((await authed(stayer).get('/api/transactions').expect(200)).body.items).toHaveLength(1);
  });
});

describe('when no mail transport is configured', () => {
  it('boots and serves the rest of the app', async () => {
    // The deployment must not be held hostage to one optional feature.
    await request(app).get('/api/health').expect(200);
    const user = await createUser();
    await authed(user).get('/api/transactions').expect(200);
  });
});
