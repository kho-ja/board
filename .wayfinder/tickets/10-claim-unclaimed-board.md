# Ticket 10 — Claim unclaimed board concurrency idempotency

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small  
**Resolution**: 2026-11-24

## Question

`claimUnclaimedBoard` after `createUser` should remain idempotent and protected from concurrent registration races (two first-time users). Verify / harden with conditional update / advisory lock if needed.

## Context

- Issue #9 / ticket 10 on the polish & harden frontier.
- Unclaimed-board claim is a first-registration ownership handoff; concurrent claims must not both win.

## Resolution

- `src/lib/boards/queries.server.ts`: `claimUnclaimedBoard` now runs candidate claim logic in a transaction, checks for existing members, performs a conditional board update where `ownerId IS NULL`, and inserts owner membership with `onConflictDoNothing`.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. No new DB-backed integration test added (no existing harness for this path). Carrying commit: `485a233` (PR #18, stacked merge).