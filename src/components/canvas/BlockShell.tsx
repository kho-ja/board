import { useEffect, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react'

import type { BlockData, FileGroupBlockData, SchemaDef, Vec } from '#/types'
import type { TextBlockData } from '#/types'
import type { PortSide } from '#/lib/canvas/geometry'
import { TextBlockEditor } from '#/blocks/text/TextBlock'

import { BlockRenderer } from './BlockRenderer'
import { useViewport } from './ViewportProvider'
import type { Tool } from './tools'

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
  schema?: SchemaDef | null
  tool?: Tool
  isConnecting?: boolean
  isConnectSource?: boolean
  isConnectTarget?: boolean
  onConnectClick?: (blockId: string) => void
  onStartConnect?: (blockId: string, side: PortSide, screenPos: Vec) => void
  onDragMove?: (blockId: string, pos: Vec) => void
  onDragEnd: (position: Vec) => void
  onDragCancel?: () => void
  onCommitText?: (blockId: string, markdown: string) => void
  onSelect?: (blockId: string) => void
  onToggleSelect?: (blockId: string) => void
  selected?: boolean
  inMultiSelection?: boolean
  livePosition?: Vec | null
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
  onEditSchema?: (schema: SchemaDef) => void
}

function groupAcceptsDrop(e: ReactDragEvent<HTMLElement>): boolean {
  const types = Array.from(e.dataTransfer.types)
  return types.includes('Files') || types.includes(BLOCK_ID_MIME)
}

