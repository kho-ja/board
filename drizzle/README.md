# Database migrations

The schema lives in `src/db/schema.ts`; `src/db/schema.ts` is the source of
truth and `npm run db:push` applies it to the local database.

## `0001_auth_and_multi_board.sql`

A **one-off data migration** for installs that already have content, which
`db:push` cannot express: adding a `NOT NULL` column to a populated table
needs a backfill between the `ADD COLUMN` and the `SET NOT NULL`.

It introduces `users`, `sessions`, `boards` and `board_members`, gives every
board-scoped table a `board_id`, and parks any pre-existing content on one
*unclaimed* board — the first account to register claims it, so a local install
does not lose its board when auth lands.

Run it once against an existing database:

```sh
psql "$DATABASE_URL" -f drizzle/0001_auth_and_multi_board.sql
```

The script is idempotent, and a fresh install does not need it: `db:push`
creates the current schema from `src/db/schema.ts` directly.
