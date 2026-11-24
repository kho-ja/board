# Ticket 4 — Cookie security (`__Host-`, `secure`)

**Type**: task (polish)  
**Status**: closed  
**Priority**: 4  
**Effort**: small  
**Resolution**: 2026-11-18  

## Question / Problem

The session cookie (`kj_session`) used default lax settings without the `__Host-` prefix and only toggled `secure: process.env.NODE_ENV === 'production'`. In production, cookies should use the `__Host-` prefix with `sameSite: None` and `secure: true` to prevent subdomain tampering and ensure host isolation, while dev over HTTP keeps `secure: false` and `sameSite: Lax` to prevent browser rejections.

## Resolution

- In `src/lib/auth/session.server.ts`:
  - `getSessionCookieName(env)` returns `__Host-kj_session` in production and `kj_session` in development.
  - `cookieOptions(env)` sets `sameSite: 'none'` and `secure: true` in production, with `httpOnly: true` and `path: '/'`.
  - In development over HTTP, `secure: false` and `sameSite: 'lax'` are retained.
  - `getSessionUser()` and `destroySession()` check the active cookie name and cleanly fall back/clear both to prevent session drops during transitions.
- Added unit tests in `src/lib/auth/session.server.test.ts`.
- Updated spec in `docs/spec-m19-auth-and-multi-board.md`.
- Fixed in commit `f70774a`.
