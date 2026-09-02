import { useLiveQuery } from '@tanstack/react-db'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { BlockShell } from '#/components/canvas/BlockShell'
import type {
  ObservableBlock,
  ObservablePlacement,
} from '#/components/canvas/BlockShell'
import { Canvas } from '#/components/canvas/Canvas'
import { ViewportProvider, useViewport } from '#/components/canvas/ViewportProvider'
import { ToolRail } from '#/components/canvas/ToolRail'
import type { Tool } from '#/components/canvas/tools'
import { LeftDock } from '#/components/canvas/LeftDock'
import { Inspector } from '#/components/canvas/Inspector'
import { StatusBar } from '#/components/canvas/StatusBar'
import { TopBar } from '#/components/canvas/TopBar'
import { useElementSize } from '#/hooks/useElementSize'
import {
  DEFAULT_VIEWPORT,
  rectFromWorldPoint,
  rectsOverlap,
  screenToWorld,
  visibleWorldRect,
  zoomAt,
} from '#/lib/canvas/transform'
import type { Vec, WorldRect } from '#/lib/canvas/transform'
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
  const [tool, setTool] = useState<Tool>('move')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const forcePan = tool === 'hand' || spaceHeld

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

  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])
  const selectedBlock = selectedId ? (byId.get(selectedId) ?? null) : null
  const selectedPlacement = selectedId
    ? (placements.find((p) => p.blockId === selectedId) ?? null)
    : null

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

  const handleUpdatePosition = (blockId: string, x: number, y: number) => {
    const existing = placements.find((p) => p.blockId === blockId)
    if (existing) {
      collections.placementsCollection.update(blockId, (draft) => {
        draft.positionX = x
        draft.positionY = y
      })
    }
  }

  const commitText = (blockId: string, markdown: string) => {
    collections.blocksCollection.update(blockId, (draft) => {
      draft.data = { kind: 'text', markdown } satisfies TextBlockData
    })
  }

  const addTextAt = useCallback(
    (world: Vec) => {
      const id = crypto.randomUUID()
      collections.blocksCollection.insert({
        id,
        kind: 'text',
        data: { kind: 'text', markdown: DEFAULT_TEXT } satisfies TextBlockData,
        schemaVersion: '1',
      })
      collections.placementsCollection.insert({
        blockId: id,
        positionX: Math.round(world.x - BLOCK_WIDTH / 2),
        positionY: Math.round(world.y - BLOCK_HEIGHT / 2),
      })
      setSelectedId(id)
    },
    [collections],
  )

  const placeAt = (blockId: string, index: number) => {
    const origin = viewCenter()
    const col = index % 5
    const row = Math.floor(index / 5)
    collections.placementsCollection.insert({
      blockId,
      positionX: Math.round(origin.x - BLOCK_WIDTH / 2 + col * GRID_SPACING),
      positionY: Math.round(origin.y - BLOCK_HEIGHT / 2 + row * GRID_SPACING),
    })
    setSelectedId(blockId)
    setTool('move')
  }

  const zoomAtCenter = (factor: number) => {
    if (width <= 0 || height <= 0) return
    setViewport(zoomAt(viewport, { x: width / 2, y: height / 2 }, factor))
  }

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.code === 'Space') {
        event.preventDefault()
        setSpaceHeld(true)
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'v') setTool('move')
      else if (key === 'h') setTool('hand')
      else if (key === 't') {
        setTool((t) => (t === 'text' ? 'move' : 'text'))
      } else if (key === 'escape') {
        setSelectedId(null)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const onPress = useCallback(
    (world: Vec) => {
      if (tool === 'text') {
        addTextAt(world)
      }
    },
    [addTextAt, tool],
  )

  const onDeselect = useCallback(() => setSelectedId(null), [])

  const selectBlock = useCallback((id: string) => setSelectedId(id), [])

  return (
    <div className="board-shell">
      <TopBar />
      <div className="board-main">
        <ToolRail tool={tool} onSelect={setTool} />
        <LeftDock
          placed={placements.map((placement) => ({
            placement,
            block: byId.get(placement.blockId),
          })).filter(
            (entry): entry is { placement: ObservablePlacement; block: ObservableBlock } =>
              !!entry.block,
          )}
          unplaced={unplaced}
          selectedId={selectedId}
          onSelect={selectBlock}
          onPlace={placeAt}
        />
        <div className="canvas-area">
          <Canvas
            containerRef={containerRef}
            className="canvas-board"
            tool={tool}
            forcePan={forcePan}
            onPress={onPress}
            onDeselect={onDeselect}
          >
            {placedBlocks.map(({ placement, block }) => (
              <BlockShell
                key={block.id}
                block={block}
                placement={placement}
                onDragEnd={(position) => handleDragEnd(block.id, position)}
                onCommitText={commitText}
                onSelect={selectBlock}
                selected={selectedId === block.id}
              />
            ))}
          </Canvas>
        </div>
        <Inspector
          block={selectedBlock}
          placement={selectedPlacement}
          onUpdatePosition={handleUpdatePosition}
        />
      </div>
      <StatusBar
        viewport={viewport}
        placedCount={placements.length}
        blockCount={blocks.length}
        onZoomIn={() => zoomAtCenter(1.35)}
        onZoomOut={() => zoomAtCenter(1 / 1.35)}
        onReset={() => {
          setViewport(DEFAULT_VIEWPORT)
          setSelectedId(null)
        }}
      />
    </div>
  )
}