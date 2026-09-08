import { useLiveQuery } from '@tanstack/react-db'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { BlockShell } from '#/components/canvas/BlockShell'
import type {
  ObservableBlock,
  ObservableMembership,
  ObservablePlacement,
} from '#/components/canvas/BlockShell'
import type { DropTarget } from '#/components/canvas/BlockShell'
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
  FileGroupBlockData,
  ObjectBlockData,
  SchemaDef,
  TextBlockData,
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
        types={types}
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
  types: SchemaDef[]
  collections: Collections
}

function Board({ blocks, placements, memberships, unplaced, types, collections }: BoardProps) {
  const { ref: containerRef, width, height } = useElementSize<HTMLDivElement>()
  const { viewport, setViewport } = useViewport()
  const [tool, setTool] = useState<Tool>('move')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [activeDrop, setActiveDrop] = useState<DropTarget | null>(null)
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


  const handleDragEnd = (blockId: string, position: Vec) => {
    const existing = placements.find((p) => p.blockId === blockId)
    if (existing) {
      const prevX = existing.positionX
      const prevY = existing.positionY
      runRecorded(
        'Move block',
        () => {
          collections.placementsCollection.update(blockId, (draft) => {
            draft.positionX = position.x
            draft.positionY = position.y
          })
        },
        () => {
          collections.placementsCollection.update(blockId, (draft) => {
            draft.positionX = prevX
            draft.positionY = prevY
          })
        },
        () => {
          collections.placementsCollection.update(blockId, (draft) => {
            draft.positionX = position.x
            draft.positionY = position.y
          })
        },
      )
    } else {
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
    }
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
      else if (key === 'escape') {
        setTool('move')
        setSelectedIds(new Set())
      }

      if (key === 'backspace' || key === 'delete') {
        if (selectedIds.size > 0) {
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
  }, [undo, redo, selectedIds, handleUnplaceBlocks, importFiles, viewCenter, addTextAt])

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
        onCreateType={() => handleOpenSchemaCreator()}
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
          onSelect={selectOnly}
          onPlaceAsset={handlePlaceAsset}
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
            {placedBlocks.map(({ placement, block }) => (
              <BlockShell
                key={block.id}
                block={block}
                placement={placement}
                schema={
                  typesById.get(block.kind) ??
                  typesById.get((block.data as ObjectBlockData).schemaId)
                }
                onDragEnd={(position) => handleDragEnd(block.id, position)}
                onCommitText={commitText}
                onSelect={selectOnly}
                onToggleSelect={toggleSelect}
                selected={selectedIds.has(block.id)}
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
        </div>
        <Inspector
          selected={selectedBlocks}
          types={types}
          onUpdatePosition={handleUpdatePosition}
          onUnplace={handleUnplace}
          onDeleteGroup={handleDeleteGroup}
          onRenameGroup={handleRenameGroup}
          onUpdateObjectValues={handleUpdateObjectValues}
          onEditSchema={handleOpenSchemaCreator}
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
      <SchemaCreator
        isOpen={schemaCreatorOpen}
        schema={schemaToEdit}
        onClose={handleCloseSchemaCreator}
        onSave={handleSaveSchema}
      />
    </div>
  )
}
