import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, LayoutGrid, LogOut } from 'lucide-react'

import { logoutFn } from '#/lib/auth/auth.functions'
import { listBoardsFn } from '#/lib/boards/boards.functions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Board switcher.
 *
 * Sits in the top bar and is the only place a board can be changed, so the
 * "which board am I looking at" question always has one answer.
 */
export function BoardSwitcher({ boardId }: { boardId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: boards = [] } = useQuery({
    queryKey: ['boards'],
    queryFn: () => listBoardsFn(),
  })

  const current = boards.find((board) => board.id === boardId)

  const signOut = async () => {
    await logoutFn({ data: undefined })
    await queryClient.invalidateQueries()
    await navigate({ to: '/login', search: { redirect: undefined } })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="board-switcher"
            aria-label="Switch board"
          />
        }
      >
        <span className="board-switcher-name">
          {current?.name ?? 'Board'}
        </span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your boards</DropdownMenuLabel>
          {boards.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              No boards yet
            </p>
          )}
          {boards.map((board) => (
            <DropdownMenuItem
              key={board.id}
              onClick={() =>
                navigate({
                  to: '/boards/$boardId',
                  params: { boardId: board.id },
                })
              }
            >
              <span className="min-w-0 flex-1 truncate">{board.name}</span>
              {board.id === boardId && (
                <Check className="size-3.5 shrink-0 opacity-70" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: '/boards' })}>
          <LayoutGrid className="size-4" />
          All boards
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
