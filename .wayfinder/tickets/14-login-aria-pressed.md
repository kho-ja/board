# Ticket 14 — Login mode toggle `aria-pressed`

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: trivial  
**Resolution**: 2026-11-24

## Question

The Sign in / Sign up toggle buttons lack `aria-pressed`, so screen readers cannot determine the active mode. Add `aria-pressed={mode === value}` to each button.

## Context

- Issue #13 / ticket 14 on the polish & harden frontier.
- Login mode toggle is a two-button state selector in `src/routes/login.tsx`.

## Resolution

- `src/routes/login.tsx`: each sign-in/sign-up toggle button sets `aria-pressed={mode === value}`.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `8bd40d3` (PR #22, stacked merge).