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
import { makeFileBlock } from '#/blocks/file/makeFileBlock'
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
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
  const selectedBlocks = useMemo(
    () =>
      placements
        .map((placement) => ({ placement, block: byId.get(placement.blockId) }))
        .filter(
          (
            entry,
          ): entry is { placement: ObservablePlacement; block: ObservableBlock } =>
            !!entry.block && selectedIds.has(entry.block.id),
        ),
    [byId, placements, selectedIds],
  )

  const selectOnly = useCallback((id: string) => setSelectedIds(new Set([id])), [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
    async (world: Vec) => {
      const id = crypto.randomUUID()
      const tx = collections.blocksCollection.insert({
        id,
        kind: 'text',
        data: { kind: 'text', markdown: DEFAULT_TEXT } satisfies TextBlockData,
        schemaVersion: '1',
      })
      await tx.isPersisted.promise
      collections.placementsCollection.insert({
        blockId: id,
        positionX: Math.round(world.x - BLOCK_WIDTH / 2),
        positionY: Math.round(world.y - BLOCK_HEIGHT / 2),
      })
      setSelectedIds(new Set([id]))
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
    setSelectedIds(new Set([blockId]))
    setTool('move')
  }

  // Cascade-import dropped/picked files as `file` blocks (metadata only), each
  // auto-placed on a GRID_SPACING grid anchored at `anchor`. Anchor for drops
  // is the drop point; for the picker button it is the m2 (80, 80) screen point.
  // Each file's placement is inserted only after its block row has committed
  // (await) so the placements FK never races the blocks write.
  const importFiles = useCallback(
    async (files: File[], anchor: Vec) => {
      let firstId: string | null = null
      for (let index = 0; index < files.length; index++) {
        const id = crypto.randomUUID()
        const col = index % 5
        const row = Math.floor(index / 5)
        const tx = collections.blocksCollection.insert({
          id,
          ...makeFileBlock(files[index]),
          schemaVersion: '1',
        })
        await tx.isPersisted.promise
        collections.placementsCollection.insert({
          blockId: id,
          positionX: Math.round(anchor.x - BLOCK_WIDTH / 2 + col * GRID_SPACING),
          positionY: Math.round(anchor.y - BLOCK_HEIGHT / 2 + row * GRID_SPACING),
        })
        if (firstId === null) firstId = id
      }
      if (firstId !== null) setSelectedIds(new Set([firstId]))
    },
    [collections],
  )

  const pickFiles = useCallback(
    (files: File[]) => {
      importFiles(files, screenToWorld(viewport, { x: 80, y: 80 }))
    },
    [importFiles, viewport],
  )

  const onImportFiles = useCallback(
    (files: File[], anchor: Vec) => importFiles(files, anchor),
    [importFiles],
  )

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
      else if (key === 't') setTool('text')
      else if (key === 'escape') {
        setTool('move')
        setSelectedIds(new Set())
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
        void addTextAt(world)
      }
    },
    [addTextAt, tool],
  )

  // Marquee box-selection: a drag on empty canvas with the Move tool selects
  // every block whose placement rect intersects the dragged rectangle. A click
  // (no drag) reports `null`, which clears the selection.
  const onMarquee = useCallback(
    (world: WorldRect | null) => {
      if (!world) {
        setSelectedIds(new Set())
        return
      }
      const next = new Set<string>()
      for (const placement of placements) {
        if (!byId.has(placement.blockId)) continue
        if (
          rectsOverlap(
            world,
            rectFromWorldPoint(
              { x: placement.positionX, y: placement.positionY },
              BLOCK_WIDTH,
              BLOCK_HEIGHT,
            ),
          )
        ) {
          next.add(placement.blockId)
        }
      }
      setSelectedIds(next)
    },
    [byId, placements],
  )

  return (
    <div className="board-shell">
      <TopBar onPickFiles={pickFiles} />
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
          selectedIds={selectedIds}
          onSelect={selectOnly}
          onPlace={placeAt}
        />
        <div className="canvas-area">
          <Canvas
            containerRef={containerRef}
            className="canvas-board"
            tool={tool}
            forcePan={forcePan}
            onPress={onPress}
            onMarquee={onMarquee}
            onImportFiles={onImportFiles}
          >
            {placedBlocks.map(({ placement, block }) => (
              <BlockShell
                key={block.id}
                block={block}
                placement={placement}
                onDragEnd={(position) => handleDragEnd(block.id, position)}
                onCommitText={commitText}
                onSelect={selectOnly}
                onToggleSelect={toggleSelect}
                selected={selectedIds.has(block.id)}
              />
            ))}
          </Canvas>
        </div>
        <Inspector
          selected={selectedBlocks}
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
          setSelectedIds(new Set())
        }}
      />
    </div>
  )
}