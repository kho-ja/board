import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '#/db/client'
import { boardMembers, boards, users } from '#/db/schema'
import type { BoardRole } from '#/lib/boards/roles'

/**
 * Server-only board and membership records.
 *
 * Ownership lives in `board_members` (a row with role `owner`); `boards.owner_id`
 * is a denormalised convenience column so "boards I own" is one index lookup.
 */

export interface BoardSummary {
  id: string
  name: string
  role: BoardRole
  ownerId: string | null
  ownerEmail: string | null
  createdAt: Date
  updatedAt: Date
}

export interface BoardMemberSummary {
  userId: string
  email: string
  name: string | null
  role: BoardRole
  createdAt: Date
}

/** Every board the user is a member of, oldest first. */
export async function listBoardsForUser(userId: string): Promise<BoardSummary[]> {
  const rows = await db
    .select({ board: boards, role: boardMembers.role, owner: users })
    .from(boardMembers)
    .innerJoin(boards, eq(boardMembers.boardId, boards.id))
    .leftJoin(users, eq(boards.ownerId, users.id))
    .where(eq(boardMembers.userId, userId))
    .orderBy(asc(boards.createdAt))

  return rows.map((row) => ({
    id: row.board.id,
    name: row.board.name,
    role: row.role,
    ownerId: row.board.ownerId,
    ownerEmail: row.owner?.email ?? null,
    createdAt: row.board.createdAt,
    updatedAt: row.board.updatedAt,
  }))
}

export async function getBoard(boardId: string): Promise<BoardSummary | null> {
  const rows = await db
    .select({ board: boards, owner: users })
    .from(boards)
    .leftJoin(users, eq(boards.ownerId, users.id))
    .where(eq(boards.id, boardId))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.board.id,
    name: row.board.name,
    role: 'owner',
    ownerId: row.board.ownerId,
    ownerEmail: row.owner?.email ?? null,
    createdAt: row.board.createdAt,
    updatedAt: row.board.updatedAt,
  }
}

/**
 * Create a board owned by `userId`, plus the matching `owner` membership.
 */
export async function createBoard(
  userId: string,
  name: string,
): Promise<BoardSummary> {
  const boardId = crypto.randomUUID()
  const now = new Date()

  await db.insert(boards).values({
    id: boardId,
    name: name.trim() || 'Untitled board',
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  })
  await db
    .insert(boardMembers)
    .values({ boardId, userId, role: 'owner', createdAt: now })

  return {
    id: boardId,
    name: name.trim() || 'Untitled board',
    role: 'owner',
    ownerId: userId,
    ownerEmail: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function renameBoard(boardId: string, name: string): Promise<void> {
  await db
    .update(boards)
    .set({ name: name.trim() || 'Untitled board', updatedAt: new Date() })
    .where(eq(boards.id, boardId))
}

/**
 * Delete a board and everything on it.
 *
 * The board-scoped tables reference `boards` with `ON DELETE CASCADE`, and the
 * composite foreign keys from placements/links/memberships to blocks cascade
 * from there — so one delete removes the whole tree.
 */
export async function deleteBoard(boardId: string): Promise<void> {
  await db.delete(boards).where(eq(boards.id, boardId))
}

export async function listBoardMembers(
  boardId: string,
): Promise<BoardMemberSummary[]> {
  const rows = await db
    .select({ member: boardMembers, user: users })
    .from(boardMembers)
    .innerJoin(users, eq(boardMembers.userId, users.id))
    .where(eq(boardMembers.boardId, boardId))
    .orderBy(asc(users.email))

  return rows.map((row) => ({
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.member.role,
    createdAt: row.member.createdAt,
  }))
}

export async function getBoardMember(
  boardId: string,
  userId: string,
): Promise<{ role: BoardRole } | null> {
  const rows = await db
    .select({ role: boardMembers.role })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/** Add (or re-add) a member. Existing membership keeps its role unless told otherwise. */
export async function addBoardMember(
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<void> {
  await db
    .insert(boardMembers)
    .values({ boardId, userId, role, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [boardMembers.boardId, boardMembers.userId],
      set: { role },
    })
}

export async function setBoardMemberRole(
  boardId: string,
  userId: string,
  role: BoardRole,
): Promise<void> {
  await db
    .update(boardMembers)
    .set({ role })
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    )
}

export async function removeBoardMember(
  boardId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(boardMembers)
    .where(
      and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    )
}

/** How many owners a board has — used to refuse removing the last one. */
export async function countBoardOwners(boardId: string): Promise<number> {
  const rows = await db
    .select({ id: boardMembers.userId })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.role, 'owner')))
  return rows.length
}

/**
 * Claim a board that has no owner yet.
 *
 * The multi-tenancy migration parks any pre-existing content on one
 * unclaimed board. The first account to register takes it over, so a local
 * install does not silently lose its board when auth lands. The claim is a
 * conditional update, so two simultaneous registrations cannot both win.
 *
 * Only boards with *no members at all* are claimable: a board whose members
 * were removed along with their account is not up for grabs.
 */
export async function claimUnclaimedBoard(userId: string): Promise<string | null> {
  const candidates = await db
    .select({ id: boards.id })
    .from(boards)
    .where(isNull(boards.ownerId))
    .orderBy(asc(boards.createdAt))
    .limit(10)

  for (const candidate of candidates) {
    const claimedId = await db.transaction(async (tx) => {
      const members = await tx
        .select({ userId: boardMembers.userId })
        .from(boardMembers)
        .where(eq(boardMembers.boardId, candidate.id))
        .limit(1)

      if (members.length > 0) return null

      const claimed = await tx
        .update(boards)
        .set({ ownerId: userId, updatedAt: new Date() })
        .where(and(eq(boards.id, candidate.id), isNull(boards.ownerId)))
        .returning({ id: boards.id })

      if (claimed.length === 0) return null

      await tx
        .insert(boardMembers)
        .values({
          boardId: candidate.id,
          userId,
          role: 'owner',
          createdAt: new Date(),
        })
        .onConflictDoNothing()

      return candidate.id
    })

    if (claimedId) return claimedId
  }

  return null
}

/** Total number of boards — used by the board list empty state. */
export async function countBoards(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(boards)
  return rows[0]?.n ?? 0
}
