import { useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, ReactNode, RefObject } from 'react'

import { matrix, screenToWorld } from '#/lib/canvas/transform'
import type { Vec, WorldRect } from '#/lib/canvas/transform'
import { usePanZoom } from './usePanZoom'
import { useViewport } from './ViewportProvider'
import type { Tool } from './tools'

interface CanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  className?: string
  tool: Tool
  forcePan: boolean
  onPress: (world: Vec) => void
  onMarquee: (world: WorldRect | null) => void
  onImportFiles?: (files: File[], anchor: Vec) => void
  children: ReactNode
}

function hasFiles(e: ReactDragEvent<HTMLDivElement>): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

export function Canvas({
  containerRef,
  className = '',
  tool,
  forcePan,
  onPress,
  onMarquee,
  onImportFiles,
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

  const onDragEnter = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepthRef.current += 1
    setDragOver(true)
  }

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return
    e.preventDefault()
  }

  const onDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragOver(false)
  }

  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    stopDragOver()
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0 || !onImportFiles) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    onImportFiles(
      files,
      screenToWorld(viewport, { x: e.clientX - rect.left, y: e.clientY - rect.top }),
    )
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