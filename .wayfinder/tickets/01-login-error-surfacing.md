# Ticket 1 — Login/signup error surfacing

**Type**: task (trivial)  
**Status**: closed  
**Priority**: high  
**Reporter/solver**: this session (claimed before resolution)  
**Resolution**: 2026-10-26

## Question

`src/routes/login.tsx` shows users a dead‑end "Something went wrong." for *every* failure mode:
- a network failure / 5xx from the server (the `catch` branch), and
- a server‑fn result `{ ok: false }` that arrived with no `error` string (the `result.error ??` fallback).

These are indistinguishable to a user, so a wrong‑password error feels no different from "the server is unreachable." How should these be surfaced?

## Decision

Two distinct, actionable messages:
1. **Server result, ok:false with an error string** → show that specific message (existing behaviour, unchanged). e.g. "Incorrect email or password."
2. **Exception escaped (`catch` branch)** → "We couldn't reach the server — check your connection and try again." This tells the user what to *do*, not just that something failed.
3. **ok:false with no error string (fallback)** → "Something went wrong. Please try again." — kept as a sane last resort but no longer the primary message.

## Resolution

`src/routes/login.tsx` `submit()`:

- `catch` branch now sets `setError('We couldn't reach the server — check your connection and try again.')` (replaces the generic fallback; the `caught` variable is no longer needed).
- the `result.ok` false branch keeps the specific error and falls back to `'Something went wrong. Please try again.'`.

## Links

- Map: `docs/wayfinder-map.md`
- Touched files: `src/routes/login.tsx`
