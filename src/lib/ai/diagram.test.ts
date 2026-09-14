import { describe, expect, it } from 'vitest'

import {
  computeLayers,
  DIAGRAM_AXIS_GAP,
  DIAGRAM_NODE_HEIGHT,
  DIAGRAM_NODE_WIDTH,
  layoutDiagram,
} from './diagram'

describe('computeLayers', () => {
  it('roots at 0, children one layer after their deepest source', () => {
    // 0 -> 1 -> 2  (diamond: 1 and 3 both feed 4)
    const edges = [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 0, to: 3 },
      { from: 3, to: 4 },
      { from: 2, to: 4 },
    ]
    expect(computeLayers(5, edges)).toEqual([0, 1, 2, 1, 3])
  })

  it('parks cycle members on an overflow layer past the DAG', () => {
    const edges = [
      { from: 0, to: 1 },
      { from: 1, to: 0 },
      { from: 2, to: 0 },
    ]
    const layers = computeLayers(3, edges)
    // node 2 is the only real root
    expect(layers[2]).toBe(0)
    // the 0<->1 loop ends up together on the overflow layer
    expect(layers[0]).toBe(layers[1])
    expect(layers[0]).toBeGreaterThan(1)
  })

  it('drops out-of-range indices', () => {
    expect(computeLayers(2, [{ from: 0, to: 9 }])).toEqual([0, 0])
  })
})

describe('layoutDiagram', () => {
  it('spaces distinct layers along the flow and centers within a layer', () => {
    const result = layoutDiagram(
      {
        nodes: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
        edges: [{ from: 0, to: 1 }],
        direction: 'left-to-right',
      },
      { x: 100, y: 200 },
    )
    expect(result.layers).toEqual([0, 1, 0])
    // layer 0 (nodes 0 & 2) centered vertically around the anchor
    expect(result.positions[0].x).toBe(100)
    expect(result.positions[2].x).toBe(100)
    // two members in layer 0: centered, so one above, one below the anchor
    expect(result.positions[0].y).toBeLessThan(200)
    expect(result.positions[2].y).toBeGreaterThan(200)
    // node 1 sits a full column to the right
    expect(result.positions[1].x).toBe(100 + DIAGRAM_NODE_WIDTH + 60)
  })

  it('flows downward when top-to-bottom', () => {
    const result = layoutDiagram(
      {
        nodes: [{ label: 'a' }, { label: 'b' }],
        edges: [{ from: 0, to: 1 }],
        direction: 'top-to-bottom',
      },
      { x: 500, y: 500 },
    )
    expect(result.positions[0].y).toBe(500)
    expect(result.positions[1].y).toBe(500 + DIAGRAM_NODE_HEIGHT + DIAGRAM_AXIS_GAP)
    expect(result.positions[0].x).toBe(500)
  })

  it('keeps spare nodes on the last layer', () => {
    const result = layoutDiagram(
      { nodes: [{ label: 'a' }, { label: 'b' }], edges: [] },
      { x: 0, y: 0 },
    )
    expect(result.layers).toEqual([0, 0])
    expect(result.positions[1].x).toBe(0)
  })
})