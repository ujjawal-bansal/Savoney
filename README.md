# Savoney

A personal finance platform for tracking income, spending, budgets and savings goals — built as a TypeScript monorepo with an Express/MongoDB API and a React 19 dashboard.

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-087ea4?logo=react&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node-22-5fa04e?logo=node.js&logoColor=white">
  <img alt="Express" src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-8-47a248?logo=mongodb&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-230%20passing-16a34a">
</p>

---

## What it does

- **Ledger** — income and expense transactions with categories, tags, notes, recurrence, full-text search, faceted filtering, sorting and pagination
- **Budgets** — per-category spending limits with live spend, burn-rate projection, a safe daily allowance, and at-risk/over-budget states
- **Goals** — savings targets with contributions, withdrawals, and the monthly amount needed to hit a deadline
- **Analytics** — aggregated totals, savings rate, period-over-period deltas, category breakdowns and bucketed trends over any date range
- **CSV import/export** — round-trippable, with per-row error reporting so one malformed line doesn't sink a 500-row import
- **Accounts** — registration, rotating sessions, password change, global sign-out, emailed password recovery, data reset and account deletion

---

## Engineering decisions

The parts of this project worth reading, and why they are the way they are.

### Money is never a floating-point number

Every monetary value — in the database, over HTTP, and in the React tree — is an **integer count of minor units** (cents). `$12.34` is `1234`.

```js
0.1 + 0.2 + 0.3 === 0.6; // false — 0.6000000000000001
```

A ledger that cannot reconcile is a broken ledger, and float drift compounds across every sum. The API **rejects** fractional amounts rather than silently rounding them, so a client bug surfaces as a `422` instead of a cent that quietly disappears. Parsing is digit-wise (`shared/src/money.ts`) because `Math.round(12.345 * 100)` is subject to the very error the design exists to avoid.

### Auth: short-lived access tokens, rotating refresh tokens, reuse detection

| Concern          | Approach                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Password storage | Argon2id (19 MiB, t=2, p=1) — memory-hard, no bcrypt 72-byte truncation  |
| Access token     | 15-minute JWT, held **in memory** on the client, never in `localStorage` |
| Refresh token    | 30-day `httpOnly` cookie, `SameSite=Strict`, scoped to `/api/auth`       |
| Rotation         | Single-use: each refresh issues a new pair and revokes the old           |
| Theft response   | Replaying a rotated token revokes the **whole session family**           |
| Storage          | Only a SHA-256 digest of the token `jti` is persisted                    |

Anything in `localStorage` is readable by any script on the page, so one XSS bug hands over a session. Keeping the access token in a module variable puts it out of reach, and the durable half of the session lives in a cookie the page cannot read at all.

The refresh cookie is **not** accepted as request authorisation — only the `Authorization` header is. Because browsers attach cookies automatically but not headers, the API is CSRF-safe by construction.

Rotation and parallel data fetching would collide (five dashboard queries → five concurrent refreshes → four replays of a rotated token → session killed as suspected theft), so the client collapses concurrent refreshes into a **single in-flight promise** (`client/src/lib/api.ts`).

### Aggregation in the database, not in Node

The previous version loaded every transaction into the API process and summed it in JavaScript. That is O(n) documents over the wire and O(n) memory for a single number. All reporting now runs as MongoDB aggregation pipelines — `$group`, `$lookup` after grouping, `$dateTrunc` for time buckets — returning a handful of rows regardless of ledger size.

Budget spend is **computed at read time**, never denormalised onto the budget document. A stored counter must be updated on every transaction create, edit, delete, category move and date change; miss one path and the number is silently wrong forever — which, for a budget, is worse than useless.

### Indexes follow the queries

Every query is scoped to one user, so `user` leads each compound index and the second field is whatever is then filtered or sorted on. The default listing (`user` + `occurredAt desc`) is satisfied entirely from the index with no in-memory sort stage.

Pagination sorts include `_id` as a tiebreaker — without it, two transactions sharing a date can swap places between page 1 and page 2, so a record is shown twice or skipped.

### One schema, validated on both sides

