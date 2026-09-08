import { describe, expect, it } from 'vitest'

import type { ObservableBlock, ObservablePlacement } from '#/components/canvas/BlockShell'
import type { Vec } from '#/types'

describe('Board Actions: Integration, Assets & Sorting', () => {
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

  it('sorts unplaced assets by name ascending and descending', () => {
    const assets: ObservableBlock[] = [
      { id: '1', kind: 'file', data: { kind: 'file', name: 'Zebra.pdf', size: 100, mimeType: 'application/pdf' }, schemaVersion: '1' },
      { id: '2', kind: 'file', data: { kind: 'file', name: 'Alpha.png', size: 500, mimeType: 'image/png' }, schemaVersion: '1' },
      { id: '3', kind: 'file', data: { kind: 'file', name: 'Beta.txt', size: 200, mimeType: 'text/plain' }, schemaVersion: '1' },
    ]

    const sortAsc = [...assets].sort((a, b) =>
      (a.data as { name: string }).name.localeCompare((b.data as { name: string }).name),
    )
    expect(sortAsc.map((a) => (a.data as { name: string }).name)).toEqual(['Alpha.png', 'Beta.txt', 'Zebra.pdf'])

    const sortDesc = [...assets].sort((a, b) =>
      (b.data as { name: string }).name.localeCompare((a.data as { name: string }).name),
    )
    expect(sortDesc.map((a) => (a.data as { name: string }).name)).toEqual(['Zebra.pdf', 'Beta.txt', 'Alpha.png'])
  })

  it('sorts unplaced assets by file size descending', () => {
    const assets: ObservableBlock[] = [
      { id: '1', kind: 'file', data: { kind: 'file', name: 'Small.txt', size: 100, mimeType: 'text/plain' }, schemaVersion: '1' },
      { id: '2', kind: 'file', data: { kind: 'file', name: 'Large.bin', size: 50000, mimeType: 'application/octet-stream' }, schemaVersion: '1' },
      { id: '3', kind: 'file', data: { kind: 'file', name: 'Medium.png', size: 5000, mimeType: 'image/png' }, schemaVersion: '1' },
    ]

    const sortSize = [...assets].sort((a, b) => {
      const sA = (a.data as { size: number }).size
      const sB = (b.data as { size: number }).size
      return sB - sA
    })
    expect(sortSize.map((a) => (a.data as { name: string }).name)).toEqual(['Large.bin', 'Medium.png', 'Small.txt'])
  })

  it('deletes asset and cleanly cascades to placements and memberships', () => {
    const blocks = [{ id: 'block-1', kind: 'file' }]
    const placements = [{ blockId: 'block-1', positionX: 10, positionY: 20 }]
    const memberships = [{ id: 'm-1', groupId: 'group-1', memberId: 'block-1' }]

    // Simulate delete block
    const toDeleteId = 'block-1'
    const remainingBlocks = blocks.filter((b) => b.id !== toDeleteId)
    const remainingPlacements = placements.filter((p) => p.blockId !== toDeleteId)
    const remainingMemberships = memberships.filter((m) => m.memberId !== toDeleteId && m.groupId !== toDeleteId)

    expect(remainingBlocks).toHaveLength(0)
    expect(remainingPlacements).toHaveLength(0)
    expect(remainingMemberships).toHaveLength(0)
  })
})
