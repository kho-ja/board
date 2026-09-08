import type { MouseEvent as ReactMouseEvent } from 'react'

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
import type { ObservableLink } from '#/types'

interface LinksLayerProps {
  links: ObservableLink[]
  getBlockRect: (blockId: string) => Rect | null
  selectedLinkId: string | null
  hoveredLinkId?: string | null
  onSelectLink: (linkId: string | null) => void
  onHoverLink?: (linkId: string | null) => void
  draftLink: {
    fromBlockId: string
    currentPos: Vec
  } | null
}

export function LinksLayer({
  links,
  getBlockRect,
  selectedLinkId,
  hoveredLinkId,
  onSelectLink,
  onHoverLink,
  draftLink,
}: LinksLayerProps) {
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
      </defs>

      {/* Render existing links */}
      {links.map((link) => {
        const rectA = getBlockRect(link.blockAId)
        const rectB = getBlockRect(link.blockBId)
        if (!rectA || !rectB) return null

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
                stroke="var(--lagoon)"
                strokeWidth="6"
                strokeOpacity="0.35"
                strokeLinecap="round"
              />
            )}

            {/* Visible curve line */}
            <path
              d={pathD}
              fill="none"
              className={`canvas-link-line${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
              stroke={isSelected ? 'var(--lagoon)' : isHovered ? 'var(--lagoon-deep)' : 'var(--sea-ink-soft)'}
              strokeWidth={isSelected ? '2.5' : isHovered ? '2.2' : '1.8'}
              strokeLinecap="round"
              filter={isSelected ? 'url(#link-glow)' : undefined}
            />

            {/* Port dots */}
            <circle
              cx={start.x}
              cy={start.y}
              r={isSelected ? '3.5' : '2.5'}
              fill={isSelected ? 'var(--lagoon)' : 'var(--sea-ink-soft)'}
            />
            <circle
              cx={end.x}
              cy={end.y}
              r={isSelected ? '3.5' : '2.5'}
              fill={isSelected ? 'var(--lagoon)' : 'var(--sea-ink-soft)'}
            />
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

        return (
          <g className="canvas-link-draft-group">
            <path
              d={draftPathD}
              fill="none"
              className="canvas-link-draft"
              stroke="var(--lagoon)"
              strokeWidth="2.2"
              strokeDasharray="5 4"
              strokeLinecap="round"
            />
            <circle
              cx={bestPort.x}
              cy={bestPort.y}
              r="4"
              fill="var(--lagoon)"
            />
            <circle
              cx={draftLink.currentPos.x}
              cy={draftLink.currentPos.y}
              r="4.5"
              fill="var(--lagoon)"
              stroke="var(--surface)"
              strokeWidth="1.5"
            />
          </g>
        )
      })()}
    </svg>
  )
}
