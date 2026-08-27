import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, authed, createUser } from '../helpers/factories.js';

const validPassword = 'correct-horse-battery';

describe('POST /api/auth/register', () => {
  it('creates an account, returns an access token, and seeds starter categories', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: validPassword })
      .expect(201);

    expect(response.body.user).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com' });
    expect(response.body.accessToken).toBeTruthy();
    // The password hash must never appear in a response body.
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const categories = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(categories.body.categories.length).toBeGreaterThan(5);
  });

  it('sets the refresh token as an httpOnly cookie, not in the body', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Grace Hopper', email: 'grace@example.com', password: validPassword })
      .expect(201);

    const cookies = response.headers['set-cookie'] as unknown as string[];
    const refreshCookie = cookies.find((c) => c.startsWith('savoney_refresh='));

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(response.body.refreshToken).toBeUndefined();
  });

  it('rejects a password below the length policy', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short', email: 'short@example.com', password: 'abc123' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.password).toBeDefined();
  });

  it('rejects a known-breached password even when long enough', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak', email: 'weak@example.com', password: 'password123' })
      .expect(422);
  });

  it('refuses a duplicate email', async () => {
    const payload = { name: 'First', email: 'dupe@example.com', password: validPassword };
    await request(app).post('/api/auth/register').send(payload).expect(201);

    const response = await request(app).post('/api/auth/register').send(payload).expect(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('normalises email casing so Ada@ and ada@ are one account', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Case', email: 'Case@Example.com', password: validPassword })
      .expect(201);

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Case', email: 'case@example.com', password: validPassword })
      .expect(409);
  });
});

describe('POST /api/auth/login', () => {
  it('returns an access token for valid credentials', async () => {
    const user = await createUser();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: validPassword })
      .expect(200);

    expect(response.body.accessToken).toBeTruthy();
  });

  it('gives the same generic error for a wrong password and an unknown account', async () => {
    const user = await createUser();

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'definitely-not-it' })
      .expect(401);

    const unknownUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: validPassword })
      .expect(401);

    // Differing messages would let an attacker enumerate registered addresses.
    expect(wrongPassword.body.error.message).toBe(unknownUser.body.error.message);
  });
});

describe('refresh token rotation', () => {
  it('issues a new token pair and invalidates the presented one', async () => {
    const user = await createUser();

    const first = await user.agent.post('/api/auth/refresh').expect(200);
    expect(first.body.accessToken).toBeTruthy();

    // The agent now holds the rotated cookie; the next refresh must also work.
    const second = await user.agent.post('/api/auth/refresh').expect(200);
    expect(second.body.accessToken).toBeTruthy();
  });

  it('revokes the whole session family when a rotated token is replayed', async () => {
    const user = await createUser();

    // Snapshot the current cookie, then rotate it. The snapshot is now spent.
    const spent = await user.agent.post('/api/auth/refresh').expect(200);
    const spentCookie = (spent.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;

    // The legitimate client rotates again and stays healthy.
    await user.agent.post('/api/auth/refresh').expect(200);

    // Replaying the superseded token looks exactly like a stolen-token replay,
    // so the entire family is revoked.
    await request(app).post('/api/auth/refresh').set('Cookie', spentCookie).expect(401);

    // The legitimate client is signed out too — we cannot tell which side was
    // the attacker, and leaving the session alive would favour the thief.
    await user.agent.post('/api/auth/refresh').expect(401);
  });

  it('rejects a refresh attempt with no cookie', async () => {
    const response = await request(app).post('/api/auth/refresh').expect(401);
    expect(response.body.error.code).toBe('NO_SESSION');
  });
});

describe('protected routes', () => {
  it('rejects a request with no token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('rejects a tampered token', async () => {
    const user = await createUser();
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.token.slice(0, -4)}AAAA`)
      .expect(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('does not accept the refresh cookie as request authorisation', async () => {
    const user = await createUser();
    // The agent carries the refresh cookie but sends no Authorization header.
    // Accepting it here would make every mutating endpoint CSRF-vulnerable.
    await user.agent.get('/api/auth/me').expect(401);
  });
});

describe('password change', () => {
  it('changes the password and revokes existing sessions', async () => {
    const user = await createUser();

    await authed(user)
      .post('/api/auth/change-password')
      .send({ currentPassword: validPassword, newPassword: 'a-brand-new-passphrase' })
      .expect(204);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: validPassword })
      .expect(401);

    await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'a-brand-new-passphrase' })
      .expect(200);

    // The old session's refresh token must no longer rotate.
    await user.agent.post('/api/auth/refresh').expect(401);
  });

  it('refuses when the current password is wrong', async () => {
    const user = await createUser();
    await authed(user)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'wrong-password-here', newPassword: 'another-good-passphrase' })
      .expect(400);
  });
});

describe('session revocation kills live access tokens', () => {
  it('invalidates an existing access token when the password changes', async () => {
    const user = await createUser();
    // The token is still cryptographically valid and unexpired.
    await authed(user).get('/api/auth/me').expect(200);

    await authed(user)
      .post('/api/auth/change-password')
      .send({ currentPassword: validPassword, newPassword: 'a-brand-new-passphrase' })
      .expect(204);

    // Revoking only refresh tokens would leave a thief signed in until this
    // access token expired, which defeats the point of changing the password.
    const response = await authed(user).get('/api/auth/me').expect(401);
    expect(response.body.error.code).toBe('SESSION_REVOKED');
  });

  it('invalidates an existing access token on sign out everywhere', async () => {
    const user = await createUser();
    await authed(user).post('/api/auth/logout-all').expect(204);
    await authed(user).get('/api/auth/me').expect(401);
  });

  it('leaves a freshly issued token working after the bump', async () => {
    const user = await createUser();
    await authed(user).post('/api/auth/logout-all').expect(204);

    // Signing in again must work immediately, in the same second — a
    // timestamp-based cutoff could not guarantee this.
    const fresh = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: validPassword })
      .expect(200);

    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .expect(200);
  });

  it('does not affect other accounts', async () => {
    const user = await createUser();
    const bystander = await createUser();
    await authed(user).post('/api/auth/logout-all').expect(204);
    await authed(bystander).get('/api/auth/me').expect(200);
  });
});
