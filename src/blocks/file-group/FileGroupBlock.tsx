import { FILE_ICON } from '#/blocks/file/FileCard'
import { formatBytes } from '#/blocks/file/FileCard'
import type { ObservableBlock } from '#/components/canvas/BlockShell'
import type { FileBlockData, FileGroupBlockData } from '#/types'

const BLOCK_ID_MIME = 'application/x-khoja-block-id'
const FROM_GROUP_MIME = 'application/x-khoja-from-group'

interface FileGroupBlockProps {
  data: FileGroupBlockData
  members: ObservableBlock[]
  onViewChange?: (view: 'card' | 'list') => void
  onMemberClick?: (blockId: string) => void
  fromGroupId?: string
}

/** File Group block: a container that renders its `file` members as a card or
 *  list. Members are read-only projections of the canonical file blocks
 *  (clicking one selects the canonical block on the canvas). */
export function FileGroupBlock({
  data,
  members,
  onViewChange,
  onMemberClick,
  fromGroupId,
}: FileGroupBlockProps) {
  const view = data.currentView

  return (
    <div className="file-group-block">
      <div className="file-group-header">
        <span className="file-group-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M1.5 4A1.5 1.5 0 0 1 3 2.5h4l1.5 2h4.5A1.5 1.5 0 0 1 14.5 6v6a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 1.5 12Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="file-group-name" title={data.name}>
          {data.name}
        </span>
        <div className="view-selector" role="group" aria-label="View">
          {(['card', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`view-selector-btn${view === v ? ' is-active' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onViewChange?.(v)}
              aria-pressed={view === v}
              title={`${v[0].toUpperCase()}${v.slice(1)} view`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="file-group-body" data-view={view}>
        {members.length === 0 ? (
          <p className="file-group-empty">Drop files here to add</p>
        ) : view === 'card' ? (
          <ul className="file-group-cards">
            {members.map((member) => (
              <FileGroupMember
                key={member.id}
                member={member}
                onMemberClick={onMemberClick}
                fromGroupId={fromGroupId}
              />
            ))}
          </ul>
        ) : (
          <ul className="file-group-list">
            {members.map((member) => (
              <FileGroupMember
                key={member.id}
                member={member}
                onMemberClick={onMemberClick}
                fromGroupId={fromGroupId}
                list
              />
            ))}
          </ul>
        )}
      </div>

      <p className="file-group-count">
        {members.length} {members.length === 1 ? 'file' : 'files'}
      </p>
    </div>
  )
}

interface FileGroupMemberProps {
  member: ObservableBlock
  onMemberClick?: (blockId: string) => void
  fromGroupId?: string
  list?: boolean
}

function FileGroupMember({
  member,
  onMemberClick,
  fromGroupId,
  list = false,
}: FileGroupMemberProps) {
  const data = member.data as FileBlockData
  return (
    <li>
      <button
        type="button"
        className="file-group-member"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onMemberClick?.(member.id)}
        title={data.name}
        draggable="true"
        onDragStart={(e) => {
          e.dataTransfer.setData(BLOCK_ID_MIME, member.id)
          if (fromGroupId) e.dataTransfer.setData(FROM_GROUP_MIME, fromGroupId)
          e.dataTransfer.effectAllowed = 'copy'
        }}
      >
        <span className="file-group-member-icon">{FILE_ICON}</span>
        <span className="file-group-member-name">{data.name}</span>
        {list && <span className="file-group-member-meta">{formatBytes(data.size)}</span>}
      </button>
    </li>
  )
}