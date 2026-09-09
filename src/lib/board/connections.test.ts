import { describe, expect, it } from 'vitest'

import {
  CONNECTION_TYPES,
  DEFAULT_CONNECTION_TYPE,
  connectionExists,
  resolveType,
  semanticKey,
  type DirectedEdge,
} from './connections'

const link = (a: string, b: string, type?: string) => ({
  id: `${a}:${b}:${type ?? ''}`,
  blockAId: a,
  blockBId: b,
  type: type as never,
})

describe('semanticKey', () => {
  it('keeps the drawn orientation for a directed edge', () => {
    const edge: DirectedEdge = { a: 'feat', b: 'api', type: 'depends-on' }
    expect(semanticKey(edge)).toBe('feat->api:depends-on')
  })

  it('normalizes the symmetric edge so both draw directions are identical', () => {
    const ab: DirectedEdge = { a: 'b2', b: 'b1', type: 'related-to' }
    const ba: DirectedEdge = { a: 'b1', b: 'b2', type: 'related-to' }
    expect(semanticKey(ab)).toBe(semanticKey(ba))
  })

  it('treats the reversed directed edge as a different connection', () => {
    const ab = semanticKey({ a: 'a1', b: 'b1', type: 'part-of' })
    const ba = semanticKey({ a: 'b1', b: 'a1', type: 'part-of' })
    expect(ab).not.toBe(ba)
  })

  it('allows multiple types between the same pair', () => {
    const dep = semanticKey({ a: 'x', b: 'y', type: 'depends-on' })
    const part = semanticKey({ a: 'x', b: 'y', type: 'part-of' })
    expect(dep).not.toBe(part)
  })
})

describe('connectionExists', () => {
  const links = [
    link('a', 'b', 'related-to'),
    link('c', 'd', 'depends-on'),
  ]

  it('finds a duplicate symmetric edge either orientation', () => {
    expect(connectionExists(links, 'b', 'a')).toBe(true)
    expect(connectionExists(links, 'a', 'b')).toBe(true)
  })

  it('finds a duplicate directed edge only in the same orientation', () => {
    expect(connectionExists(links, 'c', 'd', 'depends-on')).toBe(true)
    expect(connectionExists(links, 'd', 'c', 'depends-on')).toBe(false)
  })

  it('does not collide across types', () => {
    expect(connectionExists(links, 'a', 'b', 'part-of')).toBe(false)
  })
})

describe('resolveType', () => {
  it('falls back to related-to for legacy links', () => {
    expect(resolveType({})).toBe(DEFAULT_CONNECTION_TYPE)
    expect(resolveType({ type: 'depends-on' })).toBe('depends-on')
  })
})

describe('the typed enum stays small', () => {
  it('is exactly the four agreed types in order', () => {
    expect(CONNECTION_TYPES).toEqual([
      'depends-on',
      'responsible-for',
      'part-of',
      'related-to',
    ])
  })
})