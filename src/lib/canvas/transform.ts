import type { Vec } from '#/types'

export type { Vec } from '#/types'

export interface ViewportTransform {
  scale: number
  offset: Vec
}

export interface WorldRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const MIN_SCALE = 0.25
export const MAX_SCALE = 4
export const CULL_MARGIN = 160

export const DEFAULT_VIEWPORT: ViewportTransform = { scale: 1, offset: { x: 0, y: 0 } }

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function worldToScreen(viewport: ViewportTransform, point: Vec): Vec {
  return {
    x: point.x * viewport.scale + viewport.offset.x,
    y: point.y * viewport.scale + viewport.offset.y,
  }
}

export function screenToWorld(viewport: ViewportTransform, point: Vec): Vec {
  return {
    x: (point.x - viewport.offset.x) / viewport.scale,
    y: (point.y - viewport.offset.y) / viewport.scale,
  }
}

export function matrix(viewport: ViewportTransform): string {
  return `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.scale})`
}

export function panBy(viewport: ViewportTransform, delta: Vec): ViewportTransform {
  return {
    scale: viewport.scale,
    offset: { x: viewport.offset.x + delta.x, y: viewport.offset.y + delta.y },
  }
}

export function zoomAt(
  viewport: ViewportTransform,
  cursor: Vec,
  factor: number,
): ViewportTransform {
  const scale = clampScale(viewport.scale * factor)
  const world = screenToWorld(viewport, cursor)
  return {
    scale,
    offset: {
      x: cursor.x - world.x * scale,
      y: cursor.y - world.y * scale,
    },
  }
}

export function visibleWorldRect(
  viewport: ViewportTransform,
  width: number,
  height: number,
  margin = CULL_MARGIN,
): WorldRect {
  const min = screenToWorld(viewport, { x: -margin, y: -margin })
  const max = screenToWorld(viewport, { x: width + margin, y: height + margin })
  return { minX: min.x, minY: min.y, maxX: max.x, maxY: max.y }
}

export function rectFromWorldPoint(point: Vec, width: number, height: number): WorldRect {
  return { minX: point.x, minY: point.y, maxX: point.x + width, maxY: point.y + height }
}

export function rectsOverlap(a: WorldRect, b: WorldRect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
}

export function viewportChanged(a: ViewportTransform, b: ViewportTransform): boolean {
  return a.scale !== b.scale || a.offset.x !== b.offset.x || a.offset.y !== b.offset.y
}