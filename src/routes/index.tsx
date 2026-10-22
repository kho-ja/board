import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * The old single-board URL. Everything now lives under `/boards`, so the root
 * simply forwards there.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/boards' })
  },
})
