import { useCallback, useRef, useState } from 'react'

export interface UndoAction {
  label: string
  /** Apply the inverse of the recorded action (to restore the prior state). */
  undo: () => void
  /** Re-apply the recorded action (to restore the forward state). */
  redo: () => void
}

/**
 * A small action-based undo/redo stack. Mutations that should be reversible
 * call `runRecorded(label, apply, undo, redo)`, which executes `apply()` and
 * registers the two closures. `undo()`/`redo()` replay the captured closures
 * (and are themselves never re-recorded, so replay doesn't nest).
 */
export function useUndoRedo() {
  const [stack, setStack] = useState<{ past: UndoAction[]; future: UndoAction[] }>({
    past: [],
    future: [],
  })

  const stackRef = useRef(stack)
  stackRef.current = stack

  const runRecorded = useCallback(
    (label: string, apply: () => void, undo: () => void, redo: () => void) => {
      apply()
      setStack((prev) => ({
        past: [...prev.past, { label, undo, redo }],
        future: [],
      }))
    },
    [],
  )

  const undo = useCallback(() => {
    const { past, future } = stackRef.current
    const entry = past[past.length - 1]
    if (!entry) return
    entry.undo()
    setStack({
      past: past.slice(0, -1),
      future: [...future, entry],
    })
  }, [])

  const redo = useCallback(() => {
    const { past, future } = stackRef.current
    const entry = future[future.length - 1]
    if (!entry) return
    entry.redo()
    setStack({
      past: [...past, entry],
      future: future.slice(0, -1),
    })
  }, [])

  const canUndo = stack.past.length > 0
  const canRedo = stack.future.length > 0

  return { runRecorded, undo, redo, canUndo, canRedo }
}
