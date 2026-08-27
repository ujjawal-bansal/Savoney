import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './db/connect.js';

const start = async (): Promise<void> => {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV, docs: env.ENABLE_DOCS ? '/api/docs' : 'disabled' },
      'savoney api listening',
    );
  });

  /**
   * Graceful shutdown.
   *
   * On SIGTERM the process stops accepting new connections but lets in-flight
   * requests finish before closing the database. Exiting immediately would
   * abort requests mid-write — during a rolling deploy that means dropped user
   * data, not just a failed response.
   */
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Backstop: if a hung keep-alive connection prevents close() from
    // completing, exit anyway rather than blocking the deploy indefinitely.
    const timer = setTimeout(() => {
      logger.error('graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    timer.unref();

    server.close(async () => {
      await disconnectDatabase();
      logger.info('shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state; log it
  // loudly and let the orchestrator restart cleanly.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'unhandled promise rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });
};

start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to start server');
  process.exit(1);
});
