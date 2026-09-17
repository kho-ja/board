import { connectionExists } from '#/lib/board/connections'
import type {
  BlockData,
  ConnectionType,
  FieldValue,
  FileBlockData,
  FileGroupBlockData,
  TextBlockData,
} from '#/types'

import {
  insertBlock,
  insertLink,
  insertPlacement,
  listBlocks,
  listLinks,
  listMemberships,
  listPlacements,
  listTypes,
  updateBlock,
  upsertPlacement,
} from '#/db/queries.server'

import {
  serializeBoardForAi,
  type AiSnapshot,
} from './board'

import { layoutDiagram } from './diagram'

import {
  boardConnectBlocksDef,
  boardCreateBlocksDef,
  boardContextDef,
  boardCreateFilesDef,
  boardEditBlocksDef,
  boardMakeDiagramDef,
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

/**
 * M16 — edit existing board content: replace text, set custom-card field
 * values, rename files/groups, and place or move blocks. Mutates the database,
 * so it is gated behind a user approval.
 */
export const boardEditBlocks = boardEditBlocksDef.server(async ({ edits }) => {
  const [blocks, types] = await Promise.all([listBlocks(), listTypes()])
  const byId = new Map(blocks.map((b) => [b.id, b]))

  const results: Array<{
    id: string
    ok: boolean
    changed?: string[]
    error?: string
  }> = []

  for (const edit of edits) {
    const block = byId.get(edit.id)
    if (!block) {
      results.push({ id: edit.id, ok: false, error: `Unknown block id "${edit.id}". Use an exact id from board_context.` })
      continue
    }

    const changed: string[] = []
    let data: BlockData = block.data

    if (edit.markdown !== undefined) {
      if (block.kind !== 'text') {
        results.push({ id: edit.id, ok: false, error: 'markdown can only be set on text blocks.' })
        continue
      }
      data = { ...data, markdown: edit.markdown } as TextBlockData
      changed.push('markdown')
    }

    if (edit.values !== undefined) {
      if (block.kind === 'file' || block.kind === 'file-group' || block.kind === 'text') {
        results.push({ id: edit.id, ok: false, error: 'values can only be set on a structured card of a custom type.' })
        continue
      }
      const objectData = data as BlockData & {
        schemaId: string
        values: Record<string, FieldValue>
      }
      const typeDef = types.find((t) => t.id === objectData.schemaId)
      if (!typeDef) {
        results.push({ id: edit.id, ok: false, error: 'This block\'s custom type no longer exists.' })
        continue
      }
      const nextValues: Record<string, FieldValue> = { ...objectData.values }
      for (const field of typeDef.fields) {
        if (edit.values[field.name] !== undefined) {
          nextValues[field.id] = edit.values[field.name]
        }
      }
      data = { ...objectData, values: nextValues }
      changed.push('values')
    }

    if (edit.name !== undefined) {
      const current = data as FileBlockData | FileGroupBlockData
      if (!('name' in current)) {
        results.push({ id: edit.id, ok: false, error: 'name can only be set on file blocks and file groups.' })
        continue
      }
      data = { ...current, name: edit.name }
      changed.push('name')
    }

    // Only rewrite the block data when a field actually changed — a
    // position-only edit shouldn't trigger a pointless UPDATE.
    if (changed.length > 0) {
      const updated = await updateBlock(edit.id, { data, updatedAt: new Date() })
      if (!updated[0]) {
        results.push({ id: edit.id, ok: false, error: 'Update failed.' })
        continue
      }
    }

    if (edit.position !== undefined) {
      await upsertPlacement({
        blockId: edit.id,
        positionX: edit.position.x,
        positionY: edit.position.y,
      })
      changed.push('position')
    }

    results.push({ id: edit.id, ok: true, changed })
  }

  return { results }
})

const INLINE_TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/javascript', 'application/xml']

function isInlineMime(mimeType: string): boolean {
  const type = mimeType.trim().toLowerCase()
  return (
    INLINE_TEXT_MIME_PREFIXES.some((prefix) => type === prefix || type.startsWith(prefix)) ||
    type === 'image/svg+xml'
  )
}

/**
 * M16 — author real inline files (markdown, JSON, CSV, code, SVG) as `file`
 * blocks. `size` is the UTF-8 byte length of the content. Mutates the
 * database, so it is gated behind a user approval.
 */
export const boardCreateFiles = boardCreateFilesDef.server(async ({ files: requested }) => {
  const results: Array<{
    ok: boolean
    id?: string
    name: string
    size?: number
    error?: string
  }> = []

  for (const file of requested) {
    if (!file.name.trim()) {
      results.push({ ok: false, name: file.name, error: 'File name is required.' })
      continue
    }
    if (!isInlineMime(file.mimeType)) {
      results.push({
        ok: false,
        name: file.name,
        error:
          `Cannot store "${file.mimeType}" inline. Supported: text/*, application/json, application/javascript, application/xml, and image/svg+xml (SVG renders as an image on the board).`,
      })
      continue
    }

    const size = Buffer.byteLength(file.content, 'utf8')
    const data: FileBlockData = {
      kind: 'file',
      name: file.name,
      size,
      mimeType: file.mimeType,
      content: file.content,
    }
    const inserted = await insertBlock({ id: crypto.randomUUID(), kind: 'file', data })
    const row = inserted[0]
    if (!row) {
      results.push({ ok: false, name: file.name, error: 'Insert failed.' })
      continue
    }
    results.push({ ok: true, id: row.id, name: file.name, size })
  }

  return { results }
})

/**
 * M16 — compose a native diagram: create one text block per node, lay them out
 * (longest-path layered, either left-to-right or top-to-bottom), place them on
 * the canvas, and connect them with typed links. Edges reference node indices.
 * Mutates the database, so it is gated behind a user approval.
 */
export const boardMakeDiagram = boardMakeDiagramDef.server(
  async ({ nodes, edges, direction }) => {
    if (!nodes.length) {
      return { anchor: { x: 0, y: 0 }, results: [], linksCreated: 0, error: { message: 'No nodes provided.' } }
    }

    // Anchor the diagram near existing placed content (fall back to the origin).
    const placements = await listPlacements()
    let anchor = { x: 0, y: 0 }
    if (placements.length) {
      const total = placements.reduce(
        (acc, p) => ({ x: acc.x + p.positionX, y: acc.y + p.positionY }),
        { x: 0, y: 0 },
      )
      anchor = { x: Math.round(total.x / placements.length), y: Math.round(total.y / placements.length) }
    }

    const invalidEdges: string[] = []
    const validEdges: Array<{
      from: number
      to: number
      type?: ConnectionType
      label?: string | null
    }> = []
    const seen = new Set<string>()
    for (const edge of edges) {
      const inRange = edge.from >= 0 && edge.from < nodes.length && edge.to >= 0 && edge.to < nodes.length
      if (!inRange || edge.from === edge.to) {
        invalidEdges.push(`${edge.from} -> ${edge.to}`)
        continue
      }
      // Skip exact duplicates (same pair + same type) within one request so
      // the model can't create duplicate links between freshly-made nodes.
      const edgeKey = `${edge.from}|${edge.to}|${edge.type ?? 'depends-on'}`
      if (seen.has(edgeKey)) continue
      seen.add(edgeKey)
      validEdges.push({ from: edge.from, to: edge.to, type: edge.type, label: edge.label })
    }

    const layout = layoutDiagram({ nodes, edges: validEdges, direction }, anchor)

    // Create a text block + placement per node.
    const results: Array<{ index: number; id: string; position: { x: number; y: number } }> = []
    for (let index = 0; index < nodes.length; index++) {
      const data: TextBlockData = { kind: 'text', markdown: nodes[index].label }
      const blockId = crypto.randomUUID()
      const inserted = await insertBlock({ id: blockId, kind: 'text', data })
      const row = inserted[0]
      if (!row) {
        continue
      }
      const position = layout.positions[index]
      await insertPlacement({ blockId, positionX: position.x, positionY: position.y })
      results.push({ index, id: blockId, position })
    }

    // Connect the valid edges.
    const idByIndex = new Map(results.map((r) => [r.index, r.id]))
    let linksCreated = 0
    for (const edge of validEdges) {
      const fromId = idByIndex.get(edge.from)
      const toId = idByIndex.get(edge.to)
      if (!fromId || !toId) continue
      const inserted = await insertLink({
        id: crypto.randomUUID(),
        blockAId: fromId,
        blockBId: toId,
        type: edge.type ?? 'depends-on',
        label: edge.label ?? null,
      })
      if (inserted[0]) linksCreated++
    }

    return {
      anchor,
      results,
      linksCreated,
      ...(invalidEdges.length
        ? { error: { invalidEdges, message: `${invalidEdges.length} edge(s) skipped: out-of-range or self-loop indices.` } }
        : {}),
    }
  },
)

export const aiServerTools = [
  boardContext,
  boardCreateBlocks,
  boardConnectBlocks,
  boardEditBlocks,
  boardCreateFiles,
  boardMakeDiagram,
]