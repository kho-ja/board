import { QueryClient } from '@tanstack/react-query'

import { createCollections } from '#/collections'

export function getContext() {
  const queryClient = new QueryClient()

  const collections = createCollections(queryClient)

  return {
    queryClient,
    collections,
  }
}
