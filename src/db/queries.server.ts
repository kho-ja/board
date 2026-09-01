import { asc, desc, eq } from 'drizzle-orm'

import { db } from '#/db/index'
import { blocks, memberships, placements, types, views } from '#/db/schema'

export type BlockRow = typeof blocks.$inferSelect
export type BlockInsert = typeof blocks.$inferInsert

export type PlacementRow = typeof placements.$inferSelect
export type PlacementInsert = typeof placements.$inferInsert

export type MembershipRow = typeof memberships.$inferSelect
export type MembershipInsert = typeof memberships.$inferInsert

export type TypeRow = typeof types.$inferSelect
export type TypeInsert = typeof types.$inferInsert

export type ViewRow = typeof views.$inferSelect
export type ViewInsert = typeof views.$inferInsert

// ---------- Blocks ----------

export async function listBlocks() {
  return db.query.blocks.findMany({
    orderBy: [desc(blocks.createdAt)],
  })
}

export async function insertBlock(values: BlockInsert) {
  return db.insert(blocks).values(values).onConflictDoNothing().returning()
}

export async function updateBlock(id: string, changes: Partial<BlockRow>) {
  const { id: _ignored, ...rest } = changes
  return db.update(blocks).set(rest).where(eq(blocks.id, id)).returning()
}

export async function deleteBlock(id: string) {
  return db.delete(blocks).where(eq(blocks.id, id)).returning()
}

// ---------- Placements ----------

export async function listPlacements() {
  return db.query.placements.findMany()
}

export async function insertPlacement(values: PlacementInsert) {
  return db.insert(placements).values(values).onConflictDoNothing().returning()
}

export async function updatePlacement(blockId: string, changes: Partial<PlacementRow>) {
  const { blockId: _ignored, ...rest } = changes
  return db.update(placements).set(rest).where(eq(placements.blockId, blockId)).returning()
}

export async function deletePlacement(blockId: string) {
  return db.delete(placements).where(eq(placements.blockId, blockId)).returning()
}

// ---------- Memberships ----------

export async function listMemberships() {
  return db.query.memberships.findMany()
}

export async function insertMembership(values: MembershipInsert) {
  return db.insert(memberships).values(values).onConflictDoNothing().returning()
}

export async function updateMembership(id: string, changes: Partial<MembershipRow>) {
  const { id: _ignored, ...rest } = changes
  return db.update(memberships).set(rest).where(eq(memberships.id, id)).returning()
}

export async function deleteMembership(id: string) {
  return db.delete(memberships).where(eq(memberships.id, id)).returning()
}

// ---------- Types ----------

export async function listTypes() {
  return db.query.types.findMany({
    orderBy: [asc(types.name)],
  })
}

export async function insertType(values: TypeInsert) {
  return db.insert(types).values(values).onConflictDoNothing().returning()
}

export async function updateType(id: string, changes: Partial<TypeRow>) {
  const { id: _ignored, ...rest } = changes
  return db.update(types).set(rest).where(eq(types.id, id)).returning()
}

export async function deleteType(id: string) {
  return db.delete(types).where(eq(types.id, id)).returning()
}

// ---------- Views ----------

export async function listViews() {
  return db.query.views.findMany({
    orderBy: [asc(views.name)],
  })
}

export async function insertView(values: ViewInsert) {
  return db.insert(views).values(values).onConflictDoNothing().returning()
}

export async function updateView(id: string, changes: Partial<ViewRow>) {
  const { id: _ignored, ...rest } = changes
  return db.update(views).set(rest).where(eq(views.id, id)).returning()
}

export async function deleteView(id: string) {
  return db.delete(views).where(eq(views.id, id)).returning()
}