import { CHAT_PREFIX } from './history'

/**
 * Time-based expiry for pending Ask tool approvals.
 *
 * An approval interrupt is persisted with its thread, so a card can outlive the
 * run it belongs to: the user pauses for a mutation, closes the laptop, and
 * comes back days later to a button that looks live. The run-error path in
 * `AskPanel` already cancels approvals whose run has failed, but a run that
 * never errors (or a session that never comes back) leaves the card standing
 * indefinitely. This module gives every approval a wall-clock lifetime.
 *
 * First-seen times are stored per thread as one `interruptId -> epoch` map
 * under `khoja.chat.approval.<threadId>` — the same localStorage the chat
 * persistence already uses, best-effort like the rest of it. Keying on the
 * interrupt id is safe because ids derive from the tool-call id, which is part
 * of the persisted message, so a reload sees the same id.
 *
 * TTL choice: 24h. An approval is a question about a board mutation; a day
 * later the board has likely moved on and the args deserve a fresh run rather
 * than a stale yes. `trackApproval` reports `expired` and `AskPanel` cancels.
 */

/** How long a pending approval may sit before it is cancelled on sight. */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000

/** Per-thread storage key holding the interruptId -> first-seen map. */
export function approvalSeenKey(threadId: string): string {
  return `${CHAT_PREFIX}approval.${threadId}`
}

/** The `localStorage` surface these functions need (injectable for tests). */
export interface ApprovalSeenStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): ApprovalSeenStorage {
  return localStorage
}

function readMap(
  threadId: string,
  storage: ApprovalSeenStorage,
): Record<string, number> {
  try {
    const raw = storage.getItem(approvalSeenKey(threadId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, number> = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) map[id] = value
    }
    return map
  } catch {
    return {}
  }
}

function writeMap(
  threadId: string,
  map: Record<string, number>,
  storage: ApprovalSeenStorage,
): void {
  try {
    storage.setItem(approvalSeenKey(threadId), JSON.stringify(map))
  } catch {
    // best-effort, mirroring the chat persistence layer
  }
}

export interface ApprovalTrackOptions {
  now?: number
  ttl?: number
  storage?: ApprovalSeenStorage
}

export interface ApprovalTrackResult {
  /** When this interrupt was first observed as pending (epoch ms). */
  firstSeen: number
  /** True once `now - firstSeen` has reached the TTL. */
  expired: boolean
}

/**
 * Record (or look up) the first-seen time of a pending approval and report
 * whether it has outlived the TTL. An unseen approval is stamped with `now`
 * and is never expired on its first observation — the clock starts when we
 * first see the card, so a fresh pause always gets the full TTL.
 */
export function trackApproval(
  threadId: string,
  interruptId: string,
  options: ApprovalTrackOptions = {},
): ApprovalTrackResult {
  const storage = options.storage ?? defaultStorage()
  const now = options.now ?? Date.now()
  const ttl = options.ttl ?? APPROVAL_TTL_MS

  const map = readMap(threadId, storage)
  const known = map[interruptId]
  if (typeof known === 'number') {
    return { firstSeen: known, expired: now - known >= ttl }
  }
  map[interruptId] = now
  writeMap(threadId, map, storage)
  return { firstSeen: now, expired: false }
}

/**
 * Drop stored first-seen times for approvals that are no longer pending, so
 * the per-thread map only ever describes the live set. Callers pass the live
 * interrupt ids; anything else in the map was answered, cancelled, or expired.
 * Called only while at least one approval is visible — an empty live set is
 * indistinguishable from "not hydrated yet" and must not wipe the map.
 */
export function pruneApprovals(
  threadId: string,
  liveIds: Iterable<string>,
  options: { storage?: ApprovalSeenStorage } = {},
): void {
  const storage = options.storage ?? defaultStorage()
  const map = readMap(threadId, storage)
  const live = new Set(liveIds)
  const next: Record<string, number> = {}
  let changed = false
  for (const id of live) {
    if (typeof map[id] === 'number') next[id] = map[id]
    else changed = true
  }
  if (Object.keys(map).length !== Object.keys(next).length) changed = true
  if (changed) writeMap(threadId, next, storage)
}
