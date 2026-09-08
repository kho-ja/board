import { describe, expect, it } from 'vitest'
import {
  computeBestAnchorPair,
  createBezierPath,
  createDraftBezierPath,
  distanceSq,
  getBoxPorts,
  type Rect,
} from './geometry'
import { LinkSchema } from '#/types/schemas'

describe('geometry / connection paths', () => {
  it('connects horizontally separated blocks using right and left ports', () => {
    const rectA: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const rectB: Rect = { x: 300, y: 0, width: 100, height: 100 }

    const { start, end } = computeBestAnchorPair(rectA, rectB)
    expect(start.x).toBe(100) // right edge of A
    expect(start.y).toBe(50)  // vertical midpoint of A
    expect(end.x).toBe(300)   // left edge of B
    expect(end.y).toBe(50)    // vertical midpoint of B
  })

  it('connects vertically separated blocks using bottom and top ports', () => {
    const rectA: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const rectB: Rect = { x: 0, y: 300, width: 100, height: 100 }

    const { start, end } = computeBestAnchorPair(rectA, rectB)
    expect(start.x).toBe(50)
    expect(start.y).toBe(100) // bottom of A
    expect(end.x).toBe(50)
    expect(end.y).toBe(300)  // top of B
  })

  it('generates a valid cubic bezier path string', () => {
    const rectA: Rect = { x: 0, y: 0, width: 100, height: 100 }
    const rectB: Rect = { x: 200, y: 200, width: 100, height: 100 }

    const pair = computeBestAnchorPair(rectA, rectB)
    const path = createBezierPath(pair.start, pair.end)

    expect(path).toMatch(/^M\s*[\d.]+,[\d.]+\s*C\s*[\d.]+,[\d.]+\s*[\d.]+,[\d.]+\s*[\d.]+,[\d.]+$/)
  })

  it('generates a draft bezier path from anchor to target point', () => {
    const anchor = { x: 100, y: 50, side: 'right' as const }
    const target = { x: 250, y: 120 }
    const draftPath = createDraftBezierPath(anchor, target)

    expect(draftPath).toMatch(/^M\s*[\d.]+,[\d.]+\s*Q\s*[\d.]+,[\d.]+\s*[\d.]+,[\d.]+$/)
  })

  it('extracts all 4 cardinal box ports correctly', () => {
    const rect: Rect = { x: 10, y: 20, width: 100, height: 60 }
    const ports = getBoxPorts(rect)

    expect(ports).toHaveLength(4)
    expect(ports.find((p) => p.side === 'top')).toEqual({ x: 60, y: 20, side: 'top' })
    expect(ports.find((p) => p.side === 'right')).toEqual({ x: 110, y: 50, side: 'right' })
    expect(ports.find((p) => p.side === 'bottom')).toEqual({ x: 60, y: 80, side: 'bottom' })
    expect(ports.find((p) => p.side === 'left')).toEqual({ x: 10, y: 50, side: 'left' })
  })

  it('computes distance squared correctly', () => {
    expect(distanceSq({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25)
  })

  it('validates LinkSchema for persisted link records', () => {
    const validLink = {
      id: '00000000-0000-0000-0000-000000000001',
      blockAId: 'block-1',
      blockBId: 'block-2',
      createdAt: new Date(),
    }
    const result = LinkSchema.safeParse(validLink)
    expect(result.success).toBe(true)
  })
})
