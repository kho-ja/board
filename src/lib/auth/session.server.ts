import { createHash, randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { getCookie, setCookie } from '@tanstack/react-start/server'

import { db } from '#/db/client'
import { sessions, users } from '#/db/schema'

/**
 * Server-side session handling.
 *
 * A session is a random 32-byte token handed to the browser in an httpOnly
 * cookie. Only the SHA-256 hash of the token is stored, so a database leak
 * cannot be replayed as a live session.
 */

export const DEV_SESSION_COOKIE = 'kj_session'
export const PROD_SESSION_COOKIE = '__Host-kj_session'

/**
 * In production, prefix with `__Host-` to bind the cookie to the exact host
 * and prohibit domain overrides or subdomain tampering.
 * In development, drop the prefix so local HTTP works without browser rejection.
 */
export function getSessionCookieName(
  env: string = process.env.NODE_ENV ?? 'development',
): string {
  return env === 'production' ? PROD_SESSION_COOKIE : DEV_SESSION_COOKIE
}

export const SESSION_COOKIE = getSessionCookieName()

/** 30 days. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionUser {
  id: string
  email: string
  name: string | null
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function cookieOptions(
  env: string = process.env.NODE_ENV ?? 'development',
) {
  const isProd = env === 'production'
  return {
    httpOnly: true,
    // In production, pair __Host- with SameSite=None and Secure=true.
    // In dev over HTTP, keep Secure=false (otherwise browsers drop the cookie)
    // and SameSite=Lax (browsers reject SameSite=None without Secure).
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    secure: isProd,
  }
}

/** Create a session for `userId` and write the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt })

  const cookieName = getSessionCookieName()
  setCookie(cookieName, token, {
    ...cookieOptions(),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

/** The signed-in user for this request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieName = getSessionCookieName()
  const token = getCookie(cookieName) ?? getCookie(DEV_SESSION_COOKIE)
  if (!token) return null

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashToken(token)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  if (row.session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id))
    setCookie(cookieName, '', { ...cookieOptions(), maxAge: 0 })
    if (cookieName !== DEV_SESSION_COOKIE) {
      setCookie(DEV_SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
    }
    return null
  }

  return { id: row.user.id, email: row.user.email, name: row.user.name }
}

/** End this request's session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const cookieName = getSessionCookieName()
  const token = getCookie(cookieName) ?? getCookie(DEV_SESSION_COOKIE)
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
  }
  setCookie(cookieName, '', { ...cookieOptions(), maxAge: 0 })
  if (cookieName !== DEV_SESSION_COOKIE) {
    setCookie(DEV_SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
  }
}

/** Drop every session belonging to a user (used when an account is removed). */
export async function destroyUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** Remove expired sessions. Cheap enough to call opportunistically. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
