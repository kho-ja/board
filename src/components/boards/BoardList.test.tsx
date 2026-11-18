import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

import { BoardList, type BoardListItem } from '#/components/boards/BoardList'

afterEach(cleanup)

const board = (overrides: Partial<BoardListItem> = {}): BoardListItem => ({
  id: 'b1',
  name: 'Roadmap',
  role: 'owner',
  ownerEmail: 'me@example.com',
  ...overrides,
})

/** BoardList renders router <Link>s, so it needs a router context to mount. */
const renderList = async (props: {
  fetching?: boolean
  boards?: BoardListItem[]
}) => {
  const rootRoute = createRootRoute({
    component: () => (
      <BoardList
        fetching={props.fetching ?? false}
        boards={props.boards ?? []}
        onShare={() => {}}
        onDelete={() => {}}
      />
    ),
  })
  const boardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/boards/$boardId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([boardRoute]),
    history: createMemoryHistory({ initialEntries: ['/boards'] }),
  })
  await router.load()

  return render(<RouterProvider router={router} />)
}

/**
 * The list is driven straight off the boards query, so a refetch (create,
 * delete, share) briefly re-enters the fetching state. The contract: an
 * active fetch shows skeleton cards, never the previous list — stale data
 * masquerading as current is the bug this guards against.
 */
describe('BoardList', () => {
  it('shows skeleton cards instead of stale boards while fetching', async () => {
    const { container } = await renderList({
      fetching: true,
      boards: [board()],
    })

    expect(container.querySelectorAll('ul > li')).toHaveLength(3)
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
    expect(screen.queryByText('Roadmap')).toBeNull()
  })

  it('shows the empty state when not fetching and no boards exist', async () => {
    await renderList({ fetching: false, boards: [] })

    expect(screen.getByText('No boards yet')).toBeDefined()
  })

  it('shows each board with its role when data is present', async () => {
    await renderList({
      fetching: false,
      boards: [
        board({ id: 'b1', name: 'Roadmap', role: 'owner' }),
        board({
          id: 'b2',
          name: 'Archive',
          role: 'viewer',
          ownerEmail: null,
        }),
      ],
    })

    expect(screen.getByText('Roadmap')).toBeDefined()
    expect(screen.getByText('Archive')).toBeDefined()
    expect(screen.getByText('Owner')).toBeDefined()
    expect(screen.getByText('View only')).toBeDefined()
    expect(screen.getByText('Owner me@example.com')).toBeDefined()
    expect(screen.getByText('Shared board')).toBeDefined()
  })
})