`@savoney/shared` holds the Zod schemas. The server validates requests against them; the client drives its forms from the same objects via `@hookform/resolvers`; the OpenAPI document at `/api/docs` is **generated** from them. The published contract cannot drift from the behaviour, because there is only one definition.

### Other things that mattered

- **Fail-fast config** — the process refuses to boot on an invalid environment, and rejects a production start where the two JWT secrets match or a `localhost` CORS origin is configured
- **`sanitizeFilter` stays on** — operator objects built by application code are marked with `mongoose.trusted()`; raw request input can never inject `$ne`
- **ReDoS-safe search** — user input is escaped before reaching `$regex`; substring search is deliberate (a `$text` index cannot match `"groc"` against `"Groceries"`)
- **CSV injection defused** — exported cells starting `=`, `+`, `-` or `@` are prefixed, so a transaction title cannot execute as a formula in Excel
- **Recurrence without a scheduler** — due occurrences are materialised lazily on read, bounded twice over; no cron to operate or keep in sync across replicas
- **Graceful shutdown** — SIGTERM drains in-flight requests before closing the database, so a rolling deploy doesn't abort a write mid-flight
- **Accessibility** — money and status never rely on colour alone; native `<dialog>` for real focus trapping; `aria-sort` on sortable columns; visible focus rings; `prefers-reduced-motion` respected

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  client/  React 19 · Vite · Tailwind v4 · TanStack Query      │
│                                                              │
│  pages/          route-level screens                         │
│  features/       one folder per domain: hooks + components    │
│  components/ui/  design-system primitives                     │
│  lib/api.ts      fetch wrapper · single-flight token refresh  │
└───────────────────────────┬──────────────────────────────────┘
                            │  JSON over HTTP
                            │  Bearer access token
                            │  httpOnly refresh cookie → /api/auth
┌───────────────────────────┴──────────────────────────────────┐
│  server/  Express 5 · Mongoose 9 · Zod · Pino                 │
│                                                              │
│  routes  →  validate(schema)  →  service  →  model            │
│                    │               │                          │
│              req.validated    business logic,                 │
│              (typed, safe)    aggregations                    │
│                                                              │
│  middleware/  authenticate · validate · rate-limit · errors   │
│  modules/     auth · transactions · categories · budgets ·    │
│               goals · analytics                               │
└───────────────────────────┬──────────────────────────────────┘
                            │
                     ┌──────┴───────┐
                     │  MongoDB 8   │
                     └──────────────┘

┌──────────────────────────────────────────────────────────────┐
│  shared/  @savoney/shared — imported by BOTH sides            │
│  Zod schemas · inferred types · integer-money utilities        │
└──────────────────────────────────────────────────────────────┘
```

Routes stay thin: parse and validate, delegate to a service, shape a response. Services hold the business logic and own all database access. Handlers fail by `throw`ing an `ApiError`; one error middleware decides how every failure reaches the client, and anything unrecognised becomes a generic 500 with a `requestId` that ties the user's report to the real stack trace.

---

## Quick start

**Requirements:** Node 20.11+ and a MongoDB instance (local or Atlas).

```bash
git clone <your-repo-url> savoney && cd savoney
npm install

