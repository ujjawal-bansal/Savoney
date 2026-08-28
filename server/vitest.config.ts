import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Forks keep native module state (argon2) and Mongoose's model registry
    // cleanly isolated between files.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts', // process bootstrap: signal handling, listen
        'src/docs/**', // generated OpenAPI document
        'src/types/**', // ambient declarations, no runtime
        'src/db/seed.ts', // developer script, not application code
        'src/db/connect.ts', // real driver connection; the suite supplies its own
        'src/config/env.ts', // validates and process.exit()s at import time
        'src/middleware/rate-limit.ts', // deliberately disabled under test
      ],
      /**
       * Set just below current levels so they ratchet: a change that reduces
       * coverage fails, but the numbers are not aspirational fiction. Branch
       * coverage sits lower because much of it is defensive fallbacks whose
       * absent side is unreachable in practice.
       */
      thresholds: { statements: 85, functions: 85, branches: 65, lines: 85 },
    },
  },
});
