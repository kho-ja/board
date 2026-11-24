# Ticket 12 — Devtools gated to dev

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small  
**Resolution**: 2026-11-24

## Question

`TanStackRouterDevtoolsPanel` and `@tanstack/react-devtools` always present in production bundle. Gate both behind `process.env.NODE_ENV !== 'production'`.

## Context

- Issue #11 / ticket 12 on the polish & harden frontier.
- Root document mounted devtools unconditionally.

## Resolution

- `src/routes/__root.tsx`: render `<TanStackDevtools>`/router+query devtools plugins only when `process.env.NODE_ENV !== 'production'`.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `527e880` (PR #20, stacked merge).