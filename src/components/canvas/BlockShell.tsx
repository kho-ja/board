import { useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react'

import type { BlockData, Vec } from '#/types'
import type { TextBlockData } from '#/types'
import { TextBlockEditor } from '#/blocks/text/TextBlock'

import { BlockRenderer } from './BlockRenderer'
import { useViewport } from './ViewportProvider'

const BLOCK_ID_MIME = 'application/x-khoja-block-id'

/** Where a drag should land, resolved by the route during a pointer drag. */
export type DropTarget = { type: 'group'; groupId: string }

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

export interface ObservableMembership {
  id: string
  groupId: string
  memberId: string
  createdAt?: Date
}

interface BlockShellProps {
  block: ObservableBlock
  placement: ObservablePlacement
  onDragEnd: (position: Vec) => void
  onCommitText?: (blockId: string, markdown: string) => void
  onSelect?: (blockId: string) => void
  onToggleSelect?: (blockId: string) => void
  selected?: boolean
  members?: ObservableBlock[]
  onGroupViewChange?: (blockId: string, view: 'card' | 'list') => void
  onMemberClick?: (blockId: string) => void
  onDropFilesOnGroup?: (
    groupId: string,
    files: File[],
    dropPoint: Vec,
  ) => void
  computeDropTarget?: (
    world: Vec,
    client: Vec,
    blockId: string,
  ) => DropTarget | null
  onDropTargetChange?: (target: DropTarget | null) => void
  onDropBlockOnGroup?: (groupId: string, blockId: string, client: Vec) => void
  isGroupDropTarget?: boolean
}

function groupAcceptsDrop(e: ReactDragEvent<HTMLElement>): boolean {
  const types = Array.from(e.dataTransfer.types)
  return types.includes('Files') || types.includes(BLOCK_ID_MIME)
}

export function BlockShell({
  block,
  placement,
  onDragEnd,
  onCommitText,
  onSelect,
  onToggleSelect,
  selected = false,
  members,
  onGroupViewChange,
  onMemberClick,
  onDropFilesOnGroup,
  computeDropTarget,
  onDropTargetChange,
  onDropBlockOnGroup,
  isGroupDropTarget = false,
}: BlockShellProps) {
  const { viewport } = useViewport()

  const elRef = useRef<HTMLDivElement>(null)
  const scaleRef = useRef(viewport.scale)
  const rafRef = useRef<number | null>(null)
  const lastPosRef = useRef<Vec | null>(null)
  const dragRef = useRef<{ pointerId: number; startScreen: Vec; startWorld: Vec } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [dragTarget, setDragTarget] = useState(false)
  const dragDepthRef = useRef(0)
  const lastClientRef = useRef<Vec | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)

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
    lastClientRef.current = null
    dropTargetRef.current = null
    onDropTargetChange?.(null)
    setDragTarget(false)
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
    lastClientRef.current = { x: e.clientX, y: e.clientY }
    const target =
      computeDropTarget?.(position, { x: e.clientX, y: e.clientY }, block.id) ??
      null
    const prev = dropTargetRef.current
    const same =
      (target === null && prev === null) ||
      (target !== null &&
        prev !== null &&
        target.type === prev.type &&
        (target.type !== 'group' ||
          target.groupId === (prev as { groupId: string }).groupId))
    if (!same) {
      dropTargetRef.current = target
      onDropTargetChange?.(target)
    }
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
    const target = dropTargetRef.current
    dropTargetRef.current = null
    onDropTargetChange?.(null)
    setDragTarget(false)
    setDragging(false)
    const pos = commit && lastPosRef.current ? lastPosRef.current : null
    if (
      pos &&
      target &&
      lastClientRef.current &&
      target.type === 'group' &&
      onDropBlockOnGroup
    ) {
      onDropBlockOnGroup(target.groupId, block.id, lastClientRef.current)
      applyPosition({ x: placement.positionX, y: placement.positionY })
      lastClientRef.current = null
      return
    }
    lastClientRef.current = null
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

  const isGroup = block.kind === 'file-group'
  const isText = block.kind === 'text'
  const canReceiveDrop = isGroup && (!!onDropFilesOnGroup || !!onDropBlockOnGroup)

  const stopTarget = () => {
    dragDepthRef.current = 0
    setDragTarget(false)
  }

  const onGroupDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!groupAcceptsDrop(e)) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragTarget(true)
  }

  const onGroupDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!groupAcceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
  }

  const onGroupDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!groupAcceptsDrop(e)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragTarget(false)
  }

  const onGroupDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!groupAcceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
    stopTarget()
    const types = Array.from(e.dataTransfer.types)
    if (types.includes('Files')) {
      const files = Array.from(e.dataTransfer.files)
      if (files.length > 0 && onDropFilesOnGroup) {
        onDropFilesOnGroup(block.id, files, { x: e.clientX, y: e.clientY })
      }
    } else if (types.includes(BLOCK_ID_MIME)) {
      const droppedBlockId = e.dataTransfer.getData(BLOCK_ID_MIME)
      if (droppedBlockId && onDropBlockOnGroup) {
        onDropBlockOnGroup(block.id, droppedBlockId, { x: e.clientX, y: e.clientY })
      }
    }
  }

  return (
    <div
      ref={elRef}
      className={`block-shell${isText ? ' is-text' : ''}${isGroup ? ' is-group' : ''}${dragging ? ' is-dragging' : ''}${editing ? ' is-editing' : ''}${selected ? ' is-selected' : ''}${dragTarget || isGroupDropTarget ? ' is-drop-target' : ''}`}
      style={{ left: placement.positionX, top: placement.positionY }}
      data-block-id={block.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishDrag(e, true)}
      onPointerCancel={(e) => finishDrag(e, false)}
      onDoubleClick={enterEdit}
      title={isText ? 'Double-click to edit' : undefined}
      onDragEnter={canReceiveDrop ? onGroupDragEnter : undefined}
      onDragOver={canReceiveDrop ? onGroupDragOver : undefined}
      onDragLeave={canReceiveDrop ? onGroupDragLeave : undefined}
      onDrop={canReceiveDrop ? onGroupDrop : undefined}
    >
      {editing ? (
        <TextBlockEditor
          data={block.data as TextBlockData}
          onCommit={commitText}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <BlockRenderer
            block={block}
            members={members}
            onGroupViewChange={
              onGroupViewChange ? (view) => onGroupViewChange(block.id, view) : undefined
            }
            onMemberClick={onMemberClick}
            fromGroupId={isGroup ? block.id : undefined}
          />
          {!isText && !isGroup && (
            <p className="block-muted">
              {Math.round(placement.positionX)}, {Math.round(placement.positionY)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
