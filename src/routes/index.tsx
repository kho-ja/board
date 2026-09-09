import { useLiveQuery } from '@tanstack/react-db'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { BlockShell } from '#/components/canvas/BlockShell'
import type {
  ObservableBlock,
  ObservableMembership,
  ObservablePlacement,
} from '#/components/canvas/BlockShell'
import type { DropTarget } from '#/components/canvas/BlockShell'
import { LinksLayer } from '#/components/canvas/LinksLayer'
import type { PortSide, Rect } from '#/lib/canvas/geometry'
import { computeBestAnchorPair, createBezierPath } from '#/lib/canvas/geometry'
import {
  buildBoardExport,
  downloadJson,
  exportFilename,
  parseBoardExport,
  type BoardExport,
} from '#/lib/board/json'
import { downloadBlob, pngFilename, renderBoardPng } from '#/lib/board/png'
import type { PngBlockInput, PngLinkCurve } from '#/lib/board/png'
import { blockTitle } from '#/components/canvas/BlockRenderer'
import { formatBytes } from '#/blocks/file/FileCard'
import { MiniMap } from '#/components/canvas/MiniMap'
import {
  alignTargets,
  distributeTargets,
  type AlignMode,
  type DistributeAxis,
  type SizedRect,
} from '#/lib/canvas/layout'
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
import { useUndoRedo } from '#/hooks/useUndoRedo'
import {
  DEFAULT_VIEWPORT,
  rectFromWorldPoint,
  rectsOverlap,
  screenToWorld,
  visibleWorldRect,
  zoomAt,
} from '#/lib/canvas/transform'
import type { Vec, WorldRect } from '#/lib/canvas/transform'
import { SchemaCreator } from '#/components/schema/SchemaCreator'
import type {
  BlockData,
  FieldValue,
  FileBlockData,
  FileGroupBlockData,
  ObjectBlockData,
  ObservableLink,
  SchemaDef,
  TextBlockData,
  ViewDef,
} from '#/types'
import type { Collections } from '#/collections'

export const Route = createFileRoute('/')({
  ssr: false,
  loader: async ({ context }) => {
    await Promise.all([
      context.collections.blocksCollection.preload(),
      context.collections.placementsCollection.preload(),
      context.collections.membershipsCollection.preload(),
      context.collections.typesCollection.preload(),
      context.collections.linksCollection.preload(),
      context.collections.viewsCollection.preload(),
    ])
    return null
  },
  component: BoardPage,
})

const BLOCK_WIDTH = 180
const BLOCK_HEIGHT = 92
const GROUP_WIDTH = 280
const GROUP_HEIGHT = 220
const OBJECT_WIDTH = 240
const OBJECT_HEIGHT = 160
const GRID_SPACING = 70
const DEFAULT_TEXT = 'Text'

const sizeForBlock = (kind: string) => {
  if (kind === 'file-group') return { width: GROUP_WIDTH, height: GROUP_HEIGHT }
  if (kind === 'file' || kind === 'text') return { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }
  return { width: OBJECT_WIDTH, height: OBJECT_HEIGHT }
}

/** Drop server-managed timestamps so imports get fresh ones on insert. */
function stripRowDates<T extends { createdAt?: unknown; updatedAt?: unknown }>(
  row: T,
): Omit<T, 'createdAt' | 'updatedAt'> {
  const copy = { ...row }
  delete copy.createdAt
  delete copy.updatedAt
  return copy
}

const updatePlacement = (
  collections: Collections,
  blockId: string,
  positionX: number,
  positionY: number,
) => {
  collections.placementsCollection.update(blockId, (draft) => {
    draft.positionX = positionX
    draft.positionY = positionY
  })
}

const updateBlockData = (
  collections: Collections,
  blockId: string,
  data: BlockData,
) => {
  collections.blocksCollection.update(blockId, (draft) => {
    draft.data = data
  })
}

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

  const { data: types } = useLiveQuery({
    query: (q) => q.from({ type: collections.typesCollection }),
  })

  const { data: links } = useLiveQuery({
    query: (q) => q.from({ link: collections.linksCollection }),
  })

  const { data: views } = useLiveQuery({
    query: (q) => q.from({ view: collections.viewsCollection }),
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
        links={links}
        unplaced={unplaced}
        types={types}
        views={views}
        collections={collections}
      />
    </ViewportProvider>
  )
}

interface BoardProps {
  blocks: ObservableBlock[]
  placements: ObservablePlacement[]
  memberships: ObservableMembership[]
  links: ObservableLink[]
  unplaced: ObservableBlock[]
  types: SchemaDef[]
  views: ViewDef[]
  collections: Collections
}

