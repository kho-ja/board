/**
 * The search-param value the `/boards/$boardId` loader redirects with when a
 * board is missing or the current user has no access to it. `/boards` reads
 * it to surface a banner instead of silently bouncing the user back.
 */
export const BOARD_NOT_FOUND = 'board-not-found' as const
