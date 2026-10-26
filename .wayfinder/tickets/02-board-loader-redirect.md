# Ticket 2 — Board loader silent redirect on missing board

**Type**: task (grilling)  
**Status**: open  
**Priority**: 2  
**Effort**: trivial

## Question

`src/routes/boards/$boardId.tsx:93` does:

```ts
if (!board) throw redirect({ to: '/boards' })
```

When someone opens a URL for a board that doesn't exist (or that they have no access to), they're silently bounced back to the board list with no explanation. Is a flash toast enough, or should this page surface a persistent "This board doesn't exist or you don't have access" state?

## Context

- A redirect to `/boards` hides *why* — a typo'd link and a permissions issue look identical.
- Board-scoped loaders already run `getCurrentUserForBoard` server-side, so a 404 vs a permission denial can be told apart server-side.
