/**
 * M16 — the diagram builder's layout. `board_make_diagram` lays newly-created
 * text blocks out in layers (longest-path from the graph root) so a flow /
 * hierarchy comes out readable, then the server connects them with typed
 * links. Pure + deterministic so it is unit-testable.
 *
 * Coordinate convention matches the board: world-space top-left origins for
 * each block rectangle; a "layer column" advances along the flow direction.
 */

export interface DiagramNode {
  label: string
}

export interface DiagramEdge {
  from: number
  to: number
}

export interface DiagramLayoutInput {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  direction?: 'left-to-right' | 'top-to-bottom'
}

export interface DiagramLayoutResult {
  /** layer index per node (0-based, along the flow axis) */
  layers: number[]
  /** node position: top-left corner in board world coordinates */
  positions: Array<{ x: number; y: number }>
  /** number of layers used */
  layerCount: number
  /** world-space anchor the diagram was laid out from */
  anchor: { x: number; y: number }
}

export const DIAGRAM_NODE_WIDTH = 180
export const DIAGRAM_NODE_HEIGHT = 92
export const DIAGRAM_AXIS_GAP = 60
export const DIAGRAM_CROSS_GAP = 36

/**
 * Longest-path layering (Kahn's algorithm): a node's layer is 1 + the max
 * layer of its incoming edges (roots land on layer 0). Nodes stuck in cycles
 * (or reachable only through one) can never reach in-degree 0, so they are
 * parked on a single overflow layer past the DAG so the whole set still gets
 * placed. `edges` reference `nodes` by index; out-of-range edges are dropped.
 */
export function computeLayers(nodeCount: number, edges: DiagramEdge[]): number[] {
  const layers = new Array<number>(nodeCount).fill(0)
  const indegree = new Array<number>(nodeCount).fill(0)
  const out: number[][] = Array.from({ length: nodeCount }, () => [])

  for (const edge of edges) {
    if (
      edge.from >= 0 &&
      edge.to >= 0 &&
      edge.from < nodeCount &&
      edge.to < nodeCount &&
      edge.from !== edge.to
    ) {
      out[edge.from].push(edge.to)
      indegree[edge.to]++
    }
  }

  const processedNodes = new Set<number>()
  const queue: number[] = []
  for (let i = 0; i < nodeCount; i++) {
    if (indegree[i] === 0) queue.push(i)
  }

  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]
    processedNodes.add(node)
    for (const next of out[node]) {
      if (layers[next] < layers[node] + 1) layers[next] = layers[node] + 1
      if (--indegree[next] === 0) queue.push(next)
    }
  }

  if (processedNodes.size < nodeCount) {
    const maxLayer = Math.max(0, ...layers)
    for (let i = 0; i < nodeCount; i++) {
      if (!processedNodes.has(i)) layers[i] = maxLayer + 1
    }
  }

  return layers
}

export function layoutDiagram(
  input: DiagramLayoutInput,
  anchor: { x: number; y: number },
): DiagramLayoutResult {
  const { nodes, edges, direction = 'left-to-right' } = input
  const horizontal = direction === 'left-to-right'

  const layers = computeLayers(nodes.length, edges)
  const layerCount = Math.max(1, ...layers) + 1

  const byLayer = new Map<number, number[]>()
  layers.forEach((layer, index) => {
    const bucket = byLayer.get(layer) ?? []
    bucket.push(index)
    byLayer.set(layer, bucket)
  })

  const positions = nodes.map(() => ({ x: anchor.x, y: anchor.y }))
  const axisSize = horizontal ? DIAGRAM_NODE_WIDTH : DIAGRAM_NODE_HEIGHT
  const crossSize = horizontal ? DIAGRAM_NODE_HEIGHT : DIAGRAM_NODE_WIDTH
  for (const [layer, members] of byLayer) {
    const count = members.length
    members.forEach((nodeIndex, slot) => {
      const alongStart = horizontal ? anchor.x : anchor.y
      const crossStart = horizontal ? anchor.y : anchor.x
      const along =
        alongStart + layer * (axisSize + DIAGRAM_AXIS_GAP)
      const centeredStep = slot - (count - 1) / 2
      const across =
        crossStart + centeredStep * (crossSize + DIAGRAM_CROSS_GAP)
      positions[nodeIndex] = horizontal ? { x: along, y: across } : { x: across, y: along }
    })
  }

  return { layers, positions, layerCount, anchor }
}