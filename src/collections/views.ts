import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import { deleteViewFn, insertViewFn, listViewsFn, updateViewFn } from '#/db/queries.functions'
import { ViewSchema } from '#/types/schemas'

export function createViewsCollection(
  queryClient: QueryClient,
  boardId: string,
) {
  return createCollection(
    queryCollectionOptions({
      id: `views:${boardId}`,
      queryKey: ['views', boardId],
      queryClient,
      schema: ViewSchema,
      getKey: (view) => view.id,
      queryFn: async () => listViewsFn({ data: { boardId } }),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertViewFn({
            data: { boardId, view: mutation.modified },
          })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateViewFn({
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
          await deleteViewFn({ data: { boardId, id: mutation.key } })
        }
      },
    }),
  )
}
