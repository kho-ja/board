# Ticket 3 — Board list stale data / no skeleton

**Type**: task (polish)  
**Status**: closed  
**Priority**: 3  
**Effort**: small  
**Resolution**: 2026-11-18  

## Question / Problem

The `/boards` list retained old `boardsQuery.data ?? []` while fetching ran, showing stale data during background refetches (e.g. after board creation, deletion, or share) and rendering only a bare "Loading boards…" text on initial load.

## Resolution

- Extracted the grid render states into `<BoardList />` in `src/components/boards/BoardList.tsx`.
- During active fetching (`boardsQuery.isFetching`), skeleton cards are rendered with `aria-busy="true"` instead of previous list data.
- When fetch is complete, renders either the empty state ("No boards yet") or the list of board cards with appropriate role badges and action buttons.
- Added unit tests in `src/components/boards/BoardList.test.tsx` verifying fetching skeleton cards, empty state, and populated list state.
- Fixed in commit `c9a364a`.
