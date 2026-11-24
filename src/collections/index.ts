import type { QueryClient } from '@tanstack/react-query'

import { createBlocksCollection } from './blocks'
import { createLinksCollection } from './links'
import { createMembershipsCollection } from './memberships'
import { createPlacementsCollection } from './placements'
import { createTypesCollection } from './types'
import { createViewsCollection } from './views'

export function createCollections(queryClient: QueryClient, boardId: string) {
  return {
    blocksCollection: createBlocksCollection(queryClient, boardId),
    placementsCollection: createPlacementsCollection(queryClient, boardId),
    membershipsCollection: createMembershipsCollection(queryClient, boardId),
    linksCollection: createLinksCollection(queryClient, boardId),
    typesCollection: createTypesCollection(queryClient, boardId),
    viewsCollection: createViewsCollection(queryClient, boardId),
  }
}

export type Collections = ReturnType<typeof createCollections>

/**
 * Collections are per-board: each one queries a single board and caches its
 * rows under a board-scoped query key.
 *
 * They are memoised per (query client, board) so that navigating back to a
 * board reuses the same instances instead of registering a second live
 * collection with the same id.
 */
const collectionCache = new WeakMap<
  QueryClient,
  Map<string, Collections>
>()

export function getCollections(
  queryClient: QueryClient,
  boardId: string,
): Collections {
  let perClient = collectionCache.get(queryClient)
  if (!perClient) {
    perClient = new Map()
    collectionCache.set(queryClient, perClient)
  }
  const existing = perClient.get(boardId)
  if (existing) return existing
  const collections = createCollections(queryClient, boardId)
  perClient.set(boardId, collections)
  return collections
}

/** Clear cached live collections for a given queryClient (e.g. on logout). */
export function clearCollectionsCache(queryClient?: QueryClient): void {
  if (queryClient) {
    collectionCache.get(queryClient)?.clear()
  }
}

