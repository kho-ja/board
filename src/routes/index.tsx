import { useLiveQuery } from '@tanstack/react-db'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { BlockShell } from '#/components/canvas/BlockShell'
import type {
  ObservableBlock,
  ObservablePlacement,
} from '#/components/canvas/BlockShell'
import { blockTitle } from '#/components/canvas/BlockRenderer'
import { Canvas } from '#/components/canvas/Canvas'
import { ViewportProvider, useViewport } from '#/components/canvas/ViewportProvider'
import { useElementSize } from '#/hooks/useElementSize'
import ThemeToggle from '#/components/ThemeToggle'
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

export const Route = createFileRoute('/')({
  ssr: false,
  loader: async ({ context }) => {
    await Promise.all([
      context.collections.blocksCollection.preload(),
      context.collections.placementsCollection.preload(),
    ])
    return null
  },
  component: BoardPage,
})

const BLOCK_WIDTH = 180
const BLOCK_HEIGHT = 92
const GRID_SPACING = 70
const DEFAULT_TEXT = 'Text'

function BoardPage() {
  const collections = Route.useRouteContext({
    select: (ctx) => ctx.collections,
  })

  const { data: blocks } = useLiveQuery({
    query: (q) => q.from({ block: collections.blocksCollection }),
  })

  const { data: placements } = useLiveQuery({
    query: (q) => q.from({ placement: collections.placementsCollection }),
  })

  const placedIds = useMemo(() => new Set(placements.map((p) => p.blockId)), [placements])
  const unplaced = useMemo(
    () => blocks.filter((block) => !placedIds.has(block.id)),
    [blocks, placedIds],
  )

  return (
    <ViewportProvider>
      <Board
        blocks={blocks}
        placements={placements}
        unplaced={unplaced}
        collections={collections}
      />
    </ViewportProvider>
  )
}

interface BoardProps {
  blocks: ObservableBlock[]
  placements: ObservablePlacement[]
  unplaced: ObservableBlock[]
  collections: Collections
}

function Board({ blocks, placements, unplaced, collections }: BoardProps) {
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>()
  const { viewport, setViewport } = useViewport()
  const [libraryOpen, setLibraryOpen] = useState(false)

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

  const viewCenter = useCallback((): Vec => {
    if (width <= 0 || height <= 0) {
      return screenToWorld(viewport, { x: 80, y: 80 })
    }
    return screenToWorld(viewport, { x: width / 2, y: height / 2 })
  }, [height, viewport, width])

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

  const commitText = (blockId: string, markdown: string) => {
    collections.blocksCollection.update(blockId, (draft) => {
      draft.data = { kind: 'text', markdown } satisfies TextBlockData
    })
  }

  const addTextAtViewCenter = useCallback(() => {
    const id = crypto.randomUUID()
    const origin = viewCenter()
    collections.blocksCollection.insert({
      id,
      kind: 'text',
      data: { kind: 'text', markdown: DEFAULT_TEXT } satisfies TextBlockData,
      schemaVersion: '1',
    })
    collections.placementsCollection.insert({
      blockId: id,
      positionX: Math.round(origin.x - BLOCK_WIDTH / 2),
      positionY: Math.round(origin.y - BLOCK_HEIGHT / 2),
    })
  }, [collections, viewCenter])

  const placeAt = (blockId: string, index: number) => {
    const origin = viewCenter()
    const col = index % 5
    const row = Math.floor(index / 5)
    collections.placementsCollection.insert({
      blockId,
      positionX: Math.round(origin.x - BLOCK_WIDTH / 2 + col * GRID_SPACING),
      positionY: Math.round(origin.y - BLOCK_HEIGHT / 2 + row * GRID_SPACING),
    })
  }

  const zoomAtCenter = (factor: number) => {
    if (width <= 0 || height <= 0) return
    setViewport(zoomAt(viewport, { x: width / 2, y: height / 2 }, factor))
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 't' && event.key !== 'T') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      addTextAtViewCenter()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addTextAtViewCenter])

  useEffect(() => {
    if (unplaced.length > 0) setLibraryOpen(true)
  }, [unplaced.length])

  return (
    <div className="board-shell">
      <Canvas containerRef={containerRef} className="canvas-board">
        {placedBlocks.map(({ placement, block }) => (
          <BlockShell
            key={block.id}
            block={block}
            placement={placement}
            onDragEnd={(position) => handleDragEnd(block.id, position)}
            onCommitText={commitText}
          />
        ))}
      </Canvas>

      <TopBar />
      <ToolRail onAddText={addTextAtViewCenter} />
      <ZoomCluster
        viewport={viewport}
        visibleCount={placedBlocks.length}
        totalCount={placements.length}
        onZoomIn={() => zoomAtCenter(1.35)}
        onZoomOut={() => zoomAtCenter(1 / 1.35)}
        onReset={() => setViewport(DEFAULT_VIEWPORT)}
      />
      <LibraryPanel
        open={libraryOpen}
        unplaced={unplaced}
        onToggle={() => setLibraryOpen((open) => !open)}
        onPlace={placeAt}
      />
    </div>
  )
}

function TopBar() {
  return (
    <header className="board-topbar">
      <div className="board-brand">
        <span className="board-mark" aria-hidden="true" />
        <div className="board-brand-copy">
          <p className="board-name">Kho-ja</p>
          <p className="board-file">Board</p>
        </div>
      </div>
      <ThemeToggle className="chrome-toggle" />
    </header>
  )
}

function ToolRail({ onAddText }: { onAddText: () => void }) {
  return (
    <nav className="tool-rail" aria-label="Tools">
      <button
        type="button"
        className="tool-button"
        onClick={onAddText}
        title="Text (T)"
        aria-label="Add text block"
      >
        <span className="tool-letter">T</span>
      </button>
    </nav>
  )
}

interface ZoomClusterProps {
  viewport: ViewportTransform
  visibleCount: number
  totalCount: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

function ZoomCluster({
  viewport,
  visibleCount,
  totalCount,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomClusterProps) {
  return (
    <div className="zoom-cluster">
      <button type="button" className="chrome-icon" onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <button
        type="button"
        className="zoom-percent"
        onClick={onReset}
        title="Reset view"
        aria-label={`Zoom ${Math.round(viewport.scale * 100)} percent. Click to reset view.`}
      >
        {Math.round(viewport.scale * 100)}%
      </button>
      <button type="button" className="chrome-icon" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <span className="zoom-meta">
        {visibleCount}/{totalCount}
      </span>
    </div>
  )
}

interface LibraryPanelProps {
  open: boolean
  unplaced: ObservableBlock[]
  onToggle: () => void
  onPlace: (blockId: string, index: number) => void
}

function LibraryPanel({ open, unplaced, onToggle, onPlace }: LibraryPanelProps) {
  return (
    <aside className={`library-dock${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="library-tab"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="board-library"
      >
        Library
        <span className="library-count">{unplaced.length}</span>
      </button>
      {open && (
        <div id="board-library" className="library-panel">
          <div className="library-head">
            <h2 className="library-title">Unplaced</h2>
            <button type="button" className="chrome-icon library-close" onClick={onToggle} aria-label="Close library">
              ×
            </button>
          </div>
          {unplaced.length === 0 ? (
            <p className="library-empty">Nothing waiting. New text lands on the canvas.</p>
          ) : (
            <ul className="library-list">
              {unplaced.map((block, index) => (
                <li key={block.id} className="library-item">
                  <span className="library-item-title">{blockTitle(block)}</span>
                  <button
                    type="button"
                    className="library-place"
                    onClick={() => onPlace(block.id, index)}
                  >
                    Place
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
