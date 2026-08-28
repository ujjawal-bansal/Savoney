import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  analyticsQuerySchema,
  bulkDeleteSchema,
  categoryQuerySchema,
  changeCurrencySchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  resetDataSchema,
  resetPasswordSchema,
  contributeGoalSchema,
  createBudgetSchema,
  createCategorySchema,
  createGoalSchema,
  createTransactionSchema,
  loginSchema,
  registerSchema,
  transactionQuerySchema,
  trendQuerySchema,
  updateBudgetSchema,
  updateCategorySchema,
  updateGoalSchema,
  updateProfileSchema,
} from '@savoney/shared';

extendZodWithOpenApi(z);

/**
 * The OpenAPI document is generated from the very Zod schemas the routes
 * validate against, so the published contract cannot drift from the behaviour.
 * Hand-maintained API docs go stale the first time a field is added; these
 * cannot.
 */
const registry = new OpenAPIRegistry();

const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string(),
    details: z.record(z.string(), z.array(z.string())).optional(),
    requestId: z.string().optional(),
  }),
});

const jsonBody = (schema: z.ZodType) => ({
  content: { 'application/json': { schema } },
});

const errorResponses = {
  400: { description: 'Malformed request', ...jsonBody(errorSchema) },
  401: { description: 'Authentication required or expired', ...jsonBody(errorSchema) },
  404: { description: 'Resource not found', ...jsonBody(errorSchema) },
  409: { description: 'Conflicts with existing data', ...jsonBody(errorSchema) },
  422: { description: 'Validation failed', ...jsonBody(errorSchema) },
  429: { description: 'Rate limit exceeded', ...jsonBody(errorSchema) },
};

const secured = [{ [bearerAuth.name]: [] }];

interface RouteSpec {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  body?: z.ZodType;
  // Narrower than ZodType: the generator reads a shape off query schemas to emit
  // individual parameters. Every query schema here is an object, refinements included.
  query?: z.ZodObject<z.core.$ZodLooseShape>;
  hasId?: boolean;
  public?: boolean;
  status?: number;
}

