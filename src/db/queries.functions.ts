import { createServerFn } from '@tanstack/react-start'

import type {
  ApiKeyInsert,
  BlockInsert,
  BlockRow,
  LinkInsert,
  LinkRow,
  MembershipInsert,
  MembershipRow,
  PlacementInsert,
  PlacementRow,
  TypeInsert,
  TypeRow,
  ViewInsert,
  ViewRow,
} from './queries.server'

import { encryptApiKey } from '#/lib/ai/encryption'

import {
  deleteApiKey,
  deleteBlock,
  deleteLink,
  deleteMembership,
  deletePlacement,
  deleteType,
  deleteView,
  insertBlock,
  insertLink,
  insertMembership,
  insertPlacement,
  insertType,
  insertView,
  listBlocks,
  listLinks,
  listMemberships,
  listPlacements,
  listTypes,
  listViews,
  updateBlock,
  updateLink,
  updateMembership,
  updatePlacement,
  updateType,
  updateView,
  upsertApiKey,
} from './queries.server'

// ---------- Blocks ----------

export const listBlocksFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await listBlocks()
})

export const insertBlockFn = createServerFn({ method: 'POST' })
  .validator((input: BlockInsert) => input)
  .handler(async ({ data }) => {
    return await insertBlock(data)
  })

export const updateBlockFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; changes: Partial<BlockRow> }) => input)
  .handler(async ({ data }) => {
    return await updateBlock(data.id, data.changes)
  })

export const deleteBlockFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return await deleteBlock(data.id)
  })

// ---------- Placements ----------

export const listPlacementsFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await listPlacements()
})

export const insertPlacementFn = createServerFn({ method: 'POST' })
  .validator((input: PlacementInsert) => input)
  .handler(async ({ data }) => {
    return await insertPlacement(data)
  })

export const updatePlacementFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; changes: Partial<PlacementRow> }) => input)
  .handler(async ({ data }) => {
    return await updatePlacement(data.id, data.changes)
  })

export const deletePlacementFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return await deletePlacement(data.id)
  })

// ---------- Memberships ----------

export const listMembershipsFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await listMemberships()
})

export const insertMembershipFn = createServerFn({ method: 'POST' })
  .validator((input: MembershipInsert) => input)
  .handler(async ({ data }) => {
    return await insertMembership(data)
  })

export const updateMembershipFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; changes: Partial<MembershipRow> }) => input)
  .handler(async ({ data }) => {
    return await updateMembership(data.id, data.changes)
  })

export const deleteMembershipFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return await deleteMembership(data.id)
  })

// ---------- Types ----------

export const listTypesFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await listTypes()
})

export const insertTypeFn = createServerFn({ method: 'POST' })
  .validator((input: TypeInsert) => input)
  .handler(async ({ data }) => {
    return await insertType(data)
  })

export const updateTypeFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; changes: Partial<TypeRow> }) => input)
  .handler(async ({ data }) => {
    return await updateType(data.id, data.changes)
  })

export const deleteTypeFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return await deleteType(data.id)
  })

// ---------- Views ----------

export const listViewsFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await listViews()
})

export const insertViewFn = createServerFn({ method: 'POST' })
  .validator((input: ViewInsert) => input)
  .handler(async ({ data }) => {
    return await insertView(data)
  })

export const updateViewFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; changes: Partial<ViewRow> }) => input)
  .handler(async ({ data }) => {
    return await updateView(data.id, data.changes)
  })

export const deleteViewFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return await deleteView(data.id)
  })
// ---------- Links ----------

export const listLinksFn = createServerFn({ method: 'GET' }).handler(async () => {
  return await listLinks()
})

export const insertLinkFn = createServerFn({ method: 'POST' })
  .validator((input: LinkInsert) => input)
  .handler(async ({ data }) => {
    return await insertLink(data)
  })

export const updateLinkFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string; changes: Partial<LinkRow> }) => input)
  .handler(async ({ data }) => {
    return await updateLink(data.id, data.changes)
  })

export const deleteLinkFn = createServerFn({ method: 'POST' })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    return await deleteLink(data.id)
  })

// ---------- API Keys ----------

// Note: listApiKeys/getApiKey (db helpers) are intentionally NOT exposed to the
// client as server fns — they return secret material. The Ask panel only ever
// upserts (encrypting first) and deletes keys.

export const upsertApiKeyFn = createServerFn({ method: 'POST' })
  .validator((input: ApiKeyInsert) => input)
  .handler(async ({ data }) => {
    const ciphertext = await encryptApiKey(data.encryptedKey)
    return await upsertApiKey({ ...data, encryptedKey: ciphertext })
  })

export const deleteApiKeyFn = createServerFn({ method: 'POST' })
  .validator((input: { provider: string }) => input)
  .handler(async ({ data }) => {
    return await deleteApiKey(data.provider)
  })
