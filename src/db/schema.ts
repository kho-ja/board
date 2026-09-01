import {
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import type { BlockData, FieldDef, ViewOptions } from '#/types'

export const blocks = pgTable('blocks', {
  id: text().primaryKey(),
  // kind identifies the block type: 'file' | 'file-group' | 'text' | a custom schema id
  kind: text().notNull(),
  // discriminated data blob: FileBlockData | FileGroupBlockData | TextBlockData | ObjectBlockData
  data: jsonb('data').$type<BlockData>().notNull(),
  viewOverride: text('view_override'),
  schemaVersion: text('schema_version').notNull().default('1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const placements = pgTable(
  'placements',
  {
    blockId: text('block_id')
      .primaryKey()
      .references(() => blocks.id, { onDelete: 'cascade' }),
    positionX: real('position_x').default(0).notNull(),
    positionY: real('position_y').default(0).notNull(),
  },
  (t) => [uniqueIndex('placements_block_idx').on(t.blockId)],
)

export const memberships = pgTable(
  'memberships',
  {
    id: text().primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => blocks.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => blocks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('memberships_unique_pair').on(t.groupId, t.memberId)],
)

export const types = pgTable('types', {
  id: text().primaryKey(),
  name: text().notNull(),
  // SchemaDef.fields: FieldDef[]
  fields: jsonb('fields').$type<FieldDef[]>().notNull(),
  defaultView: text('default_view'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const views = pgTable('views', {
  id: text().primaryKey(),
  name: text().notNull(),
  targetKind: text('target_kind').notNull(),
  // ViewDef.options
  options: jsonb('options').$type<ViewOptions>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})