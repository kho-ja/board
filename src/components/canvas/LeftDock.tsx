import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { blockTitle } from './BlockRenderer'
import type { ObservableBlock, ObservablePlacement } from './BlockShell'

type Tab = 'layers' | 'assets'

interface LeftDockProps {
  placed: { block: ObservableBlock; placement: ObservablePlacement }[]
  unplaced: ObservableBlock[]
  selectedIds: ReadonlySet<string>
  onSelect: (blockId: string) => void
  onPlace: (blockId: string, index: number) => void
}

export function LeftDock({
  placed,
  unplaced,
  selectedIds,
  onSelect,
  onPlace,
}: LeftDockProps) {
  const [tab, setTab] = useState<Tab>('layers')

  useEffect(() => {
    if (unplaced.length > 0) setTab('assets')
  }, [unplaced.length])

  return (
    <aside className="left-dock">
      <div className="dock-tabs" role="tablist">
        <button
          type="button"
          className={`dock-tab${tab === 'layers' ? ' is-active' : ''}`}
          onClick={() => setTab('layers')}
          role="tab"
          aria-selected={tab === 'layers'}
        >
          Layers
          <span className="dock-count">{placed.length}</span>
        </button>
        <button
          type="button"
          className={`dock-tab${tab === 'assets' ? ' is-active' : ''}`}
          onClick={() => setTab('assets')}
          role="tab"
          aria-selected={tab === 'assets'}
        >
          Assets
          <span className="dock-count">{unplaced.length}</span>
        </button>
      </div>

      <div className="dock-body">
        {tab === 'layers' ? (
          <DockList>
            {placed.length === 0 ? (
              <p className="dock-empty">No placed blocks yet.</p>
            ) : (
              placed.map(({ block, placement }) => (
                <li key={block.id}>
                  <button
                    type="button"
                    className={`layer-row${selectedIds.has(block.id) ? ' is-selected' : ''}`}
                    onClick={() => onSelect(block.id)}
                  >
                    <span className="layer-chip" aria-hidden="true" />
                    <span className="layer-name">{blockTitle(block)}</span>
                    <span className="layer-pos">
                      {Math.round(placement.positionX)}, {Math.round(placement.positionY)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </DockList>
        ) : (
          <DockList>
            {unplaced.length === 0 ? (
              <p className="dock-empty">Nothing waiting. New text lands on the canvas.</p>
            ) : (
              unplaced.map((block, index) => (
                <li key={block.id}>
                  <button
                    type="button"
                    className="asset-row"
                    onClick={() => onPlace(block.id, index)}
                  >
                    <span className="layer-chip" aria-hidden="true" />
                    <span className="layer-name">{blockTitle(block)}</span>
                    <span className="asset-place">Place</span>
                  </button>
                </li>
              ))
            )}
          </DockList>
        )}
      </div>
    </aside>
  )
}

function DockList({ children }: { children: ReactNode }) {
  return <ul className="dock-list">{children}</ul>
}