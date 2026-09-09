import { describe, expect, it } from 'vitest'
import {
  alignTargets,
  distributeTargets,
  groupDragTargets,
  type SizedRect,
} from './layout'

const rects: SizedRect[] = [
  { id: 'a', x: 0, y: 0, width: 100, height: 50 },
  { id: 'b', x: 200, y: 100, width: 60, height: 80 },
  { id: 'c', x: 400, y: 40, width: 120, height: 60 },
]

const byId = (targets: { id: string; x: number; y: number }[]) =>
  new Map(targets.map((t) => [t.id, t]))

describe('layout / group drag', () => {
  it('translates every rect by the same delta, preserving offsets', () => {
    const out = byId(groupDragTargets(rects, { x: 30, y: -10 }))
    expect(out.get('a')).toMatchObject({ x: 30, y: -10 })
    expect(out.get('b')).toMatchObject({ x: 230, y: 90 })
    expect(out.get('c')).toMatchObject({ x: 430, y: 30 })
  })

  it('rounds fractional results to whole pixels', () => {
    const out = groupDragTargets(
      [{ id: 'a', x: 0, y: 0, width: 35.7, height: 20 }],
      { x: 10.2, y: 5.5 },
    )
    expect(out[0]).toMatchObject({ x: 10, y: 6 })
  })
})

describe('layout / align', () => {
  it('aligns left edges to the minimum x', () => {
    const out = byId(alignTargets(rects, 'left'))
    expect(out.get('a')?.x).toBe(0)
    expect(out.get('b')?.x).toBe(0)
    expect(out.get('c')?.x).toBe(0)
    // y untouched
    expect(out.get('b')?.y).toBe(100)
  })

  it('aligns right edges to the maximum x', () => {
    // maxX = 400 + 120 = 520
    const out = byId(alignTargets(rects, 'right'))
    expect(out.get('a')?.x).toBe(420)
    expect(out.get('b')?.x).toBe(460)
    expect(out.get('c')?.x).toBe(400)
  })

  it('centers horizontally on the bounding box', () => {
    // bbox x: 0..520, center 260
    const out = byId(alignTargets(rects, 'centerH'))
    expect(out.get('a')?.x).toBe(210)
    expect(out.get('b')?.x).toBe(230)
    expect(out.get('c')?.x).toBe(200)
  })

  it('aligns top / middle / bottom', () => {
    // bbox y: 0..180 (b: 100+80), middle 90
    const top = byId(alignTargets(rects, 'top'))
    expect(top.get('b')?.y).toBe(0)
    const middle = byId(alignTargets(rects, 'middle'))
    expect(middle.get('a')?.y).toBe(65) // 90 - 25
    expect(middle.get('b')?.y).toBe(50) // 90 - 40
    const bottom = byId(alignTargets(rects, 'bottom'))
    expect(bottom.get('a')?.y).toBe(130)
    expect(bottom.get('c')?.y).toBe(120)
  })

  it('returns [] for an empty selection', () => {
    expect(alignTargets([], 'left')).toEqual([])
  })
})

describe('layout / distribute', () => {
  it('spaces centers evenly, keeping extremes fixed', () => {
    const rows: SizedRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 10 }, // cx 50
      { id: 'b', x: 130, y: 0, width: 100, height: 10 }, // cx 180
      { id: 'c', x: 300, y: 0, width: 100, height: 10 }, // cx 350
    ]
    const out = byId(distributeTargets(rows, 'x'))
    // step = (350 - 50) / 2 = 150 → centers 50, 200, 350
    expect(out.get('a')?.x).toBe(0)
    expect(out.get('b')?.x).toBe(150)
    expect(out.get('c')?.x).toBe(300)
  })

  it('distributes vertically', () => {
    const rows: SizedRect[] = [
      { id: 'a', x: 0, y: 0, width: 10, height: 20 }, // cy 10
      { id: 'b', x: 0, y: 90, width: 10, height: 20 }, // cy 100
      { id: 'c', x: 0, y: 150, width: 10, height: 20 }, // cy 160
    ]
    const out = byId(distributeTargets(rows, 'y'))
    // step = (160 - 10) / 2 = 75 → centers 10, 85, 160
    expect(out.get('a')?.y).toBe(0)
    expect(out.get('b')?.y).toBe(75)
    expect(out.get('c')?.y).toBe(150)
  })

  it('is a no-op with fewer than 3 rects or coincident centers', () => {
    expect(distributeTargets(rects.slice(0, 2), 'x')).toEqual([])
    const stacked: SizedRect[] = [
      { id: 'a', x: 0, y: 0, width: 100, height: 10 },
      { id: 'b', x: 0, y: 0, width: 100, height: 10 },
      { id: 'c', x: 0, y: 0, width: 100, height: 10 },
    ]
    expect(distributeTargets(stacked, 'x')).toEqual([])
  })
})
