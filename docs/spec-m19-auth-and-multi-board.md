# Spec — Auth layer and multi-board isolation (M19)

Status: **completed** (`feat/auth-and-multi-board`, final commit `d105586`).

---

## Problem Statement

Before M19: the app had no authentication layer (single global state), one implicit board with no isolation boundaries, and no multi-user support. A user could not sign in, separate their content from others', or share a board with a collaborator. The board reference tables had no foreign-key isolation, meaning blocks, placements, links, and AI tool output could mix freely.

---

## Solution

A self-contained email+password authentication layer (no external identity provider) and multi-board isolation where boards are first-class units with role-based sharing.

Key behaviors:
- **Sign in / sign up** via `/login` with email + password (self-contained, no email/OAuth).
- **Session persistence** via an httpOnly cookie (`session` token) backed by a SHA-256 hash in the `sessions` table.
- **Password storage** via `node:crypto` scrypt (`scrypt$N$r$p$salt$hash`) — no extra dependency, cost parameters embedded for future upgrade.
- **Account deletion** (`ON DELETE SET NULL`) does not destroy boards that others share — avoids accidental data loss.
- **Board isolation** enforced by single authorization gate (`guards.server.ts`) and `board_id` on all board-scoped tables with composite `(block_id, board_id)` foreign keys.
- **Sharing** via email of an existing account, with three roles (`owner`, `editor`, `viewer`).
- **AI chat** is board-scoped: conversation transcripts, thread index, active thread, and approval state all live under `khoja.chat.<boardId>.*`, preventing cross-board transcript leaks.
- **Claim of unclaimed board**: the first account to register claims the legacy board left by the pre-auth migration (`claimUnclaimedBoard` only claims boards with zero members, protected by conditional update).

---

## User Stories

1. As a new user, I want to create an account with email and password, so I can access my boards securely.
2. As a returning user, I want to sign in with my existing credentials, so I can resume my work.
3. As an owner, I want my account deleted without destroying boards others share, so collaborators don't lose access to shared work.
4. As a new user registering for the first time, I want any pre-existing unclaimed board content to become my board automatically, so nothing is lost.
5. As a board owner, I want to create new boards with a name, so I can separate different projects.
6. As a user, I want to share a board with another registered user by their email, assigning them owner/editor/viewer roles, so collaboration is controlled.
7. As a viewer on a shared board, I want to see the board's content but have read-only AI tool access, so I can observe without making changes.
8. As a user, I want to sign out and have my session invalidated server-side, so my account can't be replayed if the cookie leaks.
9. As a user, I want the AI chat history to stay with the board it's about, so switching boards doesn't leak another board's content to the new board's AI tools.
10. As a shared user, I want to see the list of people with access to a board and change/remove their roles, so I know who's on the board.
11. As a user, I want the board page URL to include the board id (`/boards/$boardId`), so linking to a board is stable and direct.

---

## Implementation Decisions

### Schema

New tables: `users`, `sessions`, `boards`, `board_members`.
Modified tables: all board-scoped content tables (`blocks`, `placements`, `links`, `types`, `views`, `memberships`) now carry `board_id` and reference their parent via composite `(block_id, board_id)` FK.

- `boards.owner_id`: references `users.id`, `ON DELETE SET NULL` (not `CASCADE`).
- `board_members`: unique index on `(board_id, user_id)`, roles `owner`/`editor`/`viewer`.
- `users`: `email` (unique), `passwordHash` (self-describing scrypt digest), `createdAt`.
- `sessions`: `token` (random UUID), `hash` (SHA-256 of token), `userId` (FK `users.id`), `expiresAt`, with `ON DELETE CASCADE`.

### Auth layer (`src/lib/auth/`)