export function BlockShell({
  block,
  placement,
  schema,
  tool,
  isConnecting = false,
  isConnectSource = false,
  isConnectTarget = false,
  onConnectClick,
  onStartConnect,
  onDragMove,
  onDragEnd,
  onDragCancel,
  onCommitText,
  onSelect,
  onToggleSelect,
  selected = false,
  inMultiSelection = false,
  livePosition = null,
  members,
  onGroupViewChange,
  onMemberClick,
  onDropFilesOnGroup,
  computeDropTarget,
  onDropTargetChange,
  onDropBlockOnGroup,
  isGroupDropTarget = false,
  onEditSchema,
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
  // M10 — pressing an already-selected block inside a multi-selection keeps
  // the selection for a potential group drag; a plain click (no real move)
  // collapses back to that single block on pointer-up instead.
  const deferredCollapseRef = useRef(false)

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

    if (tool === 'link' || isConnecting) {
      e.stopPropagation()
      onConnectClick?.(block.id)
      return
    }

    // Modifier-click toggles membership without starting a drag (Figma-like
    // additive selection with ctrl/cmd; we also accept shift).
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      e.stopPropagation()
      onToggleSelect?.(block.id)
      return
    }

    if (selected && inMultiSelection) {
      // Part of an active multi-selection: preserve it so the gesture can
      // become a group drag. A click without movement collapses on release.
      deferredCollapseRef.current = true
    } else {
      onSelect?.(block.id)
    }
    e.stopPropagation()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointer capture can fail for non-primary or synthetic pointers; the
      // drag still tracks via bubbled pointermove/pointerup handlers.
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startScreen: { x: e.clientX, y: e.clientY },
      startWorld: { x: placement.positionX, y: placement.positionY },
    }
    lastPosRef.current = { x: placement.positionX, y: placement.positionY }
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    const s = scaleRef.current || 1
    const dx = (e.clientX - drag.startScreen.x) / s
    const dy = (e.clientY - drag.startScreen.y) / s
    const next: Vec = {
      x: Math.round(drag.startWorld.x + dx),
      y: Math.round(drag.startWorld.y + dy),
    }

    lastPosRef.current = next
    lastClientRef.current = { x: e.clientX, y: e.clientY }

    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (lastPosRef.current) {
          applyPosition(lastPosRef.current)
          onDragMove?.(block.id, lastPosRef.current)
          if (computeDropTarget && lastClientRef.current) {
            const target = computeDropTarget(
              lastPosRef.current,
              lastClientRef.current,
              block.id,
            )
            dropTargetRef.current = target
            onDropTargetChange?.(target)
          }
        }
      })
    }
  }

  const finishDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Pointer might already be released
      }
    }

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const finalPos = lastPosRef.current ?? {
      x: placement.positionX,
      y: placement.positionY,
    }

    dragRef.current = null
    lastPosRef.current = null
    setDragging(false)

    const target = dropTargetRef.current
    dropTargetRef.current = null
    onDropTargetChange?.(null)

    // Plain click on a multi-selected block collapses the selection to it.
    const deferredCollapse = deferredCollapseRef.current
    deferredCollapseRef.current = false
    const movedPx = Math.hypot(
      e.clientX - drag.startScreen.x,
      e.clientY - drag.startScreen.y,
    )
    const COLLAPSE_TOLERANCE_PX = 4

    if (commit) {
      if (target?.type === 'group' && onDropBlockOnGroup && lastClientRef.current) {
        onDropBlockOnGroup(target.groupId, block.id, lastClientRef.current)
        applyPosition({ x: placement.positionX, y: placement.positionY })
      } else {
        applyPosition(finalPos)
        onDragEnd(finalPos)
      }
      if (deferredCollapse && movedPx <= COLLAPSE_TOLERANCE_PX) {
        onSelect?.(block.id)
      }
    } else {
      applyPosition({ x: placement.positionX, y: placement.positionY })
      onDragCancel?.()
    }
  }

  const isText = block.kind === 'text'
  const isGroup = block.kind === 'file-group'
  const isObject = !isText && !isGroup && block.kind !== 'file'
  const canReceiveDrop = isGroup && (Boolean(onDropFilesOnGroup) || Boolean(onDropBlockOnGroup))

  const enterEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isText) {
      setEditing(true)
    } else if (isGroup) {
      if (onGroupViewChange) {
        const groupData = block.data as FileGroupBlockData
        const nextView = groupData.currentView === 'card' ? 'list' : 'card'
        onGroupViewChange(block.id, nextView)
      }
    } else if (isObject && schema && onEditSchema) {
      onEditSchema(schema)
    }
  }

  const blockHint = isText
    ? 'Double-click to edit text'
    : isGroup
      ? 'Double-click to toggle group layout (card/list)'
      : isObject
        ? 'Double-click to edit object type schema'
        : undefined

  const commitText = (markdown: string) => {
    setEditing(false)
    onCommitText?.(block.id, markdown)
  }

  const stopTarget = () => {
    dragDepthRef.current = 0
    setDragTarget(false)
  }

  const onGroupDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!groupAcceptsDrop(e)) return
    e.preventDefault()
    e.stopPropagation()
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
      className={`block-shell${isText ? ' is-text' : ''}${isGroup ? ' is-group' : ''}${isObject ? ' is-object' : ''}${dragging ? ' is-dragging' : ''}${editing ? ' is-editing' : ''}${selected ? ' is-selected' : ''}${dragTarget || isGroupDropTarget ? ' is-drop-target' : ''}${isConnectSource ? ' is-connecting-source' : ''}${isConnectTarget ? ' is-connect-target' : ''}`}
      style={{ left: livePosition?.x ?? placement.positionX, top: livePosition?.y ?? placement.positionY }}
      data-block-id={block.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finishDrag(e, true)}
      onPointerCancel={(e) => finishDrag(e, false)}
      onDoubleClick={enterEdit}
      title={blockHint}
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
            schema={schema}
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
          <div
            className="block-port block-port-top"
            title="Connect"
            onPointerDown={(e) => {
              e.stopPropagation()
              onStartConnect?.(block.id, 'top', { x: e.clientX, y: e.clientY })
            }}
          />
          <div
            className="block-port block-port-right"
            title="Connect"
            onPointerDown={(e) => {
              e.stopPropagation()
              onStartConnect?.(block.id, 'right', { x: e.clientX, y: e.clientY })
            }}
          />
          <div
            className="block-port block-port-bottom"
            title="Connect"
            onPointerDown={(e) => {
              e.stopPropagation()
              onStartConnect?.(block.id, 'bottom', { x: e.clientX, y: e.clientY })
            }}
          />
          <div
            className="block-port block-port-left"
            title="Connect"
            onPointerDown={(e) => {
              e.stopPropagation()
              onStartConnect?.(block.id, 'left', { x: e.clientX, y: e.clientY })
            }}
          />
        </>
      )}
    </div>
  )
}
