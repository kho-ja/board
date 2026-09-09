import { useEffect, useMemo, useRef, useState } from 'react'

import {
  DEFAULT_SEARCH_LIMIT,
  searchBlocks,
  type SearchableBlock,
} from '#/lib/board/search'
import type {
  FileBlockData,
  FileGroupBlockData,
  ObjectBlockData,
  SchemaDef,
  TextBlockData,
} from '#/types'
import type { ObservableBlock } from './BlockShell'
import { blockTitle } from './BlockRenderer'

function captionFor(block: ObservableBlock, types: readonly SchemaDef[]): string {
  const data = block.data
  if (block.kind === 'file') {
    return data.kind === 'text' ? 'Text' : 'File'
  }
  if (block.kind === 'file-group') return 'Group'
  if (block.kind === 'text') return 'Text'
  const object = data as ObjectBlockData
  return types.find((t) => t.id === object.schemaId || t.id === block.kind)?.name ?? 'Object'
}

function termsFor(block: ObservableBlock, types: readonly SchemaDef[]): string[] {
  const terms = [blockTitle(block, types), block.kind]
  if (block.kind === 'text') {
    terms.push((block.data as TextBlockData).markdown)
  } else if (block.kind === 'file') {
    terms.push((block.data as FileBlockData).name)
  } else if (block.kind === 'file-group') {
    terms.push((block.data as FileGroupBlockData).name)
  } else {
    const object = block.data as ObjectBlockData
    for (const [key, value] of Object.entries(object.values ?? {})) {
      if (value == null) continue
      terms.push(key, String(value))
    }
  }
  return terms
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const firstWord = query.trim().toLowerCase().split(/\s+/)[0]
  if (!firstWord) return <>{text}</>
  const index = text.toLowerCase().indexOf(firstWord)
  if (index === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <strong>{text.slice(index, index + firstWord.length)}</strong>
      {text.slice(index + firstWord.length)}
    </>
  )
}

interface SearchOverlayProps {
  open: boolean
  blocks: ObservableBlock[]
  types: SchemaDef[]
  unplacedBlockIds: ReadonlySet<string>
  onClose: () => void
  onSelect: (blockId: string) => void
}

export function SearchOverlay({
  open,
  blocks,
  types,
  unplacedBlockIds,
  onClose,
  onSelect,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const items = useMemo<SearchableBlock[]>(
    () =>
      blocks.map((block) => ({
        blockId: block.id,
        title: blockTitle(block, types),
        caption: captionFor(block, types),
        terms: termsFor(block, types),
      })),
    [blocks, types],
  )

  const results = useMemo(
    () => searchBlocks(query, items, DEFAULT_SEARCH_LIMIT),
    [query, items],
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const active = listRef.current?.children[activeIndex]
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  const commit = (blockId: string) => {
    onSelect(blockId)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const result = results[activeIndex]
      if (result) commit(result.blockId)
    }
  }

  return (
    <div
      className="search-overlay-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="search-palette" role="dialog" aria-label="Search board">
        <div className="search-input-row">
          <span className="search-icon" aria-hidden="true">
            ⌘
          </span>
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search blocks, text, fields, files…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="search-kbd">esc</span>
        </div>
        <ul className="search-results" ref={listRef}>
          {results.length === 0 ? (
            <li className="search-empty">
              {query.trim() ? 'No matches' : 'Type to search the board'}
            </li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.blockId}
                className={`search-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(result.blockId)}
              >
                <span className="search-item-title">
                  <Highlighted text={result.title} query={query} />
                </span>
                <span className="search-item-caption">{result.caption}</span>
                {unplacedBlockIds.has(result.blockId) && (
                  <span className="search-item-badge">not placed</span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}