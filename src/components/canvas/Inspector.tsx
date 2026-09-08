import { useEffect, useState } from 'react'

import { ObjectEditPanel } from '#/blocks/object/ObjectEditPanel'
import type {
  FieldValue,
  FileGroupBlockData,
  ObjectBlockData,
  ObservableLink,
  SchemaDef,
} from '#/types'
import { blockTitle } from './BlockRenderer'
import type { ObservableBlock, ObservablePlacement } from './BlockShell'

export interface SelectedLinkInfo {
  link: ObservableLink
  blockA?: ObservableBlock
  blockB?: ObservableBlock
}

interface InspectorProps {
  selected: { block: ObservableBlock; placement: ObservablePlacement | null }[]
  selectedLink?: SelectedLinkInfo | null
  onDeleteLink?: (linkId: string) => void
  types?: readonly SchemaDef[]
  onUpdatePosition: (blockId: string, x: number, y: number) => void
  onUnplace?: (blockId: string) => void
  onDeleteGroup?: (groupId: string) => void
  onDeleteBlock?: (blockId: string) => void
  onDeleteBlocks?: (blockIds: Iterable<string>) => void
  onRenameGroup?: (blockId: string, name: string) => void
  onUpdateObjectValues?: (
    blockId: string,
    values: Record<string, FieldValue>,
  ) => void
  onEditSchema?: (schema: SchemaDef) => void
  membersByGroup?: ReadonlyMap<string, ObservableBlock[]>
}

function round(v: number): string {
  return String(Math.round(v * 100) / 100)
}

export function Inspector({
  selected,
  selectedLink,
  onDeleteLink,
  types,
  onUpdatePosition,
  onUnplace,
  onDeleteGroup,
  onDeleteBlock,
  onDeleteBlocks,
  onRenameGroup,
  onUpdateObjectValues,
  onEditSchema,
  membersByGroup,
}: InspectorProps) {
  if (selected.length === 0) {
    if (selectedLink) {
      const titleA = selectedLink.blockA ? blockTitle(selectedLink.blockA) : 'Unknown Block'
      const titleB = selectedLink.blockB ? blockTitle(selectedLink.blockB) : 'Unknown Block'
      return (
        <aside className="inspector">
          <div className="inspector-head">
            <span className="inspector-kind">Relationship</span>
            <h2 className="inspector-title">Connection Line</h2>
          </div>
          <dl className="inspector-meta">
            <div>
              <dt>Connected from</dt>
              <dd>{titleA}</dd>
            </div>
            <div>
              <dt>Connected to</dt>
              <dd>{titleB}</dd>
            </div>
          </dl>
          <div className="inspector-actions">
            {onDeleteLink && (
              <button
                type="button"
                className="inspector-btn danger"
                onClick={() => onDeleteLink(selectedLink.link.id)}
              >
                Delete connection
              </button>
            )}
          </div>
        </aside>
      )
    }

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
        <div className="inspector-actions">
          {onUnplace && (
            <button
              type="button"
              className="inspector-btn"
              onClick={() => {
                for (const { block } of selected) {
                  onUnplace(block.id)
                }
              }}
            >
              Remove {selected.length} from board
            </button>
          )}
          {onDeleteBlocks && (
            <ConfirmDeleteMultiButton
              count={selected.length}
              onDelete={() => onDeleteBlocks(selected.map((s) => s.block.id))}
            />
          )}
        </div>
      </aside>
    )
  }

  const { block, placement } = selected[0]
  const isGroup = block.kind === 'file-group'
  const isText = block.kind === 'text'
  const isFile = block.kind === 'file'
  const isObject = !isGroup && !isText && !isFile

  const groupData = isGroup ? (block.data as FileGroupBlockData) : null
  const objectData = isObject ? (block.data as ObjectBlockData) : null
  const objectSchema = isObject
    ? types?.find(
        (t) => t.id === objectData?.schemaId || t.id === block.kind,
      ) ?? null
    : null
  const memberCount = isGroup ? (membersByGroup?.get(block.id)?.length ?? 0) : 0

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <span className="inspector-kind">
          {isObject ? objectSchema?.name ?? block.kind : block.kind}
        </span>
        <h2 className="inspector-title">{blockTitle(block, types)}</h2>
      </div>

      {isGroup && groupData && (
        <GroupPanel
          blockId={block.id}
          name={groupData.name}
          memberCount={memberCount}
          onRenameGroup={onRenameGroup}
        />
      )}

      {isObject && objectData && onUpdateObjectValues && (
        <ObjectEditPanel
          blockId={block.id}
          data={objectData}
          schema={objectSchema}
          onUpdateValues={onUpdateObjectValues}
          onEditSchema={onEditSchema}
        />
      )}

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

      <div className="inspector-actions">
        {placement && onUnplace && (
          <button
            type="button"
            className="inspector-btn"
            onClick={() => onUnplace(block.id)}
          >
            Remove from board
          </button>
        )}
        {isGroup && onDeleteGroup && (
          <ConfirmDeleteGroupButton groupId={block.id} onDeleteGroup={onDeleteGroup} />
        )}
        {!isGroup && onDeleteBlock && (
          <ConfirmDeleteBlockButton
            blockId={block.id}
            kind={isObject ? objectSchema?.name ?? block.kind : block.kind}
            onDeleteBlock={onDeleteBlock}
          />
        )}
      </div>
    </aside>
  )
}

