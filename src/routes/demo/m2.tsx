import { useLiveQuery } from '@tanstack/react-db'
import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { BlockShell, blockTitle } from '#/components/canvas/BlockShell'
import type {
  ObservableBlock,
  ObservablePlacement,
} from '#/components/canvas/BlockShell'
import { Canvas } from '#/components/canvas/Canvas'
import { ViewportProvider, useViewport } from '#/components/canvas/ViewportProvider'
import { useElementSize } from '#/hooks/useElementSize'
import {
  DEFAULT_VIEWPORT,
  rectFromWorldPoint,
  rectsOverlap,
  screenToWorld,
  visibleWorldRect,
  zoomAt,
} from '#/lib/canvas/transform'
import type { Vec, ViewportTransform, WorldRect } from '#/lib/canvas/transform'
import type { TextBlockData } from '#/types'
import type { Collections } from '#/collections'

export const Route = createFileRoute('/demo/m2')({
  ssr: false,
  loader: async ({ context }) => {
    await Promise.all([
      context.collections.blocksCollection.preload(),
      context.collections.placementsCollection.preload(),
    ])
    return null
  },
  component: M2Demo,
})

const BLOCK_WIDTH = 180
const BLOCK_HEIGHT = 92
const GRID_SPACING = 70

function M2Demo() {
  const collections = Route.useRouteContext({
    select: (ctx) => ctx.collections,
  })

  const { data: blocks } = useLiveQuery({
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

  const placedIds = useMemo(() => new Set(placements.map((p) => p.blockId)), [placements])
  const unplaced = useMemo(
    () => blocks.filter((block) => !placedIds.has(block.id)),
    [blocks, placedIds],
  )

  return (
    <ViewportProvider>
      <main className="demo-page demo-page-wide">
        <header className="mb-6">
          <p className="island-kicker mb-2">M2 — Infinite Canvas</p>
          <h1 className="demo-title mb-2">Pan · zoom · drag a block</h1>
          <p className="demo-muted max-w-2xl text-sm">
            A viewport transform drives a CSS-transformed world container; blocks sit in world
            coordinates and are culled to the viewport. Drag empty space to pan, scroll to zoom,
            and drag a block to move its placement — the position round-trips to Postgres on
            drag-end.
          </p>
        </header>

        <Board blocks={blocks} placements={placements} collections={collections} />

        <FormAndUnplacedPanel
          text={text}
          setText={setText}
          onAdd={addTextBlock}
          unplaced={unplaced}
          collections={collections}
        />
      </main>
    </ViewportProvider>
  )
}

interface BoardProps {
  blocks: ObservableBlock[]
  placements: ObservablePlacement[]
  collections: Collections
}

function Board({ blocks, placements, collections }: BoardProps) {
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>()
  const { viewport, setViewport } = useViewport()

  const visibleRect = useMemo<WorldRect | null>(
    () => (width > 0 && height > 0 ? visibleWorldRect(viewport, width, height) : null),
    [viewport, width, height],
  )

  const placedBlocks = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]))
    const placed = placements
      .map((placement) => ({ placement, block: byId.get(placement.blockId) }))
      .filter(
        (entry): entry is { placement: ObservablePlacement; block: ObservableBlock } =>
          !!entry.block,
      )
    if (!visibleRect) return placed
    return placed.filter(({ placement }) =>
      rectsOverlap(
        visibleRect,
        rectFromWorldPoint(
          { x: placement.positionX, y: placement.positionY },
          BLOCK_WIDTH,
          BLOCK_HEIGHT,
        ),
      ),
    )
  }, [blocks, placements, visibleRect])

  const handleDragEnd = (blockId: string, position: Vec) => {
    const existing = placements.find((p) => p.blockId === blockId)
    if (existing) {
      collections.placementsCollection.update(blockId, (draft) => {
        draft.positionX = position.x
        draft.positionY = position.y
      })
    } else {
      collections.placementsCollection.insert({
        blockId,
        positionX: position.x,
        positionY: position.y,
      })
    }
  }

  const zoomAtCenter = (factor: number) => {
    if (width <= 0 || height <= 0) return
    setViewport(zoomAt(viewport, { x: width / 2, y: height / 2 }, factor))
  }

  return (
    <div className="relative">
      <Canvas containerRef={containerRef} className="canvas-board">
        {placedBlocks.map(({ placement, block }) => (
          <BlockShell
            key={block.id}
            block={block}
            placement={placement}
            onDragEnd={(position) => handleDragEnd(block.id, position)}
          />
        ))}
      </Canvas>

      <ViewHud
        viewport={viewport}
        visibleCount={placedBlocks.length}
        totalCount={placements.length}
        onZoomIn={() => zoomAtCenter(1.35)}
        onZoomOut={() => zoomAtCenter(1 / 1.35)}
        onReset={() => setViewport(DEFAULT_VIEWPORT)}
      />
    </div>
  )
}

interface ViewHudProps {
  viewport: ViewportTransform
  visibleCount: number
  totalCount: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

function ViewHud({
  viewport,
  visibleCount,
  totalCount,
  onZoomIn,
  onZoomOut,
  onReset,
}: ViewHudProps) {
  return (
    <div className="canvas-hud">
      <button
        type="button"
        className="demo-button demo-button-secondary"
        onClick={onZoomOut}
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        type="button"
        className="demo-button demo-button-secondary"
        onClick={onZoomIn}
        aria-label="Zoom in"
      >
        +
      </button>
      <button type="button" className="demo-button demo-button-secondary" onClick={onReset}>
        Reset view
      </button>
      <span className="demo-pill">{Math.round(viewport.scale * 100)}%</span>
      <span className="demo-pill">
        {visibleCount}/{totalCount} placed
      </span>
    </div>
  )
}

interface FormAndUnplacedPanelProps {
  text: string
  setText: (text: string) => void
  onAdd: () => void
  unplaced: ObservableBlock[]
  collections: Collections
}

function FormAndUnplacedPanel({
  text,
  setText,
  onAdd,
  unplaced,
  collections,
}: FormAndUnplacedPanelProps) {
  const { viewport } = useViewport()
  const anchor = screenToWorld(viewport, { x: 80, y: 80 })

  const placeAt = (blockId: string, index: number) => {
    const col = index % 5
    const row = Math.floor(index / 5)
    collections.placementsCollection.insert({
      blockId,
      positionX: Math.round(anchor.x + col * GRID_SPACING),
      positionY: Math.round(anchor.y + row * GRID_SPACING),
    })
  }

  return (
    <>
      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="demo-panel">
          <h2 className="demo-section-title mb-3">Add a text block</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onAdd()
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
          <p className="demo-muted mt-3 text-xs">
            New blocks start unplaced — use <strong>Place on canvas</strong> below to put one on
            the board, then drag it around.
          </p>
        </div>

        <div className="demo-panel">
          <h2 className="demo-section-title mb-3">Unplaced blocks ({unplaced.length})</h2>
          {unplaced.length === 0 ? (
            <p className="demo-muted text-sm">All blocks are on the canvas.</p>
          ) : (
            <ul className="space-y-2">
              {unplaced.map((block, index) => (
                <li
                  key={block.id}
                  className="demo-list-item flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {blockTitle(block)}
                  </span>
                  <button
                    type="button"
                    className="demo-button demo-button-secondary whitespace-nowrap text-xs"
                    onClick={() => placeAt(block.id, index)}
                  >
                    Place on canvas
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="demo-muted mt-4 text-xs">
        Tips: drag empty space to pan · scroll to zoom · drag a block to move its placement
        (persists to Postgres).
      </p>
    </>
  )
}