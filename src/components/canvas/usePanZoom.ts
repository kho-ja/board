import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import {
  matrix,
  panBy,
  viewportChanged,
  zoomAt,
} from '#/lib/canvas/transform'
import type { Vec, ViewportTransform } from '#/lib/canvas/transform'

interface UsePanZoomOptions {
  containerRef: RefObject<HTMLElement | null>
  worldRef: RefObject<HTMLDivElement | null>
  viewport: ViewportTransform
  onCommit: (viewport: ViewportTransform) => void
}

const WHEEL_STEP = 0.0015
const COMMIT_DELAY_MS = 90

/**
 * Hot path (pan/zoom frames) stays in refs and writes the CSS transform
 * directly to the world element; the viewport is committed to React state
 * only at the end of a gesture.
 */
export function usePanZoom({
  containerRef,
  worldRef,
  viewport,
  onCommit,
}: UsePanZoomOptions) {
  const viewportRef = useRef<ViewportTransform>(viewport)

  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  const pendingRef = useRef<ViewportTransform>(viewport)
  const rafRef = useRef<number | null>(null)
  const commitTimerRef = useRef<number | null>(null)
  const panRef = useRef<{
    pointerId: number
    startScreen: Vec
    startViewport: ViewportTransform
  } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const applyTransform = (next: ViewportTransform) => {
      const world = worldRef.current
      if (world) world.style.transform = matrix(next)
    }

    const scheduleApply = (next: ViewportTransform) => {
      pendingRef.current = next
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          applyTransform(pendingRef.current)
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
      if (target?.closest('.block-shell')) return
      e.preventDefault()
      panRef.current = {
        pointerId: e.pointerId,
        startScreen: { x: e.clientX, y: e.clientY },
        startViewport: viewportRef.current,
      }
      container.setPointerCapture(e.pointerId)
      container.classList.add('is-panning')
    }

    const onPointerMove = (e: PointerEvent) => {
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
      }
    }

    const onPointerUp = (e: PointerEvent) => finishPan(e.pointerId)
    const onPointerCancel = (e: PointerEvent) => finishPan(e.pointerId)

    container.addEventListener('wheel', onWheel, { passive: false })
    container.addEventListener('pointerdown', onPointerDown)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerup', onPointerUp)
    container.addEventListener('pointercancel', onPointerCancel)

    return () => {
      container.removeEventListener('wheel', onWheel)
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerCancel)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      if (commitTimerRef.current != null) window.clearTimeout(commitTimerRef.current)
    }
  }, [containerRef, worldRef, onCommit])
}