import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import {
  deletePlacementFn,
  insertPlacementFn,
  listPlacementsFn,
  updatePlacementFn,
} from '#/db/queries.functions'
import { PlacementSchema } from '#/types/schemas'

export function createPlacementsCollection(queryClient: QueryClient) {
  return createCollection(
    queryCollectionOptions({
      id: 'placements',
      queryKey: ['placements'],
      queryClient,
      schema: PlacementSchema,
      getKey: (placement) => placement.blockId,
      queryFn: async () => listPlacementsFn(),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertPlacementFn({ data: mutation.modified })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updatePlacementFn({
            data: { id: mutation.key, changes: mutation.changes },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deletePlacementFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}