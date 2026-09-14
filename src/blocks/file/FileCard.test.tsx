import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { FileCard } from './FileCard'
import {
  FILE_VIEWS,
  resolveView,
  viewsForKind,
} from '#/lib/blocks/views'
import { BlockSchema } from '#/types/schemas'
import type { FileBlockData } from '#/types'

afterEach(cleanup)

function fileData(overrides: Partial<FileBlockData> = {}): FileBlockData {
  return {
    kind: 'file',
    name: 'plan.md',
    size: 512,
    mimeType: 'text/markdown',
    content: '# Plan\n\n- step one\n- step two',
    ...overrides,
  }
}

describe('FileCard views (M17)', () => {
  it('renders the card view by default: name, meta, and preview', () => {
    render(<FileCard data={fileData()} />)
    expect(screen.getByText('plan.md')).toBeTruthy()
    expect(screen.getByText(/512 B · text\/markdown/)).toBeTruthy()
    expect(screen.getByText(/# Plan/)).toBeTruthy()
  })

  it('renders the content view as media-only, without the meta header', () => {
    render(<FileCard data={fileData({ view: 'content' })} />)
    expect(screen.getByText(/# Plan/)).toBeTruthy()
    expect(screen.queryByText(/512 B · text\/markdown/)).toBeNull()
    expect(screen.queryByText('plan.md')).toBeNull()
    const card = screen.getByText(/# Plan/).closest('.file-card')
    expect(card?.className).toContain('is-view-content')
  })

  it('renders an SVG file in content view as a data-URI image', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'
    render(
      <FileCard
        data={fileData({
          name: 'badge.svg',
          mimeType: 'image/svg+xml',
          content: svg,
          view: 'content',
        })}
      />,
    )
    const img = screen.getByAltText('badge.svg') as HTMLImageElement
    expect(img.src.startsWith('data:image/svg+xml,')).toBe(true)
  })

  it('renders a metadata-only file in content view as an emblem placeholder', () => {
    render(<FileCard data={fileData({ content: undefined, view: 'content' })} />)
    expect(screen.getByText('plan.md')).toBeTruthy()
    const card = screen.getByText('plan.md').closest('.file-card')
    expect(card?.querySelector('.file-card-content-empty')).toBeTruthy()
  })

  it('renders the meta view as a compact chip without any preview', () => {
    render(<FileCard data={fileData({ view: 'meta' })} />)
    expect(screen.getByText('plan.md')).toBeTruthy()
    expect(screen.getByText(/512 B · text\/markdown/)).toBeTruthy()
    expect(screen.queryByText(/# Plan/)).toBeNull()
    const card = screen.getByText('plan.md').closest('.file-card')
    expect(card?.className).toContain('is-view-meta')
  })
})

describe('views registry (M17)', () => {
  it('registers card/content/meta for files only in v1', () => {
    expect(viewsForKind('file').length).toBe(3)
    expect(viewsForKind('file')).toBe(FILE_VIEWS)
    expect(viewsForKind('text')).toEqual([])
    expect(viewsForKind('file-group')).toEqual([])
  })

  it('resolves a stored view and falls back for unknown kinds or values', () => {
    expect(resolveView('file', 'content')).toBe('content')
    expect(resolveView('file', 'bogus')).toBeUndefined()
    expect(resolveView('file', null)).toBeUndefined()
    expect(resolveView('text', 'content')).toBeUndefined()
  })
})

describe('file block schema (M17)', () => {
  const card = { id: 'x', kind: 'file', schemaVersion: '1' }

  it('accepts the exact data shape a view change writes (content + view)', () => {
    const row = {
      ...card,
      data: fileData({ view: 'content' }),
    }
    expect(BlockSchema.safeParse(row).success).toBe(true)
  })

  it('accepts metadata-only uploads (no content, no view)', () => {
    const row = { ...card, data: fileData({ content: undefined }) }
    expect(BlockSchema.safeParse(row).success).toBe(true)
  })

  it('rejects an unknown view value so bad writes are caught', () => {
    const row = {
      ...card,
      data: { ...fileData(), view: 'banana' as FileBlockData['view'] },
    }
    expect(BlockSchema.safeParse(row).success).toBe(false)
  })
})