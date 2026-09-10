import type {
  BlockData,
  ConnectionType,
  FieldDef,
  FieldValue,
} from '#/types'

/**
 * M15 — turn the board's live rows into a compact, model-friendly snapshot
 * that an LLM can read as tool-call context. Pure string/number/boolean data
 * only, so it is JSON-safe across the tool boundary.
 */

export const TEXT_BODY_CHARS = 8000

export interface AiBlockInput {
  id: string
  kind: string
  data: BlockData
  createdAt?: Date | string | number | null
  updatedAt?: Date | string | number | null
}

export interface AiPlacementInput {
  blockId: string
  positionX?: number | null
  positionY?: number | null
}

export interface AiLinkInput {
  id: string
  blockAId: string
  blockBId: string
  type?: ConnectionType | null
  label?: string | null
  createdAt?: Date | string | number | null
}

export interface AiMembershipInput {
  id?: string
  groupId: string
  memberId: string
}

export interface AiTypeInput {
  id: string
  name: string
  fields: readonly FieldDef[]
}

export interface AiBoardInput {
  blocks: AiBlockInput[]
  placements: AiPlacementInput[]
  links: AiLinkInput[]
  memberships: AiMembershipInput[]
  types: AiTypeInput[]
}

export interface AiBlockSnapshot {
  id: string
  kind: string
  title: string
  body: string
  fields: Record<string, FieldValue>
  flags: string[]
}

export interface AiConnectionSnapshot {
  id: string
  from: string
  to: string
  type: ConnectionType
  label: string | null
}

export interface AiSnapshot {
  blocks: AiBlockSnapshot[]
  types: Array<{
    id: string
    name: string
    fields: Array<{ name: string; fieldType: string }>
  }>
  connections: AiConnectionSnapshot[]
  memberships: Array<{ groupId: string; memberId: string }>
}

function typeById(types: readonly AiTypeInput[], id: string) {
  return types.find((t) => t.id === id)
}

function typeByName(types: readonly AiTypeInput[], name: string) {
  const target = name.trim().toLowerCase()
  return types.find((t) => t.name.toLowerCase() === target)
}

function firstMeaningfulLine(markdown: string): string {
  const line = markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  return line ?? 'Untitled'
}

export function blockTitleFromData(
  kind: string,
  data: BlockData,
  types: readonly AiTypeInput[],
): string {
  switch (kind) {
    case 'file':
      return (data as { name?: string }).name?.trim() || 'Untitled file'
    case 'file-group':
      return (data as { name?: string }).name?.trim() || 'Untitled group'
    case 'text':
      return firstMeaningfulLine((data as { markdown?: string }).markdown ?? '')
    default: {
      const object = data as { schemaId?: string; values?: Record<string, FieldValue> }
      const typeDef = object.schemaId ? typeById(types, object.schemaId) : undefined
      const name = typeDef?.name ?? kind
      if (object.values) {
        const first = Object.entries(object.values).find(
          ([, value]) => value !== null && value !== undefined && value !== '',
        )
        if (first) return `${name}: ${String(first[1])}`
      }
      return name
    }
  }
}

export function blockBodyFromData(data: BlockData): string {
  if ('markdown' in data) {
    return (data.markdown ?? '').slice(0, TEXT_BODY_CHARS)
  }
  return ''
}

export function objectFieldsFromData(
  data: BlockData,
): Record<string, FieldValue> {
  if ('values' in data) {
    return (data.values ?? {}) as Record<string, FieldValue>
  }
  return {}
}

export function serializeBoardForAi(input: AiBoardInput): AiSnapshot {
  const placedBlockIds = new Set(input.placements.map((p) => p.blockId))
  const membershipBlocks = new Set(input.memberships.map((m) => m.memberId))

  const blocks = input.blocks.map((block) => {
    const flags: string[] = []
    if (placedBlockIds.has(block.id)) flags.push('placed')
    if (block.kind === 'file-group') flags.push('group')
    if (membershipBlocks.has(block.id)) flags.push('in-group')

    return {
      id: block.id,
      kind: block.kind,
      title: blockTitleFromData(block.kind, block.data, input.types),
      body: blockBodyFromData(block.data),
      fields: objectFieldsFromData(block.data),
      flags,
    }
  })

  return {
    blocks,
    types: input.types.map((t) => ({
      id: t.id,
      name: t.name,
      fields: t.fields.map((f) => ({ name: f.name, fieldType: f.fieldType })),
    })),
    connections: input.links.map((link) => ({
      id: link.id,
      from: link.blockAId,
      to: link.blockBId,
      type: link.type ?? 'related-to',
      label: link.label || null,
    })),
    memberships: input.memberships.map((m) => ({
      groupId: m.groupId,
      memberId: m.memberId,
    })),
  }
}

export { typeByName }