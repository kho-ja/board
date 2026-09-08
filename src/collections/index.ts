import type { QueryClient } from '@tanstack/react-query'

import { createBlocksCollection } from './blocks'
import { createLinksCollection } from './links'
import { createMembershipsCollection } from './memberships'
import { createPlacementsCollection } from './placements'
import { createTypesCollection } from './types'
import { createViewsCollection } from './views'

export function createCollections(queryClient: QueryClient) {
  return {
    blocksCollection: createBlocksCollection(queryClient),
    placementsCollection: createPlacementsCollection(queryClient),
    membershipsCollection: createMembershipsCollection(queryClient),
    linksCollection: createLinksCollection(queryClient),
    typesCollection: createTypesCollection(queryClient),
    viewsCollection: createViewsCollection(queryClient),
  }
}

export type Collections = ReturnType<typeof createCollections>
