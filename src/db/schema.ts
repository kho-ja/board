import {
  foreignKey,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import type { BlockData, ConnectionType, FieldDef, ViewOptions } from '#/types'
import type { BoardRole } from '#/lib/boards/roles'

export type { BoardRole }

export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    // Always stored lower-cased; the unique index is case-insensitive by
    // virtue of that normalisation (see src/lib/auth/password.ts callers).
    email: text().notNull(),
    name: text(),
    // scrypt digest, never the password itself.
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
)

export const sessions = pgTable(
  'sessions',
  {
    // sha256 hex of the session token. The raw token only ever exists in the
    // caller's cookie, so a database leak cannot be replayed as a session.
    id: text().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    // `pruneExpiredSessions` deletes by expiry time; without this index it has
    // to scan the whole table as expired rows accumulate.
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
)

export const boards = pgTable(
  'boards',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    // The owning user. The authoritative ownership record is the `owner` row in
    // `board_members`; this column exists so "boards I own" is a cheap index
    // lookup and so a user's boards can be cascaded away with the user.
    //
    // Nullable: a board with no owner is an *unclaimed* board. The migration
    // that introduces multi-tenancy parks the pre-existing content on one of
    // these, and the first account to register claims it (see
    // src/lib/boards/queries.server.ts).
    //
    // `SET NULL` rather than `CASCADE`: removing an account must not destroy
    // a board that other people are working on.
    ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('boards_owner_idx').on(t.ownerId)],
)

export const boardMembers = pgTable(
  'board_members',
  {
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<BoardRole>().notNull().default('editor'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('board_members_unique_idx').on(t.boardId, t.userId),
    index('board_members_user_idx').on(t.userId),
  ],
)

export const blocks = pgTable(
  'blocks',
  {
    id: text().primaryKey(),
    // Every board-scoped table carries the board it belongs to. The composite
    // unique index below is the target of the child tables' foreign keys,
    // which is what makes it impossible for a placement or link to point at a
    // block on a different board.
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    // kind identifies the block type: 'file' | 'file-group' | 'text' | a custom schema id
    kind: text().notNull(),
    // discriminated data blob: FileBlockData | FileGroupBlockData | TextBlockData | ObjectBlockData
    data: jsonb('data').$type<BlockData>().notNull(),
    schemaVersion: text('schema_version').notNull().default('1'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    // A *constraint*, not a bare index: this is the target of the child
    // tables' (block_id, board_id) foreign keys, and drizzle-kit only
    // recognises a unique constraint as the backing of a foreign key.
    unique('blocks_id_board_unique').on(t.id, t.boardId),
    index('blocks_board_idx').on(t.boardId),
  ],
)

export const placements = pgTable(
  'placements',
  {
    blockId: text('block_id').primaryKey(),
    boardId: text('board_id').notNull(),
    positionX: real('position_x').default(0).notNull(),
    positionY: real('position_y').default(0).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'placements_block_board_fk',
      columns: [t.blockId, t.boardId],
      foreignColumns: [blocks.id, blocks.boardId],
    }).onDelete('cascade'),
    index('placements_board_idx').on(t.boardId),
  ],
)

export const memberships = pgTable(
  'memberships',
  {
    id: text().primaryKey(),
    boardId: text('board_id').notNull(),
    groupId: text('group_id').notNull(),
    memberId: text('member_id').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'memberships_group_board_fk',
      columns: [t.groupId, t.boardId],
      foreignColumns: [blocks.id, blocks.boardId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'memberships_member_board_fk',
      columns: [t.memberId, t.boardId],
      foreignColumns: [blocks.id, blocks.boardId],
    }).onDelete('cascade'),
    uniqueIndex('memberships_unique_pair').on(t.groupId, t.memberId),
    index('memberships_board_idx').on(t.boardId),
  ],
)

export const links = pgTable(
  'links',
  {
    id: text().primaryKey(),
    boardId: text('board_id').notNull(),
    blockAId: text('block_a_id').notNull(),
    blockBId: text('block_b_id').notNull(),
    // Typed connection (M13); the drawn arrow expresses the canonical
    // direction for every non-symmetric type (see DECISIONS.md).
    type: text('type')
      .$type<ConnectionType>()
      .default('related-to')
      .notNull(),
    // Optional minimal edge data (a note on the connection).
    label: text('label'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'links_block_a_board_fk',
      columns: [t.blockAId, t.boardId],
      foreignColumns: [blocks.id, blocks.boardId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'links_block_b_board_fk',
      columns: [t.blockBId, t.boardId],
      foreignColumns: [blocks.id, blocks.boardId],
    }).onDelete('cascade'),
    index('links_board_idx').on(t.boardId),
  ],
)

export const types = pgTable(
  'types',
  {
    id: text().primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    // SchemaDef.fields: FieldDef[]
    fields: jsonb('fields').$type<FieldDef[]>().notNull(),
    defaultView: text('default_view'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('types_board_idx').on(t.boardId)],
)

export const views = pgTable(
  'views',
  {
    id: text().primaryKey(),
    boardId: text('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    targetKind: text('target_kind').notNull(),
    // ViewDef.options
    options: jsonb('options').$type<ViewOptions>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('views_board_idx').on(t.boardId)],
)

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text().primaryKey(),
    // API keys are per-user: with several people sharing this instance, one
    // user's key must not silently pay for another user's board.
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text().notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    // optional base URL for custom/OpenAI-compatible providers
    baseUrl: text('base_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('api_keys_user_provider_idx').on(t.userId, t.provider)],
)
