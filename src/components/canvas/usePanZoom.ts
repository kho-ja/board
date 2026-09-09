import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import {
  gridSizeForScale,
  matrix,
  mod,
  panBy,
  screenToWorld,
  viewportChanged,
  zoomAt,
} from '#/lib/canvas/transform'
import type { Vec, ViewportTransform, WorldRect } from '#/lib/canvas/transform'
import type { Tool } from './tools'

interface UsePanZoomOptions {
  containerRef: RefObject<HTMLElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  worldRef: RefObject<HTMLDivElement | null>
  marqueeRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  tool: Tool
  forcePan: boolean
  onCommit: (viewport: ViewportTransform) => void
  onPress: (world: Vec) => void
  onMarquee: (world: WorldRect | null) => void
}

const WHEEL_STEP = 0.0015
const COMMIT_DELAY_MS = 90
const MARQUEE_TOLERANCE_PX = 3

/**
 * Hot path (pan/zoom/grid frames) stays in refs and writes the CSS transform
 * and dot-grid geometry directly to the DOM; the viewport is committed to
 * React state only at the end of a gesture.
 *
 * Tool semantics (canvas-app standard):
 * - wheel always zooms at the cursor
 * - Move tool (V): over a block, BlockShell owns drag/select; an empty-canvas
 *   press starts a box/marquee selection. Move never pans.
 * - Panning is reserved for the Hand tool, holding Space in any tool, or the
 *   middle mouse button — all pan from anywhere, including over blocks.
 * - Text tool (T): an empty-canvas press calls `onPress` (world coords).
 */
