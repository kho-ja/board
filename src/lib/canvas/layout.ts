/**
 * M10 — multi-block layout primitives (pure, no React).
 *
 * All coordinates are world units. Outputs are rounded to whole pixels to
 * match the placement convention used by the board (`Math.round` on commit).
 */

export type AlignMode = 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAxis = 'x' | 'y'

export interface SizedRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface MoveTarget {
  id: string
  x: number
  y: number
}

/**
 * Relative group drag: translate every base rect by the same world delta so
 * the selection keeps its relative offsets while moving together.
 */
export function groupDragTargets(
  bases: SizedRect[],
  delta: { x: number; y: number },
): MoveTarget[] {
  return bases.map((b) => ({
    id: b.id,
    x: Math.round(b.x + delta.x),
    y: Math.round(b.y + delta.y),
  }))
}

/** Align every rect to the selection bounding box edge/center for `mode`. */
export function alignTargets(rects: SizedRect[], mode: AlignMode): MoveTarget[] {
  if (rects.length === 0) return []
  const minX = Math.min(...rects.map((r) => r.x))
  const maxX = Math.max(...rects.map((r) => r.x + r.width))
  const minY = Math.min(...rects.map((r) => r.y))
  const maxY = Math.max(...rects.map((r) => r.y + r.height))
  return rects.map((r) => {
    switch (mode) {
      case 'left':
        return { id: r.id, x: Math.round(minX), y: Math.round(r.y) }
      case 'centerH':
        return { id: r.id, x: Math.round((minX + maxX) / 2 - r.width / 2), y: Math.round(r.y) }
      case 'right':
        return { id: r.id, x: Math.round(maxX - r.width), y: Math.round(r.y) }
      case 'top':
        return { id: r.id, x: Math.round(r.x), y: Math.round(minY) }
      case 'middle':
        return { id: r.id, x: Math.round(r.x), y: Math.round((minY + maxY) / 2 - r.height / 2) }
      case 'bottom':
        return { id: r.id, x: Math.round(r.x), y: Math.round(maxY - r.height) }
    }
  })
}

/**
 * Distribute rects evenly along `axis` by center: the extreme rects stay
 * fixed, the ones in between are spaced at equal center intervals. Needs at
 * least 3 rects with distinct extremes, otherwise returns [] (no-op).
 */
export function distributeTargets(rects: SizedRect[], axis: DistributeAxis): MoveTarget[] {
  if (rects.length < 3) return []
  const center = (r: SizedRect) => (axis === 'x' ? r.x + r.width / 2 : r.y + r.height / 2)
  const sorted = [...rects].sort((a, b) => center(a) - center(b))
  const first = center(sorted[0])
  const last = center(sorted[sorted.length - 1])
  if (last === first) return []
  const step = (last - first) / (sorted.length - 1)
  return sorted.map((r, i) => {
    const c = first + step * i
    return axis === 'x'
      ? { id: r.id, x: Math.round(c - r.width / 2), y: Math.round(r.y) }
      : { id: r.id, x: Math.round(r.x), y: Math.round(c - r.height / 2) }
  })
}
