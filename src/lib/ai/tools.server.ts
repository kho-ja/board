import { connectionExists } from '#/lib/board/connections'
import type { BlockData, FieldValue } from '#/types'

import {
  insertBlock,
  insertLink,
  listBlocks,
  listLinks,
  listMemberships,
  listPlacements,
  listTypes,
} from '#/db/queries.server'

import {
  serializeBoardForAi,
  type AiSnapshot,
} from './board'

import {
  boardConnectBlocksDef,
  boardCreateBlocksDef,
  boardContextDef,
} from './tools'

/**
 * M15 — server-only tool handlers for the board chat. This module lives out of
 * the client graph (AskPanel never imports it): it reads and mutates Postgres
 * through the AI tools connected to their definitions in ./tools.
 */

/**
 * Read the entire board (blocks, placements, memberships, typed connections,
 * custom types) as a compact JSON snapshot the model can reason over.
 * Read-only — no approval required.
 */
export const boardContext = boardContextDef.server(async (): Promise<AiSnapshot> => {
  const [blocks, placements, links, memberships, types] = await Promise.all([
    listBlocks(),
    listPlacements(),
    listLinks(),
    listMemberships(),
    listTypes(),
  ])

  return serializeBoardForAi({ blocks, placements, links, memberships, types })
})

/**
 * Create new blocks on the board (unplaced assets — the users places them, or
 * the assistant connects them afterwards). Mutates the database, so it is
 * gated behind a user approval.
 */
export const boardCreateBlocks = boardCreateBlocksDef.server(
  async ({ blocks: requested }) => {
    const types = await listTypes()

    const results: Array<{
      ok: boolean
      id?: string
      kind?: string
      title: string
      error?: string
    }> = []

    for (const req of requested) {
      let kind: string
      let data: BlockData

      if (req.typeName) {
        const typeName = req.typeName
        const typeDef = types.find(
          (t) => t.name.toLowerCase() === typeName.trim().toLowerCase(),
        )
        if (!typeDef) {
          results.push({
            ok: false,
            title: req.title,
            error:
              `Unknown custom type "${typeName}". ` +
              (types.length
                ? `Available types: ${types.map((t) => t.name).join(', ')}.`
                : 'There are no custom types on this board yet.'),
          })
          continue
        }
        const values: Record<string, FieldValue> = {}
        for (const field of typeDef.fields) {
          const value = req.values?.[field.name]
          if (value !== undefined && value !== null) values[field.id] = value
        }
        kind = typeDef.id
        data = { kind: typeDef.id, schemaId: typeDef.id, values }
      } else if (req.kind === 'file-group') {
        kind = 'file-group'
        data = { kind: 'file-group', name: req.title, currentView: 'card' }
      } else {
        kind = 'text'
        data = { kind: 'text', markdown: req.title }
      }

      const inserted = await insertBlock({ id: crypto.randomUUID(), kind, data })
      const row = inserted[0]
      if (!row) {
        results.push({ ok: false, title: req.title, error: 'Insert failed' })
        continue
      }
      results.push({ ok: true, id: row.id, kind, title: req.title })
    }

    return { results }
  },
)

/**
 * Create a typed connection between two existing blocks. Mutates the database,
 * so it is gated behind a user approval.
 */
export const boardConnectBlocks = boardConnectBlocksDef.server(
  async ({ fromBlockId, toBlockId, type, label }) => {
    if (fromBlockId === toBlockId) {
      return { ok: false, error: 'A block cannot connect to itself.' }
    }

    const [blocks, links] = await Promise.all([listBlocks(), listLinks()])
    const ids = new Set(blocks.map((b) => b.id))
    if (!ids.has(fromBlockId) || !ids.has(toBlockId)) {
      return {
        ok: false,
        error: `Unknown block id. Use exact ids from board_context (from=${fromBlockId}, to=${toBlockId}).`,
      }
    }

    if (connectionExists(links, fromBlockId, toBlockId, type)) {
      return {
        ok: false,
        error: `A "${type}" connection between these blocks already exists.`,
      }
    }

    const inserted = await insertLink({
      id: crypto.randomUUID(),
      blockAId: fromBlockId,
      blockBId: toBlockId,
      type,
      label: label ?? null,
    })
    const row = inserted[0]
    if (!row) return { ok: false, error: 'Insert failed.' }
    return { ok: true, id: row.id }
  },
)

export const aiServerTools = [boardContext, boardCreateBlocks, boardConnectBlocks]