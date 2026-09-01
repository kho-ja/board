import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'

import type { TextBlockData } from '#/types'

export const Route = createFileRoute('/demo/m1')({
  ssr: false,
  loader: async ({ context }) => {
    await Promise.all([
      context.collections.blocksCollection.preload(),
      context.collections.placementsCollection.preload(),
    ])
    return null
  },
  component: M1Demo,
})

function M1Demo() {
  const collections = Route.useRouteContext({
    select: (ctx) => ctx.collections,
  })

  const { data: blocks, isLoading } = useLiveQuery({
    query: (q) => q.from({ block: collections.blocksCollection }),
  })

  const { data: placements } = useLiveQuery({
    query: (q) => q.from({ placement: collections.placementsCollection }),
  })

  const [text, setText] = useState('')

  const addTextBlock = () => {
    if (!text.trim()) return
    const markdown = text.trim()
    collections.blocksCollection.insert({
      id: crypto.randomUUID(),
      kind: 'text',
      data: { kind: 'text', markdown } satisfies TextBlockData,
      schemaVersion: '1',
    })
    setText('')
  }

  const moveBlock = (id: string, x: number, y: number) => {
    const existing = placements?.find((p) => p.blockId === id)
    if (existing) {
      collections.placementsCollection.update(existing.blockId, (draft) => {
        draft.positionX = x
        draft.positionY = y
      })
    } else {
      collections.placementsCollection.insert({ blockId: id, positionX: x, positionY: y })
    }
  }

  return (
    <main className="demo-page demo-center">
      <section className="demo-panel w-full max-w-2xl">
        <header className="mb-8">
          <p className="island-kicker mb-2">M1 — Data Path</p>
          <h1 className="demo-title mb-2">QueryCollection → server fn → Postgres</h1>
          <p className="demo-muted text-sm">
            Blocks are read through <code>useLiveQuery</code>; inserting a block
            writes optimistically to the collection and persists via a server fn.
            Reload to confirm persistence.
          </p>
        </header>

        <h2 className="demo-section-title mb-4">Blocks (text kind)</h2>

        {isLoading && <p className="demo-muted text-sm">Loading…</p>}

        <ul className="mb-6 space-y-3">
          {blocks.map((block) => {
            const placement = placements?.find((p) => p.blockId === block.id)
            return (
              <li key={block.id} className="demo-list-item">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block truncate font-medium">
                      {block.kind === 'text'
                        ? ((block.data as TextBlockData).markdown ?? '')
                        : block.id}
                    </span>
                    <span className="demo-muted text-xs">
                      {block.kind} · {block.id.slice(0, 8)} · v{block.schemaVersion}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      moveBlock(block.id, Math.round(Math.random() * 400), Math.round(Math.random() * 300))
                    }
                    className="demo-button demo-button-secondary whitespace-nowrap text-xs"
                  >
                    {placement ? `Move (${placement.positionX},${placement.positionY})` : 'Place'}
                  </button>
                </div>
              </li>
            )
          })}
          {blocks.length === 0 && !isLoading && (
            <li className="demo-list-item text-center demo-muted">
              No blocks yet. Add one below.
            </li>
          )}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            addTextBlock()
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Text block content…"
            className="demo-input min-w-0 flex-1"
          />
          <button type="submit" className="demo-button whitespace-nowrap">
            Add Text Block
          </button>
        </form>
      </section>
    </main>
  )
}