function GroupPanel({
  blockId,
  name,
  memberCount,
  onRenameGroup,
}: {
  blockId: string
  name: string
  memberCount: number
  onRenameGroup?: (blockId: string, name: string) => void
}) {
  const [value, setValue] = useState(name)

  useEffect(() => {
    setValue(name)
  }, [name])

  const commit = () => {
    if (onRenameGroup && value.trim() && value.trim() !== name) {
      onRenameGroup(blockId, value)
    } else {
      setValue(name)
    }
  }

  return (
    <div className="inspector-field">
      <label className="inspector-label" htmlFor={`group-name-${blockId}`}>
        Name
      </label>
      <input
        id={`group-name-${blockId}`}
        className="inspector-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          }
        }}
      />
      <p className="inspector-hint">
        {memberCount} {memberCount === 1 ? 'file' : 'files'}
      </p>
    </div>
  )
}

function ConfirmDeleteGroupButton({
  groupId,
  onDeleteGroup,
}: {
  groupId: string
  onDeleteGroup: (groupId: string) => void
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  const onClick = () => {
    if (!armed) {
      setArmed(true)
    } else {
      onDeleteGroup(groupId)
      setArmed(false)
    }
  }

  return (
    <button
      type="button"
      className={`inspector-btn danger${armed ? ' is-armed' : ''}`}
      onClick={onClick}
      title="Delete this group. Files inside will be moved to the canvas."
    >
      {armed ? 'Click again to confirm delete' : 'Delete group'}
    </button>
  )
}

function ConfirmDeleteBlockButton({
  blockId,
  kind,
  onDeleteBlock,
}: {
  blockId: string
  kind: string
  onDeleteBlock: (blockId: string) => void
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  const onClick = () => {
    if (!armed) {
      setArmed(true)
    } else {
      onDeleteBlock(blockId)
      setArmed(false)
    }
  }

  return (
    <button
      type="button"
      className={`inspector-btn danger${armed ? ' is-armed' : ''}`}
      onClick={onClick}
      title="Permanently delete this asset and its data."
    >
      {armed ? 'Click again to confirm delete' : `Delete ${kind}`}
    </button>
  )
}

function ConfirmDeleteMultiButton({
  count,
  onDelete,
}: {
  count: number
  onDelete: () => void
}) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(timer)
  }, [armed])

  const onClick = () => {
    if (!armed) {
      setArmed(true)
    } else {
      onDelete()
      setArmed(false)
    }
  }

  return (
    <button
      type="button"
      className={`inspector-btn danger${armed ? ' is-armed' : ''}`}
      onClick={onClick}
      title="Permanently delete selected assets."
    >
      {armed ? 'Click again to confirm delete' : `Delete ${count} assets`}
    </button>
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
          aria-label="X position"
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
          aria-label="Y position"
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
