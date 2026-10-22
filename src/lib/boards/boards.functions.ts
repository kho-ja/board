import { createServerFn } from '@tanstack/react-start'

import type { BoardRole } from '#/lib/boards/roles'

import { requireBoardOwner, requireBoardRead, requireUser } from '#/lib/auth/guards.server'
import { findUserByEmail } from '#/lib/auth/users.server'

import {
  addBoardMember,
  countBoardOwners,
  createBoard,
  deleteBoard,
  getBoardMember,
  listBoardMembers,
  listBoardsForUser,
  removeBoardMember,
  renameBoard,
  setBoardMemberRole,
} from './queries.server'

/**
 * Board management: listing, creating, renaming, deleting and sharing.
 *
 * Reads of the caller's own board list only need a session; everything that
 * touches a *particular* board checks that the caller owns it.
 */

export const listBoardsFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    return await listBoardsForUser(user.id)
  },
)

export const createBoardFn = createServerFn({ method: 'POST' })
  .validator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return await createBoard(user.id, data.name)
  })

export const renameBoardFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; name: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardOwner(data.boardId)
    await renameBoard(data.boardId, data.name)
    return { ok: true }
  })

export const deleteBoardFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardOwner(data.boardId)
    await deleteBoard(data.boardId)
    return { ok: true }
  })

export const listBoardMembersFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listBoardMembers(data.boardId)
  })

export const shareBoardFn = createServerFn({ method: 'POST' })
  .validator(
    (input: { boardId: string; email: string; role: BoardRole }) => input,
  )
  .handler(async ({ data }) => {
    await requireBoardOwner(data.boardId)

    const email = data.email?.trim() ?? ''
    if (!email || !email.includes('@')) {
      throw new Error('Enter a valid email address.')
    }

    const invitee = await findUserByEmail(email)
    if (!invitee) {
      throw new Error(
        `No account uses ${email}. They need to sign up before you can share a board with them.`,
      )
    }

    await addBoardMember(data.boardId, invitee.id, data.role)
    return { ok: true }
  })

export const setMemberRoleFn = createServerFn({ method: 'POST' })
  .validator(
    (input: { boardId: string; userId: string; role: BoardRole }) => input,
  )
  .handler(async ({ data }) => {
    const { user } = await requireBoardOwner(data.boardId)

    if (data.role !== 'owner') {
      const target = await getBoardMember(data.boardId, data.userId)
      if (target?.role === 'owner' && (await countBoardOwners(data.boardId)) <= 1) {
        throw new Error('A board must keep at least one owner.')
      }
    }

    await setBoardMemberRole(data.boardId, data.userId, data.role)
    return { ok: true, userId: user.id }
  })

export const removeMemberFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; userId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardOwner(data.boardId)

    const target = await getBoardMember(data.boardId, data.userId)
    if (!target) return { ok: true }

    if (target.role === 'owner' && (await countBoardOwners(data.boardId)) <= 1) {
      throw new Error('A board must keep at least one owner.')
    }

    await removeBoardMember(data.boardId, data.userId)
    return { ok: true }
  })
