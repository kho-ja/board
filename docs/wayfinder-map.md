# Wayfinder Map — polish & harden (feat/auth-and-multi-board)

## Destination

Improve the existing auth and multi-board experience through targeted polish and hardening — clearer user feedback, smoother loading/empty states, sensible validation, and security hardening — until the rough edges identified are closed or accepted.

## Notes

- Target audience: all users of the Kho-ja Board app (new and existing accounts)
- Success criteria: users always see clear, actionable feedback; loading states are smooth; validation is correct; system stays performant.
- Scope: all existing features (auth, board management, Ask AI, sharing, persistence).

## Decisions so far

- (Ticket resolutions are appended here as they close; see tickets/ folder.)

## Not yet specified

- None — the polish frontier is fully charted from the survey.

## Out of scope

- New features (real-time collaboration, enhanced AI, public package release prep).
- Major architectural rewrites.

---

## Tickets

Status legend: `open`, `in-progress`, `closed`. Frontier = open, unclaimed tickets with no blockers ahead of them.

1. [Login/signup error surfacing](.wayfinder/tickets/01-login-error-surfacing.md) — closed — task — smallest, high user-visible impact
2. [Board loader silent redirect on missing board](.wayfinder/tickets/02-board-loader-redirect.md) — closed — task — trivial
3. [Board list stale data / no skeleton](.wayfinder/tickets/03-board-list-stale-data.md) — closed — task — small
4. [Cookie security (`__Host-`, `secure`)](.wayfinder/tickets/04-cookie-security.md) — closed — task — small
5. [Sign-out client-cache cleanup](.wayfinder/tickets/05-signout-cache-leak.md) — closed — task — small
6. [AskPanel retry after bad provider/model](.wayfinder/tickets/06-askpanel-retry.md) — closed — task — small
7. [Share dialog role validation](.wayfinder/tickets/07-share-validation.md) — closed — task — small
8. [SchemaCreator focus restoration](.wayfinder/tickets/08-schema-creator-focus.md) — closed — task — trivial
9. [Session prune index](.wayfinder/tickets/09-session-prune-index.md) — closed — task — small infra
10. [Claim unclaimed board concurrency idempotency](.wayfinder/tickets/10-claim-unclaimed-board.md) — closed — task — small
11. [Board members list viewer access](.wayfinder/tickets/11-board-members-viewer.md) — closed — task — trivial
12. [Devtools gated to dev](.wayfinder/tickets/12-devtools-production.md) — closed — task — small
13. [Schema type name length validation](.wayfinder/tickets/13-schema-name-length.md) — closed — task — trivial
14. [Login mode toggle `aria-pressed`](.wayfinder/tickets/14-login-aria-pressed.md) — closed — task — trivial
15. [AskPanel approval cleanup after failed run](.wayfinder/tickets/15-askpanel-approval.md) — closed — task — small

## Resolutions log

