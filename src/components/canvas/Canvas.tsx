import { useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode, RefObject } from 'react'

import { matrix, screenToWorld } from '#/lib/canvas/transform'
import type { Vec, WorldRect } from '#/lib/canvas/transform'
import { usePanZoom } from './usePanZoom'
import { useViewport } from './ViewportProvider'
import type { Tool } from './tools'

const BLOCK_ID_MIME = 'application/x-khoja-block-id'
const FROM_GROUP_MIME = 'application/x-khoja-from-group'

interface CanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  className?: string
  tool: Tool
  forcePan: boolean
  onPress: (world: Vec) => void
  onMarquee: (world: WorldRect | null) => void
  onImportFiles?: (files: File[], anchor: Vec) => void
  onPlaceBlockAt?: (blockId: string, world: Vec) => void
  onRemoveFromGroup?: (groupId: string, memberId: string, world: Vec) => void
  children: ReactNode
}

interface DropPayload {
  kind: 'files' | 'block' | 'remove-member'
  files?: File[]
  blockId?: string
  groupId?: string
}

function dropPayload(e: ReactDragEvent<HTMLDivElement>): DropPayload | null {
  const types = Array.from(e.dataTransfer.types)
  if (types.includes('Files')) {
    return { kind: 'files', files: Array.from(e.dataTransfer.files) }
  }
  if (types.includes(FROM_GROUP_MIME)) {
    const blockId = e.dataTransfer.getData(BLOCK_ID_MIME)
    const groupId = e.dataTransfer.getData(FROM_GROUP_MIME)
    if (blockId && groupId) return { kind: 'remove-member', blockId, groupId }
  }
  if (types.includes(BLOCK_ID_MIME)) {
    const blockId = e.dataTransfer.getData(BLOCK_ID_MIME)
    if (blockId) return { kind: 'block', blockId }
  }
  return null
}

/**
 * Reducible-state acceptance check. Must only inspect `dataTransfer.types`
 * (reliable in every drag phase); `getData()` returns "" during dragenter/
 * dragover and is only readable on `drop`. Using getData here is what broke
 * placing a dragged asset — preventDefault was never called on dragover.
 */
function dropHasContent(e: ReactDragEvent<HTMLDivElement>): boolean {
  const types = Array.from(e.dataTransfer.types)
  return (
    types.includes('Files') ||
    types.includes(BLOCK_ID_MIME) ||
    types.includes(FROM_GROUP_MIME)
  )
}

export function Canvas({
  containerRef,
  className = '',
  tool,
  forcePan,
  onPress,
  onMarquee,
  onImportFiles,
  onPlaceBlockAt,
  onRemoveFromGroup,
  children,
}: CanvasProps) {
  const { viewport, setViewport } = useViewport()
  const worldRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const marqueeRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const dragDepthRef = useRef(0)

  usePanZoom({
    containerRef,
    gridRef,
    worldRef,
    marqueeRef,
    viewport,
    tool,
    forcePan,
    onCommit: setViewport,
    onPress,
    onMarquee,
  })

  const stopDragOver = () => {
    dragDepthRef.current = 0
    setDragOver(false)
  }

  const screenToWorldAt = (e: ReactDragEvent<HTMLDivElement>): Vec | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return screenToWorld(viewport, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const onDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!dropHasContent(e)) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!dropHasContent(e)) return
    e.preventDefault()
  }

  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!dropHasContent(e)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }

  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    const payload = dropPayload(e)
    if (!payload) return
    e.preventDefault()
    stopDragOver()
    const world = screenToWorldAt(e)
    if (!world) return
    if (payload.kind === 'files' && payload.files && onImportFiles) {
      onImportFiles(payload.files, world)
    } else if (payload.kind === 'block' && payload.blockId && onPlaceBlockAt) {
      onPlaceBlockAt(payload.blockId, world)
    } else if (
      payload.kind === 'remove-member' &&
      payload.blockId &&
      payload.groupId &&
      onRemoveFromGroup
    ) {
      onRemoveFromGroup(payload.groupId, payload.blockId, world)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`canvas-viewport tool-${tool}${dragOver ? ' is-drag-over' : ''} ${className}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div ref={gridRef} className="canvas-grid" aria-hidden="true" />
      <div ref={marqueeRef} className="marquee-select" aria-hidden="true" />
      <div ref={worldRef} className="canvas-world" style={{ transform: matrix(viewport) }}>
        {children}
      </div>
    </div>
  )
}
