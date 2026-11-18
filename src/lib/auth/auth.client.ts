import type { QueryClient } from '@tanstack/react-query'

import { clearCollectionsCache } from '#/collections'
import { clearChatStorage } from '#/lib/chat/history'
import { logoutFn } from '#/lib/auth/auth.functions'

/**
 * Clear client-side caches (in-memory LiveQuery collections and localStorage chat histories).
 * Prevents chat transcripts or cached board collections from leaking on shared devices.
 */
export function clearClientCaches(queryClient?: QueryClient): void {
  if (queryClient) {
    clearCollectionsCache(queryClient)
    queryClient.clear()
  }
  clearChatStorage()
}

/**
 * Sign out the current user:
 * 1. Destroy server-side session and cookie via `logoutFn`
 * 2. Clear client-side caches (query cache, collections, chat history in localStorage)
 * 3. Navigate to `/login`
 */
export async function signOut({
  queryClient,
  navigate,
}: {
  queryClient: QueryClient
  navigate: (opts: { to: string; search?: Record<string, unknown> }) => Promise<unknown> | void
}): Promise<void> {
  try {
    await logoutFn({ data: undefined })
  } finally {
    clearClientCaches(queryClient)
    await navigate({ to: '/login', search: { redirect: undefined } })
  }
}