const ROUTES: RouteSpec[] = [
  {
    method: 'post',
    path: '/auth/register',
    tag: 'Auth',
    summary: 'Create an account',
    body: registerSchema,
    public: true,
    status: 201,
  },
  {
    method: 'post',
    path: '/auth/login',
    tag: 'Auth',
    summary: 'Sign in and receive an access token',
    body: loginSchema,
    public: true,
  },
  {
    method: 'post',
    path: '/auth/refresh',
    tag: 'Auth',
    summary: 'Rotate the refresh cookie for a new access token',
    public: true,
  },
  {
    method: 'post',
    path: '/auth/logout',
    tag: 'Auth',
    summary: 'End the current session',
    public: true,
    status: 204,
  },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Fetch the signed-in user' },
  {
    method: 'patch',
    path: '/auth/me',
    tag: 'Auth',
    summary: 'Update profile settings',
    body: updateProfileSchema,
  },
  {
    method: 'post',
    path: '/auth/change-password',
    tag: 'Auth',
    summary: 'Change password and revoke all sessions',
    body: changePasswordSchema,
    status: 204,
  },
  {
    method: 'post',
    path: '/auth/forgot-password',
    tag: 'Auth',
    summary:
      'Request a password reset link (always succeeds, never reveals whether the account exists)',
    body: forgotPasswordSchema,
    public: true,
  },
  {
    method: 'post',
    path: '/auth/reset-password',
    tag: 'Auth',
    summary: 'Redeem a reset token, set a new password and revoke every session',
    body: resetPasswordSchema,
    public: true,
    status: 204,
  },
  {
    method: 'post',
    path: '/auth/reset-data',
    tag: 'Auth',
    summary: 'Delete all transactions, budgets and goals, keeping the account',
    body: resetDataSchema,
  },
  {
    method: 'delete',
    path: '/auth/me',
    tag: 'Auth',
    summary: 'Permanently delete the account and all of its data',
    body: deleteAccountSchema,
    status: 204,
  },
  {
    method: 'post',
    path: '/auth/currency',
    tag: 'Auth',
    summary: 'Change account currency, rescaling stored amounts when the exponent differs',
    body: changeCurrencySchema,
  },
  {
    method: 'post',
    path: '/auth/logout-all',
    tag: 'Auth',
    summary: 'Revoke every session on every device',
    status: 204,
  },

  {
    method: 'get',
    path: '/categories',
    tag: 'Categories',
    summary: 'List categories with usage counts',
    query: categoryQuerySchema,
  },
  {
    method: 'post',
    path: '/categories',
    tag: 'Categories',
    summary: 'Create a category',
    body: createCategorySchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/categories/{id}',
    tag: 'Categories',
    summary: 'Update a category',
    body: updateCategorySchema,
    hasId: true,
  },
  {
    method: 'delete',
    path: '/categories/{id}',
    tag: 'Categories',
    summary: 'Delete a category, optionally reassigning its transactions',
    hasId: true,
  },

  {
    method: 'get',
    path: '/transactions',
    tag: 'Transactions',
    summary: 'List transactions with filtering, search and pagination',
    query: transactionQuerySchema,
  },
  {
    method: 'post',
    path: '/transactions',
    tag: 'Transactions',
    summary: 'Record a transaction',
    body: createTransactionSchema,
    status: 201,
  },
  {
    method: 'get',
    path: '/transactions/export',
    tag: 'Transactions',
    summary: 'Export the full ledger as CSV',
  },
  {
    method: 'post',
    path: '/transactions/import',
    tag: 'Transactions',
    summary: 'Import transactions from CSV',
  },
  {
    method: 'get',
    path: '/transactions/{id}',
    tag: 'Transactions',
    summary: 'Fetch one transaction',
    hasId: true,
  },
  {
    method: 'patch',
    path: '/transactions/{id}',
    tag: 'Transactions',
    summary: 'Update a transaction',
    body: createTransactionSchema.partial(),
    hasId: true,
  },
  {
    method: 'delete',
    path: '/transactions/{id}',
    tag: 'Transactions',
    summary: 'Delete a transaction',
    hasId: true,
    status: 204,
  },
  {
    method: 'post',
    path: '/transactions/bulk-delete',
    tag: 'Transactions',
    summary: 'Delete many transactions at once',
    body: bulkDeleteSchema,
  },

  {
    method: 'get',
    path: '/budgets',
    tag: 'Budgets',
    summary: 'List budgets with live spend and projections',
  },
  {
    method: 'post',
    path: '/budgets',
    tag: 'Budgets',
    summary: 'Create a budget',
    body: createBudgetSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/budgets/{id}',
    tag: 'Budgets',
    summary: 'Update a budget',
    body: updateBudgetSchema,
    hasId: true,
  },
  {
    method: 'delete',
    path: '/budgets/{id}',
    tag: 'Budgets',
    summary: 'Delete a budget',
    hasId: true,
    status: 204,
  },

  { method: 'get', path: '/goals', tag: 'Goals', summary: 'List savings goals' },
  {
    method: 'post',
    path: '/goals',
    tag: 'Goals',
    summary: 'Create a savings goal',
    body: createGoalSchema,
    status: 201,
  },
  {
    method: 'patch',
    path: '/goals/{id}',
    tag: 'Goals',
    summary: 'Update a goal',
    body: updateGoalSchema,
    hasId: true,
  },
  {
    method: 'post',
    path: '/goals/{id}/contribute',
    tag: 'Goals',
    summary: 'Add to or withdraw from a goal',
    body: contributeGoalSchema,
    hasId: true,
  },
  {
    method: 'delete',
    path: '/goals/{id}',
    tag: 'Goals',
    summary: 'Delete a goal',
    hasId: true,
    status: 204,
  },

  {
    method: 'get',
    path: '/analytics/summary',
    tag: 'Analytics',
    summary: 'Totals, savings rate and period-over-period deltas',
    query: analyticsQuerySchema,
  },
  {
    method: 'get',
    path: '/analytics/breakdown',
    tag: 'Analytics',
    summary: 'Spend grouped by category',
    query: analyticsQuerySchema,
  },
  {
    method: 'get',
    path: '/analytics/trend',
    tag: 'Analytics',
    summary: 'Income and expense bucketed over time',
    query: trendQuerySchema,
  },
];

for (const route of ROUTES) {
  registry.registerPath({
    method: route.method,
    path: route.path,
    tags: [route.tag],
    summary: route.summary,
    ...(route.public ? {} : { security: secured }),
    request: {
      ...(route.body ? { body: { content: { 'application/json': { schema: route.body } } } } : {}),
      ...(route.query ? { query: route.query } : {}),
      ...(route.hasId
        ? { params: z.object({ id: z.string().describe('24-character hex ObjectId') }) }
        : {}),
    },
    responses: {
      [route.status ?? 200]: { description: 'Success' },
      ...errorResponses,
    },
  });
}

export const buildOpenApiDocument = () =>
  new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Savoney API',
      version: '2.0.0',
      description: [
        'Personal finance API.',
        '',
        '**Money is always expressed in integer minor units** (cents for USD). ',
        'A $12.34 expense is sent as `amountMinor: 1234`. Floating-point amounts are rejected.',
        '',
        'Authenticate with `Authorization: Bearer <accessToken>`. Access tokens are short-lived; ',
        'call `POST /auth/refresh` (which uses the httpOnly refresh cookie) to obtain a new one.',
      ].join('\n'),
    },
    servers: [{ url: '/api', description: 'Current host' }],
    tags: [
      { name: 'Auth', description: 'Registration, sessions and profile' },
      { name: 'Transactions', description: 'The ledger, including CSV import and export' },
      { name: 'Categories', description: 'Classification of income and spending' },
      { name: 'Budgets', description: 'Spending limits with live progress' },
      { name: 'Goals', description: 'Savings targets' },
      { name: 'Analytics', description: 'Aggregated reporting' },
    ],
  });
