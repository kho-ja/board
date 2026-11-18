import { Link } from '@tanstack/react-router'

import type { BoardRole } from '#/lib/boards/roles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The board grid's three states, pulled out of the `/boards` route so the
 * fetching decision is testable: an active fetch renders skeleton cards —
 * never the previous list — then either the empty state or the boards.
 *
 * `fetching` mirrors TanStack Query's `isFetching`: true during any active
 * fetch, including background refetches after a create, delete or share.
 */

export interface BoardListItem {
  id: string
  name: string
  role: BoardRole
  ownerEmail: string | null
}

const ROLE_LABEL: Record<BoardRole, string> = {
  owner: 'Owner',
  editor: 'Can edit',
  viewer: 'View only',
}

export function BoardList({
  fetching,
  boards,
  onShare,
  onDelete,
}: {
  fetching: boolean
  boards: BoardListItem[]
  onShare: (boardId: string) => void
  onDelete: (boardId: string) => void
}) {
  if (fetching) {
    return (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="flex flex-col rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-3 w-40" />
            <div className="mt-4 flex gap-2">
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (boards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">No boards yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first board to start organising things.
        </p>
      </div>
    )
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <li
          key={board.id}
          className="flex flex-col rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <Link
              to="/boards/$boardId"
              params={{ boardId: board.id }}
              className="text-base font-bold text-foreground hover:underline"
            >
              {board.name}
            </Link>
            <Badge variant="secondary">{ROLE_LABEL[board.role]}</Badge>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {board.ownerEmail ? `Owner ${board.ownerEmail}` : 'Shared board'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link to="/boards/$boardId" params={{ boardId: board.id }}>
              <Button type="button" variant="outline" size="sm">
                Open
              </Button>
            </Link>
            {board.role === 'owner' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onShare(board.id)}
                >
                  Share
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(board.id)}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
