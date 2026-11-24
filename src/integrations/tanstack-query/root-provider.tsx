import { QueryClient } from '@tanstack/react-query'

/**
 * Router-level context.
 *
 * The board collections are *not* here: they are scoped to a single board, so
 * they are created per board inside the board route (see #/collections).
 */
export function getContext() {
  const queryClient = new QueryClient()

  return {
    queryClient,
  }
}
