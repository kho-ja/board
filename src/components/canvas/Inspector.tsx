import { useEffect, useState } from 'react'

import { ObjectEditPanel } from '#/blocks/object/ObjectEditPanel'
import type { AlignMode, DistributeAxis } from '#/lib/canvas/layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CONNECTION_TYPE_COLORS,
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPES,
} from '#/lib/board/connections'
import type {
  ConnectionType,
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
  onUpdateLinkType?: (linkId: string, type: ConnectionType) => void
  onUpdateLinkLabel?: (linkId: string, label: string) => void
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
  onAlignSelected?: (mode: AlignMode) => void
  onDistributeSelected?: (axis: DistributeAxis) => void
}

function round(v: number): string {
  return String(Math.round(v * 100) / 100)
}

export function Inspector({
  selected,
  selectedLink,
  onDeleteLink,
  onUpdateLinkType,
  onUpdateLinkLabel,
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
  onAlignSelected,
  onDistributeSelected,
}: InspectorProps) {
  if (selected.length === 0) {
    if (selectedLink) {
      const titleA = selectedLink.blockA ? blockTitle(selectedLink.blockA) : 'Unknown Block'
      const titleB = selectedLink.blockB ? blockTitle(selectedLink.blockB) : 'Unknown Block'
      return (
        <aside className="inspector">
          <div className="inspector-head">
            <span className="inspector-kind">Relationship</span>
            <h2 className="inspector-title">Connection</h2>
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
          {onUpdateLinkType && (
            <ConnectionTypeField
              linkId={selectedLink.link.id}
              type={selectedLink.link.type ?? 'related-to'}
              onUpdate={onUpdateLinkType}
            />
          )}
          {onUpdateLinkLabel && (
            <ConnectionLabelField
              linkId={selectedLink.link.id}
              label={selectedLink.link.label ?? ''}
              onUpdate={onUpdateLinkLabel}
            />
          )}
          <div className="inspector-actions">
            {onDeleteLink && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="inspector-btn danger"
                onClick={() => onDeleteLink(selectedLink.link.id)}
              >
                Delete connection
              </Button>
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
          {(onAlignSelected || onDistributeSelected) && (
            <AlignPanel
              onAlign={onAlignSelected}
              onDistribute={onDistributeSelected}
            />
          )}
          {onUnplace && (
            <Button
              type="button"
              size="sm"
              className="inspector-btn"
              onClick={() => {
                for (const { block } of selected) {
                  onUnplace(block.id)
                }
              }}
            >
              Remove {selected.length} from board
            </Button>
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
          <Button
            type="button"
            size="sm"
            className="inspector-btn"
            onClick={() => onUnplace(block.id)}
          >
            Remove from board
          </Button>
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

function ConnectionTypeField({
  linkId,
  type,
  onUpdate,
}: {
  linkId: string
  type: ConnectionType
  onUpdate: (linkId: string, type: ConnectionType) => void
}) {
  return (
    <div className="inspector-field">
      <label className="inspector-label" htmlFor={`conn-type-${linkId}`}>
        Type
      </label>
      <Select
        value={type}
        onValueChange={(v) => {
          if (v !== null) onUpdate(linkId, v as ConnectionType)
        }}
      >
        <SelectTrigger id={`conn-type-${linkId}`} className="w-full">
          <SelectValue placeholder="Choose a type" />
        </SelectTrigger>
        <SelectContent>
            <SelectGroup>
              {CONNECTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {CONNECTION_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
      </Select>
      <p className="inspector-hint">
        <span
          className="conn-type-dot"
          style={{ background: CONNECTION_TYPE_COLORS[type] }}
          aria-hidden="true"
        />
        {CONNECTION_TYPES.map((t) => CONNECTION_TYPE_LABELS[t]).join(' · ')}
      </p>
    </div>
  )
}

function ConnectionLabelField({
  linkId,
  label,
  onUpdate,
}: {
  linkId: string
  label: string
  onUpdate: (linkId: string, label: string) => void
}) {
  const [value, setValue] = useState(label)

  useEffect(() => {
    setValue(label)
  }, [label])

  const commit = () => {
    if (value.trim() !== label) {
      onUpdate(linkId, value.trim())
    } else {
      setValue(label)
    }
  }

  return (
    <div className="inspector-field">
      <label className="inspector-label" htmlFor={`conn-label-${linkId}`}>
        Label
      </label>
      <Input
        id={`conn-label-${linkId}`}
        className="inspector-input"
        placeholder="Optional note on the connection"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter blurs; onBlur commits — exactly once (blur fired by Enter
          // would otherwise commit twice against the stale `label` prop).
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function AlignPanel({
  onAlign,
  onDistribute,
}: {
  onAlign?: (mode: AlignMode) => void
  onDistribute?: (axis: DistributeAxis) => void
}) {
  if (!onAlign && !onDistribute) return null
  const alignButtons: { mode: AlignMode; label: string; title: string }[] = [
    { mode: 'left', label: 'Left', title: 'Align left edges' },
    { mode: 'centerH', label: 'Center', title: 'Align horizontal centers' },
    { mode: 'right', label: 'Right', title: 'Align right edges' },
    { mode: 'top', label: 'Top', title: 'Align top edges' },
    { mode: 'middle', label: 'Middle', title: 'Align vertical centers' },
    { mode: 'bottom', label: 'Bottom', title: 'Align bottom edges' },
  ]
  return (
    <div className="inspector-align">
      {onAlign && (
        <div className="inspector-align-row" role="group" aria-label="Align selection">
          {alignButtons.map(({ mode, label, title }) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              className="inspector-btn inspector-align-btn"
              title={title}
              onClick={() => onAlign(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      {onDistribute && (
        <div className="inspector-align-row" role="group" aria-label="Distribute selection">
          <Button
            type="button"
            size="sm"
            className="inspector-btn inspector-align-btn"
            title="Space out evenly horizontally (needs 3+ blocks)"
            onClick={() => onDistribute('x')}
          >
            Distribute H
          </Button>
          <Button
            type="button"
            size="sm"
            className="inspector-btn inspector-align-btn"
            title="Space out evenly vertically (needs 3+ blocks)"
            onClick={() => onDistribute('y')}
          >
            Distribute V
          </Button>
        </div>
      )}
    </div>
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
      <Input
        id={`group-name-${blockId}`}
        className="inspector-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter blurs; onBlur commits — exactly once.
          if (e.key === 'Enter') {
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
    <Button
      type="button"
      variant={armed ? 'destructive' : 'ghost'}
      size="sm"
      className={`inspector-btn danger${armed ? ' is-armed' : ''}`}
      onClick={onClick}
      title="Delete this group. Files inside will be moved to the canvas."
    >
      {armed ? 'Click again to confirm delete' : 'Delete group'}
    </Button>
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
    <Button
      type="button"
      variant={armed ? 'destructive' : 'ghost'}
      size="sm"
      className={`inspector-btn danger${armed ? ' is-armed' : ''}`}
      onClick={onClick}
      title="Permanently delete this asset and its data."
    >
      {armed ? 'Click again to confirm delete' : `Delete ${kind}`}
    </Button>
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
    <Button
      type="button"
      variant={armed ? 'destructive' : 'ghost'}
      size="sm"
      className={`inspector-btn danger${armed ? ' is-armed' : ''}`}
      onClick={onClick}
      title="Permanently delete selected assets."
    >
      {armed ? 'Click again to confirm delete' : `Delete ${count} assets`}
    </Button>
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
        <Input
          type="number"
          step="any"
          className="inspector-pos-input"
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
        <Input
          type="number"
          step="any"
          className="inspector-pos-input"
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
