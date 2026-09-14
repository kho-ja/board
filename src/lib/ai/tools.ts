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

/**
 * M16 — edit existing board content. Mutates the database, so it is gated
 * behind a user approval.
 */
export const boardEditBlocksDef = toolDefinition({
  name: 'board_edit_blocks',
  description:
    'Edit existing blocks on the board. You may replace a text note\'s markdown, set field values on a structured card (keyed by the custom type field names), rename a file or file group, move/place a block (position), or any combination. Use the exact block ids and type names from board_context. Requires user approval before it runs.',
  needsApproval: true,
  inputSchema: z.object({
    edits: z
      .array(
        z.object({
          id: z.string().describe('Exact id of the block to edit (from board_context).'),
          markdown: z
            .string()
            .optional()
            .describe('Replaces the full text content of a text block.'),
          values: z
            .record(z.string(), fieldValueSchema)
            .optional()
            .describe("Sets field values on a structured card, keyed by the type's field names (from board_context). Omitted fields keep their current value."),
          name: z
            .string()
            .optional()
            .describe('New name for a file block or a file group.'),
          position: z
            .object({
              x: z.number().describe('World-space X of the block top-left corner.'),
              y: z.number().describe('World-space Y of the block top-left corner.'),
            })
            .optional()
            .describe('Place the block on the canvas, or move it if already placed.'),
        }),
      )
      .describe('The edits to apply (one or more).'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.string(),
        ok: z.boolean(),
        changed: z.array(z.string()).optional(),
        error: z.string().optional(),
      }),
    ),
  }),
})

/**
 * M16 — author real (inline) files on the board: markdown, JSON, CSV, code,
 * or SVG. SVG content renders as an image. Mutates the database, so it is
 * gated behind a user approval.
 */
export const boardCreateFilesDef = toolDefinition({
  name: 'board_create_files',
  description:
    'Create file blocks with real content right on the board. Each file stores its bytes as inline text content (markdown, plain text, JSON, CSV, source code, or SVG). SVG content (mimeType "image/svg+xml") renders as an image on the board. Files appear as unplaced assets in the Assets panel. Name files with an extension. Requires user approval before it runs.',
  needsApproval: true,
  inputSchema: z.object({
    files: z
      .array(
        z.object({
          name: z.string().describe('File name, including its extension (e.g. "changelog.md").'),
          mimeType: z
            .string()
            .describe('MIME type of the content: text/plain, text/markdown, application/json, text/csv, text/html, image/svg+xml, application/javascript, etc. Use image/svg+xml for SVG diagrams/images.'),
          content: z
            .string()
            .describe('The entire file content as text (SVG markup for image/svg+xml files).'),
        }),
      )
      .describe('The files to create (one or more).'),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        ok: z.boolean(),
        id: z.string().optional(),
        name: z.string(),
        size: z.number().optional(),
        error: z.string().optional(),
      }),
    ),
  }),
})

/**
 * M16 — compose a diagram out of native blocks + connections, laid out and
 * placed on the canvas. Mutates the database, so it is gated behind a user
 * approval.
 */
export const boardMakeDiagramDef = toolDefinition({
  name: 'board_make_diagram',
  description:
    'Build a diagram on the canvas from scratch: describe the diagram nodes (boxes) and the edges between them; the tool creates one text block per node, lays them out in flow order (longest-path layering), places them on the canvas, and connects them with typed links. Nodes and edges are given by index (0-based position in the nodes array). Use cases: flowcharts, org charts, dependency graphs, mind maps, process diagrams. Requires user approval before it runs, then the diagram is arranged on the board.',
  needsApproval: true,
  inputSchema: z.object({
    title: z
      .string()
      .optional()
      .describe('A short label for the diagram (helps the summary text; the nodes carry the real content).'),
    nodes: z
      .array(
        z.object({
          label: z.string().describe('The visible text of this diagram box (keep it short).'),
        }),
      )
      .describe('The diagram boxes, in order.'),
    edges: z
      .array(
        z.object({
          from: z.number().describe('Index (into nodes) of the source box.'),
          to: z.number().describe('Index (into nodes) of the target box.'),
          type: z
            .enum(CONNECTION_TYPES)
            .optional()
            .describe('Connection type. Defaults to depends-on for flows; use part-of for hierarchies and related-to for undirected associations.'),
          label: z.string().nullish().describe('Optional short edge note.'),
        }),
      )
      .describe('The connections between the diagram boxes, as node indices.'),
    direction: z
      .enum(['left-to-right', 'top-to-bottom'])
      .default('left-to-right')
      .optional()
      .describe('Flow direction of the layout.'),
  }),
  outputSchema: z.object({
    anchor: z.object({ x: z.number(), y: z.number() }),
    results: z.array(
      z.object({
        index: z.number(),
        id: z.string(),
        position: z.object({ x: z.number(), y: z.number() }),
      }),
    ),
    linksCreated: z.number(),
    error: z
      .object({
        invalidEdges: z.array(z.string()).optional(),
        message: z.string().optional(),
      })
      .optional(),
  }),
})

export const aiTools = [
  boardContextDef,
  boardCreateBlocksDef,
  boardConnectBlocksDef,
  boardEditBlocksDef,
  boardCreateFilesDef,
  boardMakeDiagramDef,
]

// Re-exported so the system prompt can reference tool names via constants.
export const AI_TOOL_NAMES = {
  context: boardContextDef.name,
  createBlocks: boardCreateBlocksDef.name,
  connectBlocks: boardConnectBlocksDef.name,
  editBlocks: boardEditBlocksDef.name,
  createFiles: boardCreateFilesDef.name,
  makeDiagram: boardMakeDiagramDef.name,
} as const