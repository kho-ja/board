import type { MouseEvent as ReactMouseEvent } from 'react'

import {
  CONNECTION_TYPE_COLORS,
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPES,
  isDirected,
  resolveType,
} from '#/lib/board/connections'
import {
  computeBestAnchorPair,
  createBezierPath,
  createDraftBezierPath,
  getBoxPorts,
  distanceSq,
  type AnchorPoint,
  type Rect,
} from '#/lib/canvas/geometry'
import type { Vec } from '#/lib/canvas/transform'
import type { ConnectionType, ObservableLink } from '#/types'

interface LinksLayerProps {
  links: ObservableLink[]
  getBlockRect: (blockId: string) => Rect | null
  selectedLinkId: string | null
  hoveredLinkId?: string | null
  onSelectLink: (linkId: string | null) => void
  onHoverLink?: (linkId: string | null) => void
  /** Connection type selected in the picker while the Connector tool is
   *  active — colors the live draft. */
  pendingLinkType?: ConnectionType
  draftLink: {
    fromBlockId: string
    currentPos: Vec
  } | null
}

const ARROW_MARKER_SIZE = 9

export function LinksLayer({
  links,
  getBlockRect,
  selectedLinkId,
  hoveredLinkId,
  onSelectLink,
  onHoverLink,
  pendingLinkType = 'related-to',
  draftLink,
}: LinksLayerProps) {
  const draftType = resolveType({ type: pendingLinkType })
  return (
    <svg
      className="canvas-links-layer"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <defs>
        <filter id="link-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="var(--lagoon)" floodOpacity="0.6" />
        </filter>
        {CONNECTION_TYPES.map((type) =>
          isDirected(type) ? (
            <marker
              key={type}
              id={`conn-arrow-${type}`}
              viewBox="0 0 10 10"
              refX="7.5"
              refY="5"
              markerWidth={ARROW_MARKER_SIZE}
              markerHeight={ARROW_MARKER_SIZE}
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={CONNECTION_TYPE_COLORS[type]} />
            </marker>
          ) : null,
        )}
      </defs>

      {/* Render existing links */}
      {links.map((link) => {
        const rectA = getBlockRect(link.blockAId)
        const rectB = getBlockRect(link.blockBId)
        if (!rectA || !rectB) return null

        const type = resolveType(link)
        const color = CONNECTION_TYPE_COLORS[type]
        const directed = isDirected(type)
        const { start, end } = computeBestAnchorPair(rectA, rectB)
        const pathD = createBezierPath(start, end)
        const isSelected = selectedLinkId === link.id
        const isHovered = hoveredLinkId === link.id

        return (
          <g key={link.id} className={`canvas-link-group${isSelected ? ' is-selected' : ''}`}>
            {/* Invisible wide path for easy click and hover */}
            <path
              d={pathD}
              fill="none"
              stroke="transparent"
              strokeWidth="22"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e: ReactMouseEvent) => {
                e.stopPropagation()
                onSelectLink(link.id)
              }}
              onMouseEnter={() => onHoverLink?.(link.id)}
              onMouseLeave={() => onHoverLink?.(null)}
            />

            {/* Selection halo */}
            {isSelected && (
              <path
                d={pathD}
                fill="none"
                stroke={color}
                strokeWidth="6"
                strokeOpacity="0.35"
                strokeLinecap="round"
              />
            )}

            {/* Visible curve line + directed arrowhead */}
            <path
              d={pathD}
              fill="none"
              className={`canvas-link-line${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
              stroke={isSelected ? color : isHovered ? 'var(--lagoon-deep)' : color}
              strokeWidth={isSelected ? '2.5' : isHovered ? '2.2' : '1.8'}
              strokeLinecap="round"
              filter={isSelected ? 'url(#link-glow)' : undefined}
              markerEnd={directed ? `url(#conn-arrow-${type})` : undefined}
            />

            {/* Port dots */}
            <circle
              cx={start.x}
              cy={start.y}
              r={isSelected ? '3.5' : '2.5'}
              fill={isSelected ? color : 'var(--sea-ink-soft)'}
            />
            <circle
              cx={end.x}
              cy={end.y}
              r={isSelected ? '3.5' : '2.5'}
              fill={isSelected ? color : 'var(--sea-ink-soft)'}
            />

            {/* Edge note always; the type name while selected/hovered. */}
            {(link.label || isSelected || isHovered) && (
              <text
                x={(start.x + end.x) / 2}
                y={(start.y + end.y) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                className="canvas-link-label"
                style={{ pointerEvents: 'none' }}
                fill={color}
                stroke="var(--panel-bg, var(--surface))"
                strokeWidth="4"
                paintOrder="stroke"
              >
                {(link.label ?? '').trim() || CONNECTION_TYPE_LABELS[type]}
              </text>
            )}
          </g>
        )
      })}

      {/* Render active draft connecting line */}
      {draftLink && (() => {
        const rect = getBlockRect(draftLink.fromBlockId)
        if (!rect) return null
        const ports = getBoxPorts(rect)
        let bestPort: AnchorPoint = ports[0]
        let minDist = Infinity

        for (const p of ports) {
          const d = distanceSq(p, draftLink.currentPos)
          if (d < minDist) {
            minDist = d
            bestPort = p
          }
        }

        const draftPathD = createDraftBezierPath(bestPort, draftLink.currentPos)
        const draftColor = CONNECTION_TYPE_COLORS[draftType]

        return (
          <g className="canvas-link-draft-group">
            <path
              d={draftPathD}
              fill="none"
              className="canvas-link-draft"
              stroke={draftColor}
              strokeWidth="2.2"
              strokeDasharray="5 4"
              strokeLinecap="round"
              markerEnd={isDirected(draftType) ? `url(#conn-arrow-${draftType})` : undefined}
            />
            <circle cx={bestPort.x} cy={bestPort.y} r="4" fill={draftColor} />
            <circle
              cx={draftLink.currentPos.x}
              cy={draftLink.currentPos.y}
              r="4.5"
              fill={draftColor}
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
          </g>
        )
      })()}
    </svg>
  )
}