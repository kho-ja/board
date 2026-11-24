import { createServerFn } from '@tanstack/react-start'

import type {
  ApiKeyContent,
  BlockContent,
  BlockRow,
  LinkContent,
  LinkRow,
  MembershipContent,
  MembershipRow,
  PlacementContent,
  PlacementRow,
  TypeContent,
  TypeRow,
  ViewContent,
  ViewRow,
} from './queries.server'

import { encryptApiKey } from '#/lib/ai/encryption'
import { requireBoardRead, requireBoardWrite, requireUser } from '#/lib/auth/guards.server'

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

/*
 * Every board-scoped server function re-checks the caller's membership of the
 * board it is about to touch. The board id comes from the client, so it is
 * treated as untrusted input: `requireBoardRead` / `requireBoardWrite` are what
 * actually decide whether a request may proceed.
 */

// ---------- Blocks ----------

export const listBlocksFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listBlocks(data.boardId)
  })

export const insertBlockFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; block: BlockContent }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await insertBlock(data.boardId, data.block)
  })

export const updateBlockFn = createServerFn({ method: 'POST' })
  .validator(
    (input: { boardId: string; id: string; changes: Partial<BlockRow> }) =>
      input,
  )
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await updateBlock(data.boardId, data.id, data.changes)
  })

export const deleteBlockFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; id: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await deleteBlock(data.boardId, data.id)
  })

// ---------- Placements ----------

export const listPlacementsFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listPlacements(data.boardId)
  })

export const insertPlacementFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; placement: PlacementContent }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await insertPlacement(data.boardId, data.placement)
  })

export const updatePlacementFn = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      boardId: string
      id: string
      changes: Partial<PlacementRow>
    }) => input,
  )
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await updatePlacement(data.boardId, data.id, data.changes)
  })

export const deletePlacementFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; id: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await deletePlacement(data.boardId, data.id)
  })

// ---------- Memberships ----------

export const listMembershipsFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listMemberships(data.boardId)
  })

export const insertMembershipFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; membership: MembershipContent }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await insertMembership(data.boardId, data.membership)
  })

export const updateMembershipFn = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      boardId: string
      id: string
      changes: Partial<MembershipRow>
    }) => input,
  )
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await updateMembership(data.boardId, data.id, data.changes)
  })

export const deleteMembershipFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; id: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await deleteMembership(data.boardId, data.id)
  })

// ---------- Types ----------

export const listTypesFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listTypes(data.boardId)
  })

export const insertTypeFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; type: TypeContent }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await insertType(data.boardId, data.type)
  })

export const updateTypeFn = createServerFn({ method: 'POST' })
  .validator(
    (input: { boardId: string; id: string; changes: Partial<TypeRow> }) =>
      input,
  )
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await updateType(data.boardId, data.id, data.changes)
  })

export const deleteTypeFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; id: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await deleteType(data.boardId, data.id)
  })

// ---------- Views ----------

export const listViewsFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listViews(data.boardId)
  })

export const insertViewFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; view: ViewContent }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await insertView(data.boardId, data.view)
  })

export const updateViewFn = createServerFn({ method: 'POST' })
  .validator(
    (input: { boardId: string; id: string; changes: Partial<ViewRow> }) =>
      input,
  )
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await updateView(data.boardId, data.id, data.changes)
  })

export const deleteViewFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; id: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await deleteView(data.boardId, data.id)
  })

// ---------- Links ----------

export const listLinksFn = createServerFn({ method: 'GET' })
  .validator((input: { boardId: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardRead(data.boardId)
    return await listLinks(data.boardId)
  })

export const insertLinkFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; link: LinkContent }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await insertLink(data.boardId, data.link)
  })

export const updateLinkFn = createServerFn({ method: 'POST' })
  .validator(
    (input: { boardId: string; id: string; changes: Partial<LinkRow> }) =>
      input,
  )
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await updateLink(data.boardId, data.id, data.changes)
  })

export const deleteLinkFn = createServerFn({ method: 'POST' })
  .validator((input: { boardId: string; id: string }) => input)
  .handler(async ({ data }) => {
    await requireBoardWrite(data.boardId)
    return await deleteLink(data.boardId, data.id)
  })

// ---------- API Keys ----------

// Note: listApiKeys/getApiKey (db helpers) are intentionally NOT exposed to the
// client as server fns — they return secret material. The Ask panel only ever
// upserts (encrypting first) and deletes keys.
//
// API keys belong to the signed-in user, not to the board: with several people
// sharing this instance, one user's key must not silently pay for another
// user's board.

export const upsertApiKeyFn = createServerFn({ method: 'POST' })
  .validator((input: ApiKeyContent) => input)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const ciphertext = await encryptApiKey(data.encryptedKey)
    return await upsertApiKey({
      ...data,
      id: crypto.randomUUID(),
      userId: user.id,
      encryptedKey: ciphertext,
    })
  })

export const deleteApiKeyFn = createServerFn({ method: 'POST' })
  .validator((input: { provider: string }) => input)
  .handler(async ({ data }) => {
    const user = await requireUser()
    return await deleteApiKey(user.id, data.provider)
  })
