import { useRef } from 'react'
import type { ReactNode, RefObject } from 'react'

import { matrix } from '#/lib/canvas/transform'
import type { Vec } from '#/lib/canvas/transform'
import { usePanZoom } from './usePanZoom'
import { useViewport } from './ViewportProvider'
import type { Tool } from './tools'

interface CanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  className?: string
  tool: Tool
  forcePan: boolean
  onPress: (world: Vec) => void
  onDeselect: () => void
  children: ReactNode
}

export function Canvas({
  containerRef,
  className = '',
  tool,
  forcePan,
  onPress,
  onDeselect,
  children,
}: CanvasProps) {
  const { viewport, setViewport } = useViewport()
  const worldRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  usePanZoom({
    containerRef,
    gridRef,
    worldRef,
    viewport,
    tool,
    forcePan,
    onCommit: setViewport,
    onPress,
    onDeselect,
  })

  return (
    <div ref={containerRef} className={`canvas-viewport tool-${tool} ${className}`}>
      <div ref={gridRef} className="canvas-grid" aria-hidden="true" />
      <div ref={worldRef} className="canvas-world" style={{ transform: matrix(viewport) }}>
        {children}
      </div>
    </div>
  )
}