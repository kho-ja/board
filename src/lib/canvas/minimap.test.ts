import { describe, expect, it } from 'vitest'
import {
  centerOffset,
  contentBounds,
  expandBounds,
  fitView,
  miniToWorld,
  unionBounds,
  worldToMini,
} from './minimap'

describe('minimap / bounds', () => {
  it('returns null for no rects', () => {
    expect(contentBounds([])).toBeNull()
  })

  it('spans all rects', () => {
    expect(
      contentBounds([
        { x: 0, y: 10, width: 100, height: 50 },
        { x: 200, y: -20, width: 60, height: 300 },
      ]),
    ).toEqual({ minX: 0, minY: -20, maxX: 260, maxY: 280 })
  })

  it('expands and unions', () => {
    expect(expandBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 5)).toEqual({
      minX: -5,
      minY: -5,
      maxX: 15,
      maxY: 15,
    })
    expect(
      unionBounds({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { minX: 5, minY: -5, maxX: 8, maxY: 20 }),
    ).toEqual({ minX: 0, minY: -5, maxX: 10, maxY: 20 })
  })
})

describe('minimap / projection', () => {
  const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 }
  const fit = fitView(bounds, 200, 100, 10)

  it('fits content centered in the frame', () => {
    // k = min(180/400, 80/200) = 0.4; center (200,100) → (100,50)
    expect(fit.k).toBeCloseTo(0.4, 6)
    expect(worldToMini({ x: 200, y: 100 }, fit)).toMatchObject({ x: 100, y: 50 })
    expect(worldToMini({ x: 0, y: 0 }, fit)).toMatchObject({ x: 20, y: 10 })
    expect(worldToMini({ x: 400, y: 200 }, fit)).toMatchObject({ x: 180, y: 90 })
  })

  it('round-trips', () => {
    const p = { x: 123.5, y: 77.25 }
    const back = miniToWorld(worldToMini(p, fit), fit)
    expect(back.x).toBeCloseTo(p.x, 6)
    expect(back.y).toBeCloseTo(p.y, 6)
  })

  it('handles degenerate single-point content', () => {
    const single = fitView({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, 200, 100, 10)
    expect(Number.isFinite(single.k)).toBe(true)
    expect(single.k).toBeGreaterThan(0)
    expect(worldToMini({ x: 5, y: 5 }, single)).toMatchObject({ x: 100, y: 50 })
  })
})

describe('minimap / navigation', () => {
  it('centers a world point in the container', () => {
    // scale 2, container 800x600, point (100,100) → offset (400-200, 300-200)
    expect(centerOffset({ x: 100, y: 100 }, 2, { width: 800, height: 600 })).toEqual({
      x: 200,
      y: 100,
    })
  })
})
