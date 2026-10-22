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

export function createBlocksCollection(
  queryClient: QueryClient,
  boardId: string,
) {
  return createCollection(
    queryCollectionOptions({
      id: `blocks:${boardId}`,
      queryKey: ['blocks', boardId],
      queryClient,
      schema: BlockSchema,
      getKey: (block) => block.id,
      queryFn: async () => listBlocksFn({ data: { boardId } }),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertBlockFn({
            data: { boardId, block: mutation.modified },
          })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateBlockFn({
            data: {
              boardId,
              id: mutation.key,
              changes: mutation.changes,
            },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteBlockFn({ data: { boardId, id: mutation.key } })
        }
      },
    }),
  )
}
