import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import type { BoardRole } from '#/db/schema'
import { BoardList } from '#/components/boards/BoardList'
import {
  createBoardFn,
  deleteBoardFn,
  listBoardMembersFn,
  listBoardsFn,
  removeMemberFn,
  setMemberRoleFn,
  shareBoardFn,
} from '#/lib/boards/boards.functions'
import { isBoardRole } from '#/lib/boards/roles'
import { currentUserFn } from '#/lib/auth/auth.functions'
import { signOut } from '#/lib/auth/auth.client'
import { BOARD_NOT_FOUND } from '#/lib/boards/board-errors'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * The board list —Ethe app's home after signing in.
 *
 * A board is a unit of isolation: it owns its blocks, connections, types and
 * views, and it is shared with other people through explicit memberships.
 */

export const Route = createFileRoute('/boards/')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loader: async () => {
    const user = await currentUserFn()
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: undefined } })
    }
    return { user }
  },
  component: BoardsPage,
})

function BoardsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = Route.useLoaderData()
  const search = Route.useSearch()

  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [redirectError, setRedirectError] = useState<string | null>(
    search.error ?? null,
  )
  const [pending, setPending] = useState(false)
  const [sharing, setSharing] = useState<string | null>(null)

  // The $boardId loader lands here with an error param when a board is
  // missing or inaccessible. Keep the message for this visit, but strip it
  // from the URL so a refresh or shared link doesn't resurrect the banner.
  useEffect(() => {
    if (!search.error) return
    setRedirectError(search.error)
    void navigate({ to: '/boards', search: { error: undefined }, replace: true })
  }, [search.error, navigate])

  const boardsQuery = useQuery({
    queryKey: ['boards'],
    queryFn: () => listBoardsFn(),
  })

  const boards = boardsQuery.data ?? []

  const createBoard = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setRedirectError(null)
    setPending(true)
    try {
      const board = await createBoardFn({ data: { name: newName } })
      setNewName('')
      await queryClient.invalidateQueries({ queryKey: ['boards'] })
      await navigate({ to: '/boards/$boardId', params: { boardId: board.id } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create board.')
    } finally {
      setPending(false)
    }
  }

  const removeBoard = async (boardId: string) => {
    if (!window.confirm('Delete this board and everything on it?')) return
    setError(null)
    setRedirectError(null)
    try {
      await deleteBoardFn({ data: { boardId } })
      await queryClient.invalidateQueries({ queryKey: ['boards'] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete board.')
    }
  }

  const handleSignOut = async () => {
    await signOut({ queryClient, navigate })
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <p className="text-sm font-extrabold leading-none text-foreground">
                Kho-ja
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Boards</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user.name || user.email}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Your boards
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each board keeps its own blocks, connections and types.
            </p>
          </div>

          <form onSubmit={createBoard} className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New board name"
              className="w-48"
              aria-label="New board name"
              maxLength={64}
            />
            <Button type="submit" disabled={pending || !newName.trim()}>
              New board
            </Button>
          </form>
        </div>

        {(redirectError || error) && (
          <p
            role="alert"
            className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error ??
              (redirectError === BOARD_NOT_FOUND
                ? 'That board could not be found, or you do not have access to it.'
                : redirectError)}
          </p>
        )}

        <BoardList
          fetching={boardsQuery.isFetching}
          boards={boards}
          onShare={setSharing}
          onDelete={(boardId) => void removeBoard(boardId)}
        />
      </div>

      <ShareDialog
        boardId={sharing}
        onClose={() => setSharing(null)}
        onChanged={() =>
          queryClient.invalidateQueries({ queryKey: ['boards'] })
        }
      />
    </main>
  )
}

function ShareDialog({
  boardId,
  onClose,
  onChanged,
}: {
  boardId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<BoardRole>('editor')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const membersQuery = useQuery({
    queryKey: ['board-members', boardId],
    queryFn: () => listBoardMembersFn({ data: { boardId: boardId! } }),
    enabled: !!boardId,
  })

  const share = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!boardId) return
    setError(null)
    if (!isBoardRole(role) || (role !== 'editor' && role !== 'viewer')) {
      setError('Unknown role.')
      return
    }
    setPending(true)
    try {
      await shareBoardFn({ data: { boardId, email, role } })
      setEmail('')
      await membersQuery.refetch()
      onChanged()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not share.')
    } finally {
      setPending(false)
    }
  }

  const changeRole = async (userId: string, next: BoardRole) => {
    if (!boardId) return
    setError(null)
    if (!isBoardRole(next)) {
      setError('Unknown role.')
      return
    }
    try {
      await setMemberRoleFn({ data: { boardId, userId, role: next } })
      await membersQuery.refetch()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update role.')
    }
  }

  const remove = async (userId: string) => {
    if (!boardId) return
    setError(null)
    try {
      await removeMemberFn({ data: { boardId, userId } })
      await membersQuery.refetch()
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not remove member.',
      )
    }
  }

  return (
    <Dialog
      open={!!boardId}
      onOpenChange={(next) => {
        if (!next) {
          setError(null)
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this board</DialogTitle>
          <DialogDescription>
            People you add here can open this board. Viewers cannot change
            anything.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={share} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="share-email">Email</Label>
            <Input
              id="share-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="share-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                if (isBoardRole(value)) setRole(value)
              }}
            >
              <SelectTrigger id="share-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Can edit</SelectItem>
                <SelectItem value="viewer">View only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            Add person
          </Button>
        </form>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">People with access</p>
          {(membersQuery.data ?? []).map((member) => (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {member.name || member.email}
                </p>
                {member.name && (
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  onValueChange={(value) => {
                    if (isBoardRole(value)) void changeRole(member.userId, value)
                  }}
                >
                  <SelectTrigger className="w-28" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="editor">Can edit</SelectItem>
                    <SelectItem value="viewer">View only</SelectItem>
                  </SelectContent>
                </Select>
                <DialogClose
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove(member.userId)}
                    />
                  }
                >
                  Remove
                </DialogClose>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