export function usePanZoom({
  containerRef,
  gridRef,
  worldRef,
  marqueeRef,
  viewport,
  tool,
  forcePan,
  onCommit,
  onPress,
  onMarquee,
}: UsePanZoomOptions) {
  const viewportRef = useRef<ViewportTransform>(viewport)
  const toolRef = useRef<Tool>(tool)
  const forcePanRef = useRef(forcePan)
  const onPressRef = useRef(onPress)
  const onMarqueeRef = useRef(onMarquee)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    toolRef.current = tool
    forcePanRef.current = forcePan
    onPressRef.current = onPress
    onMarqueeRef.current = onMarquee
  })

  const pendingRef = useRef<ViewportTransform>(viewport)
  const rafRef = useRef<number | null>(null)
  const commitTimerRef = useRef<number | null>(null)
  const panRef = useRef<{
    pointerId: number
    startScreen: Vec
    startViewport: ViewportTransform
  } | null>(null)
  const marqueeGestureRef = useRef<{
    pointerId: number
    startScreen: Vec
    startViewport: ViewportTransform
    currentScreen: Vec
    moved: boolean
  } | null>(null)

  // Paint the world transform and the zoom-aware dot grid for a given viewport.
  // Used by the hot path (gesture frames) and on committed viewport changes.
  const paint = useCallback(
    (next: ViewportTransform) => {
      const world = worldRef.current
      if (world) world.style.transform = matrix(next)

      const grid = gridRef.current
      if (grid) {
        const step = gridSizeForScale(next.scale) * next.scale
        grid.style.backgroundSize = `${step}px ${step}px`
        grid.style.backgroundPosition = `${mod(next.offset.x, step)}px ${mod(next.offset.y, step)}px`
      }
    },
    [gridRef, worldRef],
  )

  // Apply on every committed viewport change (e.g. reset, zoom buttons).
  useEffect(() => {
    paint(viewport)
  }, [paint, viewport])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scheduleApply = (next: ViewportTransform) => {
      pendingRef.current = next
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          paint(pendingRef.current)
        })
      }
    }

    const scheduleCommit = () => {
      if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current)
      commitTimerRef.current = window.setTimeout(() => {
        commitTimerRef.current = null
        onCommit(viewportRef.current)
      }, COMMIT_DELAY_MS)
    }

    const screenPoint = (e: { clientX: number; clientY: number }): Vec => {
      const rect = container.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const drawMarquee = (a: Vec, b: Vec) => {
      const el = marqueeRef.current
      if (!el) return
      el.style.display = 'block'
      el.style.left = `${Math.min(a.x, b.x)}px`
      el.style.top = `${Math.min(a.y, b.y)}px`
      el.style.width = `${Math.abs(b.x - a.x)}px`
      el.style.height = `${Math.abs(b.y - a.y)}px`
    }

    const hideMarquee = () => {
      const el = marqueeRef.current
      if (el) el.style.display = 'none'
    }

    const startPan = (e: PointerEvent) => {
      e.preventDefault()
      panRef.current = {
        pointerId: e.pointerId,
        startScreen: { x: e.clientX, y: e.clientY },
        startViewport: viewportRef.current,
      }
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        // Capture can fail for non-primary pointers; the gesture still
        // tracks via bubbled pointermove/pointerup handlers.
      }
      container.classList.add('is-panning')
    }

    const startMarquee = (e: PointerEvent) => {
      e.preventDefault()
      const start = screenPoint(e)
      marqueeGestureRef.current = {
        pointerId: e.pointerId,
        startScreen: start,
        startViewport: viewportRef.current,
        currentScreen: start,
        moved: false,
      }
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        // Capture can fail for non-primary pointers; the gesture still
        // tracks via bubbled pointermove/pointerup handlers.
      }
      container.classList.add('is-marqueing')
      drawMarquee(start, start)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * WHEEL_STEP)
      const next = zoomAt(viewportRef.current, screenPoint(e), factor)
      viewportRef.current = next
      scheduleApply(next)
      scheduleCommit()
    }

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const onBlock = !!target?.closest('.block-shell')

      // Middle mouse always pans, from anywhere and over any tool.
      if (e.button === 1) {
        startPan(e)
        return
      }

      // Hand tool / Space held: pan from anywhere, including over blocks.
      if (forcePanRef.current) {
        startPan(e)
        return
      }

      // Text tool: an empty-canvas press creates a block at that world point.
      if (toolRef.current === 'text' && !onBlock) {
        onPressRef.current(screenToWorld(viewportRef.current, screenPoint(e)))
        return
      }

      // Move tool over a block: BlockShell owns drag/select/toggle.
      if (onBlock) return

      // Move tool on empty canvas: box/marquee selection.
      if (e.button === 0) {
        startMarquee(e)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const mq = marqueeGestureRef.current
      if (mq && mq.pointerId === e.pointerId) {
        const p = screenPoint(e)
        mq.currentScreen = p
        mq.moved =
          mq.moved ||
          Math.abs(p.x - mq.startScreen.x) > MARQUEE_TOLERANCE_PX ||
          Math.abs(p.y - mq.startScreen.y) > MARQUEE_TOLERANCE_PX
        drawMarquee(mq.startScreen, p)
        return
      }

      const pan = panRef.current
      if (!pan || pan.pointerId !== e.pointerId) return
      e.preventDefault()
      const next = panBy(pan.startViewport, {
        x: e.clientX - pan.startScreen.x,
        y: e.clientY - pan.startScreen.y,
      })
      viewportRef.current = next
      scheduleApply(next)
    }

    const finishGesture = (pointerId: number) => {
      const mq = marqueeGestureRef.current
      if (mq && mq.pointerId === pointerId) {
        marqueeGestureRef.current = null
        container.classList.remove('is-marqueing')
        hideMarquee()
        try {
          container.releasePointerCapture(pointerId)
        } catch {
          // pointer may already have been released
        }
        const start = screenToWorld(mq.startViewport, mq.startScreen)
        const end = screenToWorld(mq.startViewport, mq.currentScreen)
        onMarqueeRef.current(
          mq.moved
            ? {
                minX: Math.min(start.x, end.x),
                minY: Math.min(start.y, end.y),
                maxX: Math.max(start.x, end.x),
                maxY: Math.max(start.y, end.y),
              }
            : null,
        )
        return
      }

      const pan = panRef.current
      if (!pan || pan.pointerId !== pointerId) return
      panRef.current = null
      container.classList.remove('is-panning')
      try {
        container.releasePointerCapture(pointerId)
      } catch {
        // pointer may already have been released
      }
      if (viewportChanged(pan.startViewport, viewportRef.current)) {
        onCommit(viewportRef.current)
      }
    }

    const onPointerUp = (e: PointerEvent) => finishGesture(e.pointerId)
    const onPointerCancel = (e: PointerEvent) => finishGesture(e.pointerId)

    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerCancel)

    // Paint the initial grid so the first frame shows dots at the right step.
    paint(viewportRef.current)

    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerCancel)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current)
    }
  }, [containerRef, gridRef, worldRef, marqueeRef, onCommit, paint])
}