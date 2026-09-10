import { describe, expect, it } from 'vitest'

import type { BlockData, FieldValue } from '#/types'

import {
  TEXT_BODY_CHARS,
  blockBodyFromData,
  blockTitleFromData,
  objectFieldsFromData,
  serializeBoardForAi,
  typeByName,
} from './board'
import type { AiBlockInput } from './board'

const textBlock = (id: string, markdown: string): AiBlockInput => ({
  id,
  kind: 'text',
  data: { kind: 'text', markdown } as BlockData,
})

const groupBlock = (id: string, name: string): AiBlockInput => ({
  id,
  kind: 'file-group',
  data: { kind: 'file-group', name } as BlockData,
})

const fileBlock = (id: string, name: string): AiBlockInput => ({
  id,
  kind: 'file',
  data: { kind: 'file', name, size: 0, mimeType: 'text/plain' } as BlockData,
})

const objectBlock = (
  id: string,
  schemaId: string,
  values: Record<string, FieldValue>,
): AiBlockInput => ({
  id,
  kind: 'note',
  data: {
    kind: 'note',
    schemaId,
    values,
    title: '',
    body: '',
  } as BlockData,
})

const objectType = (id: string, name: string) => ({
  id,
  name,
  fields: [
    { id: 'f-assignee', name: 'Assignee', fieldType: 'text' as const },
    { id: 'f-priority', name: 'Priority', fieldType: 'number' as const },
  ],
})

describe('blockTitleFromData', () => {
  it('uses the first meaningful line of a text block', () => {
    expect(blockTitleFromData('text', textBlock('a', 'Queue\n\nnotes').data, [])).toBe(
      'Queue',
    )
  })

  it('falls back to "Untitled" for blank text', () => {
    expect(blockTitleFromData('text', textBlock('a', '  \n\n').data, [])).toBe(
      'Untitled',
    )
  })

  it('uses the group name', () => {
    expect(
      blockTitleFromData('file-group', groupBlock('g', 'Archive').data, []),
    ).toBe('Archive')
  })

  it('uses the file name', () => {
    expect(blockTitleFromData('file', fileBlock('f', 'report.pdf').data, [])).toBe(
      'report.pdf',
    )
  })

  it('prefers the first non-empty value for a typed object', () => {
    const data = objectBlock('o', 'task', { Assignee: null, Priority: 3 }).data
    expect(blockTitleFromData('note', data, [objectType('task', 'Task')])).toBe(
      'Task: 3',
    )
  })

  it('falls back to the type name when all values are empty', () => {
    const data = objectBlock('o', 'task', { Assignee: '', Priority: null }).data
    expect(blockTitleFromData('note', data, [objectType('task', 'Task')])).toBe(
      'Task',
    )
  })
})

describe('blockBodyFromData', () => {
  it('returns the markdown for text blocks', () => {
    expect(blockBodyFromData(textBlock('a', 'body').data)).toBe('body')
  })

  it('returns nothing for non-text blocks', () => {
    expect(blockBodyFromData(groupBlock('g', 'x').data)).toBe('')
  })

  it('truncates very long bodies', () => {
    const long = 'x'.repeat(TEXT_BODY_CHARS + 500)
    const body = blockBodyFromData(textBlock('a', long).data)
    expect(body.length).toBe(TEXT_BODY_CHARS)
  })
})

describe('objectFieldsFromData', () => {
  it('pulls values out of a typed object block', () => {
    const data = objectBlock('o', 'task', { Assignee: 'pm', Priority: 1 }).data
    expect(objectFieldsFromData(data)).toEqual({ Assignee: 'pm', Priority: 1 })
  })

  it('returns an empty map for text/file blocks', () => {
    expect(objectFieldsFromData(textBlock('a', 'x').data)).toEqual({})
  })
})

describe('typeByName', () => {
  it('matches case-insensitively', () => {
    const types = [objectType('task', 'Task')]
    expect(typeByName(types, 'task')?.id).toBe('task')
    expect(typeByName(types, '  TASK ')?.id).toBe('task')
  })

  it('returns undefined when missing', () => {
    expect(typeByName([], 'nope')).toBeUndefined()
  })
})

describe('serializeBoardForAi', () => {
  const base = {
    blocks: [
      textBlock('t1', '# Homepage'),
      groupBlock('g1', 'Docs'),
      objectBlock('o1', 'task', { Assignee: 'pm', Priority: 2 }),
      textBlock('t2', '# Unplaced note'),
    ],
    placements: [
      { blockId: 't1', positionX: 0, positionY: 0 },
      { blockId: 'g1', positionX: 40, positionY: 40 },
    ],
    links: [
      { id: 'l1', blockAId: 't1', blockBId: 'g1', type: 'part-of' as const },
      { id: 'l2', blockAId: 'o1', blockBId: 'g1', type: null, label: '' },
    ],
    memberships: [{ id: 'm1', groupId: 'g1', memberId: 't1' }],
    types: [objectType('task', 'Task')],
  }

  it('flags placed, grouped and group blocks', () => {
    const snapshot = serializeBoardForAi(base)
    const byId = new Map(snapshot.blocks.map((b) => [b.id, b]))
    expect(byId.get('t1')?.flags).toEqual(['placed', 'in-group'])
    expect(byId.get('g1')?.flags).toEqual(['placed', 'group'])
    expect(byId.get('t2')?.flags).toEqual([])
  })

  it('carries titles, bodies and object fields', () => {
    const snapshot = serializeBoardForAi(base)
    const byId = new Map(snapshot.blocks.map((b) => [b.id, b]))
    expect(byId.get('t1')?.title).toBe('# Homepage')
    expect(byId.get('t1')?.body).toBe('# Homepage')
    expect(byId.get('o1')?.title).toBe('Task: pm')
    expect(byId.get('o1')?.fields).toEqual({ Assignee: 'pm', Priority: 2 })
  })

  it('projects types with a stable field shape', () => {
    const snapshot = serializeBoardForAi(base)
    expect(snapshot.types).toEqual([
      { id: 'task', name: 'Task', fields: [{ name: 'Assignee', fieldType: 'text' }, { name: 'Priority', fieldType: 'number' }] },
    ])
  })

  it('normalizes connection metadata', () => {
    const snapshot = serializeBoardForAi(base)
    expect(snapshot.connections).toEqual([
      { id: 'l1', from: 't1', to: 'g1', type: 'part-of', label: null },
      { id: 'l2', from: 'o1', to: 'g1', type: 'related-to', label: null },
    ])
  })

  it('carries memberships through', () => {
    const snapshot = serializeBoardForAi(base)
    expect(snapshot.memberships).toEqual([{ groupId: 'g1', memberId: 't1' }])
  })

  it('produces JSON-safe plain data', () => {
    const snapshot = serializeBoardForAi(base)
    expect(() => JSON.stringify(snapshot)).not.toThrow()
  })
})