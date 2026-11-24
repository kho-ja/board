# Ticket 09 — Session prune index on expiresAt

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small infra  
**Resolution**: 2026-11-24

## Question

Add an index on `sessions.expiresAt` so `pruneExpiredSessions` scans only expired rows instead of the full table. Apply via drizzle-kit.

## Context

- Issue #8 / ticket 09 on the polish & harden frontier.
- Session expiry cleanup queries by `expiresAt`; schema/index and migration needed.

## Resolution

- `src/db/schema.ts`: added `sessions_expires_at_idx` on `sessions.expiresAt`.
- `drizzle/0002_session_expires_at_idx.sql`: added `CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");` for existing installs. Apply via normal Drizzle migration flow.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `d02991b` (PR #17, stacked merge).