- 2026-10-26 · Login/signup error surfacing — **resolved** (`.wayfinder/tickets/01-login-error-surfacing.md` closed). Specific actionable error now shown on server/network failure; generic fallback retained for unexpected empty errors.
- 2026-11-17 · Board loader silent redirect on missing board — **resolved** (`.wayfinder/tickets/02-board-loader-redirect.md` closed). Loader now redirects to `/boards?error=board-not-found`; the list page shows "That board could not be found, or you do not have access to it." and strips the param from the URL. Chose the ticket's persistent-banner wording over the 404-vs-permission distinction — the server-side split remains unimplemented and was deliberately left for a future decision.
- 2026-11-19 · Board list stale data / loading skeleton — **resolved** (`.wayfinder/tickets/03-board-list-stale-data.md` closed). List now renders skeleton cards during `isFetching` instead of stale data with a "Loading boards…" text only; extraction to `BoardList` component with tests. Code review (Standards: clean, 3 minor judgement-call smells; Spec: compliant, minor creep).
- 2026-11-18 · Board list stale data / no skeleton — **resolved** (`c9a364a`, `.wayfinder/tickets/03-board-list-stale-data.md` closed). Extracted `<BoardList />` in `src/components/boards/BoardList.tsx` rendering skeleton cards during active query fetch (`isFetching`) rather than stale boards; empty and populated states preserved; verified by component unit tests in `src/components/boards/BoardList.test.tsx`.
- 2026-11-18 · Cookie security (`__Host-`, `secure`) — **resolved** (`f70774a`, `.wayfinder/tickets/04-cookie-security.md` closed). Configured session cookie with `__Host-` prefix in production (`sameSite: 'none'`, `secure: true`, `path: '/'`); maintained `kj_session` with `secure: false` and `lax` same-site in dev over plain HTTP; verified by unit tests in `src/lib/auth/session.server.test.ts`.
- 2026-11-18 · Sign-out client-cache cleanup — **resolved** (`234b579`, `.wayfinder/tickets/05-signout-cache-leak.md` closed). Added `clearChatStorage` for all `khoja.chat.<boardId>.*` and legacy keys, `clearCollectionsCache` for live collections, and centralized `signOut` in `src/lib/auth/auth.client.ts` guaranteeing client cache cleanup on logout; verified by unit tests in `src/lib/auth/auth.client.test.ts` and `src/lib/chat/history.test.ts`.
- 2026-11-19 · AskPanel retry after streaming failure surfaces provider/model — **resolved** (`104006f`, `.wayfinder/tickets/06-askpanel-retry.md` closed). Error state now surfaces the failure with a provider/model hint and an "Ask settings" shortcut alongside the existing "Try again"; code review (Standards: no hard violations; minor style-registration/terminology findings; Spec: compliant with minor caveats).
- 2026-11-24 · Share dialog role validation — **resolved** (`6b6dfdf`, `.wayfinder/tickets/07-share-validation.md` closed, issue #6 / PR #15). Added `isBoardRole` client/server validation; share dialog rejects unknown/non-shareable roles with `role="alert"` "Unknown role."; `setMemberRoleFn` rejects unknown roles.
- 2026-11-24 · SchemaCreator focus restoration — **resolved** (`2238b86`, `.wayfinder/tickets/08-schema-creator-focus.md` closed, issue #7 / PR #16). Captures active trigger before open and restores focus on close for keyboard navigation.
- 2026-11-24 · Session prune index on expiresAt — **resolved** (`d02991b`, `.wayfinder/tickets/09-session-prune-index.md` closed, issue #8 / PR #17). Added `sessions_expires_at_idx` in schema and `drizzle/0002_session_expires_at_idx.sql`; apply via normal migration flow.
- 2026-11-24 · Claim unclaimed board concurrency idempotency — **resolved** (`485a233`, `.wayfinder/tickets/10-claim-unclaimed-board.md` closed, issue #9 / PR #18). `claimUnclaimedBoard` now claims in a transaction with conditional owner update and conflict-safe owner membership insert.
- 2026-11-24 · Board members list viewer access — **resolved** (`f70ea47`, `.wayfinder/tickets/11-board-members-viewer.md` closed, issue #10 / PR #19). `listBoardMembersFn` requires editor-level board access; viewers no longer receive full member roster/emails.
- 2026-11-24 · Devtools gated to non-production env — **resolved** (`527e880`, `.wayfinder/tickets/12-devtools-production.md` closed, issue #11 / PR #20). Root document mounts TanStack devtools only when `process.env.NODE_ENV !== 'production'`.
- 2026-11-24 · Schema type name length validation — **resolved** (`2c1c082`, `.wayfinder/tickets/13-schema-name-length.md` closed, issue #12 / PR #21). Capped SchemaCreator type names at 64 chars and normalized/capped board names server-side/client-side; scope covers `renameBoardFn` but no dedicated board-rename UI is wired.
- 2026-11-24 · Login mode toggle `aria-pressed` — **resolved** (`8bd40d3`, `.wayfinder/tickets/14-login-aria-pressed.md` closed, issue #13 / PR #22). Sign-in/sign-up toggle buttons expose `aria-pressed={mode === value}`.
- 2026-11-24 · AskPanel approval cleanup on failed run/tab close — **resolved** (`f985be4`, `.wayfinder/tickets/15-askpanel-approval.md` closed, issue #14 / PR #23). Pending approvals are marked expired on hide/close/unmount and canceled on next observation; abandon-on-close coverage added.
