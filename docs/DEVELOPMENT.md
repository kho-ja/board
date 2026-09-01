# Development

> Status: **M0 and M1 complete.** TanStack Start scaffold is in place and the
> Postgres data path (server functions → Drizzle → Postgres, reactive
> QueryCollections) is verified end-to-end. Milestones use the checklist below
> (`npm run lint`, `npm run build`, `npm run dev`, Postgres `db:push`).

## Prerequisites

- **Node.js** >= 24 (verified: v24.19.0)
- **npm** >= 11 (verified: 11.17.0)
- **PostgreSQL** — installed locally; **now the v1 database** (full-send TanStack).
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
```

## Environment variables

Set in `.env` (not committed):

```
DATABASE_URL=postgres://user:pass@localhost:5432/kho_ja
```

Postgres connection string is read by the Drizzle/`pg` client inside the Start
server (server-only; never shipped to the client).

## Database setup (M1)

Tables mirror the TanStack DB collections: `blocks`, `placements`, `memberships`,
`types`, `views`, plus a `schema_version` column.

```bash
npx drizzle-kit push     # apply schema.ts to local Postgres (dev)
```

Server functions (`createServerFn` in `src/db/queries.functions.ts`) wrap the
server-only DB helpers in `src/db/queries.server.ts` (Drizzle queries against the
singleton client); TanStack DB QueryCollections bind the client to them (live
queries + optimistic mutations). No ElectricSQL in v1.

## Testing

No test framework set up yet. The interaction milestone (create File Group, add
member files, switch card/list view) is the primary end-to-end acceptance, with
`npm run lint` + `npm run build` as gates.

## Common problems

- **TanStack Start Windows scaffold quirk** — if the CLI errors with `mkdir C:\`,
  use `--blank` or the start-basic example (see M0).
- **`pg` pool exhaustion / hot reload** — use a single Drizzle/Pool singleton
  (`src/db/index.ts`) so dev hot reload doesn't open new pools.
- **DB credentials leaking to client** — keep the `pg` Pool + Drizzle client in
  server-only code (`.server.ts` / inside server functions); never import into client
  components.
