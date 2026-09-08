import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useUndoRedo } from './useUndoRedo'

describe('useUndoRedo', () => {
  let counter: { value: number }

  /** A tiny action that sets the counter to a new value and can undo/redo. */
  const setTo = (v: number) => ({
    undo: () => {
      counter.value = v
    },
    redo: () => {
      counter.value = v * 10
    },
    apply: () => {
      counter.value = v
    },
  })

  beforeEach(() => {
    counter = { value: 0 }
  })

  it('applies the action immediately and exposes UndoRedo state', () => {
    const { result } = renderHook(() => useUndoRedo())
    act(() => result.current.runRecorded('Set', setTo(5).apply, setTo(5).undo, setTo(5).redo))
    expect(counter.value).toBe(5)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('undo and redo replay the captured closures', () => {
    const { result } = renderHook(() => useUndoRedo())
    const action = setTo(7)
    act(() => result.current.runRecorded('Set', action.apply, action.undo, action.redo))
    act(() => result.current.undo())
    expect(counter.value).toBe(7) // undo closure sets value to 7 in this action
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(counter.value).toBe(70) // redo closure sets value to 70
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('performing a new action clears the redo (future) stack', () => {
    const { result } = renderHook(() => useUndoRedo())
    const a = setTo(1)
    const b = setTo(2)
    act(() => result.current.runRecorded('A', a.apply, a.undo, a.redo))
    act(() => result.current.runRecorded('B', b.apply, b.undo, b.redo))
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.runRecorded('C', b.apply, b.undo, b.redo))
    expect(result.current.canRedo).toBe(false)
  })

  it('undo with an empty stack is a no-op', () => {
    const { result } = renderHook(() => useUndoRedo())
    act(() => result.current.undo())
    expect(counter.value).toBe(0)
    expect(result.current.canUndo).toBe(false)
  })
})
