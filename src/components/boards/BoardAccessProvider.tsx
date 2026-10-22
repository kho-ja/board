import { createContext, useContext, useMemo } from 'react'

import { canEditBoard, type BoardRole } from '#/lib/boards/roles'

/**
 * The signed-in user's permissions on the board currently open.
 *
 * Provided by the board route so that deeply nested canvas components can ask
 * "may I change anything?" without every layer threading a prop through.
 * The server enforces the same rule independently — this only shapes the UI.
 */
interface BoardAccess {
  role: BoardRole
  canEdit: boolean
}

const BoardAccessContext = createContext<BoardAccess>({
  role: 'owner',
  canEdit: true,
})

export function BoardAccessProvider({
  role,
  children,
}: {
  role: BoardRole
  children: React.ReactNode
}) {
  const value = useMemo<BoardAccess>(
    () => ({ role, canEdit: canEditBoard(role) }),
    [role],
  )
  return (
    <BoardAccessContext.Provider value={value}>
      {children}
    </BoardAccessContext.Provider>
  )
}

export function useBoardAccess(): BoardAccess {
  return useContext(BoardAccessContext)
}
