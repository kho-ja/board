import { describe, expect, it } from 'vitest'

import {
  APPROVAL_TTL_MS,
  approvalSeenKey,
  pruneApprovals,
  trackApproval,
} from './approval-expiry'

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  }
}

const THREAD = 'thread-1'
const INTERRUPT = 'approval_call_42'

describe('approval expiry', () => {
  it('stamps an unseen approval with now and does not expire it', () => {
    const storage = makeStorage()
    const result = trackApproval(THREAD, INTERRUPT, {
      now: 1_000_000,
      storage,
    })
    expect(result).toEqual({ firstSeen: 1_000_000, expired: false })
    expect(storage.raw.get(approvalSeenKey(THREAD))).toBe(
      JSON.stringify({ [INTERRUPT]: 1_000_000 }),
    )
  })

  it('keeps the original first-seen time across repeated observations', () => {
    const storage = makeStorage()
    trackApproval(THREAD, INTERRUPT, { now: 1_000_000, storage })
    const later = trackApproval(THREAD, INTERRUPT, {
      now: 1_000_000 + 60_000,
      storage,
    })
    expect(later.firstSeen).toBe(1_000_000)
    expect(later.expired).toBe(false)
  })

  it('expires only once the TTL has elapsed', () => {
    const storage = makeStorage()
    trackApproval(THREAD, INTERRUPT, { now: 1_000_000, storage })

    const justUnder = trackApproval(THREAD, INTERRUPT, {
      now: 1_000_000 + APPROVAL_TTL_MS - 1,
      storage,
    })
    expect(justUnder.expired).toBe(false)

    const atTtl = trackApproval(THREAD, INTERRUPT, {
      now: 1_000_000 + APPROVAL_TTL_MS,
      storage,
    })
    expect(atTtl.expired).toBe(true)
  })

  it('honours a custom TTL', () => {
    const storage = makeStorage()
    trackApproval(THREAD, INTERRUPT, { now: 5_000, ttl: 1_000, storage })
    const result = trackApproval(THREAD, INTERRUPT, {
      now: 6_000,
      ttl: 1_000,
      storage,
    })
    expect(result.expired).toBe(true)
  })

  it('keeps approvals of different threads and interrupts apart', () => {
    const storage = makeStorage()
    trackApproval(THREAD, INTERRUPT, { now: 1_000, storage })
    const other = trackApproval('thread-2', INTERRUPT, {
      now: 1_000,
      storage,
    })
    const sameThreadOther = trackApproval(THREAD, 'approval_call_43', {
      now: 2_000,
      storage,
    })
    expect(other.firstSeen).toBe(1_000)
    expect(sameThreadOther.firstSeen).toBe(2_000)
    expect(sameThreadOther.expired).toBe(false)
  })

  it('treats a corrupt or non-numeric stored map as empty', () => {
    const storage = makeStorage()
    storage.setItem(approvalSeenKey(THREAD), 'not json')
    const fromGarbage = trackApproval(THREAD, INTERRUPT, {
      now: 7_000,
      storage,
    })
    expect(fromGarbage).toEqual({ firstSeen: 7_000, expired: false })

    storage.setItem(approvalSeenKey(THREAD), JSON.stringify({ [INTERRUPT]: 'nope' }))
    const fromBadValue = trackApproval(THREAD, INTERRUPT, {
      now: 8_000,
      storage,
    })
    expect(fromBadValue).toEqual({ firstSeen: 8_000, expired: false })
  })

  it('prunes first-seen times for approvals that are no longer live', () => {
    const storage = makeStorage()
    trackApproval(THREAD, INTERRUPT, { now: 1_000, storage })
    trackApproval(THREAD, 'approval_gone', { now: 2_000, storage })

    pruneApprovals(THREAD, [INTERRUPT], { storage })

    expect(storage.raw.get(approvalSeenKey(THREAD))).toBe(
      JSON.stringify({ [INTERRUPT]: 1_000 }),
    )
    // the live approval keeps its original clock
    const again = trackApproval(THREAD, INTERRUPT, { now: 3_000, storage })
    expect(again.firstSeen).toBe(1_000)
  })

  it('pruning against an unknown id leaves an empty map, not a crash', () => {
    const storage = makeStorage()
    trackApproval(THREAD, INTERRUPT, { now: 1_000, storage })
    pruneApprovals(THREAD, ['brand-new'], { storage })
    expect(storage.raw.get(approvalSeenKey(THREAD))).toBe('{}')
    const fresh = trackApproval(THREAD, 'brand-new', { now: 4_000, storage })
    expect(fresh.expired).toBe(false)
  })
})
