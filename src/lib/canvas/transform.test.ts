import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VIEWPORT,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  gridSizeForScale,
  matrix,
  mod,
  panBy,
  rectFromWorldPoint,
  rectsOverlap,
  screenToWorld,
  viewportChanged,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
} from './transform'
import type { ViewportTransform } from './transform'

describe('worldToScreen / screenToWorld', () => {
  it('are exact inverses at any scale and offset', () => {
    const vp: ViewportTransform = { scale: 2, offset: { x: 100, y: -40 } }
    const point = { x: 33, y: -77 }
    expect(screenToWorld(vp, worldToScreen(vp, point))).toEqual(point)
  })

  it('maps origin to the offset at scale 1', () => {
    const vp: ViewportTransform = { scale: 1, offset: { x: 40, y: 20 } }
    expect(worldToScreen(vp, { x: 0, y: 0 })).toEqual({ x: 40, y: 20 })
  })

  it('scales the world offset from the origin', () => {
    const vp: ViewportTransform = { scale: 3, offset: { x: 0, y: 0 } }
    expect(worldToScreen(vp, { x: 5, y: -2 })).toEqual({ x: 15, y: -6 })
  })
})

describe('clampScale', () => {
  it('clamps to the MIN/MAX range', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(100)).toBe(MAX_SCALE)
    expect(clampScale(1)).toBe(1)
  })
})

describe('matrix', () => {
  it('renders the translate/scale transform string', () => {
    expect(matrix({ scale: 1.5, offset: { x: -10, y: 20 } })).toBe(
      'translate(-10px, 20px) scale(1.5)',
    )
  })
})

describe('panBy', () => {
  it('adds the delta to the offset and keeps the scale', () => {
    const vp: ViewportTransform = { scale: 2, offset: { x: 5, y: 5 } }
    expect(panBy(vp, { x: 10, y: -3 })).toEqual({ scale: 2, offset: { x: 15, y: 2 } })
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the cursor stationary', () => {
    const vp: ViewportTransform = { scale: 1, offset: { x: 0, y: 0 } }
    const cursor = { x: 80, y: 60 }
    const zoomed = zoomAt(vp, cursor, 2)
    // The world point under the cursor before zoom must stay under the cursor after.
    const world = screenToWorld(vp, cursor)
    expect(worldToScreen(zoomed, world)).toEqual(cursor)
    expect(zoomed.scale).toBe(2)
  })

  it('clamps the resulting scale', () => {
    const vp: ViewportTransform = DEFAULT_VIEWPORT
    expect(zoomAt(vp, { x: 0, y: 0 }, 1000).scale).toBe(MAX_SCALE)
    expect(zoomAt(vp, { x: 0, y: 0 }, 0.0001).scale).toBe(MIN_SCALE)
  })
})

describe('visibleWorldRect', () => {
  it('derives the world-space rectangle from the viewport and container size', () => {
    const vp: ViewportTransform = { scale: 1, offset: { x: 100, y: 200 } }
    const rect = visibleWorldRect(vp, 800, 600, 0)
    expect(rect).toEqual({ minX: -100, minY: -200, maxX: 700, maxY: 400 })
  })
})

describe('rectFromWorldPoint / rectsOverlap', () => {
  it('builds a rect from a point and size', () => {
    expect(rectFromWorldPoint({ x: 10, y: 20 }, 180, 90)).toEqual({
      minX: 10,
      minY: 20,
      maxX: 190,
      maxY: 110,
    })
  })

  it('detects overlapping and non-overlapping rects', () => {
    const a = rectFromWorldPoint({ x: 0, y: 0 }, 10, 10)
    expect(rectsOverlap(a, rectFromWorldPoint({ x: 5, y: 5 }, 10, 10))).toBe(true)
    expect(rectsOverlap(a, rectFromWorldPoint({ x: 20, y: 20 }, 10, 10))).toBe(false)
    // Edge-touching rects do not overlap (strict inequality).
    expect(rectsOverlap(a, rectFromWorldPoint({ x: 10, y: 10 }, 10, 10))).toBe(false)
  })
})

describe('viewportChanged', () => {
  it('detects any change in scale or offset', () => {
    const base = DEFAULT_VIEWPORT
    expect(viewportChanged(base, { ...base })).toBe(false)
    expect(viewportChanged(base, { scale: 2, offset: { x: 0, y: 0 } })).toBe(true)
    expect(viewportChanged(base, { scale: 1, offset: { x: 1, y: 0 } })).toBe(true)
  })
})

describe('gridSizeForScale', () => {
  it('returns a positive 1/2/5 × 10ⁿ step', () => {
    for (const scale of [0.25, 0.5, 1, 2, 4]) {
      const step = gridSizeForScale(scale)
      expect(step).toBeGreaterThan(0)
      for (const cand of [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
        if (step === cand) break
      }
      expect(step).toBeGreaterThan(0)
    }
  })

  it('increases the world step as the scale drops (zoomed out)', () => {
    expect(gridSizeForScale(0.25)).toBeGreaterThan(gridSizeForScale(1))
  })
})

describe('mod', () => {
  it('wraps into [0, m) for negative inputs', () => {
    expect(mod(-3, 5)).toBe(2)
    expect(mod(7, 5)).toBe(2)
    expect(mod(0, 5)).toBe(0)
    expect(mod(5, 5)).toBe(0)
  })
})
