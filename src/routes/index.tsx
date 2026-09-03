import { useLiveQuery } from '@tanstack/react-db'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { BlockShell } from '#/components/canvas/BlockShell'
import type {
  ObservableBlock,
  ObservableMembership,
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
import type { FileGroupBlockData, TextBlockData } from '#/types'
import type { Collections } from '#/collections'

export const Route = createFileRoute('/')({
  ssr: false,
  loader: async ({ context }) => {
    await Promise.all([
      context.collections.blocksCollection.preload(),
      context.collections.placementsCollection.preload(),
      context.collections.membershipsCollection.preload(),
    ])
    return null
  },
  component: BoardPage,
})

const BLOCK_WIDTH = 180
const BLOCK_HEIGHT = 92
const GROUP_WIDTH = 280
const GROUP_HEIGHT = 220
const GRID_SPACING = 70
const DEFAULT_TEXT = 'Text'

const sizeForBlock = (kind: string) =>
  kind === 'file-group'
    ? { width: GROUP_WIDTH, height: GROUP_HEIGHT }
    : { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }

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

  const { data: memberships } = useLiveQuery({
    query: (q) => q.from({ membership: collections.membershipsCollection }),
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
        memberships={memberships}
        unplaced={unplaced}
        collections={collections}
      />
    </ViewportProvider>
  )
}

interface BoardProps {
  blocks: ObservableBlock[]
  placements: ObservablePlacement[]
  memberships: ObservableMembership[]
  unplaced: ObservableBlock[]
  collections: Collections
}

function Board({ blocks, placements, memberships, unplaced, collections }: BoardProps) {
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
    return placed.filter(({ placement, block }) =>
      rectsOverlap(
        visibleRect,
        rectFromWorldPoint(
          { x: placement.positionX, y: placement.positionY },
          sizeForBlock(block.kind).width,
          sizeForBlock(block.kind).height,
        ),
      ),
    )
  }, [blocks, placements, visibleRect])

  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])

  const membersByGroup = useMemo(() => {
    const map = new Map<string, ObservableBlock[]>()
    for (const membership of memberships) {
      const member = byId.get(membership.memberId)
      if (!member) continue
      const list = map.get(membership.groupId)
      if (list) list.push(member)
      else map.set(membership.groupId, [member])
    }
    return map
  }, [byId, memberships])
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

  const placeBlockAt = (blockId: string, world: Vec) => {
    const existing = placements.find((p) => p.blockId === blockId)
    if (existing) return
    const size = sizeForBlock(byId.get(blockId)?.kind ?? '')
    collections.placementsCollection.insert({
      blockId,
      positionX: Math.round(world.x - size.width / 2),
      positionY: Math.round(world.y - size.height / 2),
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
    async (files: File[], anchor: Vec, intoGroup?: string | null) => {
      let firstId: string | null = null
      const created: string[] = []
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
        created.push(id)
        if (firstId === null) firstId = id
      }
      if (intoGroup) {
        // Membership rows reference already-committed file blocks (awaited
        // above), so the membership FK cannot race. Files dropped into a group
        // keep their own placements; the membership is an extra reference.
        const already = new Set(
          memberships.filter((m) => m.groupId === intoGroup).map((m) => m.memberId),
        )
        for (const memberId of created) {
          if (already.has(memberId)) continue
          already.add(memberId)
          collections.membershipsCollection.insert({
            id: crypto.randomUUID(),
            groupId: intoGroup,
            memberId,
          })
        }
      } else if (firstId !== null) {
        setSelectedIds(new Set([firstId]))
      }
    },
    [collections, memberships],
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

  const createGroup = useCallback(async () => {
    const id = crypto.randomUUID()
    const tx = collections.blocksCollection.insert({
      id,
      kind: 'file-group',
      data: {
        kind: 'file-group',
        name: 'File Group',
        currentView: 'card',
      } satisfies FileGroupBlockData,
      schemaVersion: '1',
    })
    await tx.isPersisted.promise
    const origin = viewCenter()
    collections.placementsCollection.insert({
      blockId: id,
      positionX: Math.round(origin.x - GROUP_WIDTH / 2),
      positionY: Math.round(origin.y - GROUP_HEIGHT / 2),
    })
    setTool('move')
    setSelectedIds(new Set([id]))
  }, [collections, viewCenter])

  const handleDropFilesOnGroup = useCallback(
    (groupId: string, files: File[], dropPoint: Vec) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const anchor = screenToWorld(viewport, {
        x: dropPoint.x - rect.left,
        y: dropPoint.y - rect.top,
      })
      void importFiles(files, anchor, groupId)
    },
    [containerRef, importFiles, viewport],
  )

  const handleGroupViewChange = useCallback(
    (blockId: string, view: 'card' | 'list') => {
      collections.blocksCollection.update(blockId, (draft) => {
        const data = draft.data as FileGroupBlockData
        draft.data = { kind: 'file-group', name: data.name, currentView: view }
      })
    },
    [collections],
  )

  const handleRenameGroup = useCallback(
    (blockId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      collections.blocksCollection.update(blockId, (draft) => {
        const data = draft.data as FileGroupBlockData
        draft.data = { kind: 'file-group', name: trimmed, currentView: data.currentView }
      })
    },
    [collections],
  )

  const handleUnplace = useCallback(
    (blockId: string) => {
      collections.placementsCollection.delete(blockId)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(blockId)
        return next
      })
    },
    [collections],
  )

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      for (const membership of memberships) {
        if (membership.groupId === groupId) {
          collections.membershipsCollection.delete(membership.id)
        }
      }
      collections.placementsCollection.delete(groupId)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    },
    [collections, memberships],
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
        const block = byId.get(placement.blockId)
        if (!block) continue
        if (
          rectsOverlap(
            world,
            rectFromWorldPoint(
              { x: placement.positionX, y: placement.positionY },
              sizeForBlock(block.kind).width,
              sizeForBlock(block.kind).height,
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
      <TopBar
        onPickFiles={pickFiles}
        onCreateGroup={() => void createGroup()}
      />
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
            onPlaceBlockAt={placeBlockAt}
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
                members={membersByGroup.get(block.id)}
                onGroupViewChange={handleGroupViewChange}
                onMemberClick={selectOnly}
                onDropFilesOnGroup={handleDropFilesOnGroup}
              />
            ))}
          </Canvas>
        </div>
        <Inspector
          selected={selectedBlocks}
          onUpdatePosition={handleUpdatePosition}
          onUnplace={handleUnplace}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={handleRenameGroup}
          membersByGroup={membersByGroup}
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