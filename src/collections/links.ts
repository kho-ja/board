import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import {
  deleteLinkFn,
  insertLinkFn,
  listLinksFn,
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
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteLinkFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}
