/**
 * Board membership roles.
 *
 * Kept in its own module (rather than in the Drizzle schema) so that client
 * components can import the type without dragging `drizzle-orm/pg-core` into
 * the browser bundle.
 */

export type BoardRole = 'owner' | 'editor' | 'viewer'

export const BOARD_ROLES = ['owner', 'editor', 'viewer'] as const

export function isBoardRole(value: unknown): value is BoardRole {
  return (
    value === 'owner' || value === 'editor' || value === 'viewer'
  )
}

/** Roles ordered from least to most privileged. */
export const BOARD_ROLE_RANK: Record<BoardRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
}

/** Whether the role may change board content. */
export function canEditBoard(role: BoardRole): boolean {
  return roleAtLeast(role, 'editor')
}

/** Whether the role may administer the board (rename, delete, share). */
export function canAdministerBoard(role: BoardRole): boolean {
  return roleAtLeast(role, 'owner')
}

/**
 * The authorisation predicate used by the server guards: does `role` meet at
 * least `minimum`?
 */
export function roleAtLeast(role: BoardRole, minimum: BoardRole): boolean {
  return BOARD_ROLE_RANK[role] >= BOARD_ROLE_RANK[minimum]
}
