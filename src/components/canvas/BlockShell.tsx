import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { BlockData, Vec } from '#/types'
import type { FileBlockData, FileGroupBlockData, ObjectBlockData, TextBlockData } from '#/types'
import { useViewport } from './ViewportProvider'

export interface ObservableBlock {
  id: string
  kind: string
  data: BlockData
  schemaVersion: string
  createdAt?: Date
  updatedAt?: Date
}

export interface ObservablePlacement {
  blockId: string
  positionX: number
  positionY: number
}

interface BlockShellProps {
  block: ObservableBlock
  placement: ObservablePlacement
  onDragEnd: (position: Vec) => void
}

export function blockTitle(block: ObservableBlock): string {
  switch (block.kind) {
    case 'text':
      return (block.data as TextBlockData).markdown.trim() || 'Empty text block'
    case 'file':
      return (block.data as FileBlockData).name
    case 'file-group':
      return (block.data as FileGroupBlockData).name
    default:
      return (block.data as ObjectBlockData).schemaId
  }
}

export function BlockShell({ block, placement, onDragEnd }: BlockShellProps) {
  const { viewport } = useViewport()

  const elRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(viewport.scale)
  const rafRef = useRef<number | null>(null)
  const lastPosRef = useRef<Vec | null>(null)
  const dragRef = useRef<{ pointerId: number; startScreen: Vec; startWorld: Vec } | null>(null)
  const [dragging, setDragging] = useState(false)

  scaleRef.current = viewport.scale

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const applyPosition = (position: Vec) => {
    const el = elRef.current
    if (el) {
      el.style.left = `${position.x}px`
      el.style.top = `${position.y}px`
    }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      startWorld: { x: placement.positionX, y: placement.positionY },
    }
    lastPosRef.current = null
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    e.preventDefault()
    const position = {
      x: drag.startWorld.x + (e.clientX - drag.startScreen.x) / scaleRef.current,
      y: drag.startWorld.y + (e.clientY - drag.startScreen.y) / scaleRef.current,
    }
    lastPosRef.current = position
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (lastPosRef.current) applyPosition(lastPosRef.current)
      })
    }
  }

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = dragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    dragRef.current = null
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // pointer may already have been released
    }
    setDragging(false)
    if (commit && lastPosRef.current) {
      onDragEnd(lastPosRef.current)
    }
  }

  return (
    <div
      ref={elRef}
      className={`block-shell${dragging ? ' is-dragging' : ''}`}
      style={{ left: placement.positionX, top: placement.positionY }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishDrag(e, true)}
      onPointerCancel={(e) => finishDrag(e, false)}
    >
      <p className="block-title">{blockTitle(block)}</p>
      <p className="block-muted">
        {block.kind} · {block.id.slice(0, 8)} · v{block.schemaVersion}
      </p>
    </div>
  )
}