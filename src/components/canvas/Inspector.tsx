import { useEffect, useState } from 'react'

import { blockTitle } from './BlockRenderer'
import type { ObservableBlock, ObservablePlacement } from './BlockShell'

interface InspectorProps {
  selected: { block: ObservableBlock; placement: ObservablePlacement | null }[]
  onUpdatePosition: (blockId: string, x: number, y: number) => void
}

function round(v: number): string {
  return String(Math.round(v * 100) / 100)
}

export function Inspector({ selected, onUpdatePosition }: InspectorProps) {
  if (selected.length === 0) {
    return (
      <aside className="inspector">
        <p className="inspector-empty">No selection</p>
      </aside>
    )
  }

  if (selected.length > 1) {
    const kinds = new Map<string, number>()
    for (const { block } of selected) {
      kinds.set(block.kind, (kinds.get(block.kind) ?? 0) + 1)
    }
    return (
      <aside className="inspector">
        <div className="inspector-head">
          <span className="inspector-kind">{selected.length}</span>
          <h2 className="inspector-title">blocks selected</h2>
        </div>
        <dl className="inspector-meta">
          {Array.from(kinds.entries()).map(([kind, count]) => (
            <div key={kind}>
              <dt>{kind}</dt>
              <dd>
                {count} {count === 1 ? 'block' : 'blocks'}
              </dd>
            </div>
          ))}
        </dl>
      </aside>
    )
  }

  const { block, placement } = selected[0]

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <span className="inspector-kind">{block.kind}</span>
        <h2 className="inspector-title">{blockTitle(block)}</h2>
      </div>

      {placement && (
        <PositionField
          placement={placement}
          onCommit={onUpdatePosition}
          blockId={block.id}
        />
      )}

      <dl className="inspector-meta">
        <div>
          <dt>ID</dt>
          <dd>{block.id.slice(0, 8)}</dd>
        </div>
        <div>
          <dt>Schema</dt>
          <dd>v{block.schemaVersion}</dd>
        </div>
      </dl>
    </aside>
  )
}

interface PositionFieldProps {
  blockId: string
  placement: ObservablePlacement
  onCommit: (blockId: string, x: number, y: number) => void
}

function PositionField({ blockId, placement, onCommit }: PositionFieldProps) {
  const [x, setX] = useState(round(placement.positionX))
  const [y, setY] = useState(round(placement.positionY))

  useEffect(() => {
    setX(round(placement.positionX))
    setY(round(placement.positionY))
  }, [placement.positionX, placement.positionY])

  const commit = () => {
    const nx = Number.parseFloat(x)
    const ny = Number.parseFloat(y)
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      onCommit(blockId, nx, ny)
    } else {
      setX(round(placement.positionX))
      setY(round(placement.positionY))
    }
  }

  return (
    <div className="inspector-position">
      <label className="position-field">
        <span>X</span>
        <input
          type="number"
          step="any"
          value={x}
          onInput={(e) => setX((e.target as HTMLInputElement).value)}
          onChange={() => undefined}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
        />
      </label>
      <label className="position-field">
        <span>Y</span>
        <input
          type="number"
          step="any"
          value={y}
          onInput={(e) => setY((e.target as HTMLInputElement).value)}
          onChange={() => undefined}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
        />
      </label>
    </div>
  )
}