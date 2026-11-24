# Ticket 3 — Board list stale data / loading skeleton

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small  
**Resolution**: 2026-11-19

## Question

The `/boards` list retains old `boardsQuery.data ?? []` while fetching. When a fetch is active (initial load or refetch), should the list show skeleton cards — and if so, should the stale data ever be trusted as current?

## Context

- The route used `boardsQuery.isLoading` only, rendering a bare "Loading boards…" text; refetches kept stale data on screen with no feedback.
- The ticket asked: render skeleton cards during active fetch (`isFetching`) instead of showing stale data with a "Loading boards…" text only.

## Resolution

- Extracted the grid's three states into `src/components/boards/BoardList.tsx` with a `fetching` prop.
- While `fetching` is true the list renders three skeleton cards under `<ul aria-busy="true">` — never the stale list.
- `src/routes/boards/index.tsx` passes `fetching={boardsQuery.isFetching}`.

## Review

- Code review (`git diff 4887021...HEAD`, commit `c9a364a`): **Standards clean** (lint/typecheck green; tests beside component; BoardRole imported from client-safe module); 3 minor judgement-call smells (skeleton/real-card shell duplication; `role === 'owner'` could use `canAdministerBoard`; duplicated link params). **Spec compliant**; minor creep (extraction justified, hardcoded skeleton count, tests).