function Board({ blocks, placements, memberships, links, unplaced, types, views, collections }: BoardProps) {
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>()
  const { viewport, setViewport } = useViewport()
  const [tool, setTool] = useState<Tool>('move')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null)
  const [draftLink, setDraftLink] = useState<{ fromBlockId: string; currentPos: Vec } | null>(null)
  const [livePositions, setLivePositions] = useState<Map<string, Vec>>(() => new Map())
  const [measuredSizes, setMeasuredSizes] = useState<Map<string, { width: number; height: number }>>(
    () => new Map(),
  )
  const [dockTab, setDockTab] = useState<'layers' | 'assets' | 'types'>('layers')
  const [miniMapOpen, setMiniMapOpen] = useState(true)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [activeDrop, setActiveDrop] = useState<DropTarget | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const notify = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => {
      noticeTimerRef.current = null
      setNotice(null)
    }, 4000)
  }, [])
  useEffect(
    () => () => {
      if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current)
    },
    [],
  )
  // Track live on-canvas block sizes so link anchors re-route the same commit
  // a block's content wraps or resizes (text blocks use `width: max-content`).
  // offsetWidth/offsetHeight are world units (unaffected by canvas zoom).
  useEffect(() => {
    const root = containerRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const apply = (el: HTMLElement) => {
      const id = el.getAttribute('data-block-id')
      if (!id) return
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w <= 0 || h <= 0) return
      setMeasuredSizes((prev) => {
        const cur = prev.get(id)
        if (cur && cur.width === w && cur.height === h) return prev
        const next = new Map(prev)
        next.set(id, { width: w, height: h })
        return next
      })
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.target as HTMLElement)
    })
    const observeAll = () => {
      root.querySelectorAll<HTMLElement>('[data-block-id]').forEach((el) => {
        ro.observe(el)
        apply(el)
      })
    }
    observeAll()
    const mo = new MutationObserver(observeAll)
    mo.observe(root, { childList: true, subtree: true })
    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [containerRef])
  const forcePan = tool === 'hand' || spaceHeld
  const { runRecorded, undo, redo } = useUndoRedo()

  const typesById = useMemo(
    () => new Map(types.map((t) => [t.id, t])),
    [types],
  )

  const [schemaCreatorOpen, setSchemaCreatorOpen] = useState(false)
  const [schemaToEdit, setSchemaToEdit] = useState<SchemaDef | null>(null)

  const handleOpenSchemaCreator = useCallback((schema?: SchemaDef) => {
    setSchemaToEdit(schema ?? null)
    setSchemaCreatorOpen(true)
  }, [])

  const handleCloseSchemaCreator = useCallback(() => {
    setSchemaCreatorOpen(false)
    setSchemaToEdit(null)
  }, [])

  const handleSaveSchema = useCallback(
    (schema: SchemaDef) => {
      const existing = types.find((t) => t.id === schema.id)
      if (existing) {
        runRecorded(
          `Update type ${schema.name}`,
          () => {
            collections.typesCollection.update(schema.id, (draft) => {
              draft.name = schema.name
              draft.fields = schema.fields
              draft.defaultView = schema.defaultView
            })
          },
          () => {
            collections.typesCollection.update(schema.id, (draft) => {
              draft.name = existing.name
              draft.fields = existing.fields
              draft.defaultView = existing.defaultView
            })
          },
          () => {
            collections.typesCollection.update(schema.id, (draft) => {
              draft.name = schema.name
              draft.fields = schema.fields
              draft.defaultView = schema.defaultView
            })
          },
        )
      } else {
        runRecorded(
          `Create type ${schema.name}`,
          () => {
            collections.typesCollection.insert(schema)
          },
          () => {
            collections.typesCollection.delete(schema.id)
          },
          () => {
            collections.typesCollection.insert(schema)
          },
        )
      }
    },
    [collections, runRecorded, types],
  )

  const handleDeleteType = useCallback(
    (typeId: string) => {
      const target = types.find((t) => t.id === typeId)
      if (!target) return
      runRecorded(
        `Delete type ${target.name}`,
        () => {
          collections.typesCollection.delete(typeId)
        },
        () => {
          collections.typesCollection.insert(target)
        },
        () => {
          collections.typesCollection.delete(typeId)
        },
      )
    },
    [collections, runRecorded, types],
  )



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

  // Prune measured sizes for deleted blocks so the cache doesn't grow.
  useEffect(() => {
    setMeasuredSizes((prev) => {
      if (prev.size === 0) return prev
      let changed = false
      const next = new Map(prev)
      for (const id of prev.keys()) {
        if (!byId.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [byId])

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

  const onSelectLink = useCallback((id: string | null) => {
    setSelectedLinkId(id)
    if (id) setSelectedIds(new Set())
  }, [])

  const selectOnly = useCallback((id: string) => {
    setSelectedLinkId(null)
    setSelectedIds(new Set([id]))
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelectedLinkId(null)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Reveal the selected element on the canvas: if a single placed block is
  // selected and it sits outside the visible area (so it would otherwise be
  // culled and give no reaction), pan the board to bring it into view.
  useEffect(() => {
    if (selectedIds.size !== 1 || !visibleRect || width <= 0 || height <= 0) return
    const id = Array.from(selectedIds)[0]
    const placement = placements.find((p) => p.blockId === id)
    const block = byId.get(id)
    if (!placement || !block) return
    const size = sizeForBlock(block.kind)
    const rect = rectFromWorldPoint(
      { x: placement.positionX, y: placement.positionY },
      size.width,
      size.height,
    )
    if (rectsOverlap(visibleRect, rect)) return
    const cx = rect.minX + size.width / 2
    const cy = rect.minY + size.height / 2
    setViewport({
      scale: viewport.scale,
      offset: {
        x: width / 2 - cx * viewport.scale,
        y: height / 2 - cy * viewport.scale,
      },
    })
  }, [
    selectedIds,
    placements,
    byId,
    visibleRect,
    viewport.scale,
    width,
    height,
    setViewport,
  ])

  const viewCenter = useCallback((): Vec => {
    if (width <= 0 || height <= 0) {
      return screenToWorld(viewport, { x: 80, y: 80 })
    }
    return screenToWorld(viewport, { x: width / 2, y: height / 2 })
  }, [height, viewport, width])

  const handleCreateInstance = useCallback(
    (schemaId: string) => {
      const typeDef = types.find((t) => t.id === schemaId)
      if (!typeDef) return
      const blockId = crypto.randomUUID()
      const center = viewCenter()
      const size = sizeForBlock(schemaId)
      const newBlock: ObservableBlock = {
        id: blockId,
        kind: schemaId,
        data: {
          kind: schemaId,
          schemaId,
          values: {},
        },
        schemaVersion: '1',
      }
      const newPlacement: ObservablePlacement = {
        blockId,
        positionX: Math.round(center.x - size.width / 2),
        positionY: Math.round(center.y - size.height / 2),
      }

      runRecorded(
        `Add ${typeDef.name}`,
        () => {
          const tx = collections.blocksCollection.insert(newBlock)
          void tx.isPersisted.promise.then(() => {
            collections.placementsCollection.insert(newPlacement)
          })
        },
        () => {
          collections.placementsCollection.delete(blockId)
          collections.blocksCollection.delete(blockId)
        },
        () => {
          const tx = collections.blocksCollection.insert(newBlock)
          void tx.isPersisted.promise.then(() => {
            collections.placementsCollection.insert(newPlacement)
          })
        },
      )
      setTool('move')
      setSelectedIds(new Set([blockId]))
    },
    [collections, runRecorded, types, viewCenter],
  )

  const handleUpdateObjectValues = useCallback(
    (blockId: string, values: Record<string, FieldValue>) => {
      const block = byId.get(blockId)
      if (!block) return
      const prevData = block.data as ObjectBlockData
      const nextData: ObjectBlockData = {
        ...prevData,
        values,
      }

      runRecorded(
        'Edit field values',
        () => {
          updateBlockData(collections, blockId, nextData)
        },
        () => {
          updateBlockData(collections, blockId, prevData)
        },
        () => {
          updateBlockData(collections, blockId, nextData)
        },
      )
    },
    [byId, collections, runRecorded],
  )



  // M10 — relative group drag: when the dragged block belongs to a
  // multi-selection, every selected placement follows by the same world delta
  // (computed against committed placements so it never accumulates).
  const handleDragMove = useCallback(
    (blockId: string, pos: Vec) => {
      const base = placements.find((p) => p.blockId === blockId)
      if (!base) {
        setLivePositions((prev) => {
          const next = new Map(prev)
          next.set(blockId, pos)
          return next
        })
        return
      }
      const dx = pos.x - base.positionX
      const dy = pos.y - base.positionY
      const group =
        selectedIds.has(blockId) && selectedIds.size > 1
          ? Array.from(selectedIds)
          : [blockId]
      setLivePositions((prev) => {
        const next = new Map(prev)
        for (const id of group) {
          const b = placements.find((p) => p.blockId === id)
          if (!b) continue
          next.set(id, { x: b.positionX + dx, y: b.positionY + dy })
        }
        return next
      })
    },
    [placements, selectedIds],
  )

  const getBlockRect = useCallback(
    (blockId: string): Rect | null => {
      const live = livePositions.get(blockId)
      const placement = placements.find((p) => p.blockId === blockId)
      if (!live && !placement) return null
      const block = byId.get(blockId)
      const kind = block?.kind ?? ''
      const size = sizeForBlock(kind)
      const x = live ? live.x : placement!.positionX
      const y = live ? live.y : placement!.positionY
      // Prefer the ResizeObserver-measured size (tracks max-content text
      // blocks as they wrap/resize); fall back to a sync DOM read on first
      // paint before the observer fires, then to fixed sizes when unmounted.
      const measured = measuredSizes.get(blockId)
      let width = measured?.width ?? size.width
      let height = measured?.height ?? size.height
      if (!measured && typeof document !== 'undefined') {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          width = el.offsetWidth
          height = el.offsetHeight
        }
      }
      return { x, y, width, height }
    },
    [byId, livePositions, measuredSizes, placements],
  )

  const handleCreateLink = useCallback(
    (blockAId: string, blockBId: string) => {
      if (blockAId === blockBId) return
      const exists = links.some(
        (l) =>
          (l.blockAId === blockAId && l.blockBId === blockBId) ||
          (l.blockAId === blockBId && l.blockBId === blockAId),
      )
      if (exists) return

      const id = crypto.randomUUID()
      const link: ObservableLink = {
        id,
        blockAId,
        blockBId,
        createdAt: new Date(),
      }

      runRecorded(
        'Connect blocks',
        () => {
          collections.linksCollection.insert(link)
        },
        () => {
          collections.linksCollection.delete(id)
        },
        () => {
          collections.linksCollection.insert(link)
        },
      )
      setSelectedLinkId(id)
      setSelectedIds(new Set())
    },
    [collections, links, runRecorded],
  )

  const handleDeleteLink = useCallback(
    (linkId: string) => {
      const target = links.find((l) => l.id === linkId)
      if (!target) return
      runRecorded(
        'Delete connection',
        () => {
          collections.linksCollection.delete(linkId)
        },
        () => {
          collections.linksCollection.insert(target)
        },
        () => {
          collections.linksCollection.delete(linkId)
        },
      )
      setSelectedLinkId((prev) => (prev === linkId ? null : prev))
    },
    [collections, links, runRecorded],
  )

  const handleConnectClick = useCallback(
    (blockId: string) => {
      if (!draftLink) {
        const rect = getBlockRect(blockId)
        const center = rect
          ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
          : viewCenter()
        setDraftLink({ fromBlockId: blockId, currentPos: center })
      } else {
        if (draftLink.fromBlockId !== blockId) {
          handleCreateLink(draftLink.fromBlockId, blockId)
        }
        setDraftLink(null)
      }
    },
    [draftLink, getBlockRect, handleCreateLink, viewCenter],
  )

  const handleStartConnect = useCallback(
    (blockId: string, _side: PortSide, screenPos: Vec) => {
      const rect = containerRef.current?.getBoundingClientRect()
      const worldPos = rect
        ? screenToWorld(viewport, { x: screenPos.x - rect.left, y: screenPos.y - rect.top })
        : viewCenter()
      setDraftLink({ fromBlockId: blockId, currentPos: worldPos })
    },
    [containerRef, viewCenter, viewport],
  )

  useEffect(() => {
    if (!draftLink) return

    const onPointerMove = (e: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const worldPos = screenToWorld(viewport, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
      setDraftLink((prev) => (prev ? { ...prev, currentPos: worldPos } : null))
    }

    const onPointerUp = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest?.('[data-block-id]')
      const targetId = target?.getAttribute('data-block-id')
      if (targetId && targetId !== draftLink.fromBlockId) {
        handleCreateLink(draftLink.fromBlockId, targetId)
        setDraftLink(null)
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [containerRef, draftLink, handleCreateLink, viewport])

  const selectedLink = useMemo(() => {
    if (!selectedLinkId) return null
    const link = links.find((l) => l.id === selectedLinkId)
    if (!link) return null
    return {
      link,
      blockA: byId.get(link.blockAId),
      blockB: byId.get(link.blockBId),
    }
  }, [byId, links, selectedLinkId])

  // M10 — group drag commit: all selected placements move together in a
  // single batched undo/redo action. Members without a placement (selected
  // from the dock but never placed) are skipped.
  const handleDragEnd = (blockId: string, position: Vec) => {
    const group =
      selectedIds.has(blockId) && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [blockId]
    setLivePositions((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const id of group) {
        if (next.delete(id)) changed = true
      }
      return changed ? next : prev
    })

    const base = placements.find((p) => p.blockId === blockId)
    if (!base) {
      const placement = {
        blockId,
        positionX: position.x,
        positionY: position.y,
      }
      runRecorded(
        'Place block',
        () => void collections.placementsCollection.insert(placement),
        () => void collections.placementsCollection.delete(blockId),
        () => void collections.placementsCollection.insert(placement),
      )
      return
    }

    const dx = position.x - base.positionX
    const dy = position.y - base.positionY
    if (dx === 0 && dy === 0) return

    const moves: {
      id: string
      prevX: number
      prevY: number
      nextX: number
      nextY: number
    }[] = []
    for (const id of group) {
      const p = placements.find((pl) => pl.blockId === id)
      if (!p) continue
      moves.push({
        id,
        prevX: p.positionX,
        prevY: p.positionY,
        nextX: Math.round(p.positionX + dx),
        nextY: Math.round(p.positionY + dy),
      })
    }
    if (moves.length === 0) return
    if (moves.every((m) => m.prevX === m.nextX && m.prevY === m.nextY)) return

    const label = moves.length === 1 ? 'Move block' : `Move ${moves.length} blocks`
    runRecorded(
      label,
      () => {
        for (const m of moves) {
          collections.placementsCollection.update(m.id, (draft) => {
            draft.positionX = m.nextX
            draft.positionY = m.nextY
          })
        }
      },
      () => {
        for (const m of moves) {
          collections.placementsCollection.update(m.id, (draft) => {
            draft.positionX = m.prevX
            draft.positionY = m.prevY
          })
        }
      },
      () => {
        for (const m of moves) {
          collections.placementsCollection.update(m.id, (draft) => {
            draft.positionX = m.nextX
            draft.positionY = m.nextY
          })
        }
      },
    )
  }

  const handleUpdatePosition = (blockId: string, x: number, y: number) => {
    const existing = placements.find((p) => p.blockId === blockId)
    if (!existing) return
    const prevX = existing.positionX
    const prevY = existing.positionY
    runRecorded(
      'Set position',
      () => void updatePlacement(collections, blockId, x, y),
      () => void updatePlacement(collections, blockId, prevX, prevY),
      () => void updatePlacement(collections, blockId, x, y),
    )
  }

  // M10 — alignment & distribution for the current multi-selection, each as a
  // single batched undo/redo action. No-ops (fewer than 2 placed blocks, or
  // nothing would move) record nothing.
  const selectedRects = useCallback(() => {
    const rects: SizedRect[] = []
    for (const id of selectedIds) {
      const rect = getBlockRect(id)
      if (rect) rects.push({ id, ...rect })
    }
    return rects
  }, [getBlockRect, selectedIds])

  const commitMoveTargets = useCallback(
    (label: string, targets: { id: string; x: number; y: number }[]) => {
      const moves: { id: string; prevX: number; prevY: number; nextX: number; nextY: number }[] = []
      for (const t of targets) {
        const p = placements.find((pl) => pl.blockId === t.id)
        if (!p) continue
        if (p.positionX === t.x && p.positionY === t.y) continue
        moves.push({ id: t.id, prevX: p.positionX, prevY: p.positionY, nextX: t.x, nextY: t.y })
      }
      if (moves.length === 0) return
      runRecorded(
        label,
        () => {
          for (const m of moves) {
            collections.placementsCollection.update(m.id, (draft) => {
              draft.positionX = m.nextX
              draft.positionY = m.nextY
            })
          }
        },
        () => {
          for (const m of moves) {
            collections.placementsCollection.update(m.id, (draft) => {
              draft.positionX = m.prevX
              draft.positionY = m.prevY
            })
          }
        },
        () => {
          for (const m of moves) {
            collections.placementsCollection.update(m.id, (draft) => {
              draft.positionX = m.nextX
              draft.positionY = m.nextY
            })
          }
        },
      )
    },
    [collections, placements, runRecorded],
  )

  const handleAlignSelected = useCallback(
    (mode: AlignMode) => {
      const rects = selectedRects()
      if (rects.length < 2) return
      commitMoveTargets(`Align ${mode}`, alignTargets(rects, mode))
    },
    [commitMoveTargets, selectedRects],
  )

  const handleDistributeSelected = useCallback(
    (axis: DistributeAxis) => {
      const rects = selectedRects()
      if (rects.length < 3) return
      commitMoveTargets(
        axis === 'x' ? 'Distribute horizontally' : 'Distribute vertically',
        distributeTargets(rects, axis),
      )
    },
    [commitMoveTargets, selectedRects],
  )

  // M11 — full-board export / import / PNG snapshot.
  //
  // Import replaces the whole board so a file round-trips the exact state;
  // the previous board is captured for a one-step undo. The wipe set is read
  // from a ref at call time (not from the record-time closure) so undo/redo
  // always remove what is actually on the board when they run.
  const liveRowsRef = useRef({ blocks, placements, memberships, links, types, views })
  liveRowsRef.current = { blocks, placements, memberships, links, types, views }

  const replaceAllRows = useCallback(
    async (rows: BoardExport) => {
      const c = collections
      const current = liveRowsRef.current
      const wipeTxs = [
        ...current.links.map((l) => c.linksCollection.delete(l.id)),
        ...current.memberships.map((m) => c.membershipsCollection.delete(m.id)),
        ...current.placements.map((p) => c.placementsCollection.delete(p.blockId)),
        ...current.blocks.map((b) => c.blocksCollection.delete(b.id)),
        ...current.types.map((t) => c.typesCollection.delete(t.id)),
        ...current.views.map((v) => c.viewsCollection.delete(v.id)),
      ]
      await Promise.all(wipeTxs.map((t) => t.isPersisted.promise))
      // Parents before children: placements/memberships/links carry FKs to blocks.
      const parentTxs = [
        ...rows.blocks.map((b) => c.blocksCollection.insert(stripRowDates(b))),
        ...rows.types.map((t) => c.typesCollection.insert(stripRowDates(t))),
        ...rows.views.map((v) => c.viewsCollection.insert(stripRowDates(v))),
      ]
      await Promise.all(parentTxs.map((t) => t.isPersisted.promise))
      for (const p of rows.placements) {
        c.placementsCollection.insert({
          blockId: p.blockId,
          positionX: p.positionX,
          positionY: p.positionY,
        })
      }
      for (const m of rows.memberships) c.membershipsCollection.insert(stripRowDates(m))
      for (const l of rows.links) c.linksCollection.insert(stripRowDates(l))
    },
    [collections],
  )

  const handleExportJson = useCallback(() => {
    const payload = buildBoardExport({
      blocks: [...blocks],
      placements: [...placements],
      memberships: [...memberships],
      links: [...links],
      types: [...types],
      views: [...views],
    })
    downloadJson(exportFilename(), payload)
    notify(
      `Exported ${blocks.length} blocks, ${placements.length} placed, ${links.length} links.`,
    )
  }, [blocks, links, memberships, notify, placements, types, views])

  const handleImportBoardFile = useCallback(
    (file: File) => {
      void (async () => {
        let data: BoardExport
        try {
          const parsed = parseBoardExport(JSON.parse(await file.text()))
          if (!parsed.ok) {
            notify(`Import failed: ${parsed.error}`)
            return
          }
          data = parsed.data
        } catch {
          notify('Import failed: that file is not valid board JSON.')
          return
        }
        const prev = liveRowsRef.current
        const prevSnapshot: BoardExport = {
          app: 'kho-ja.board',
          version: 1,
          exportedAt: new Date().toISOString(),
          blocks: structuredClone(prev.blocks),
          placements: structuredClone(prev.placements),
          memberships: structuredClone(prev.memberships),
          links: structuredClone(prev.links),
          types: structuredClone(prev.types),
          views: structuredClone(prev.views),
        }
        runRecorded(
          `Import board (${data.blocks.length} blocks)`,
          () => void replaceAllRows(data),
          () => void replaceAllRows(prevSnapshot),
          () => void replaceAllRows(data),
        )
        setSelectedIds(new Set())
        setSelectedLinkId(null)
        notify(`Imported ${data.blocks.length} blocks, ${data.placements.length} placed.`)
      })()
    },
    [notify, replaceAllRows, runRecorded],
  )

  const handleExportPng = useCallback(() => {
    void (async () => {
      const pngBlocks: PngBlockInput[] = []
      for (const p of placements) {
        const rect = getBlockRect(p.blockId)
        const block = byId.get(p.blockId)
        if (!rect || !block) continue
        const data = block.data
        if (block.kind === 'text') {
          const text = data as TextBlockData
          pngBlocks.push({ rect, kind: 'text', title: '', body: text.markdown.split('\n') })
        } else if (block.kind === 'file') {
          const file = data as FileBlockData
          pngBlocks.push({
            rect,
            kind: 'file',
            title: file.name,
            subtitle: `${formatBytes(file.size)}${file.mimeType ? ` · ${file.mimeType}` : ''}`,
          })
        } else if (block.kind === 'file-group') {
          const group = data as FileGroupBlockData
          const members = membersByGroup.get(block.id) ?? []
          pngBlocks.push({
            rect,
            kind: 'file-group',
            title: group.name,
            subtitle: `${members.length} ${members.length === 1 ? 'file' : 'files'}`,
            body: members.map((m) => blockTitle(m, types)),
          })
        } else {
          const values = (data as ObjectBlockData).values ?? {}
          pngBlocks.push({
            rect,
            kind: block.kind,
            title: blockTitle(block, types),
            body: Object.entries(values).map(([k, v]) =>
              v === null || v === undefined ? `${k}: —` : `${k}: ${String(v)}`,
            ),
          })
        }
      }
      if (pngBlocks.length === 0) {
        notify('Nothing to export: the board is empty.')
        return
      }
      const pngLinks: PngLinkCurve[] = []
      for (const l of links) {
        const ra = getBlockRect(l.blockAId)
        const rb = getBlockRect(l.blockBId)
        if (!ra || !rb) continue
        const { start, end } = computeBestAnchorPair(ra, rb)
        pngLinks.push({
          d: createBezierPath(start, end),
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
        })
      }
      const bounds = {
        minX: Math.min(...pngBlocks.map((b) => b.rect.x)),
        minY: Math.min(...pngBlocks.map((b) => b.rect.y)),
        maxX: Math.max(...pngBlocks.map((b) => b.rect.x + b.rect.width)),
        maxY: Math.max(...pngBlocks.map((b) => b.rect.y + b.rect.height)),
      }
      try {
        const blob = await renderBoardPng(pngBlocks, pngLinks, bounds)
        downloadBlob(blob, pngFilename())
        notify(`Exported PNG (${pngBlocks.length} blocks).`)
      } catch (e) {
        notify(`PNG export failed: ${e instanceof Error ? e.message : 'unknown error'}`)
      }
    })()
  }, [byId, getBlockRect, links, membersByGroup, notify, placements, types])

  const commitText = (blockId: string, markdown: string) => {
    const block = blocks.find((b) => b.id === blockId)
    const prev = block?.data
    runRecorded(
      'Edit text',
      () => {
        collections.blocksCollection.update(blockId, (draft) => {
          draft.data = { kind: 'text', markdown } satisfies TextBlockData
        })
      },
      () => {
        if (prev) {
          collections.blocksCollection.update(blockId, (draft) => {
            draft.data = prev
          })
        }
      },
      () => {
        collections.blocksCollection.update(blockId, (draft) => {
          draft.data = { kind: 'text', markdown } satisfies TextBlockData
        })
      },
    )
  }

  const addTextAt = useCallback(
    async (world: Vec, initialText = DEFAULT_TEXT) => {
      const id = crypto.randomUUID()
      const block = {
        id,
        kind: 'text',
        data: { kind: 'text', markdown: initialText } satisfies TextBlockData,
        schemaVersion: '1',
      }
      const placement = {
        blockId: id,
        positionX: Math.round(world.x - BLOCK_WIDTH / 2),
        positionY: Math.round(world.y - BLOCK_HEIGHT / 2),
      }
      runRecorded(
        'Add text',
        () => {
          const tx = collections.blocksCollection.insert(block)
          void tx.isPersisted.promise.then(() => {
            collections.placementsCollection.insert(placement)
          })
        },
        () => {
          collections.placementsCollection.delete(id)
          collections.blocksCollection.delete(id)
        },
        () => {
          const tx = collections.blocksCollection.insert(block)
          void tx.isPersisted.promise.then(() => {
            collections.placementsCollection.insert(placement)
          })
        },
      )
      setSelectedIds(new Set([id]))
    },
    [collections, runRecorded],
  )

  const placeBlockAt = useCallback(
    (blockId: string, world: Vec) => {
      const existing = placements.find((p) => p.blockId === blockId)
      if (existing) return
      const size = sizeForBlock(byId.get(blockId)?.kind ?? '')
      const placement = {
        blockId,
        positionX: Math.round(world.x - size.width / 2),
        positionY: Math.round(world.y - size.height / 2),
      }
      runRecorded(
        'Place block',
        () => void collections.placementsCollection.insert(placement),
        () => void collections.placementsCollection.delete(blockId),
        () => void collections.placementsCollection.insert(placement),
      )
      setSelectedIds(new Set([blockId]))
      setTool('move')
    },
    [byId, collections, placements, runRecorded],
  )

  const handlePlaceAsset = useCallback(
    (blockId: string) => {
      placeBlockAt(blockId, viewCenter())
    },
    [placeBlockAt, viewCenter],
  )

  // Cascade-import dropped/picked files as `file` blocks (metadata only), each
  // auto-placed on a GRID_SPACING grid anchored at `anchor`. Anchor for drops
  // is the drop point; for the picker button it is the m2 (80, 80) screen point.
  // Each file's placement is inserted only after its block row has committed
  // (await) so the placements FK never races the blocks write.
  const importFiles = useCallback(
    async (files: File[], anchor: Vec, intoGroup?: string | null) => {
      let firstId: string | null = null
      type FileBlockRow = ReturnType<typeof makeFileBlock> & {
        id: string
        schemaVersion: string
      }
      const createdBlocks: { block: FileBlockRow; placement: ObservablePlacement }[] =
        []
      const createdMemberships: ObservableMembership[] = []
      const already = new Set(
        memberships.filter((m) => m.groupId === intoGroup).map((m) => m.memberId),
      )

      const apply = async () => {
        for (let index = 0; index < files.length; index++) {
          const id = crypto.randomUUID()
          const col = index % 5
          const row = Math.floor(index / 5)
          const block = {
            id,
            ...makeFileBlock(files[index]),
            schemaVersion: '1',
          }
          const placement = {
            blockId: id,
            positionX: Math.round(
              anchor.x - BLOCK_WIDTH / 2 + col * GRID_SPACING,
            ),
            positionY: Math.round(
              anchor.y - BLOCK_HEIGHT / 2 + row * GRID_SPACING,
            ),
          }
          createdBlocks.push({ block, placement })
          const tx = collections.blocksCollection.insert(block)
          await tx.isPersisted.promise
          collections.placementsCollection.insert(placement)
          if (firstId === null) firstId = id
        }
        if (intoGroup) {
          for (const { block } of createdBlocks) {
            if (already.has(block.id)) continue
            already.add(block.id)
            const membership = {
              id: crypto.randomUUID(),
              groupId: intoGroup,
              memberId: block.id,
            }
            createdMemberships.push(membership)
            collections.membershipsCollection.insert(membership)
          }
        }
      }

      runRecorded(
        intoGroup ? 'Add files to group' : 'Import files',
        () => void apply(),
        () => {
          for (const m of createdMemberships) {
            collections.membershipsCollection.delete(m.id)
          }
          for (const { block } of createdBlocks) {
            collections.placementsCollection.delete(block.id)
            collections.blocksCollection.delete(block.id)
          }
        },
        () => void apply(),
      )

      if (!intoGroup && firstId !== null) {
        setSelectedIds(new Set([firstId]))
      }
    },
    [collections, memberships, runRecorded],
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
    const origin = viewCenter()
    const block = {
      id,
      kind: 'file-group',
      data: {
        kind: 'file-group',
        name: 'File Group',
        currentView: 'card',
      } satisfies FileGroupBlockData,
      schemaVersion: '1',
    }
    const placement: ObservablePlacement = {
      blockId: id,
      positionX: Math.round(origin.x - GROUP_WIDTH / 2),
      positionY: Math.round(origin.y - GROUP_HEIGHT / 2),
    }
    runRecorded(
      'Create group',
      () => {
        const tx = collections.blocksCollection.insert(block)
        void tx.isPersisted.promise.then(() => {
          collections.placementsCollection.insert(placement)
        })
      },
      () => {
        collections.placementsCollection.delete(id)
        collections.blocksCollection.delete(id)
      },
      () => {
        const tx = collections.blocksCollection.insert(block)
        void tx.isPersisted.promise.then(() => {
          collections.placementsCollection.insert(placement)
        })
      },
    )
    setTool('move')
    setSelectedIds(new Set([id]))
  }, [collections, viewCenter, runRecorded])

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

  const findGroupAt = useCallback(
    (world: Vec, excludeBlockId: string): ObservableBlock | null => {
      for (const { block, placement } of placedBlocks) {
        if (block.id === excludeBlockId) continue
        if (block.kind !== 'file-group') continue
        const { width: w, height: h } = sizeForBlock(block.kind)
        if (
          world.x >= placement.positionX &&
          world.x <= placement.positionX + w &&
          world.y >= placement.positionY &&
          world.y <= placement.positionY + h
        ) {
          return block
        }
      }
      return null
    },
    [placedBlocks],
  )

  const computeDropTarget = useCallback(
    (world: Vec, _client: Vec, blockId: string): DropTarget | null => {
      const block = byId.get(blockId)
      if (!block || block.kind !== 'file') return null
      const group = findGroupAt(world, blockId)
      return group ? { type: 'group', groupId: group.id } : null
    },
    [byId, findGroupAt],
  )

  const onDropTargetChange = useCallback((target: DropTarget | null) => {
    setActiveDrop(target)
  }, [])

  const handleDropBlockOnGroup = useCallback(
    (groupId: string, blockId: string, client: Vec) => {
      const block = byId.get(blockId)
      if (!block || block.kind !== 'file') return
      const group = byId.get(groupId)
      if (!group || group.kind !== 'file-group') return

      const existingPlacement = placements.find((p) => p.blockId === blockId)
      const existingMembership = memberships.find(
        (m) => m.groupId === groupId && m.memberId === blockId,
      )
      const membership: ObservableMembership = {
        id: crypto.randomUUID(),
        groupId,
        memberId: blockId,
      }

      const rect = containerRef.current?.getBoundingClientRect()
      const world =
        rect && rect.width > 0 && rect.height > 0
          ? screenToWorld(viewport, { x: client.x - rect.left, y: client.y - rect.top })
          : viewCenter()

      // A pointer drag may have left live positions behind for the whole
      // selection; the drop supersedes them.
      setLivePositions(new Map())
      runRecorded(
        'Add to group',
        () => {
          if (!existingMembership) {
            collections.membershipsCollection.insert(membership)
          }
          if (!existingPlacement) {
            const size = sizeForBlock(block.kind)
            collections.placementsCollection.insert({
              blockId,
              positionX: Math.round(world.x - size.width / 2),
              positionY: Math.round(world.y - size.height / 2),
            })
          }
        },
        () => {
          if (!existingMembership) {
            collections.membershipsCollection.delete(membership.id)
          }
          if (!existingPlacement) {
            collections.placementsCollection.delete(blockId)
          }
        },
        () => {
          if (!existingMembership) {
            collections.membershipsCollection.insert(membership)
          }
          if (!existingPlacement) {
            const size = sizeForBlock(block.kind)
            collections.placementsCollection.insert({
              blockId,
              positionX: Math.round(world.x - size.width / 2),
              positionY: Math.round(world.y - size.height / 2),
            })
          }
        },
      )
    },
    [byId, collections, containerRef, memberships, placements, runRecorded, viewCenter, viewport],
  )

  const handleRemoveFromGroup = useCallback(
    (groupId: string, memberId: string, world: Vec) => {
      const membership = memberships.find(
        (m) => m.groupId === groupId && m.memberId === memberId,
      )
      if (!membership) return
      const block = byId.get(memberId)
      const existing = placements.find((p) => p.blockId === memberId)
      const size = block ? sizeForBlock(block.kind) : { width: 220, height: 80 }
      const newPlacement: ObservablePlacement = {
        blockId: memberId,
        positionX: Math.round(world.x - size.width / 2),
        positionY: Math.round(world.y - size.height / 2),
      }

      runRecorded(
        'Extract from group',
        () => {
          collections.membershipsCollection.delete(membership.id)
          if (existing) {
            updatePlacement(collections, memberId, newPlacement.positionX, newPlacement.positionY)
          } else {
            collections.placementsCollection.insert(newPlacement)
          }
        },
        () => {
          collections.membershipsCollection.insert(membership)
          if (existing) {
            updatePlacement(collections, memberId, existing.positionX, existing.positionY)
          } else {
            collections.placementsCollection.delete(memberId)
          }
        },
        () => {
          collections.membershipsCollection.delete(membership.id)
          if (existing) {
            updatePlacement(collections, memberId, newPlacement.positionX, newPlacement.positionY)
          } else {
            collections.placementsCollection.insert(newPlacement)
          }
        },
      )
      setSelectedIds(new Set([memberId]))
    },
    [byId, collections, memberships, placements, runRecorded],
  )

  const handleGroupViewChange = useCallback(
    (blockId: string, view: 'card' | 'list') => {
      const block = blocks.find((b) => b.id === blockId)
      if (!block) return
      const prevData = block.data
      const nextData: FileGroupBlockData = {
        kind: 'file-group',
        name: (prevData as FileGroupBlockData).name,
        currentView: view,
      }
      runRecorded(
        'Change view',
        () => void updateBlockData(collections, blockId, nextData),
        () => void updateBlockData(collections, blockId, prevData as FileGroupBlockData),
        () => void updateBlockData(collections, blockId, nextData),
      )
    },
    [blocks, collections, runRecorded],
  )

  const handleRenameGroup = useCallback(
    (blockId: string, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const block = blocks.find((b) => b.id === blockId)
      if (!block) return
      const prevData = block.data
      const prev = prevData as FileGroupBlockData
      const nextData: FileGroupBlockData = {
        kind: 'file-group',
        name: trimmed,
        currentView: prev.currentView,
      }
      runRecorded(
        'Rename group',
        () => void updateBlockData(collections, blockId, nextData),
        () => void updateBlockData(collections, blockId, prevData as FileGroupBlockData),
        () => void updateBlockData(collections, blockId, nextData),
      )
    },
    [blocks, collections, runRecorded],
  )

  const handleUnplaceBlocks = useCallback(
    (blockIds: Iterable<string>) => {
      const ids = Array.from(blockIds)
      const toUnplace: ObservablePlacement[] = []
      for (const id of ids) {
        const existing = placements.find((p) => p.blockId === id)
        if (existing) {
          toUnplace.push({
            blockId: existing.blockId,
            positionX: existing.positionX,
            positionY: existing.positionY,
          })
        }
      }
      if (toUnplace.length === 0) return
      const label =
        toUnplace.length === 1 ? 'Remove from board' : `Remove ${toUnplace.length} blocks`
      runRecorded(
        label,
        () => {
          for (const p of toUnplace) {
            collections.placementsCollection.delete(p.blockId)
          }
        },
        () => {
          for (const p of toUnplace) {
            collections.placementsCollection.insert(p)
          }
        },
        () => {
          for (const p of toUnplace) {
            collections.placementsCollection.delete(p.blockId)
          }
        },
      )
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const p of toUnplace) next.delete(p.blockId)
        return next
      })
    },
    [collections, placements, runRecorded],
  )

  const handleUnplace = useCallback(
    (blockId: string) => {
      handleUnplaceBlocks([blockId])
    },
    [handleUnplaceBlocks],
  )

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      const groupMemberships = memberships.filter((m) => m.groupId === groupId)
      const groupPlacement = placements.find((p) => p.blockId === groupId)
      runRecorded(
        'Delete group',
        () => {
          for (const m of groupMemberships) {
            collections.membershipsCollection.delete(m.id)
          }
          collections.placementsCollection.delete(groupId)
        },
        () => {
          if (groupPlacement) {
            collections.placementsCollection.insert(groupPlacement)
          }
          for (const m of groupMemberships) {
            collections.membershipsCollection.insert(m)
          }
        },
        () => {
          for (const m of groupMemberships) {
            collections.membershipsCollection.delete(m.id)
          }
          collections.placementsCollection.delete(groupId)
        },
      )
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(groupId)
        return next
      })
    },
    [collections, memberships, placements, runRecorded],
  )

  const handleDeleteBlocks = useCallback(
    (blockIds: Iterable<string>) => {
      const ids = Array.from(blockIds)
      const toDeleteBlocks: ObservableBlock[] = []
      const toDeletePlacements: ObservablePlacement[] = []
      const toDeleteMemberships: ObservableMembership[] = []
      const toDeleteLinks: ObservableLink[] = []

      for (const id of ids) {
        const block = byId.get(id)
        if (block) toDeleteBlocks.push(block)

        const placement = placements.find((p) => p.blockId === id)
        if (placement) toDeletePlacements.push(placement)

        for (const m of memberships) {
          if (m.memberId === id || m.groupId === id) {
            if (!toDeleteMemberships.some((existing) => existing.id === m.id)) {
              toDeleteMemberships.push(m)
            }
          }
        }

        for (const l of links) {
          if (l.blockAId === id || l.blockBId === id) {
            if (!toDeleteLinks.some((existing) => existing.id === l.id)) {
              toDeleteLinks.push(l)
            }
          }
        }
      }

      if (toDeleteBlocks.length === 0) return

      const label =
        toDeleteBlocks.length === 1
          ? `Delete ${toDeleteBlocks[0].kind}`
          : `Delete ${toDeleteBlocks.length} assets`

      runRecorded(
        label,
        () => {
          for (const l of toDeleteLinks) {
            collections.linksCollection.delete(l.id)
          }
          for (const m of toDeleteMemberships) {
            collections.membershipsCollection.delete(m.id)
          }
          for (const p of toDeletePlacements) {
            collections.placementsCollection.delete(p.blockId)
          }
          for (const b of toDeleteBlocks) {
            collections.blocksCollection.delete(b.id)
          }
        },
        () => {
          for (const b of toDeleteBlocks) {
            collections.blocksCollection.insert(b)
          }
          for (const p of toDeletePlacements) {
            collections.placementsCollection.insert(p)
          }
          for (const m of toDeleteMemberships) {
            collections.membershipsCollection.insert(m)
          }
          for (const l of toDeleteLinks) {
            collections.linksCollection.insert(l)
          }
        },
        () => {
          for (const l of toDeleteLinks) {
            collections.linksCollection.delete(l.id)
          }
          for (const m of toDeleteMemberships) {
            collections.membershipsCollection.delete(m.id)
          }
          for (const p of toDeletePlacements) {
            collections.placementsCollection.delete(p.blockId)
          }
          for (const b of toDeleteBlocks) {
            collections.blocksCollection.delete(b.id)
          }
        },
      )

      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const b of toDeleteBlocks) next.delete(b.id)
        return next
      })
      if (selectedLinkId && toDeleteLinks.some((l) => l.id === selectedLinkId)) {
        setSelectedLinkId(null)
      }
    },
    [byId, collections, links, memberships, placements, runRecorded, selectedLinkId],
  )

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      handleDeleteBlocks([blockId])
    },
    [handleDeleteBlocks],
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

      const mod = event.metaKey || event.ctrlKey
      if (mod) {
        const key = event.key.toLowerCase()
        if (key === 'z') {
          event.preventDefault()
          if (event.shiftKey) redo()
          else undo()
          return
        }
        if (key === 'y') {
          event.preventDefault()
          redo()
          return
        }
        if (event.altKey) return
      } else if (event.altKey) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        setSpaceHeld(true)
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'v') setTool('move')
      else if (key === 'h') setTool('hand')
      else if (key === 't') setTool('text')
      else if (key === 'c') setTool('link')
      else if (key === 'a') {
        setDockTab((prev) => (prev === 'assets' ? 'layers' : 'assets'))
      } else if (key === 'm') {
        setMiniMapOpen((prev) => !prev)
      } else if (key === 'escape') {
        if (draftLink) {
          setDraftLink(null)
        } else if (selectedLinkId) {
          setSelectedLinkId(null)
        } else {
          setTool('move')
          setSelectedIds(new Set())
        }
      }

      if (key === 'backspace' || key === 'delete') {
        if (selectedLinkId) {
          event.preventDefault()
          handleDeleteLink(selectedLinkId)
        } else if (selectedIds.size > 0) {
          event.preventDefault()
          handleUnplaceBlocks(selectedIds)
        }
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }

    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return
      const clipboardData = event.clipboardData
      if (!clipboardData) return

      if (clipboardData.files && clipboardData.files.length > 0) {
        event.preventDefault()
        const files = Array.from(clipboardData.files)
        const center = viewCenter()
        void importFiles(files, center)
        return
      }

      const text = clipboardData.getData('text/plain')
      if (text && text.trim()) {
        event.preventDefault()
        const center = viewCenter()
        void addTextAt(center, text.trim())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('paste', onPaste)
    }
  }, [undo, redo, selectedIds, handleUnplaceBlocks, importFiles, viewCenter, addTextAt, draftLink, handleDeleteLink, selectedLinkId])

  const onPress = useCallback(
    (world: Vec) => {
      if (tool === 'text') {
        void addTextAt(world)
      }
    },
    [addTextAt, tool],
  )

  // M12 — overview dots share the link layer's live rects, so they track
  // content (and drags) exactly.
  const miniItems = useMemo(
    () =>
      placements.flatMap((p) => {
        const rect = getBlockRect(p.blockId)
        return rect ? [{ id: p.blockId, rect, selected: selectedIds.has(p.blockId) }] : []
      }),
    [getBlockRect, placements, selectedIds],
  )

  // Marquee box-selection: a drag on empty canvas with the Move tool selects
  // every block whose placement rect intersects the dragged rectangle. A click
  // (no drag) reports `null`, which clears the selection.
  const onMarquee = useCallback(
    (world: WorldRect | null) => {
      setSelectedLinkId(null)
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
        onCreateType={() => handleOpenSchemaCreator()}
        onExportJson={handleExportJson}
        onImportBoardFile={handleImportBoardFile}
        onExportPng={handleExportPng}
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
          types={types}
          selectedIds={selectedIds}
          activeTab={dockTab}
          onTabChange={setDockTab}
          onSelect={selectOnly}
          onPlaceAsset={handlePlaceAsset}
          onDeleteAsset={handleDeleteBlock}
          onPickFiles={pickFiles}
          onOpenSchemaCreator={handleOpenSchemaCreator}
          onCreateInstance={handleCreateInstance}
          onDeleteType={handleDeleteType}
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
            onRemoveFromGroup={handleRemoveFromGroup}
          >
            <LinksLayer
              links={links}
              getBlockRect={getBlockRect}
              selectedLinkId={selectedLinkId}
              hoveredLinkId={hoveredLinkId}
              onSelectLink={onSelectLink}
              onHoverLink={setHoveredLinkId}
              draftLink={draftLink}
            />
            {placedBlocks.map(({ placement, block }) => (
              <BlockShell
                key={block.id}
                block={block}
                placement={placement}
                schema={
                  typesById.get(block.kind) ??
                  typesById.get((block.data as ObjectBlockData).schemaId)
                }
                tool={tool}
                isConnecting={draftLink !== null}
                isConnectSource={draftLink?.fromBlockId === block.id}
                onConnectClick={handleConnectClick}
                onStartConnect={handleStartConnect}
                onDragMove={handleDragMove}
                onDragEnd={(position) => handleDragEnd(block.id, position)}
                onDragCancel={() => setLivePositions(new Map())}
                onCommitText={commitText}
                onSelect={selectOnly}
                onToggleSelect={toggleSelect}
                selected={selectedIds.has(block.id)}
                inMultiSelection={selectedIds.size > 1}
                livePosition={livePositions.get(block.id)}
                members={membersByGroup.get(block.id)}
                onGroupViewChange={handleGroupViewChange}
                onMemberClick={selectOnly}
                onDropFilesOnGroup={handleDropFilesOnGroup}
                computeDropTarget={computeDropTarget}
                onDropTargetChange={onDropTargetChange}
                onDropBlockOnGroup={handleDropBlockOnGroup}
                isGroupDropTarget={
                  activeDrop?.type === 'group' && activeDrop.groupId === block.id
                }
                onEditSchema={handleOpenSchemaCreator}
              />
            ))}
          </Canvas>
          {miniMapOpen && (
            <MiniMap
              items={miniItems}
              containerWidth={width}
              containerHeight={height}
              freezeBounds={livePositions.size > 0}
            />
          )}
        </div>
        <Inspector
          selected={selectedBlocks}
          selectedLink={selectedLink}
          onDeleteLink={handleDeleteLink}
          types={types}
          onUpdatePosition={handleUpdatePosition}
          onUnplace={handleUnplace}
          onDeleteGroup={handleDeleteGroup}
          onDeleteBlock={handleDeleteBlock}
          onDeleteBlocks={handleDeleteBlocks}
          onRenameGroup={handleRenameGroup}
          onUpdateObjectValues={handleUpdateObjectValues}
          onEditSchema={handleOpenSchemaCreator}
          membersByGroup={membersByGroup}
          onAlignSelected={handleAlignSelected}
          onDistributeSelected={handleDistributeSelected}
        />
      </div>
      <StatusBar
        viewport={viewport}
        placedCount={placements.length}
        blockCount={blocks.length}
        linksCount={links.length}
        message={notice}
        onZoomIn={() => zoomAtCenter(1.35)}
        onZoomOut={() => zoomAtCenter(1 / 1.35)}
        onReset={() => {
          setViewport(DEFAULT_VIEWPORT)
          setSelectedIds(new Set())
        }}
      />
      <SchemaCreator
        isOpen={schemaCreatorOpen}
        schema={schemaToEdit}
        onClose={handleCloseSchemaCreator}
        onSave={handleSaveSchema}
      />
    </div>
  )
}
