import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { BlockData, Vec } from '#/types'
import type { TextBlockData } from '#/types'
import { TextBlockEditor } from '#/blocks/text/TextBlock'
import { BlockRenderer } from './BlockRenderer'
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
  onCommitText?: (blockId: string, markdown: string) => void
  onSelect?: (blockId: string) => void
  onToggleSelect?: (blockId: string) => void
  selected?: boolean
}

export function BlockShell({
  block,
  placement,
  onDragEnd,
  onCommitText,
  onSelect,
  onToggleSelect,
  selected = false,
}: BlockShellProps) {
  const { viewport } = useViewport()

  const elRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(viewport.scale)
  const rafRef = useRef<number | null>(null)
  const lastPosRef = useRef<Vec | null>(null)
  const dragRef = useRef<{ pointerId: number; startScreen: Vec; startWorld: Vec } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)

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
    if (e.button !== 0 || editing) return

    // Modifier-click toggles membership without starting a drag (Figma-like
    // additive selection with ctrl/cmd; we also accept shift).
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && onToggleSelect) {
      onToggleSelect(block.id)
      e.preventDefault()
      e.stopPropagation()
      return
    }

    onSelect?.(block.id)
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

  const enterEdit = () => {
    if (block.kind !== 'text' || !onCommitText) return
    setEditing(true)
  }

  const commitText = (markdown: string) => {
    setEditing(false)
    if (onCommitText && markdown.trim() !== (block.data as TextBlockData).markdown) {
      onCommitText(block.id, markdown)
    }
  }

  const isText = block.kind === 'text'

  return (
    <div
      ref={elRef}
      className={`block-shell${isText ? ' is-text' : ''}${dragging ? ' is-dragging' : ''}${editing ? ' is-editing' : ''}${selected ? ' is-selected' : ''}`}
      style={{ left: placement.positionX, top: placement.positionY }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishDrag(e, true)}
      onPointerCancel={(e) => finishDrag(e, false)}
      onDoubleClick={enterEdit}
      title={isText ? 'Double-click to edit' : undefined}
    >
      {editing ? (
        <TextBlockEditor
          data={block.data as TextBlockData}
          onCommit={commitText}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <BlockRenderer block={block} />
          {!isText && (
            <p className="block-muted">
              {block.kind} · {block.id.slice(0, 8)} · v{block.schemaVersion}
            </p>
          )}
        </>
      )}
    </div>
  )
}