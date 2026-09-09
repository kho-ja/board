import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import {
  MINIMAP_MARGIN_PX,
  centerOffset,
  contentBounds,
  expandBounds,
  fitView,
  miniToWorld,
  worldToMini,
  type MiniBounds,
} from '#/lib/canvas/minimap'
import { screenToWorld } from '#/lib/canvas/transform'
import { useViewport } from './ViewportProvider'

export interface MiniMapItem {
  id: string
  rect: { x: number; y: number; width: number; height: number }
  selected: boolean
}

interface MiniMapProps {
  items: MiniMapItem[]
  containerWidth: number
  containerHeight: number
  /** True while blocks are being dragged: keeps the frame still so only the
   *  dragged dots travel. */
  freezeBounds?: boolean
}

const FRAME_W = 168
const FRAME_H = 124
const FRAME_PAD = 8

function miniPointFromClient(client: { x: number; y: number }): { x: number; y: number } | null {
  const r = document.querySelector<SVGSVGElement>('.minimap-svg')?.getBoundingClientRect()
  return r ? { x: client.x - r.left, y: client.y - r.top } : null
}

/**
 * M12 — corner overview mini-map. Dots track every placed block live (drives
 * off the same rects as the link layer); the lagoon box is the current
 * viewport. The widget is a viewport scrubber: press (or hold and move)
 * anywhere and the board view stays centered on the world point under the
 * cursor — click-centering, tracked continuously. Bounds freeze for the
 * duration of a gesture so the frame never rescales under the pointer.
 */
export function MiniMap({ items, containerWidth, containerHeight, freezeBounds = false }: MiniMapProps) {
  const { viewport, setViewport } = useViewport()
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number } | null>(null)
  // Viewport scale at call time (window listeners outlive their render).
  const scaleRef = useRef(viewport.scale)
  scaleRef.current = viewport.scale
  const frozenRef = useRef<{ bounds: MiniBounds } | null>(null)

  const liveBounds = useMemo<MiniBounds | null>(() => {
    const content = contentBounds(items.map((i) => i.rect))
    if (!content) return null
    return expandBounds(content, MINIMAP_MARGIN_PX)
  }, [items])

  // Snapshot the frame when a freeze begins (minimap gesture or block drag)
  // so it never rescales under the pointer; released when the gesture ends.
  const frozen = dragging || freezeBounds
  useEffect(() => {
    if (frozen && liveBounds && !frozenRef.current) {
      frozenRef.current = { bounds: liveBounds }
    }
    if (!frozen) frozenRef.current = null
  }, [frozen, liveBounds])

  const bounds = (frozen && frozenRef.current ? frozenRef.current.bounds : liveBounds) ?? liveBounds
  const fit = bounds ? fitView(bounds, FRAME_W, FRAME_H, FRAME_PAD) : null

  // Latest frame/container for window-level callbacks (stable identity).
  const lastFitRef = useRef(fit)
  lastFitRef.current = fit
  const lastContainerRef = useRef({ width: containerWidth, height: containerHeight })
  lastContainerRef.current = { width: containerWidth, height: containerHeight }

  // The gesture starts on the svg content; coordinates always resolve
  // against its content box.
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !bounds) return
    e.stopPropagation()
    e.preventDefault()
    // Viewport scrubber: press — and continuing to hold — keeps the view
    // centered on the world point under the cursor, exactly like a click
    // but tracked continuously for the whole gesture.
    frozenRef.current = { bounds }
    dragRef.current = { pointerId: e.pointerId }
    const m = miniPointFromClient({ x: e.clientX, y: e.clientY })
    if (m) centerAt(m)
    setDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Window-level tracking below makes capture optional, not required.
    }
  }

  // Center the view on the world point under mini coords (clamped to the
  // frame) at the current zoom.
  const centerAt = useCallback(
    (m: { x: number; y: number }) => {
      const frameFit = lastFitRef.current
      if (!frameFit) return
      const clamped = {
        x: Math.min(FRAME_W, Math.max(0, m.x)),
        y: Math.min(FRAME_H, Math.max(0, m.y)),
      }
      const world = miniToWorld(clamped, frameFit)
      setViewport({
        scale: scaleRef.current,
        offset: centerOffset(world, scaleRef.current, {
          width: lastContainerRef.current.width,
          height: lastContainerRef.current.height,
        }),
      })
    },
    [setViewport],
  )

  // Window-level tracking: the frame is tiny, so scrubbing routinely leaves
  // it (clamped to the edges) and pointer capture is not reliable in every
  // embed/preview. Window listeners keep the gesture alive wherever the
  // cursor goes.
  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const m = miniPointFromClient(e)
      if (m) centerAt(m)
    },
    [centerAt],
  )

  const endWindowGesture = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      dragRef.current = null
      frozenRef.current = null
      setDragging(false)
    },
    [],
  )

  // Subscribe window tracking only for the duration of a gesture.
  useEffect(() => {
    if (!dragging) return
    const move = (e: PointerEvent) => onWindowMove(e)
    const up = (e: PointerEvent) => endWindowGesture(e)
    const cancel = (e: PointerEvent) => endWindowGesture(e)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [dragging, endWindowGesture, onWindowMove])

  if (!bounds || !fit) return null

  const topLeft = screenToWorld(viewport, { x: 0, y: 0 })
  const bottomRight =
    containerWidth > 0 && containerHeight > 0
      ? screenToWorld(viewport, { x: containerWidth, y: containerHeight })
      : null
  const box = bottomRight
    ? {
        x: worldToMini(topLeft, fit).x,
        y: worldToMini(topLeft, fit).y,
        width: Math.max(6, (worldToMini(bottomRight, fit).x - worldToMini(topLeft, fit).x)),
        height: Math.max(6, (worldToMini(bottomRight, fit).y - worldToMini(topLeft, fit).y)),
      }
    : null

  return (
    <div
      className="minimap"
      role="application"
      aria-label="Board overview. Click to center, drag to pan."
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        className="minimap-svg"
        width={FRAME_W}
        height={FRAME_H}
        viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
        onPointerDown={onPointerDown}
        style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        {items.map((item) => {
          const p = worldToMini({ x: item.rect.x, y: item.rect.y }, fit)
          const w = Math.max(2.5, item.rect.width * fit.k)
          const h = Math.max(2.5, item.rect.height * fit.k)
          return (
            <rect
              key={item.id}
              x={p.x}
              y={p.y}
              width={w}
              height={h}
              rx={1.5}
              fill={item.selected ? 'var(--lagoon)' : 'var(--sea-ink-soft)'}
              fillOpacity={item.selected ? 0.95 : 0.55}
            />
          )
        })}
        {box && (
          <rect
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            rx={3}
            fill="var(--lagoon)"
            fillOpacity={0.1}
            stroke="var(--lagoon)"
            strokeWidth={1.2}
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>
    </div>
  )
}
