import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import { deleteTypeFn, insertTypeFn, listTypesFn, updateTypeFn } from '#/db/queries.functions'
import { TypeSchema } from '#/types/schemas'

export function createTypesCollection(queryClient: QueryClient) {
  return createCollection(
    queryCollectionOptions({
      id: 'types',
      queryKey: ['types'],
      queryClient,
      schema: TypeSchema,
      getKey: (type) => type.id,
      queryFn: async () => listTypesFn(),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertTypeFn({ data: mutation.modified })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateTypeFn({
            data: { id: mutation.key, changes: mutation.changes },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteTypeFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}