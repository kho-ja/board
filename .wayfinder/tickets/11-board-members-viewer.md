# Ticket 11 — Board members list viewer access

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: trivial  
**Resolution**: 2026-11-24

## Question

`listBoardMembersFn` uses `requireBoardRead`; a viewer can enumerate members/roles/emails. Decide/document whether this is acceptable or restrict to `owner`/`editor` only.

## Context

- Issue #10 / ticket 11 on the polish & harden frontier.
- Member roster includes emails/roles; read-only viewers do not need full roster access.

## Resolution

- `src/lib/boards/boards.functions.ts`: `listBoardMembersFn` now requires `requireBoardAccess(boardId, 'editor')`; comment updated to document the restriction.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `f70ea47` (PR #19, stacked merge).