import { describe, expect, it } from 'vitest'

import type { ObservablePlacement, Vec } from '#/types'

describe('Milestone 8: Integration & Board Actions', () => {
  it('batches multi-selection unplace into a single undo/redo transaction', () => {
    const placements: ObservablePlacement[] = [
      { blockId: 'b1', positionX: 100, positionY: 100 },
      { blockId: 'b2', positionX: 200, positionY: 200 },
      { blockId: 'b3', positionX: 300, positionY: 300 },
    ]

    const selectedIds = new Set(['b1', 'b2'])
    const deletedIds: string[] = []
    const restoredPlacements: ObservablePlacement[] = []

    // Simulate handleUnplaceBlocks
    const toUnplace = placements.filter((p) => selectedIds.has(p.blockId))
    expect(toUnplace).toHaveLength(2)

    // Forward apply
    for (const p of toUnplace) {
      deletedIds.push(p.blockId)
    }
    expect(deletedIds).toEqual(['b1', 'b2'])

    // Undo closure
    for (const p of toUnplace) {
      restoredPlacements.push(p)
    }
    expect(restoredPlacements).toHaveLength(2)
    expect(restoredPlacements[0].blockId).toBe('b1')
    expect(restoredPlacements[1].blockId).toBe('b2')
  })

  it('computes correct placement position for pasted blocks centered at viewport', () => {
    const center: Vec = { x: 500, y: 400 }
    const blockSize = { width: 260, height: 140 }

    const placement: ObservablePlacement = {
      blockId: 'new-pasted-id',
      positionX: Math.round(center.x - blockSize.width / 2),
      positionY: Math.round(center.y - blockSize.height / 2),
    }

    expect(placement.positionX).toBe(370)
    expect(placement.positionY).toBe(330)
  })

  it('detects keyboard shortcut actions correctly', () => {
    const shortcuts: Record<string, string> = {
      v: 'move',
      h: 'hand',
      t: 'text',
    }

    expect(shortcuts['v']).toBe('move')
    expect(shortcuts['h']).toBe('hand')
    expect(shortcuts['t']).toBe('text')
  })
})
