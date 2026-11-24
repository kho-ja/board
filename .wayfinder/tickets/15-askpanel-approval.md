# Ticket 15 — AskPanel approval cleanup after failed run

**Type**: task (polish)  
**Status**: closed  
**Priority**: 2  
**Effort**: small  
**Resolution**: 2026-11-24

## Question

Approval cards stay in localStorage when the server never acks (connection drop before server ack); retry then fails indefinitely. Clean approvals when the run fails or tab closes unexpectedly.

## Context

- Issue #14 / ticket 15 on the polish & harden frontier.
- AskPanel already canceled approvals on failed runs and pruned aged approvals on sight; abandon/close cases could leave stale dead-end cards.

## Resolution

- `src/lib/chat/approval-expiry.ts`: added `expireApprovalsNow(...)` and treated `firstSeen === 0` as expired in `trackApproval`.
- `src/lib/chat/approval-expiry.test.ts`: added coverage for abandon-on-close immediate expiry.
- `src/components/canvas/AskPanel.tsx`: on pending approvals, marks approvals expired on `pagehide`, `visibilitychange` to hidden, and unmount/thread change so next observation cancels stale cards.

## Review

- `npm run lint`, `npm run typecheck`, and `npm run test` passed (26 files, 259 tests) on the merged stack. Carrying commit: `f985be4` (PR #23, stacked merge).