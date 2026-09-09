import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SEARCH_LIMIT,
  matchesQuery,
  searchBlocks,
  type SearchableBlock,
} from './search'

const item = (
  blockId: string,
  title: string,
  terms: string[],
  caption = '—',
): SearchableBlock => ({ blockId, title, caption, terms })

const sample: SearchableBlock[] = [
  item('p1', 'Person: Ada Lovelace', ['person', 'ada', 'lovelace', 'mathematician']),
  item('p2', 'Person: Grace Hopper', ['person', 'grace', 'hopper', 'admiral']),
  item('t1', 'Infinite canvas notes', ['text', 'markdown of the canvas engine']),
  item('f1', 'meeting-notes.pdf', ['file', 'meeting-notes']),
  item('g1', 'Team Archive', ['file-group', 'team']),
  item('o1', 'Project: Titan', ['project', 'titan', '2026-09-01', '120']),
]

describe('matchesQuery', () => {
  it('requires every whitespace-separated word to match', () => {
    expect(matchesQuery('grace hopper', sample[1])).toBe(true)
    expect(matchesQuery('hopper grace', sample[1])).toBe(true)
    expect(matchesQuery('grace kaboom', sample[1])).toBe(false)
  })

  it('matches inside captions', () => {
    expect(matchesQuery('—', sample[0])).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(matchesQuery('ADA', sample[0])).toBe(true)
  })

  it('matches non-string term values (numbers, dates)', () => {
    expect(matchesQuery('120', sample[5])).toBe(true)
    expect(matchesQuery('2026-09', sample[5])).toBe(true)
  })

  it('returns false for empty or whitespace queries', () => {
    expect(matchesQuery('', sample[0])).toBe(false)
    expect(matchesQuery('   ', sample[0])).toBe(false)
  })
})

describe('searchBlocks', () => {
  it('returns nothing for an empty query', () => {
    expect(searchBlocks('', sample)).toEqual([])
  })

  it('finds substring matches in titles and terms', () => {
    const ids = searchBlocks('grace', sample).map((r) => r.blockId)
    expect(ids).toEqual(['p2'])
  })

  it('ranks title prefix above term prefix above substring', () => {
    const all: SearchableBlock[] = [
      item('sub', 'Meeting Room', ['room']),
      item('both', 'Room: R2', ['room']),
    ]
    const [first] = searchBlocks('room', all)
    expect(first.blockId).toBe('both')
  })

  it('ranks term prefix above substring-only matches', () => {
    const all: SearchableBlock[] = [
      item('sub', 'The Lab', ['laboratory']),
      item('pre', 'Notes', ['lab']),
    ]
    const [first] = searchBlocks('lab', all)
    expect(first.blockId).toBe('pre')
  })

  it('matches every word of a multi-word query', () => {
    const ids = searchBlocks('person hopper', sample).map((r) => r.blockId)
    expect(ids).toEqual(['p2'])
  })

  it('sorts ties alphabetically and honors the limit', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      item(`b${i}`, i % 2 === 0 ? 'Alpha Block' : 'Beta Block', ['block']),
    )
    const limited = searchBlocks('block', many, 5)
    expect(limited).toHaveLength(5)
    expect(limited[0].title).toBe('Alpha Block')
  })

  it('honors the default limit', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      item(`b${i}`, `Block ${i}`, ['block']),
    )
    expect(searchBlocks('block', many)).toHaveLength(DEFAULT_SEARCH_LIMIT)
  })

  it('flags whether the title itself matched for highlighting', () => {
    const results = searchBlocks('titan', sample)
    expect(results[0].matchTitle).toBe(true)
  })
})