import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import {
  deleteLinkFn,
  insertLinkFn,
  listLinksFn,
  updateLinkFn,
} from '#/db/queries.functions'
import { LinkSchema } from '#/types/schemas'

export function createLinksCollection(queryClient: QueryClient) {
  return createCollection(
    queryCollectionOptions({
      id: 'links',
      queryKey: ['links'],
      queryClient,
      schema: LinkSchema,
      getKey: (link) => link.id,
      queryFn: async () => listLinksFn(),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertLinkFn({ data: mutation.modified })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateLinkFn({
            data: { id: mutation.key, changes: mutation.changes },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteLinkFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}
