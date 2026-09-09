import { describe, expect, it } from 'vitest'

import {
  BOARD_EXPORT_APP,
  BOARD_EXPORT_VERSION,
  buildBoardExport,
  exportFilename,
  parseBoardExport,
  type BoardSnapshot,
} from './json'

const snapshot: BoardSnapshot = {
  blocks: [
    { id: 'b1', kind: 'text', data: { kind: 'text', markdown: 'hi' }, schemaVersion: '1' },
    {
      id: 'b2',
      kind: 'file',
      data: { kind: 'file', name: 'a.bin', size: 3, mimeType: 'application/octet-stream' },
      schemaVersion: '1',
    },
  ],
  placements: [
    { blockId: 'b1', positionX: 10, positionY: 20 },
    { blockId: 'b2', positionX: 100, positionY: 200 },
  ],
  memberships: [],
  links: [{ id: 'l1', blockAId: 'b1', blockBId: 'b2', type: 'depends-on', label: 'releases' }],
  types: [],
  views: [],
}

describe('board json / export', () => {
  it('builds a versioned payload', () => {
    const out = buildBoardExport({ ...snapshot })
    expect(out.app).toBe(BOARD_EXPORT_APP)
    expect(out.version).toBe(BOARD_EXPORT_VERSION)
    expect(out.blocks).toHaveLength(2)
    expect(out.links).toHaveLength(1)
    expect(typeof out.exportedAt).toBe('string')
  })

  it('stamps filenames', () => {
    expect(exportFilename(new Date(2026, 8, 8, 17, 5, 9))).toBe('kho-ja-board-20260908-170509.json')
  })
})

describe('board json / import validation', () => {
  it('round-trips a valid export (dates coerce from strings)', () => {
    const exported = JSON.parse(JSON.stringify(buildBoardExport({ ...snapshot })))
    const result = parseBoardExport(exported)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(BOARD_EXPORT_VERSION)
      expect(result.data.links[0]).toMatchObject({ type: 'depends-on', label: 'releases' })
    }
  })

  it('rejects an unknown connection type', () => {
    const base = buildBoardExport({ ...snapshot })
    const bad = {
      ...base,
      links: [{ id: 'l', blockAId: 'b1', blockBId: 'b2', type: 'blocks' }],
    }
    expect(parseBoardExport(bad).ok).toBe(false)
  })

  it('upgrades a v1 export to v2 by backfilling the link type', () => {
    const v1 = {
      ...JSON.parse(JSON.stringify(buildBoardExport({ ...snapshot }))),
      version: 1,
      links: [{ id: 'l1', blockAId: 'b1', blockBId: 'b2' }],
    }
    const result = parseBoardExport(v1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.version).toBe(BOARD_EXPORT_VERSION)
      expect(result.data.links[0].type).toBe('related-to')
    }
  })

  it('rejects the wrong app or version', () => {
    const base = buildBoardExport({ ...snapshot })
    expect(parseBoardExport({ ...base, app: 'other' }).ok).toBe(false)
    expect(parseBoardExport({ ...base, version: 999 }).ok).toBe(false)
  })

  it('rejects rows whose kind and data disagree', () => {
    const base = buildBoardExport({ ...snapshot })
    const bad = {
      ...base,
      blocks: [{ id: 'x', kind: 'text', data: { kind: 'file', name: 'n', size: 1, mimeType: 'm' } }],
    }
    const result = parseBoardExport(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/must match/)
  })

  it('rejects dangling placement / membership / link references', () => {
    const base = buildBoardExport({ ...snapshot })
    expect(
      parseBoardExport({ ...base, placements: [{ blockId: 'ghost', positionX: 0, positionY: 0 }] }),
    ).toMatchObject({ ok: false })
    expect(
      parseBoardExport({
        ...base,
        memberships: [{ id: 'm', groupId: 'b1', memberId: 'ghost' }],
      }).ok,
    ).toBe(false)
    expect(
      parseBoardExport({ ...base, links: [{ id: 'l', blockAId: 'b1', blockBId: 'ghost' }] }).ok,
    ).toBe(false)
  })

  it('reports the first problem in plain language', () => {
    const result = parseBoardExport({ app: BOARD_EXPORT_APP })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(typeof result.error).toBe('string')
  })
})
