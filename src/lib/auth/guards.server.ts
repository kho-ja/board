import { redirect } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { db } from '#/db/client'
import { boardMembers } from '#/db/schema'
import { roleAtLeast, type BoardRole } from '#/lib/boards/roles'

import { getSessionUser, type SessionUser } from './session.server'

/**
 * Request-scoped authorisation helpers.
 *
 * Every board-scoped server function funnels through here, so the "which
 * boards may this caller touch?" question is answered in exactly one place.
 */

export interface BoardMembership {
  boardId: string
  userId: string
  role: BoardRole
}

export interface BoardAccess {
  user: SessionUser
  membership: BoardMembership
}

/** The signed-in user, or a redirect to the sign-in page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    throw redirect({ to: '/login', search: { redirect: undefined } })
  }
  return user
}

/** The signed-in user, or null. For pages that render differently when signed out. */
export async function optionalUser(): Promise<SessionUser | null> {
  return await getSessionUser()
}

export async function getBoardMembership(
  boardId: string,
  userId: string,
): Promise<BoardMembership | null> {
  const rows = await db
    .select()
    .from(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * Require membership of `boardId` with at least `minimum` role.
 *
 * Throws a redirect when signed out, and a plain error when the caller may
 * not touch the board. The error message deliberately does not distinguish
 * "no such board" from "not a member" —Ea stranger should not be able to probe
 * which board ids exist.
 */
export async function requireBoardAccess(
  boardId: string,
  minimum: BoardRole,
): Promise<BoardAccess> {
  const user = await requireUser()
  const membership = await getBoardMembership(boardId, user.id)
  if (!membership) {
    throw new Error('Board not found.')
  }
  if (!roleAtLeast(membership.role, minimum)) {
    throw new Error('You do not have permission to do that on this board.')
  }
  return { user, membership }
}

/** Read access (any member). */
export function requireBoardRead(boardId: string): Promise<BoardAccess> {
  return requireBoardAccess(boardId, 'viewer')
}

/** Write access (owner or editor). */
export function requireBoardWrite(boardId: string): Promise<BoardAccess> {
  return requireBoardAccess(boardId, 'editor')
}

/** Board administration (owner only). */
export function requireBoardOwner(boardId: string): Promise<BoardAccess> {
  return requireBoardAccess(boardId, 'owner')
}
