# Ticket 07 — Share dialog role validation

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small  
**Resolution**: 2026-11-24

## Question

If a bad role is injected via devtools, the server may accept/reject silently. Show a clear `role="alert"` error such as "Unknown role" before submitting the share row.

## Context

- Issue #6 / ticket 07 on the polish & harden frontier.
- Share dialog and member role changes accepted role input with weak client/server validation.

## Resolution

- Added `BOARD_ROLES`/`isBoardRole` in `src/lib/boards/roles.ts`, with coverage in `src/lib/boards/roles.test.ts`.
- `src/routes/boards/index.tsx`: share submit rejects unknown/non-shareable roles with `role="alert"` "Unknown role."; role Select handlers only accept known roles.
- `src/lib/boards/boards.functions.ts`: `shareBoardFn` rejects unknown/`owner` share roles; `setMemberRoleFn` rejects unknown roles.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `6b6dfdf` (PR #15, merged into integration flow).