import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

import { getAssetCategory } from '#/lib/assets/categories'
import type { FileBlockData, SchemaDef } from '#/types'
import { FileImport } from './FileImport'
import { blockTitle } from './BlockRenderer'
import type { ObservableBlock, ObservablePlacement } from './BlockShell'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

export type Tab = 'layers' | 'assets' | 'types'

export type AssetSort =
  | 'category'
  | 'name-asc'
  | 'name-desc'
  | 'newest'
  | 'oldest'
  | 'size'

const SORT_OPTIONS: readonly AssetSort[] = [
  'category',
  'name-asc',
  'name-desc',
  'newest',
  'oldest',
  'size',
]

function formatSize(bytes?: number): string | null {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface LeftDockProps {
  placed: { block: ObservableBlock; placement: ObservablePlacement }[]
  unplaced: ObservableBlock[]
  types?: readonly SchemaDef[]
  selectedIds: ReadonlySet<string>
  activeTab?: Tab
  onTabChange?: (tab: Tab) => void
  onSelect: (blockId: string) => void
  onPlaceAsset?: (blockId: string) => void
  onDeleteAsset?: (blockId: string) => void
  onPickFiles?: (files: File[]) => void
  onOpenSchemaCreator?: (schema?: SchemaDef) => void
  onCreateInstance?: (schemaId: string) => void
  onDeleteType?: (schemaId: string) => void
}

export function LeftDock({
  placed,
  unplaced,
  types = [],
  selectedIds,
  activeTab,
  onTabChange,
  onSelect,
  onPlaceAsset,
  onDeleteAsset,
  onPickFiles,
  onOpenSchemaCreator,
  onCreateInstance,
  onDeleteType,
}: LeftDockProps) {
  const [internalTab, setInternalTab] = useState<Tab>('layers')
  const tab = activeTab ?? internalTab
  const setTab = useCallback(
    (nextTab: Tab) => {
      setArmedDeleteId(null)
      if (onTabChange) onTabChange(nextTab)
      else setInternalTab(nextTab)
    },
    [onTabChange],
  )

  const [layersActive, setLayersActive] = useState(0)
  const [assetsActive, setAssetsActive] = useState(0)
  const [assetSort, setAssetSort] = useState<AssetSort>('category')
  // Arm-then-confirm for permanent asset deletion (matches the Inspector —
  // a permanent cascade delete should never happen on a single click/keystroke).
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!armedDeleteId) return
    const timer = setTimeout(() => setArmedDeleteId(null), 3000)
    return () => clearTimeout(timer)
  }, [armedDeleteId])

  const handleAssetsActive = (index: number) => {
    setArmedDeleteId(null)
    setAssetsActive(index)
  }

  const requestDeleteAsset = (blockId: string) => {
    if (!onDeleteAsset) return
    if (armedDeleteId === blockId) {
      onDeleteAsset(blockId)
      setArmedDeleteId(null)
    } else {
      setArmedDeleteId(blockId)
    }
  }

  const cycleSort = () => {
    setAssetSort((current) => {
      const idx = SORT_OPTIONS.indexOf(current)
      const nextIdx = (idx + 1) % SORT_OPTIONS.length
      return SORT_OPTIONS[nextIdx]
    })
  }

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of unplaced) {
      const cat = getAssetCategory(b, types)
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    return counts
  }, [unplaced, types])

  const sortedUnplaced = useMemo(() => {
    const list = [...unplaced]
    return list.sort((a, b) => {
      const titleA = blockTitle(a, types).toLowerCase()
      const titleB = blockTitle(b, types).toLowerCase()
      const catA = getAssetCategory(a, types)
      const catB = getAssetCategory(b, types)

      switch (assetSort) {
        case 'category': {
          if (catA !== catB) return catA.localeCompare(catB)
          return titleA.localeCompare(titleB)
        }
        case 'name-asc':
          return titleA.localeCompare(titleB)
        case 'name-desc':
          return titleB.localeCompare(titleA)
        case 'newest': {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return tB - tA
        }
        case 'oldest': {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return tA - tB
        }
        case 'size': {
          const sizeA =
            a.kind === 'file' ? ((a.data as FileBlockData).size ?? 0) : 0
          const sizeB =
            b.kind === 'file' ? ((b.data as FileBlockData).size ?? 0) : 0
          return sizeB - sizeA
        }
        default:
          return 0
      }
    })
  }, [unplaced, types, assetSort])

  const prevUnplacedCount = useRef(unplaced.length)
  useEffect(() => {
    if (unplaced.length > prevUnplacedCount.current && prevUnplacedCount.current === 0) {
      setTab('assets')
    }
    prevUnplacedCount.current = unplaced.length
  }, [unplaced.length, setTab])

  useEffect(() => {
    setLayersActive((i) =>
      placed.length === 0 ? 0 : Math.min(i, placed.length - 1),
    )
  }, [placed.length])

  useEffect(() => {
    setAssetsActive((i) =>
      sortedUnplaced.length === 0 ? 0 : Math.min(i, sortedUnplaced.length - 1),
    )
  }, [sortedUnplaced.length])

  const tabsRef = useRef<HTMLDivElement>(null)

  return (
    <aside className="left-dock">
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (next) setTab(next as Tab)
        }}
        className="flex h-full flex-col"
      >
        <TabsList
          className="dock-tabs"
          aria-label="Board views"
          ref={tabsRef}
        >
          <TabsTrigger value="layers" id="dock-tab-layers" className="dock-tab">
            Layers
            <span className="dock-count">{placed.length}</span>
          </TabsTrigger>
          <TabsTrigger value="assets" id="dock-tab-assets" className="dock-tab">
            Assets
            <span className="dock-count">{unplaced.length}</span>
          </TabsTrigger>
          <TabsTrigger value="types" id="dock-tab-types" className="dock-tab">
            Types
            <span className="dock-count">{types.length}</span>
          </TabsTrigger>
        </TabsList>

      <div className="dock-body">
        <TabsContent value="layers" id="dock-panel-layers">
          <NavList
            idPrefix="layer"
            items={placed}
            getKey={(it) => it.block.id}
            activeIndex={layersActive}
            onActiveIndexChange={setLayersActive}
            onSelect={onSelect}
            selectedKeys={selectedIds}
            label="Placed blocks"
            empty="No placed blocks yet."
            renderContent={(it, active, selected) => (
              <div
                className={`layer-row${selected ? ' is-selected' : ''}`}
                data-active={active || undefined}
              >
                <span className="layer-chip" aria-hidden="true" />
                <span className="layer-name">{blockTitle(it.block, types)}</span>
                <span className="layer-pos">
                  {Math.round(it.placement.positionX)},{' '}
                  {Math.round(it.placement.positionY)}
                </span>
              </div>
            )}
          />
        </TabsContent>
        <TabsContent value="assets" id="dock-panel-assets">
          <div className="dock-assets-toolbar">
            {unplaced.length > 0 && (
              <>
                <label className="dock-sort-label" htmlFor="dock-asset-sort">
                  Sort <span className="dock-sort-hint">(S)</span>
                </label>
                <Select
                  value={assetSort}
                  onValueChange={(v) => {
                    if (v) setAssetSort(v as AssetSort)
                  }}
                >
                  <SelectTrigger id="dock-asset-sort" className="dock-sort-select" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="category">Category (Images, Docs, Notes...)</SelectItem>
                      <SelectItem value="name-asc">Name (A &rarr; Z)</SelectItem>
                      <SelectItem value="name-desc">Name (Z &rarr; A)</SelectItem>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                      <SelectItem value="size">Size (Large &rarr; Small)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </>
            )}
            {onPickFiles && (
              <FileImport
                onPick={onPickFiles}
                label="+ Place files"
                className="dock-place-files-btn"
              />
            )}
          </div>
          <NavList
            idPrefix="asset"
            items={sortedUnplaced}
            getKey={(b: ObservableBlock) => b.id}
            activeIndex={assetsActive}
            onActiveIndexChange={handleAssetsActive}
            onAction={onPlaceAsset}
            onDelete={requestDeleteAsset}
            onCycleSort={cycleSort}
            selectedKeys={new Set()}
            label="Unplaced assets"
            empty={
              <div className="dock-empty">
                <p>Nothing waiting.</p>
                {onPickFiles && (
                  <FileImport
                    onPick={onPickFiles}
                    label="Place files on board"
                    className="dock-empty-cta"
                  />
                )}
              </div>
            }
            renderContent={(block: ObservableBlock, active, _selected, index) => {
              const title = blockTitle(block, types)
              const isFile = block.kind === 'file'
              const sizeStr = isFile
                ? formatSize((block.data as FileBlockData).size)
                : null
              const category = getAssetCategory(block, types)

              const isFirstInCategory =
                assetSort === 'category' &&
                (index === 0 ||
                  getAssetCategory(sortedUnplaced[index - 1], types) !== category)

              return (
                <div className="asset-row-wrapper">
                  {isFirstInCategory && (
                    <div className="dock-category-divider">
                      <span className="dock-category-name">{category}</span>
                      <span className="dock-category-count">
                        {categoryCounts.get(category) ?? 1}
                      </span>
                    </div>
                  )}
                  <div
                    className="asset-row"
                    data-active={active || undefined}
                    draggable="true"
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/x-khoja-block-id',
                        block.id,
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                  >
                    <div className="asset-row-main">
                      <span className="layer-chip" aria-hidden="true" />
                      <span className="layer-name" title={title}>
                        {title}
                      </span>
                    </div>
                    {category && assetSort !== 'category' && (
                      <span className="asset-category-tag">{category}</span>
                    )}
                    {sizeStr && <span className="asset-size">{sizeStr}</span>}
                    <div className="asset-actions">
                      {onPlaceAsset && (
                        <Button
                          type="button"
                          size="sm"
                          className="asset-action-btn asset-place-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPlaceAsset(block.id)
                          }}
                          title="Place on board (Enter)"
                          aria-label={`Place ${title} on board`}
                        >
                          + Place
                        </Button>
                      )}
                      {onDeleteAsset && (
                        <Button
                          type="button"
                          variant={armedDeleteId === block.id ? 'destructive' : 'ghost'}
                          size="sm"
                          className={`asset-action-btn asset-delete-btn${armedDeleteId === block.id ? ' is-armed' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            requestDeleteAsset(block.id)
                          }}
                          title={
                            armedDeleteId === block.id
                              ? 'Click again to permanently delete'
                              : 'Delete asset permanently (Del)'
                          }
                          aria-label={`${armedDeleteId === block.id ? 'Confirm deleting' : 'Delete'} ${title} permanently${armedDeleteId === block.id ? ' — click again' : ''}`}
                        >
                          {armedDeleteId === block.id ? 'Delete?' : '×'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }}
          />
        </TabsContent>
        <TabsContent value="types" id="dock-panel-types">
          <div className="dock-types-header">
            <span className="dock-types-title">Custom Types</span>
            {onOpenSchemaCreator && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="dock-new-type-btn"
                onClick={() => onOpenSchemaCreator()}
              >
                + New Type
              </Button>
            )}
          </div>
          {types.length === 0 ? (
            <div className="dock-empty">
              <p>No custom types yet.</p>
              {onOpenSchemaCreator && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="dock-empty-cta"
                  onClick={() => onOpenSchemaCreator()}
                >
                  Create your first type
                </Button>
              )}
            </div>
          ) : (
            <div className="dock-types-list">
              {types.map((t) => (
                <div key={t.id} className="dock-type-card">
                  <div className="dock-type-card-head">
                    <span className="dock-type-name">{t.name}</span>
                    <span className="dock-type-fields-badge">
                      {t.fields.length} {t.fields.length === 1 ? 'field' : 'fields'}
                    </span>
                  </div>
                  <p className="dock-type-fields-preview">
                    {t.fields.map((f) => f.name).join(', ') || 'No fields'}
                  </p>
                  <div className="dock-type-card-actions">
                    {onCreateInstance && (
                      <Button
                        type="button"
                        size="sm"
                        className="dock-type-action-btn primary"
                        onClick={() => onCreateInstance(t.id)}
                        title={`Place a new ${t.name} on the board`}
                      >
                        + Add to board
                      </Button>
                    )}
                    {onOpenSchemaCreator && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="dock-type-action-btn"
                        onClick={() => onOpenSchemaCreator(t)}
                        title="Edit schema fields"
                      >
                        Edit
                      </Button>
                    )}
                    {onDeleteType && (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="dock-type-action-btn danger"
                        onClick={() => onDeleteType(t.id)}
                        title="Delete type"
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </div>
      </Tabs>
    </aside>
  )
}

interface NavListProps<T> {
  idPrefix: string
  items: T[]
  getKey: (item: T) => string
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onSelect?: (key: string) => void
  onAction?: (key: string) => void
  onDelete?: (key: string) => void
  onCycleSort?: () => void
  selectedKeys: ReadonlySet<string>
  label: string
  empty: ReactNode
  renderContent: (
    item: T,
    active: boolean,
    selected: boolean,
    index: number,
  ) => ReactNode
}

/** APG listbox with aria-activedescendant: focus stays on the container and
 *  the active option is highlighted via `data-active` styled in CSS. */
function NavList<T>({
  idPrefix,
  items,
  getKey,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onAction,
  onDelete,
  onCycleSort,
  selectedKeys,
  label,
  empty,
  renderContent,
}: NavListProps<T>) {
  const listRef = useRef<HTMLUListElement>(null)
  const optionId = (index: number) => `${idPrefix}-option-${index}`

  const moveFocus = (index: number) => {
    if (items.length === 0) return
    const clamped = Math.max(0, Math.min(index, items.length - 1))
    onActiveIndexChange(clamped)
    onSelect?.(getKey(items[clamped]))
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (items.length === 0) return
    const last = items.length - 1
    const key = e.key.toLowerCase()

    switch (key) {
      case 'arrowdown':
        e.preventDefault()
        moveFocus(activeIndex + 1)
        break
      case 'arrowup':
        e.preventDefault()
        moveFocus(activeIndex - 1)
        break
      case 'home':
        e.preventDefault()
        moveFocus(0)
        break
      case 'end':
        e.preventDefault()
        moveFocus(last)
        break
      case 'enter':
      case ' ':
        // Enter / Space executes the primary action (place or select)
        e.preventDefault()
        if (onAction && items[activeIndex]) {
          onAction(getKey(items[activeIndex]))
        } else if (onSelect && items[activeIndex]) {
          onSelect(getKey(items[activeIndex]))
        }
        break
      case 'delete':
      case 'backspace':
        if (onDelete && items[activeIndex]) {
          e.preventDefault()
          onDelete(getKey(items[activeIndex]))
        }
        break
      case 's':
        if (onCycleSort) {
          e.preventDefault()
          onCycleSort()
        }
        break
      default:
        break
    }
  }

  const onOptionClick = (e: ReactMouseEvent, index: number) => {
    // Keep focus on the listbox container so arrow navigation keeps working,
    // but don't activate action if clicking an inner interactive control.
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    listRef.current?.focus()
    moveFocus(index)
  }

  return (
    <ul
      ref={listRef}
      className="dock-list"
      role="listbox"
      aria-label={label}
      aria-activedescendant={
        items.length > 0 ? optionId(activeIndex) : undefined
      }
      tabIndex={items.length > 0 ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      {items.length === 0 ? (
        <li className="dock-empty">{empty}</li>
      ) : (
        items.map((item, index) => {
          const key = getKey(item)
          const active = index === activeIndex
          const selected = selectedKeys.has(key)
          return (
            <li
              key={key}
              id={optionId(index)}
              role="option"
              aria-selected={selected}
              className={active ? 'is-active' : ''}
              onClick={(e) => onOptionClick(e, index)}
            >
              {renderContent(item, active, selected, index)}
            </li>
          )
        })
      )}
    </ul>
  )
}
