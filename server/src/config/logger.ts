import { pino } from 'pino';
import { env, isProduction, isTest } from './env.js';

/**
 * Structured JSON logging in production so records are queryable in a log
 * aggregator; pretty-printed lines in development because a human is reading
 * them. Tests stay silent unless something actually breaks.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'savoney-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  /**
   * Never let a credential reach the log sink. Redaction happens at the
   * serialiser, so it also covers objects logged incidentally inside errors.
   */
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.accessToken',
      '*.refreshToken',
      '*.passwordHash',
    ],
    censor: '[redacted]',
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }),
});
