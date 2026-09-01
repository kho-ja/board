import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import { deleteViewFn, insertViewFn, listViewsFn, updateViewFn } from '#/db/queries.functions'
import { ViewSchema } from '#/types/schemas'

export function createViewsCollection(queryClient: QueryClient) {
  return createCollection(
    queryCollectionOptions({
      id: 'views',
      queryKey: ['views'],
      queryClient,
      schema: ViewSchema,
      getKey: (view) => view.id,
      queryFn: async () => listViewsFn(),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertViewFn({ data: mutation.modified })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateViewFn({
            data: { id: mutation.key, changes: mutation.changes },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteViewFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}