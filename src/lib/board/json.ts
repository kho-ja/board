import { z } from 'zod'

import {
  BlockSchema,
  LinkSchema,
  MembershipSchema,
  PlacementSchema,
  TypeSchema,
  ViewSchema,
} from '#/types/schemas'

export const BOARD_EXPORT_APP = 'kho-ja.board' as const
export const BOARD_EXPORT_VERSION = 1 as const

/**
 * M11 — full board serialization. Every collection the board reads from is
 * included so an export round-trips the exact board state.
 */
export const BoardExportSchema = z.object({
  app: z.literal(BOARD_EXPORT_APP),
  version: z.literal(BOARD_EXPORT_VERSION),
  exportedAt: z.string(),
  blocks: z.array(BlockSchema),
  placements: z.array(PlacementSchema),
  memberships: z.array(MembershipSchema),
  links: z.array(LinkSchema),
  types: z.array(TypeSchema),
  views: z.array(ViewSchema),
})

export type BoardExport = z.infer<typeof BoardExportSchema>

export interface BoardSnapshot {
  blocks: BoardExport['blocks']
  placements: BoardExport['placements']
  memberships: BoardExport['memberships']
  links: BoardExport['links']
  types: BoardExport['types']
  views: BoardExport['views']
}

export function buildBoardExport(snapshot: BoardSnapshot): BoardExport {
  return {
    app: BOARD_EXPORT_APP,
    version: BOARD_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    ...snapshot,
  }
}

export type ParseResult =
  | { ok: true; data: BoardExport }
  | { ok: false; error: string }

/**
 * Parse + validate an imported board file. Beyond the row schemas this checks
 * referential integrity (every placement / membership / link points at an
 * exported block) and reports the first problem in plain language.
 */
export function parseBoardExport(json: unknown): ParseResult {
  const parsed = BoardExportSchema.safeParse(json)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first.path.join('.') || '(root)'
    return { ok: false, error: `${path}: ${first.message}` }
  }
  const data = parsed.data
  const blockIds = new Set(data.blocks.map((b) => b.id))

  for (const p of data.placements) {
    if (!blockIds.has(p.blockId)) {
      return { ok: false, error: `placement points at unknown block ${p.blockId}` }
    }
  }
  for (const m of data.memberships) {
    if (!blockIds.has(m.groupId)) {
      return { ok: false, error: `membership ${m.id} points at unknown group ${m.groupId}` }
    }
    if (!blockIds.has(m.memberId)) {
      return { ok: false, error: `membership ${m.id} points at unknown member ${m.memberId}` }
    }
  }
  for (const l of data.links) {
    if (!blockIds.has(l.blockAId) || !blockIds.has(l.blockBId)) {
      return { ok: false, error: `link ${l.id} points at a block that is not exported` }
    }
  }
  return { ok: true, data }
}

/** Filename stamp: kho-ja-board-20260908-170500.json */
export function exportFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `kho-ja-board-${stamp}.json`
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
