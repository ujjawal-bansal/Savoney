import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * `Algorithm` is an ambient `const enum`, which cannot be imported as a value
 * under `verbatimModuleSyntax` — the declaration is erased at build time and
 * there is no runtime object to read. The numeric value is part of the
 * library's public type contract (Argon2d=0, Argon2i=1, Argon2id=2).
 */
const ARGON2ID = 2 as Algorithm;

/**
 * Argon2id at the OWASP-recommended baseline: 19 MiB, 2 iterations, 1 lane.
 *
 * Argon2id rather than bcrypt because it is memory-hard — a GPU or ASIC farm
 * cannot parallelise it cheaply — and because it has no 72-byte input
 * truncation. `@node-rs/argon2` ships prebuilt binaries, so there is no
 * node-gyp toolchain requirement in CI or in the container image.
 */
const PRODUCTION_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Minimal work factor for the test environment only.
 *
 * Password hashing is expensive by design. A suite that registers a user in
 * almost every test, across parallel workers, ends up CPU-bound on the KDF
 * rather than on the code under test — slow enough that tests intermittently
 * exceeded their timeout. Cost parameters are encoded into each stored hash, so
 * hashing and verification are still exercised end to end; only the number of
 * rounds changes, and only when NODE_ENV is exactly `test`.
 */
const TEST_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 512,
  timeCost: 1,
  parallelism: 1,
} as const;

const OPTIONS = process.env.NODE_ENV === 'test' ? TEST_OPTIONS : PRODUCTION_OPTIONS;

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS);

/**
 * Verify a password. Returns false rather than throwing on a malformed stored
 * hash, so a corrupt record fails closed as a normal auth failure.
 *
 * No options are passed: Argon2 reads the cost parameters back out of the
 * encoded hash, which is what lets the work factor be raised later without
 * invalidating existing passwords.
 */
export const verifyPassword = async (storedHash: string, plain: string): Promise<boolean> => {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
};

/**
 * A decoy hash, computed once at startup with the active parameters.
 *
 * Hardcoding one would embed fixed cost parameters, and verification reads its
 * cost from the hash — so a hardcoded decoy would take production time even in
 * tests, and would stop matching real cost if the parameters were ever raised.
 */
const decoyHash: Promise<string> = hashPassword('savoney-timing-decoy');

/**
 * Burn the same CPU as a real verification when the account does not exist.
 *
 * Without this, "no such user" returns in microseconds while a real user takes
 * tens of milliseconds, and that gap alone lets an attacker enumerate which
 * email addresses are registered.
 */
export const fakeVerify = async (plain: string): Promise<void> => {
  await verifyPassword(await decoyHash, plain);
};
