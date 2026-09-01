import { useRef } from 'react'
import type { ReactNode, RefObject } from 'react'

import { matrix } from '#/lib/canvas/transform'
import { usePanZoom } from './usePanZoom'
import { useViewport } from './ViewportProvider'

interface CanvasProps {
  containerRef: RefObject<HTMLDivElement | null>
  className?: string
  children: ReactNode
}

export function Canvas({ containerRef, className = '', children }: CanvasProps) {
  const { viewport, setViewport } = useViewport()
  const worldRef = useRef<HTMLDivElement>(null)

  usePanZoom({ containerRef, worldRef, viewport, onCommit: setViewport })

  return (
    <div ref={containerRef} className={`canvas-viewport ${className}`}>
      <div ref={worldRef} className="canvas-world" style={{ transform: matrix(viewport) }}>
        {children}
      </div>
    </div>
  )
}