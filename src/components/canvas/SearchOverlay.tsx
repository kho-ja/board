import { useEffect, useMemo, useState } from 'react'

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
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'

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
    if (open) setQuery('')
  }, [open])

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Search board"
      description="Search blocks, text, fields, files…"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search blocks, text, fields, files…"
          value={query}
          onValueChange={setQuery}
          spellCheck={false}
          autoComplete="off"
        />
        <CommandList>
          {results.length === 0 ? (
            <CommandEmpty>{query.trim() ? 'No matches' : 'Type to search the board'}</CommandEmpty>
          ) : (
            <CommandGroup>
              {results.map((result) => (
                <CommandItem
                  key={result.blockId}
                  value={result.title}
                  onSelect={() => onSelect(result.blockId)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <Highlighted text={result.title} query={query} />
                  </span>
                  <CommandShortcut>{result.caption}</CommandShortcut>
                  {unplacedBlockIds.has(result.blockId) && (
                    <span className="text-xs text-muted-foreground">not placed</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}