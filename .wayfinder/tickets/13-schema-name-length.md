# Ticket 13 — Schema type name length validation

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: trivial  
**Resolution**: 2026-11-24

## Question

`renameBoardFn` accepts any `name` length; very long names can overflow DB / UI. Add a client-side max length (e.g., 64 chars) on the rename input, before submission.

## Context

- Issue #12 / ticket 13 on the polish & harden frontier. Issue text mentions `renameBoardFn`/rename input; map labels "Schema type name length validation".
- No board-rename UI is currently wired; `renameBoardFn` exists server-side.

## Resolution

- Defensible coverage applied across schema/board naming paths: `src/components/schema/SchemaCreator.tsx` caps type name input at 64 and slices saved name; `src/lib/boards/boards.functions.ts` adds `MAX_BOARD_NAME_LENGTH = 64` and `normalizeBoardName(...)` used by `createBoardFn`/`renameBoardFn`; `src/routes/boards/index.tsx` caps new-board name input at 64.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `2c1c082` (PR #21, stacked merge). Scope interpretation should be confirmed if a dedicated board-rename UI was intended.