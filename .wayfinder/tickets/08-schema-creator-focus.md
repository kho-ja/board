# Ticket 08 — SchemaCreator focus restored on close

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: trivial  
**Resolution**: 2026-11-24

## Question

When Schema Creator closes (button/Esc), focus should return to the element that opened it rather than reverting silently, preserving keyboard navigation.

## Context

- Issue #7 / ticket 08 on the polish & harden frontier.
- Schema Creator dialog open/close was handled in `src/routes/boards/$boardId.tsx`.

## Resolution

- `src/routes/boards/$boardId.tsx`: capture the active trigger element before opening Schema Creator; on close clear state and restore focus with `requestAnimationFrame` when the trigger is still connected.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `2238b86` (PR #16, stacked merge).