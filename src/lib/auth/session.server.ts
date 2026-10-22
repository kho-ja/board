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

export const SESSION_COOKIE = 'kj_session'

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

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  }
}

/** Create a session for `userId` and write the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt })

  setCookie(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

/** The signed-in user for this request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getCookie(SESSION_COOKIE)
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
    setCookie(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
    return null
  }

  return { id: row.user.id, email: row.user.email, name: row.user.name }
}

/** End this request's session and clear the cookie. */
export async function destroySession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE)
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
  }
  setCookie(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 })
}

/** Drop every session belonging to a user (used when an account is removed). */
export async function destroyUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

/** Remove expired sessions. Cheap enough to call opportunistically. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}
