import { MongoBinary } from 'mongodb-memory-server-core';

/** Pinned so a cache miss cannot pull a different MongoDB and change behaviour. */
export const MONGO_VERSION = '8.0.4';

/**
 * Download the MongoDB binary once, before any worker starts.
 *
 * Test files run in parallel forks and each starts its own `MongoMemoryServer`
 * for full isolation. Left to themselves, those forks race for the shared
 * binary-cache lock (`~/.cache/mongodb-binaries/<version>.lock`) on a cold
 * cache and the whole suite dies with `UnableToUnlockLockfileError`. Resolving
 * the binary here means every fork finds it already present and never takes
 * the download path.
 */
export default async function setup() {
  await MongoBinary.getPath({ version: MONGO_VERSION });
}
