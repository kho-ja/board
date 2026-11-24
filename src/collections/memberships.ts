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

export function createMembershipsCollection(
  queryClient: QueryClient,
  boardId: string,
) {
  return createCollection(
    queryCollectionOptions({
      id: `memberships:${boardId}`,
      queryKey: ['memberships', boardId],
      queryClient,
      schema: MembershipSchema,
      getKey: (membership) => membership.id,
      queryFn: async () => listMembershipsFn({ data: { boardId } }),
      onInsert: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await insertMembershipFn({
            data: { boardId, membership: mutation.modified },
          })
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const mutation of transaction.mutations) {
          await updateMembershipFn({
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
          await deleteMembershipFn({ data: { boardId, id: mutation.key } })
        }
      },
    }),
  )
}
