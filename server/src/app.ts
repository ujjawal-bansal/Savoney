import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { corsOrigins, env, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { isDatabaseReady } from './db/connect.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { ApiError } from './lib/api-error.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { requestId } from './middleware/request-id.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import budgetRoutes from './modules/budgets/budget.routes.js';
import categoryRoutes from './modules/categories/category.routes.js';
import goalRoutes from './modules/goals/goal.routes.js';
import transactionRoutes from './modules/transactions/transaction.routes.js';

export const createApp = (): Express => {
  const app = express();

  // Rate limiting and logging both depend on the real client IP, which behind a
  // load balancer is only available via X-Forwarded-For. The hop count is
  // explicit rather than `true`, because trusting every proxy lets a client
  // spoof the header and evade limits entirely.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    helmet({
      // The API serves JSON to a separate origin; a restrictive CSP here would
      // only affect Swagger UI, which needs inline styles to render.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin and non-browser callers (curl, tests) send no Origin.
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        callback(new ApiError(403, `Origin ${origin} is not allowed`, 'CORS_REJECTED'));
      },
      credentials: true,
      exposedHeaders: ['x-request-id'],
    }),
  );

  app.use(compression());
  // A body limit is a denial-of-service control: without one, a single request
  // can pin the process allocating memory.
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as { id?: string }).id ?? '',
        // Health checks would otherwise dominate the log volume.
        autoLogging: { ignore: (req) => req.url === '/api/health' },
      }),
    );
  }

  app.use('/api', globalLimiter);

  /** Liveness — the process is up and serving. */
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'savoney-api', version: '2.0.0', uptime: process.uptime() });
  });

  /**
   * Readiness — the process can actually serve traffic. Separated from liveness
   * so an orchestrator restarts a wedged process but merely stops routing to
   * one that is briefly unable to reach the database.
   */
  app.get('/api/ready', (_req, res) => {
    const ready = isDatabaseReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database: ready });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/budgets', budgetRoutes);
  app.use('/api/goals', goalRoutes);
  app.use('/api/analytics', analyticsRoutes);

  if (env.ENABLE_DOCS) {
    const document = buildOpenApiDocument();
    app.get('/api/openapi.json', (_req, res) => res.json(document));
    app.use(
      '/api/docs',
      swaggerUi.serve,
      swaggerUi.setup(document, {
        customSiteTitle: 'Savoney API',
        swaggerOptions: { persistAuthorization: true },
      }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