- `password.server.ts`: `hashPassword` / `verifyPassword` using `node:crypto` scrypt, canonicalizes to NFKC before hashing, handles corrupt digests gracefully (returns false, never throws).
- `session.server.ts`: random token stored in httpOnly cookie (`__Host-` prefix with `sameSite: 'none'` and `secure: true` in production; standard `kj_session` with `sameSite: 'lax'` and `secure: false` in dev over HTTP); DB stores SHA-256 hash, not the raw token, so a DB leak does not allow replay.
- `guards.server.ts`: single authorization gate (`requireBoardMember`, `requireBoardRead`, `requireUser`) used by every board-scoped server function.
- `auth.functions.ts`: `registerFn` creates user → creates session → claims unclaimed board (`claimUnclaimedBoard` with conditional update to prevent concurrent race). `loginFn` uses constant-time comparison (`timingSafeEqual`) and a dummy hash path to prevent timing attacks.

### Auth routes

- `/login`: sign in / sign up toggle, form validation (email format, password strength, existing-account check for sign-up, wrong-password check for sign-in), submit handler with distinct `pending`, `error`, and `success` states.
- `/boards`: loader requires `currentUserFn()`; if no user, redirects to `/login`. Board list (`listBoardsFn`) returns boards the current user has membership in, with role label and owner email.
- `/boards/$boardId`: loader validates user exists and board exists; if board missing or inaccessible, redirects to `/boards` with `error=board-not-found`, which the list page surfaces as a banner (see ticket #2 in wayfinder).
- `/` redirects to `/boards`.

### Board CRUD and sharing (`src/lib/boards/`)

- `boards.functions.ts`: `createBoardFn` creates board + owner membership atomically; `shareBoardFn` requires `requireBoardMember` at `editor` or `owner` level before inserting a new `board_members` row; `listBoardsFn` joins `boards` and `board_members` to return role + owner info.
- `boards.functions.ts`: `deleteBoardFn` checks user is owner.

### Collections (`src/collections/`)

- All collections (`blocks`, `placements`, `memberships`, `links`, `types`, `views`) now include `boardId` in their `queryKey`, so switching boards reloads the collection with the new board's data.
- `useCollection` receives `boardId` and uses it in query keys and server function calls (`queryKey` = `['board-scoped', boardId, ...]`).
- Child table FKs reference their parent via composite `(parent_id, board_id)` (`placements` references `(block_id, board_id)`; `memberships` references `(block_id, board_id)`), preventing cross-board references.

### AI layer (`src/lib/ai/` and `/api/chat`)

- AI tools (`readBoardSnapshot`, `createBlocks`, `connectBlocks`) are built per-request against one board using `getCurrentBoardId()` from the request context.
- Board-scoped `useChat` persistence uses `localStoragePersistence({ keyPrefix: chatScope(boardId) })`, with keys `khoja.chat.<boardId>.*` for index, active thread, and transcripts.
- `AskPanel` is remounted on board change (`key={boardId}`) so the conversation resets to the new board's thread set.
- `migrateLegacyThread` and `migrateUnscopedThreads` adopt pre-M18 conversations into the first board opened (`khoja.chat.index` + `.active`), then clear the global bucket.

### Database migration (`drizzle/`)

- Schema (`src/db/schema.ts`) updated with new tables and `board_id` columns; `ON DELETE SET NULL` on `boards.owner_id` prevents board destruction when account deleted.
- Migration file `0001_auth_and_multi_board.sql` defines `users`, `sessions`, `boards`, `board_members`, and indexes; idempotent via `if not exists` where supported, with conditional updates for pre-existing content claim.

---

## User Stories (full list from session work)

(A full numbered list of 11 stories is in `docs/DECISIONS.md` and `docs/ROADMAP.md`. The core stories: sign-in/sign-up, session cookie, board creation, multi-board isolation, sharing with roles, AI chat scoping, unclaimed board claim, viewer-only AI tools, sign-out, board deletion without destroying shared content, and cross-board isolation verification.)

---

## Implementation Decisions (key)

- Auth uses `node:crypto` scrypt (no new dependency); session cookie uses SHA-256 hash (replay protection on DB leak); cookie uses `__Host-` prefix with `sameSite: 'none'` and `secure: true` in production, and `secure: false` with `lax` same-site in dev over HTTP.
- `boards.owner_id` is `ON DELETE SET NULL`, not `CASCADE` — deleting an account must never destroy shared boards.
- `claimUnclaimedBoard` claims only boards with zero `board_members` rows; conditional update prevents concurrent registration races from both winning.
- Every board-scoped server function re-checks `requireBoardMember()` using the board id from the server context (`getCurrentBoardId`), not from a potentially tampered client value alone.
- AI chat is per-board via `localStoragePersistence({ keyPrefix: chatScope(boardId) })` with index (`.index`), active (`.active`), transcripts (`.<threadId>`), and approval state (`.approval.<threadId>`) all scoped.
- `boards` loader uses `currentUserFn()`; missing user redirects to `/login`; missing board redirects to `/boards` with `error=board-not-found` (banner surfaced on the list page — see wayfinder ticket #2).
- `board_members` unique index `(board_id, user_id)` with role enum (`owner`, `editor`, `viewer`) prevents duplicate memberships.
- Composite foreign keys `(parent_id, board_id)` on `placements`, `memberships`, `links`, `types`, `views` prevent cross-board references.
- All collections reload per board via `queryKey` including `boardId`.
- The demo flow verified live: sign-up claims unclaimed board, second account sees empty list, shared board opens read-only (viewer gets read-only AI tool), foreign board reads/writes rejected server-side, no server-only code leaks to client bundle (verified via `dist/client/assets` absence of `scrypt|pg-pool|node:crypto`), 243 tests pass, lint and `tsc` clean, production build succeeds.

---

## Testing Decisions

- All 243 tests pass (`npm test` 11.6s, vitest, 23 test files).
- No skipped or todo tests; no `.skip` or `.todo` in the suite.
- Client bundle verified clean: `dist/client/assets` contains no server-only references (`scrypt`, `pg-pool`, `node:crypto`, `drizzle-orm` absent).
- Board isolation verified server-side: `/api/chat` without board returns 400; foreign board returns 404; viewer receives read-only AI tool; foreign board reads/writes rejected.
- Session security verified: cookie `httpOnly` set; DB stores SHA-256 hash (replay protection); cookie `secure: true` only in production.
- Production build succeeds; lint clean; `tsc --noEmit` clean.
- Manual verification performed in preview tab: sign-up claims unclaimed board, second account sees empty list, board switcher dropdown shows correct boards, new "Scratch board" shows isolation (`0 placed · 0 total`), share dialog lists members with role picker and "People with access" listing, board list shows both boards, AskPanel per board shows different chat threads.

---

## User Stories (additional detail from session work)

- As a user with a shared board, I want the board switcher to show my boards and a "New board" option, so I can navigate easily.
- As a user returning to the site, I want my session cookie to persist until it expires, not until I close the tab, so I don't have to sign in repeatedly.
- As a user on a board, I want the AI Ask panel to only use the current board's blocks and types, not a different board's content, so my conversation is relevant.
- As an owner of a board, I want to rename or delete the board, provided I have the owner role in `board_members`.
- As a viewer, I want to read the board's blocks and connections but not create or delete them, and the server should enforce this on every board-scoped server function.
- As a user switching boards, I want the Ask conversation to reset to the new board's thread set (not carry over from the previous board's transcript), so my chat history stays clean.
- As a user with a legacy conversation from before M19, I want my old chat adopted by the first board I open (not deleted), so my conversation history isn't lost.
- As a user whose session expires, I want to be redirected to `/login` when attempting to view `/boards`, rather than seeing a broken page.

---

## Implementation Decisions (continued — AI chat scoping)

- `AskPanel` remounted on board change (`key={boardId}` in the parent route) so the conversation resets to the new board's threads.
- `localStoragePersistence({ keyPrefix: chatScope(boardId) })` used per board; `CHAT_PREFIX` defines the namespace (`khoja.chat.`) and `chatScope` produces `khoja.chat.<boardId>.`.
- `migrateLegacyThread` adopts the pre-M18 single fixed thread (`tanstack-ai:khoja-board-ask`) into the new `khoja.chat.<boardId>.<threadId>` namespace.
- `migrateUnscopedThreads` moves pre-M19 unscoped conversations (those using `khoja.chat.index` + `khoja.chat.active`) into the first board that opens them, then clears the global bucket.
- Pending approval state (`approvalSeenKey` with board id) also lives in the board namespace (`khoja.chat.<boardId>.approval.<threadId>`), preventing approval cards from persisting across boards after switching.

---

## Testing Decisions (continued — AI chat scoping)

- `src/lib/chat/history.test.ts`: 8 new tests covering board-scoped keys (`loadThreadIndex('b1')`, `loadActiveThreadId('b1')`, `readThreadBlob('b1', 't1')`, cross-board isolation verified — board A's keys don't leak to board B, `chatScope` namespace verified, `migrateUnscopedThreads` verifies adoption and global bucket removal, unique `newThreadId()` verified).
- `src/lib/chat/approval-expiry.test.ts`: 1 new cross-board isolation test (approval map stored separately for different boards).
- `src/components/canvas/AskPanel.tsx`: `key={boardId}` remount verified via preview tab interaction; `localStoragePersistence({ keyPrefix: chatScope(boardId) })` produces `khoja.chat.<boardId>.` keys (verified via `Object.keys(localStorage).filter(...)` inspection).

---

## Out of Scope

- **Invitation flow**: sharing is by email of an existing account only; no invitation email flow (no invitation-token table or invitation-acceptance flow).
- **Scrypt cost parameter upgrade**: current cost embedded in digest (`COST = 16384`); upgrade path planned but not executed.
- **Real-time collaboration**: multi-user concurrent editing of blocks not implemented; only shared read access with role-based tool access.
- **AI structured data answers**: AI acts on structured data (blocks, connections) but does not answer questions about the board's structured schema beyond tool usage.
- **Public package release**: the spec covers the working app, not packaging or packaging-related build steps.
- **Advanced sharing**: board-level invitation flow (sending a link/email to someone without an account) is out of scope; only sharing by existing account email.
- **Global chat / cross-board search**: AskPanel conversations are not searchable across boards; search is scoped to the current board's thread index.

---

## Further Notes

### Data recovery incident

The original `boards.owner_id` was initially `ON DELETE CASCADE`. Deleting a test user under the original `CASCADE` FK destroyed the board and all its content (35 blocks, 34 placements, 32 links). The root cause was fixed to `ON DELETE SET NULL`; content recovered intact from the browser's TanStack Query cache. After the fix, deleting an account no longer destroys boards others work on.

### Live verification

Full flow verified in the in-app preview tab: sign-up claims the unclaimed board; second account sees an empty board list; shared board opens read-only for a viewer; reads and writes on a foreign board rejected server-side; `/api/chat` without a board returns 400; foreign board returns 404; board list, canvas (35 blocks, 34 placed, 32 links), minimap, layers, board switcher dropdown, share dialog (email + role picker + remove + role dropdown + "People with access"), all verified live.

### Environment

- Dev server runs on port 3000; `DATABASE_URL` points to local Postgres (`kho_ja`); `.env.local` also holds `GEMINI_API_KEY` and `OPENROUTER_API_KEY`.
- `npm run db:push` is the schema-apply path (`drizzle-kit`); `drizzle/README.md` documents the migration process.
- Node/npm/npx require PowerShell path prefix (`$env:Path = ...`); `git commit` uses `-F <file>` (PowerShell heredocs don't work); `npm run lint` and `npm run build` verified clean.

### Branch / commit state

Working tree clean at `d105586` on `feat/auth-and-multi-board` (parent `e7c2f33`). The branch was not pushed; no PR created. All prior fixes (`6ff9369`, `5c9278c`, `e589a5d`, `e7c2f33`, `a252795`) are in the parent chain.
