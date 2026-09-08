import { describe, expect, it } from 'vitest'

import { blockTitle } from '#/components/canvas/BlockRenderer'
import type { ObservableBlock } from '#/components/canvas/BlockShell'
import type { SchemaDef } from '#/types'
import { BlockSchema, TypeSchema } from '#/types/schemas'

describe('Custom Object Type Schema & Block Renderer', () => {
  const sampleSchema: SchemaDef = {
    id: 'user-task-type',
    name: 'Task',
    fields: [
      { id: 'f-title', name: 'Title', fieldType: 'text' },
      { id: 'f-priority', name: 'Priority', fieldType: 'number' },
      { id: 'f-done', name: 'Done', fieldType: 'boolean' },
    ],
    defaultView: 'card',
  }

  it('validates schema definition via TypeSchema', () => {
    const parsed = TypeSchema.parse(sampleSchema)
    expect(parsed.name).toBe('Task')
    expect(parsed.fields).toHaveLength(3)
  })

  it('validates custom object block data with BlockSchema', () => {
    const blockData = {
      id: 'block-123',
      kind: 'user-task-type',
      data: {
        kind: 'user-task-type',
        schemaId: 'user-task-type',
        values: {
          'f-title': 'Ship milestone 7',
          'f-priority': 1,
          'f-done': true,
          'legacy-removed-field': 'preserved value',
        },
      },
      schemaVersion: '1',
    }

    const validated = BlockSchema.parse(blockData)
    expect(validated.kind).toBe('user-task-type')
    expect((validated.data as any).values['legacy-removed-field']).toBe('preserved value')
  })

  it('resolves blockTitle using title field if present', () => {
    const block: ObservableBlock = {
      id: 'block-1',
      kind: 'user-task-type',
      data: {
        kind: 'user-task-type',
        schemaId: 'user-task-type',
        values: {
          'f-title': 'Review PR',
        },
      },
      schemaVersion: '1',
    }

    expect(blockTitle(block, [sampleSchema])).toBe('Task: Review PR')
  })

  it('resolves blockTitle with fallback when no title value is set', () => {
    const block: ObservableBlock = {
      id: 'block-2',
      kind: 'user-task-type',
      data: {
        kind: 'user-task-type',
        schemaId: 'user-task-type',
        values: {},
      },
      schemaVersion: '1',
    }

    expect(blockTitle(block, [sampleSchema])).toBe('New Task')
  })
})
