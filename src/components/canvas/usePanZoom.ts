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
import type { Vec, ViewportTransform } from '#/lib/canvas/transform'
import type { Tool } from './tools'

interface UsePanZoomOptions {
  containerRef: RefObject<HTMLElement | null>
  gridRef: RefObject<HTMLDivElement | null>
  worldRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  tool: Tool
  forcePan: boolean
  onCommit: (viewport: ViewportTransform) => void
  onPress: (world: Vec) => void
  onDeselect: () => void
}

const WHEEL_STEP = 0.0015
const COMMIT_DELAY_MS = 90

/**
 * Hot path (pan/zoom/grid frames) stays in refs and writes the CSS transform
 * and dot-grid geometry directly to the DOM; the viewport is committed to
 * React state only at the end of a gesture.
 *
 * Interactions:
 * - wheel always zooms at the cursor
 * - drag pans when `forcePan` is on (Hand tool / space held), including on blocks;
 *   otherwise an empty-canvas drag pans and a block drag is owned by BlockShell
 * - with the Text tool, an empty-canvas press calls `onPress` (world coords)
 *   instead of panning
 */
export function usePanZoom({
  containerRef,
  gridRef,
  worldRef,
  viewport,
  tool,
  forcePan,
  onCommit,
  onPress,
  onDeselect,
}: UsePanZoomOptions) {
  const viewportRef = useRef<ViewportTransform>(viewport)
  const toolRef = useRef<Tool>(tool)
  const forcePanRef = useRef(forcePan)
  const onPressRef = useRef(onPress)
  const onDeselectRef = useRef(onDeselect)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  useEffect(() => {
    toolRef.current = tool
    forcePanRef.current = forcePan
    onPressRef.current = onPress
    onDeselectRef.current = onDeselect
  })

  const pendingRef = useRef<ViewportTransform>(viewport)
  const rafRef = useRef<number | null>(null)
  const commitTimerRef = useRef<number | null>(null)
  const panRef = useRef<{
    pointerId: number
    startScreen: Vec
    startViewport: ViewportTransform
    moved: boolean
    pressWasEmpty: boolean
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

      // Text tool: an empty-canvas press creates a block at that world point.
      if (toolRef.current === 'text' && !onBlock && !forcePanRef.current) {
        onPressRef.current(screenToWorld(viewportRef.current, screenPoint(e)))
        return
      }

      if (onBlock && !forcePanRef.current) return

      e.preventDefault()
      panRef.current = {
        pointerId: e.pointerId,
        startScreen: { x: e.clientX, y: e.clientY },
        startViewport: viewportRef.current,
        moved: false,
        pressWasEmpty: !onBlock,
      }
      container.setPointerCapture(e.pointerId)
      container.classList.add('is-panning')
    }

    const onPointerMove = (e: PointerEvent) => {
      const pan = panRef.current
      if (!pan || pan.pointerId !== e.pointerId) return
      e.preventDefault()
      pan.moved = true
      const next = panBy(pan.startViewport, {
        x: e.clientX - pan.startScreen.x,
        y: e.clientY - pan.startScreen.y,
      })
      viewportRef.current = next
      scheduleApply(next)
    }

    const finishPan = (pointerId: number) => {
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
      } else if (pan.pressWasEmpty && !pan.moved && toolRef.current === 'move') {
        onDeselectRef.current()
      }
    }

    const onPointerUp = (e: PointerEvent) => finishPan(e.pointerId)
    const onPointerCancel = (e: PointerEvent) => finishPan(e.pointerId)

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
  }, [containerRef, gridRef, worldRef, onCommit, paint])
}