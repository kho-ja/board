import { and, asc, desc, eq } from 'drizzle-orm'

import { db } from './client.ts'
import {
  apiKeys,
  blocks,
  links,
  memberships,
  placements,
  types,
  views,
} from './schema.ts'

export type BlockRow = typeof blocks.$inferSelect
export type BlockInsert = typeof blocks.$inferInsert
/** What a caller may insert — the board is supplied by the server. */
export type BlockContent = Omit<BlockInsert, 'boardId'>

export type PlacementRow = typeof placements.$inferSelect
export type PlacementInsert = typeof placements.$inferInsert
export type PlacementContent = Omit<PlacementInsert, 'boardId'>

export type MembershipRow = typeof memberships.$inferSelect
export type MembershipInsert = typeof memberships.$inferInsert
export type MembershipContent = Omit<MembershipInsert, 'boardId'>

export type TypeRow = typeof types.$inferSelect
export type TypeInsert = typeof types.$inferInsert
export type TypeContent = Omit<TypeInsert, 'boardId'>

export type ViewRow = typeof views.$inferSelect
export type ViewInsert = typeof views.$inferInsert
export type ViewContent = Omit<ViewInsert, 'boardId'>

export type LinkRow = typeof links.$inferSelect
export type LinkInsert = typeof links.$inferInsert
export type LinkContent = Omit<LinkInsert, 'boardId'>

export type ApiKeyRow = typeof apiKeys.$inferSelect
export type ApiKeyInsert = typeof apiKeys.$inferInsert
export type ApiKeyContent = Omit<ApiKeyInsert, 'userId' | 'id'>

/*
 * Every board-scoped helper takes the board id as its first argument and
 * filters on it. Callers are expected to have already checked that the
 * request's user may touch that board (see src/lib/auth/guards.server.ts) —
 * these helpers never trust a board id on their own.
 */

// ---------- API Keys ----------

export async function listApiKeys(userId: string) {
  return db.select().from(apiKeys).where(eq(apiKeys.userId, userId))
}

export async function getApiKey(userId: string, provider: string) {
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertApiKey(values: ApiKeyInsert) {
  return db
    .insert(apiKeys)
    .values(values)
    .onConflictDoUpdate({
      target: [apiKeys.userId, apiKeys.provider],
      set: {
        encryptedKey: values.encryptedKey,
        baseUrl: values.baseUrl,
        updatedAt: new Date(),
      },
    })
    .returning()
}

export async function deleteApiKey(userId: string, provider: string) {
  return db
    .delete(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider)))
    .returning()
}

// ---------- Blocks ----------

export async function listBlocks(boardId: string) {
  return db
    .select()
    .from(blocks)
    .where(eq(blocks.boardId, boardId))
    .orderBy(desc(blocks.createdAt))
}

export async function insertBlock(boardId: string, values: BlockContent) {
  return db
    .insert(blocks)
    .values({ ...values, boardId })
    .onConflictDoNothing()
    .returning()
}

export async function updateBlock(boardId: string, id: string, changes: Partial<BlockRow>) {
  const { id: _ignored, boardId: _ignoredBoard, ...rest } = changes
  return db
    .update(blocks)
    .set(rest)
    .where(and(eq(blocks.id, id), eq(blocks.boardId, boardId)))
    .returning()
}

export async function deleteBlock(boardId: string, id: string) {
  return db
    .delete(blocks)
    .where(and(eq(blocks.id, id), eq(blocks.boardId, boardId)))
    .returning()
}

// ---------- Placements ----------

export async function listPlacements(boardId: string) {
  return db.select().from(placements).where(eq(placements.boardId, boardId))
}

export async function insertPlacement(boardId: string, values: PlacementContent) {
  return db
    .insert(placements)
    .values({ ...values, boardId })
    .onConflictDoNothing()
    .returning()
}

export async function updatePlacement(
  boardId: string,
  blockId: string,
  changes: Partial<PlacementRow>,
) {
  const { blockId: _ignored, boardId: _ignoredBoard, ...rest } = changes
  return db
    .update(placements)
    .set(rest)
    .where(
      and(eq(placements.blockId, blockId), eq(placements.boardId, boardId)),
    )
    .returning()
}

