# Development

> Status: **M0–M18 complete** (full v1 scope from START_PLAN). TanStack Start
> scaffold, the Postgres data path (server functions → Drizzle → Postgres,
> reactive QueryCollections), and the pan/zoom/drag infinite canvas are all
> verified end-to-end; lint, type-check, 155 unit tests, and the production
> build are green.

## Prerequisites

- **Node.js** >= 24 (verified: v24.19.0)
- **npm** >= 11 (verified: 11.17.0)
- **PostgreSQL** — installed locally; **the v1 database** (full-send TanStack).
  A running server + a database (e.g. `kho_ja`) is required from milestone M1.

## Scaffold (M0)

```bash
npx @tanstack/cli@latest create . --add-ons tanstack-query -y
# (If the CLI misbehaves on Windows — known `mkdir C:\` quirk — use `--blank`
#  and add TanStack Start deps manually, or scaffold from the start-basic example.)
```

Add database + reactive-store deps:

```bash
npm i @tanstack/react-db @tanstack/query-db-collection @tanstack/query-core drizzle-orm pg
npm i -D drizzle-kit @types/pg
```

## Dev / build commands

```bash
npm run dev      # TanStack Start dev server (Vite + Nitro)
npm run build    # type-check + production build (server + client)
npm run start    # run the production server
npm run lint     # ESLint (flat config: eslint.config.js)
npm run test     # Vitest unit tests (16 files, 155 tests)
npx tsc --noEmit # standalone type-check
```

## Environment variables

Set in `.env.local` (not committed):

```
DATABASE_URL=postgres://user:pass@localhost:5432/kho_ja
AI_ENCRYPTION_KEY=base64-of-32-bytes   # encrypts stored provider API keys at rest
ANTHROPIC_API_KEY=...                  # optional: preconfigure an Ask provider
OPENAI_API_KEY=...                     # optional: preconfigure an Ask provider
```

Postgres connection string is read by the Drizzle/`pg` client inside the Start
server (server-only; never shipped to the client). Client code can never read
`process.env` (Vite strips it) — configuration truth for the AI providers is
server-derived via `listAiProviders()` (see `src/lib/ai/providers.server.ts`).

## Database setup (M1)

Tables mirror the TanStack DB collections: `blocks`, `placements`, `memberships`,
`types`, `views`, and later `links` + `diagrams`; every table carries a
`schema_version` column.

```bash
npx drizzle-kit push     # apply schema.ts to local Postgres (dev)
```

Server functions (`createServerFn` in `src/db/queries.functions.ts`) wrap the
server-only DB helpers in `src/db/queries.server.ts` (Drizzle queries against the
singleton client in `src/db/client.ts`); TanStack DB QueryCollections bind the
client to them (live queries + optimistic mutations). No ElectricSQL in v1.

## Testing

Vitest unit tests live beside the code (e.g. `src/lib/chat/history.test.ts`) and
run with `npm run test` (16 files / 155 tests, green). Lint + type-check + build
are the remaining gates; the interaction milestones are the end-to-end
acceptance (create File Group, add member files, switch views, Ask chat, etc.).

## Common problems

- **TanStack Start Windows scaffold quirk** — if the CLI errors with `mkdir C:\`,
  use `--blank` or the start-basic example (see M0).
- **`pg` pool exhaustion / hot reload** — use a single Drizzle/Pool singleton
  (`src/db/client.ts`) so dev hot reload doesn't open new pools. It rebuilds the
  Drizzle client only when the schema reference changes and keeps the Pool alive.
- **DB credentials leaking to client** — keep the `pg` Pool + Drizzle client in
  server-only code (`.server.ts` / inside server functions); never import into client
  components.
- **AI providers "not configured" in Ask** — the client can't read `process.env`;
  add keys via the ⚙️ Ask settings dialog (persisted encrypted) or set
  `AI_ENCRYPTION_KEY` + a provider key in `.env.local`.
- **`drizzle-kit push` wants to drop a column** — a stale column removed from
  `src/db/schema.ts` (e.g. `view_override`) will be dropped from the dev DB; that
  is expected on an uncommitted dev database.
