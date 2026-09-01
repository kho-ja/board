import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import {
  deleteBlockFn,
  insertBlockFn,
  listBlocksFn,
  updateBlockFn,
} from '#/db/queries.functions'
import { BlockSchema } from '#/types/schemas'

export function createBlocksCollection(queryClient: QueryClient) {
  return createCollection(
    queryCollectionOptions({
      id: 'blocks',
      queryKey: ['blocks'],
      queryClient,
      schema: BlockSchema,
      getKey: (block) => block.id,
      queryFn: async () => listBlocksFn(),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertBlockFn({ data: mutation.modified })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateBlockFn({
            data: { id: mutation.key, changes: mutation.changes },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteBlockFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}