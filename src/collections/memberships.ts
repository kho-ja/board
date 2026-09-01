import { createCollection } from '@tanstack/react-db'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import type { QueryClient } from '@tanstack/react-query'

import {
  deleteMembershipFn,
  insertMembershipFn,
  listMembershipsFn,
  updateMembershipFn,
} from '#/db/queries.functions'
import { MembershipSchema } from '#/types/schemas'

export function createMembershipsCollection(queryClient: QueryClient) {
  return createCollection(
    queryCollectionOptions({
      id: 'memberships',
      queryKey: ['memberships'],
      queryClient,
      schema: MembershipSchema,
      getKey: (membership) => membership.id,
      queryFn: async () => listMembershipsFn(),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertMembershipFn({ data: mutation.modified })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateMembershipFn({
            data: { id: mutation.key, changes: mutation.changes },
          })
        }
      },
      onDelete: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await deleteMembershipFn({ data: { id: mutation.key } })
        }
      },
    }),
  )
}