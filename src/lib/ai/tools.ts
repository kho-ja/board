import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { CONNECTION_TYPES } from '#/lib/board/connections'

/**
 * M15 — AI tool definitions. Client-safe on purpose: AskPanel imports `aiTools`
 * so the board chat knows the tool names/schemas and gating. The DB-backed
 * server handlers live in ./tools.server (server-only module) and are attached
 * here via `.server()`.
 */

const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

const snapshotSchema = z.object({
  blocks: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      title: z.string(),
      body: z.string(),
      fields: z.record(z.string(), fieldValueSchema),
      flags: z.array(z.string()),
    }),
  ),
  types: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      fields: z.array(z.object({ name: z.string(), fieldType: z.string() })),
    }),
  ),
  connections: z.array(
    z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      type: z.string(),
      label: z.string().nullish(),
    }),
  ),
  memberships: z.array(z.object({ groupId: z.string(), memberId: z.string() })),
})

/**
 * Read the entire board (blocks, placements, memberships, typed connections,
 * custom types) as a compact JSON snapshot the model can reason over.
 * Read-only — no approval required.
 */
export const boardContextDef = toolDefinition({
  name: 'board_context',
  description:
    "Read the current board. Returns every block (text notes, files, file groups, custom-type cards with their field values), every typed connection, memberships, and the custom type schemas. Use this first before answering any question about the board's contents.",
  inputSchema: z.object({}),
  outputSchema: snapshotSchema,
})

/**
 * Create new blocks on the board (unplaced assets — the users places them, or
 * the assistant connects them afterwards). Mutates the database, so it is
 * gated behind a user approval.
 */
export const boardCreateBlocksDef = toolDefinition({
  name: 'board_create_blocks',
  description:
    'Create new blocks on the board. Each block may be a free-form text note, a file group, or a structured card of an existing custom type (pass typeName and values keyed by field name). New blocks are added as unplaced assets in the Assets panel. Requires user approval before it runs.',
  needsApproval: true,
  inputSchema: z.object({
    blocks: z
      .array(
        z.object({
          title: z
            .string()
            .describe(
              "Human-readable title. For 'text' blocks this is the note's content; for structured cards the card label; for file groups the group name.",
            ),
          kind: z
            .enum(['text', 'file-group'])
            .default('text')
            .describe("'text' creates a text note; 'file-group' creates an empty file group."),
          typeName: z
            .string()
            .optional()
            .describe(
              'If set, creates a structured card of an existing custom type (must match a type name from board_context).',
            ),
          values: z
            .record(z.string(), fieldValueSchema)
            .optional()
            .describe('Field values keyed by the custom type\'s field names (when typeName is set).'),
        }),
      )
      .describe('The blocks to create (one or more).'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        ok: z.boolean(),
        id: z.string().optional(),
        kind: z.string().optional(),
        title: z.string(),
        error: z.string().optional(),
      }),
    ),
  }),
})

/**
 * Create a typed connection between two existing blocks. Mutates the database,
 * so it is gated behind a user approval.
 */
export const boardConnectBlocksDef = toolDefinition({
  name: 'board_connect_blocks',
  description:
    'Create a typed connection (edge) between two existing blocks. Use the block ids from board_context. Directional types: depends-on (dependant -> dependency), responsible-for (person -> thing), part-of (part -> whole). related-to is symmetric. Requires user approval before it runs.',
  needsApproval: true,
  inputSchema: z.object({
    fromBlockId: z.string().describe('id of the source block'),
    toBlockId: z.string().describe('id of the target block'),
    type: z
      .enum(CONNECTION_TYPES)
      .describe('The connection type. related-to is the generic symmetric fallback.'),
    label: z
      .string()
      .nullish()
      .describe('Optional short note about the connection.'),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    id: z.string().optional(),
    error: z.string().optional(),
  }),
})

export const aiTools = [boardContextDef, boardCreateBlocksDef, boardConnectBlocksDef]

// Re-exported so the system prompt can reference tool names via constants.
export const AI_TOOL_NAMES = {
  context: boardContextDef.name,
  createBlocks: boardCreateBlocksDef.name,
  connectBlocks: boardConnectBlocksDef.name,
} as const