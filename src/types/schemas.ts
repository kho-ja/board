import { z } from 'zod'

export const FieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export const FileViewSchema = z.enum(['card', 'content', 'meta'])

export const FileBlockDataSchema = z.object({
  kind: z.literal('file'),
  name: z.string(),
  size: z.number(),
  mimeType: z.string(),
  content: z.string().optional(),
  view: FileViewSchema.optional(),
})

export const FileGroupBlockDataSchema = z.object({
  kind: z.literal('file-group'),
  name: z.string(),
  currentView: z.enum(['card', 'list']),
})

export const TextBlockDataSchema = z.object({
  kind: z.literal('text'),
  markdown: z.string(),
})

export const ObjectBlockDataSchema = z.object({
  kind: z.string(),
  schemaId: z.string(),
  values: z.record(z.string(), FieldValueSchema),
})

export const BlockDataSchema = z.union([
  FileBlockDataSchema,
  FileGroupBlockDataSchema,
  TextBlockDataSchema,
  ObjectBlockDataSchema,
])

export const BlockSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    data: BlockDataSchema,
    viewOverride: z.string().nullable().optional(),
    schemaVersion: z.string().default('1'),
    createdAt: z.coerce.date().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.kind !== block.data.kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `block.kind (${block.kind}) must match data.kind (${block.data.kind})`,
        path: ['kind'],
      })
    }
  })

export const PlacementSchema = z.object({
  blockId: z.string(),
  positionX: z.number(),
  positionY: z.number(),
})

export const MembershipSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  memberId: z.string(),
  createdAt: z.coerce.date().optional(),
})

export const ConnectionTypeSchema = z.enum([
  'depends-on',
  'responsible-for',
  'part-of',
  'related-to',
])

export const LinkSchema = z.object({
  id: z.string(),
  blockAId: z.string(),
  blockBId: z.string(),
  type: ConnectionTypeSchema.optional(),
  label: z.string().nullable().optional(),
  createdAt: z.coerce.date().optional(),
})

export const FieldDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  fieldType: z.enum(['text', 'number', 'boolean', 'date', 'relation']),
})

export const TypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(FieldDefSchema),
  defaultView: z.string().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
})

export const ViewOptionsSchema = z.object({
  fields: z.array(z.string()).optional(),
  layout: z.enum(['card', 'list', 'grid']),
  sort: z
    .object({
      field: z.string(),
      dir: z.enum(['asc', 'desc']),
    })
    .optional(),
  density: z.string().optional(),
})

export const ViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetKind: z.string(),
  options: ViewOptionsSchema,
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
})