cp server/.env.example server/.env
# Generate two different secrets and paste them in:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm run seed     # optional: a demo account with a year of history
npm run dev      # API on :4000, client on :5173
```

Then open **http://localhost:5173**.

The seed creates a demo login — `demo@savoney.app` / `savoney-demo-2026` — with 400+ transactions across 12 categories, budgets in every state, and part-funded goals.

> Port **4000**, not 5000: macOS binds 5000 to the AirPlay Receiver, which answers requests with a `403` and makes the API look broken.

### With Docker

```bash
cp .env.docker.example .env    # fill in MONGO_PASSWORD and both JWT secrets
docker compose up --build      # http://localhost:8080
```

### Deploying

Render blueprint in [`render.yaml`](render.yaml); step-by-step guide in
[DEPLOYMENT.md](DEPLOYMENT.md).

---

## Scripts

Run from the repository root.

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `npm run dev`       | Shared build, then API and client together                      |
| `npm run build`     | Build all three workspaces                                      |
| `npm test`          | Server and client test suites                                   |
| `npm run typecheck` | Typecheck every workspace                                       |
| `npm run lint`      | ESLint across the monorepo                                      |
| `npm run format`    | Prettier write                                                  |
| `npm run seed`      | Reseed the demo account (`-- --keep` to preserve existing data) |
| `npm run verify`    | format + lint + typecheck + test + build — what CI runs         |

---

## Testing

**230 tests.** The server suite runs against a real in-memory MongoDB (`mongodb-memory-server`) — real aggregation pipelines, real indexes, real unique constraints. A mocked Mongoose would happily pass tests for pipelines that cannot actually run.

```bash
npm test                              # everything
npm run test:server                   # API only
npm run test:coverage -w @savoney/server
```

What is actually covered:

- **Auth** — registration, breached-password rejection, identical error text for wrong-password vs. unknown-account, cookie flags, refresh rotation, **session-family revocation on token replay**, password change invalidating live sessions, and that the refresh cookie alone cannot authorise a request
- **Tenant isolation** — reads, writes and deletes across accounts all return `404` rather than `403`, because confirming existence is itself a leak
- **Money** — exact-integer sums across 10,000 additions, half-away-from-zero rounding, rejection of fractional amounts on the wire
- **Filtering** — inclusive date bounds, mid-word search, regex metacharacters treated literally, stable pagination with no duplicated or skipped rows, page-size caps
- **Analytics** — exact totals, null savings rate when there is no income, equal-length period comparison, category percentages as a share of _all_ spending rather than the visible top five
- **Budgets** — live spend, recomputation after a transaction is deleted, threshold states, one-budget-per-category-per-period
- **Client** — transparent token refresh, single-flight refresh collapsing, retry-once-only, and that deltas render an explicit sign rather than relying on colour

---

## API

Interactive docs — generated from the same Zod schemas the routes validate against — are served at **`/api/docs`**, with the raw document at `/api/openapi.json`.

|                                                            |                                                   |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `POST /api/auth/register` · `login` · `refresh` · `logout` | Sessions                                          |
| `GET/PATCH /api/auth/me`, `POST /api/auth/change-password` | Profile                                           |
| `GET/POST/PATCH/DELETE /api/transactions`                  | Ledger, plus `/export`, `/import`, `/bulk-delete` |
| `GET/POST/PATCH/DELETE /api/categories`                    | Classification, plus `/:id/archive`               |
| `GET/POST/PATCH/DELETE /api/budgets`                       | Limits with live progress                         |
| `GET/POST/PATCH/DELETE /api/goals`                         | Targets, plus `/:id/contribute`                   |
| `GET /api/analytics/summary` · `breakdown` · `trend`       | Reporting                                         |
| `GET /api/health` · `/api/ready`                           | Liveness and readiness                            |

All amounts are integer minor units. `$12.34` is `{"amountMinor": 1234}`.

---

## Project structure

```
savoney/
├── shared/                    @savoney/shared — the contract
│   └── src/
│       ├── money.ts           integer money: parsing, arithmetic, formatting
│       └── schemas/           Zod schemas + inferred types
├── server/
│   ├── src/
│   │   ├── config/            env validation, logger
│   │   ├── db/                connection, seed
│   │   ├── lib/               ApiError, tokens, password, csv, recurrence, pagination
│   │   ├── middleware/        authenticate, validate, rate-limit, error handler
│   │   ├── modules/           auth · transactions · categories · budgets · goals · analytics
│   │   ├── docs/openapi.ts    spec generated from the shared schemas
│   │   └── app.ts             middleware assembly
│   └── tests/                 unit + integration (in-memory MongoDB)
├── client/
│   └── src/
│       ├── components/ui/     Button, Card, Input, Dialog, Progress, Skeleton…
│       ├── components/charts/ theme-aware Recharts wrappers
│       ├── features/          per-domain hooks and components
│       ├── pages/             route screens
│       └── lib/               api client, formatting, query client, theme
├── docker-compose.yml
└── .github/workflows/ci.yml
```

---

## License

MIT
