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

1. [Login/signup error surfacing](.wayfinder/tickets/01-login-error-surfacing.md) — open — task — smallest, high user-visible impact
2. [Board loader silent redirect on missing board](.wayfinder/tickets/02-board-loader-redirect.md) — open — task — trivial
3. [Board list stale data / no skeleton](.wayfinder/tickets/03-board-list-stale-data.md) — open — task — small
4. [Cookie security (`__Host-`, `secure`)](.wayfinder/tickets/04-cookie-security.md) — open — task — small
5. [Sign-out client-cache cleanup](.wayfinder/tickets/05-signout-cache-leak.md) — open — task — small
6. [AskPanel retry after bad provider/model](.wayfinder/tickets/06-askpanel-retry.md) — open — task — small
7. [Share dialog role validation](.wayfinder/tickets/07-share-validation.md) — open — task — small
8. [SchemaCreator focus restoration](.wayfinder/tickets/08-schema-creator-focus.md) — open — task — trivial
9. [Session prune index](.wayfinder/tickets/09-session-prune-index.md) — open — task — small infra
10. [Claim unclaimed board concurrency idempotency](.wayfinder/tickets/10-claim-unclaimed-board.md) — open — task — small
11. [Board members list viewer access](.wayfinder/tickets/11-board-members-viewer.md) — open — task — trivial
12. [Devtools gated to dev](.wayfinder/tickets/12-devtools-production.md) — open — task — small
13. [Schema type name length validation](.wayfinder/tickets/13-schema-name-length.md) — open — task — trivial
14. [Login mode toggle `aria-pressed`](.wayfinder/tickets/14-login-aria-pressed.md) — open — task — trivial
15. [AskPanel approval cleanup after failed run](.wayfinder/tickets/15-askpanel-approval.md) — open — task — small

## Resolutions log

- 2026-10-26 · Login/signup error surfacing — **resolved** (`.wayfinder/tickets/01-login-error-surfacing.md` closed). Specific actionable error now shown on server/network failure; generic fallback retained for unexpected empty errors.
