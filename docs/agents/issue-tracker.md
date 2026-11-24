# Issue tracker (GitHub)

Issues live at `github.com/kho-ja/board`, published with the `ready-for-agent` label. Numbering is offset from the wayfinder tickets by one: issue #N corresponds to wayfinder ticket N+1 (ticket 01 was resolved before the issues were published and has no issue). See `docs/wayfinder-map.md` for the full frontier and resolutions log; close the remote issue when its local ticket closes.

## Closing a ticket

A ticket may be recorded resolved only after every item below is observed, not claimed:

1. `git log -1 --oneline` shows the commit that carries the fix; cite that SHA in the resolutions-log entry.
2. Local ticket status, resolutions log, remote issue, and any docs describing the changed behavior (grep the spec and map for stale wording) are all updated.
3. `npm run lint`, `npm run typecheck`, and `npm run test` all pass before the commit lands (the pre-commit hook enforces lint-staged, typecheck, and tests).

## Tooling note

On Windows/PowerShell, quote any path containing `$` (e.g. `'src/routes/boards/$boardId.test.ts'`) or the shell expands it as a variable.