/** Place a block, or move it if already placed (M16 — AI builder placement). */
export async function upsertPlacement(boardId: string, values: PlacementContent) {
  return db
    .insert(placements)
    .values({ ...values, boardId })
    .onConflictDoUpdate({
      target: placements.blockId,
      set: { positionX: values.positionX, positionY: values.positionY },
    })
    .returning()
}

export async function deletePlacement(boardId: string, blockId: string) {
  return db
    .delete(placements)
    .where(
      and(eq(placements.blockId, blockId), eq(placements.boardId, boardId)),
    )
    .returning()
}

// ---------- Memberships ----------

export async function listMemberships(boardId: string) {
  return db.select().from(memberships).where(eq(memberships.boardId, boardId))
}

export async function insertMembership(boardId: string, values: MembershipContent) {
  return db
    .insert(memberships)
    .values({ ...values, boardId })
    .onConflictDoNothing()
    .returning()
}

export async function updateMembership(
  boardId: string,
  id: string,
  changes: Partial<MembershipRow>,
) {
  const { id: _ignored, boardId: _ignoredBoard, ...rest } = changes
  return db
    .update(memberships)
    .set(rest)
    .where(and(eq(memberships.id, id), eq(memberships.boardId, boardId)))
    .returning()
}

export async function deleteMembership(boardId: string, id: string) {
  return db
    .delete(memberships)
    .where(and(eq(memberships.id, id), eq(memberships.boardId, boardId)))
    .returning()
}

// ---------- Types ----------

export async function listTypes(boardId: string) {
  return db
    .select()
    .from(types)
    .where(eq(types.boardId, boardId))
    .orderBy(asc(types.name))
}

export async function insertType(boardId: string, values: TypeContent) {
  return db
    .insert(types)
    .values({ ...values, boardId })
    .onConflictDoNothing()
    .returning()
}

export async function updateType(boardId: string, id: string, changes: Partial<TypeRow>) {
  const { id: _ignored, boardId: _ignoredBoard, ...rest } = changes
  return db
    .update(types)
    .set(rest)
    .where(and(eq(types.id, id), eq(types.boardId, boardId)))
    .returning()
}

export async function deleteType(boardId: string, id: string) {
  return db
    .delete(types)
    .where(and(eq(types.id, id), eq(types.boardId, boardId)))
    .returning()
}

// ---------- Views ----------

export async function listViews(boardId: string) {
  return db
    .select()
    .from(views)
    .where(eq(views.boardId, boardId))
    .orderBy(asc(views.name))
}

export async function insertView(boardId: string, values: ViewContent) {
  return db
    .insert(views)
    .values({ ...values, boardId })
    .onConflictDoNothing()
    .returning()
}

export async function updateView(boardId: string, id: string, changes: Partial<ViewRow>) {
  const { id: _ignored, boardId: _ignoredBoard, ...rest } = changes
  return db
    .update(views)
    .set(rest)
    .where(and(eq(views.id, id), eq(views.boardId, boardId)))
    .returning()
}

export async function deleteView(boardId: string, id: string) {
  return db
    .delete(views)
    .where(and(eq(views.id, id), eq(views.boardId, boardId)))
    .returning()
}

// ---------- Links ----------

export async function listLinks(boardId: string) {
  // Direct select, not the relational builder: `db.query.links` caches its
  // column metadata on first import and silently drops columns added later
  // (e.g. `type`/`label`), which HMR does not rebuild.
  return db.select().from(links).where(eq(links.boardId, boardId))
}

export async function insertLink(boardId: string, values: LinkContent) {
  return db
    .insert(links)
    .values({ ...values, boardId })
    .onConflictDoNothing()
    .returning()
}

export async function updateLink(boardId: string, id: string, changes: Partial<LinkRow>) {
  const { id: _ignored, boardId: _ignoredBoard, ...rest } = changes
  return db
    .update(links)
    .set(rest)
    .where(and(eq(links.id, id), eq(links.boardId, boardId)))
    .returning()
}

export async function deleteLink(boardId: string, id: string) {
  return db
    .delete(links)
    .where(and(eq(links.id, id), eq(links.boardId, boardId)))
    .returning()
}
