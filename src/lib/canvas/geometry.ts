import type { Vec } from './transform'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type PortSide = 'top' | 'bottom' | 'left' | 'right'

export interface AnchorPoint extends Vec {
  side: PortSide
}

export function getBoxPorts(rect: Rect): AnchorPoint[] {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2

  return [
    { x: cx, y: rect.y, side: 'top' },
    { x: cx, y: rect.y + rect.height, side: 'bottom' },
    { x: rect.x, y: cy, side: 'left' },
    { x: rect.x + rect.width, y: cy, side: 'right' },
  ]
}

export function distanceSq(a: Vec, b: Vec): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/**
 * Given two bounding boxes, determines the best pair of connection ports
 * (one on rectA, one on rectB) that yield a natural and direct connection.
 */
export function computeBestAnchorPair(
  rectA: Rect,
  rectB: Rect,
): { start: AnchorPoint; end: AnchorPoint } {
  const portsA = getBoxPorts(rectA)
  const portsB = getBoxPorts(rectB)

  let bestDist = Infinity
  let bestPair = { start: portsA[0], end: portsB[0] }

  for (const pA of portsA) {
    for (const pB of portsB) {
      // Penalize connections that go in backwards directions
      let penalty = 0
      if (pA.side === 'right' && pB.x < pA.x) penalty += 5000
      if (pA.side === 'left' && pB.x > pA.x) penalty += 5000
      if (pA.side === 'bottom' && pB.y < pA.y) penalty += 5000
      if (pA.side === 'top' && pB.y > pA.y) penalty += 5000

      const d = distanceSq(pA, pB) + penalty
      if (d < bestDist) {
        bestDist = d
        bestPair = { start: pA, end: pB }
      }
    }
  }

  return bestPair
}

/**
 * Creates a smooth cubic Bezier path between two anchor points taking
 * their port orientation into account.
 */
export function createBezierPath(start: AnchorPoint, end: AnchorPoint): string {
  const dx = Math.abs(end.x - start.x)
  const dy = Math.abs(end.y - start.y)
  const dist = Math.sqrt(dx * dx + dy * dy)
  const curvature = Math.max(30, Math.min(180, dist * 0.45))

  let cpStartX = start.x
  let cpStartY = start.y
  let cpEndX = end.x
  let cpEndY = end.y

  switch (start.side) {
    case 'top':
      cpStartY -= curvature
      break
    case 'bottom':
      cpStartY += curvature
      break
    case 'left':
      cpStartX -= curvature
      break
    case 'right':
      cpStartX += curvature
      break
  }

  switch (end.side) {
    case 'top':
      cpEndY -= curvature
      break
    case 'bottom':
      cpEndY += curvature
      break
    case 'left':
      cpEndX -= curvature
      break
    case 'right':
      cpEndX += curvature
      break
  }

  return `M ${start.x},${start.y} C ${cpStartX},${cpStartY} ${cpEndX},${cpEndY} ${end.x},${end.y}`
}

/**
 * Creates a bezier curve from an anchor point towards a free pointer position.
 */
export function createDraftBezierPath(start: AnchorPoint, target: Vec): string {
  const dx = Math.abs(target.x - start.x)
  const dy = Math.abs(target.y - start.y)
  const dist = Math.sqrt(dx * dx + dy * dy)
  const curvature = Math.max(20, Math.min(120, dist * 0.4))

  let cpStartX = start.x
  let cpStartY = start.y

  switch (start.side) {
    case 'top':
      cpStartY -= curvature
      break
    case 'bottom':
      cpStartY += curvature
      break
    case 'left':
      cpStartX -= curvature
      break
    case 'right':
      cpStartX += curvature
      break
  }

  return `M ${start.x},${start.y} Q ${cpStartX},${cpStartY} ${target.x},${target.y}`
}
