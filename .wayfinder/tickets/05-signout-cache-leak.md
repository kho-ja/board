# Ticket 5 — Sign-out client-cache cleanup

**Type**: task (polish)  
**Status**: closed  
**Priority**: 5  
**Effort**: small  
**Resolution**: 2026-11-18  

## Question / Problem

On sign-out, previously only `logoutFn` was invoked followed by query invalidation. In-memory TanStack Query caches, live board collection instances in `collectionCache`, and board chat histories in localStorage (`khoja.chat.<boardId>.*` as well as legacy chat keys) remained in the client browser, potentially leaking conversation or board details on shared machines.

## Resolution

- Created `clearChatStorage` in `src/lib/chat/history.ts` to wipe all keys starting with `khoja.chat.` (`CHAT_PREFIX`) and `tanstack-ai:khoja-board-ask` (`LEGACY_CHAT_KEY`) while preserving unrelated keys (e.g. `theme`).
- Added `clearCollectionsCache` in `src/collections/index.ts` to reset live collection instances for a `QueryClient`.
- Introduced `src/lib/auth/auth.client.ts` exporting:
  - `clearClientCaches(queryClient)`: clears TanStack Query cache (`queryClient.clear()`), collection instances, and chat localStorage.
  - `signOut({ queryClient, navigate })`: calls `logoutFn({ data: undefined })`, executes `clearClientCaches` inside a `finally` block (guaranteeing local cleanup even if the network or server errors), and redirects to `/login`.
- Updated `BoardSwitcher` (`src/components/boards/BoardSwitcher.tsx`) and the boards list view (`src/routes/boards/index.tsx`) to use `signOut`.
- Added unit tests in `src/lib/chat/history.test.ts` and `src/lib/auth/auth.client.test.ts`.
- Updated spec in `docs/spec-m19-auth-and-multi-board.md`.
- Fixed in commit `234b579`.
