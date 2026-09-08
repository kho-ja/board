import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'

import { blockTitle } from './BlockRenderer'
import type { ObservableBlock, ObservablePlacement } from './BlockShell'

type Tab = 'layers' | 'assets'

interface LeftDockProps {
  placed: { block: ObservableBlock; placement: ObservablePlacement }[]
  unplaced: ObservableBlock[]
  selectedIds: ReadonlySet<string>
  onSelect: (blockId: string) => void
  onPlaceAsset?: (blockId: string) => void
}

export function LeftDock({
  placed,
  unplaced,
  selectedIds,
  onSelect,
  onPlaceAsset,
}: LeftDockProps) {
  const [tab, setTab] = useState<Tab>('layers')
  const [layersActive, setLayersActive] = useState(0)
  const [assetsActive, setAssetsActive] = useState(0)

  useEffect(() => {
    if (unplaced.length > 0) setTab('assets')
  }, [unplaced.length])

  useEffect(() => {
    setLayersActive((i) =>
      placed.length === 0 ? 0 : Math.min(i, placed.length - 1),
    )
  }, [placed.length])
  useEffect(() => {
    setAssetsActive((i) =>
      unplaced.length === 0 ? 0 : Math.min(i, unplaced.length - 1),
    )
  }, [unplaced.length])

  const tabsRef = useRef<HTMLDivElement>(null)

  const onTabsKeyDown = (e: ReactKeyboardEvent) => {
    const buttons = Array.from(
      tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
    )
    const current = document.activeElement as HTMLButtonElement | null
    const idx = current ? buttons.indexOf(current) : -1
    if (idx < 0 || buttons.length === 0) return
    let next: number
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (idx + 1) % buttons.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (idx - 1 + buttons.length) % buttons.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = buttons.length - 1
        break
      default:
        return
    }
    e.preventDefault()
    buttons[next].focus()
    buttons[next].click()
  }

  return (
    <aside className="left-dock">
      <div
        className="dock-tabs"
        role="tablist"
        aria-label="Board views"
        ref={tabsRef}
        onKeyDown={onTabsKeyDown}
      >
        <button
          type="button"
          className={`dock-tab${tab === 'layers' ? ' is-active' : ''}`}
          onClick={() => setTab('layers')}
          role="tab"
          id="dock-tab-layers"
          aria-selected={tab === 'layers'}
          aria-controls="dock-panel-layers"
          tabIndex={tab === 'layers' ? 0 : -1}
        >
          Layers
          <span className="dock-count">{placed.length}</span>
        </button>
        <button
          type="button"
          className={`dock-tab${tab === 'assets' ? ' is-active' : ''}`}
          onClick={() => setTab('assets')}
          role="tab"
          id="dock-tab-assets"
          aria-selected={tab === 'assets'}
          aria-controls="dock-panel-assets"
          tabIndex={tab === 'assets' ? 0 : -1}
        >
          Assets
          <span className="dock-count">{unplaced.length}</span>
        </button>
      </div>

      <div className="dock-body">
        <div
          id="dock-panel-layers"
          role="tabpanel"
          aria-labelledby="dock-tab-layers"
          hidden={tab !== 'layers'}
        >
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
                <span className="layer-name">{blockTitle(it.block)}</span>
                <span className="layer-pos">
                  {Math.round(it.placement.positionX)},{' '}
                  {Math.round(it.placement.positionY)}
                </span>
              </div>
            )}
          />
        </div>
        <div
          id="dock-panel-assets"
          role="tabpanel"
          aria-labelledby="dock-tab-assets"
          hidden={tab !== 'assets'}
        >
          <NavList
            idPrefix="asset"
            items={unplaced}
            getKey={(b: ObservableBlock) => b.id}
            activeIndex={assetsActive}
            onActiveIndexChange={setAssetsActive}
            onSelect={onPlaceAsset}
            selectedKeys={new Set()}
            label="Unplaced assets"
            empty="Nothing waiting. New text lands on the canvas."
            renderContent={(block: ObservableBlock, active) => (
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
                <span className="layer-chip" aria-hidden="true" />
                <span className="layer-name">{blockTitle(block)}</span>
              </div>
            )}
          />
        </div>
      </div>
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
  selectedKeys: ReadonlySet<string>
  label: string
  empty: ReactNode
  renderContent: (item: T, active: boolean, selected: boolean) => ReactNode
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
  selectedKeys,
  label,
  empty,
  renderContent,
}: NavListProps<T>) {
  const listRef = useRef<HTMLUListElement>(null)
  const optionId = (index: number) => `${idPrefix}-option-${index}`

  const activate = (index: number) => {
    if (items.length === 0) return
    const clamped = Math.max(0, Math.min(index, items.length - 1))
    onActiveIndexChange(clamped)
    onSelect?.(getKey(items[clamped]))
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (items.length === 0) return
    const last = items.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        activate(activeIndex + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        activate(activeIndex - 1)
        break
      case 'Home':
        e.preventDefault()
        activate(0)
        break
      case 'End':
        e.preventDefault()
        activate(last)
        break
      case 'Enter':
      case ' ':
        // Space scrolls the page by default; stop it once we're in the list.
        e.preventDefault()
        activate(activeIndex)
        break
      default:
        break
    }
  }

  const onOptionClick = (e: ReactMouseEvent, index: number) => {
    // Keep focus on the listbox container so arrow navigation keeps working.
    e.preventDefault()
    listRef.current?.focus()
    activate(index)
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
              {renderContent(item, active, selected)}
            </li>
          )
        })
      )}
    </ul>
  )
}
