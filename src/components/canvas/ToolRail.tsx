import {
  CONNECTION_TYPE_COLORS,
  CONNECTION_TYPE_LABELS,
  CONNECTION_TYPES,
} from '#/lib/board/connections'
import type { ConnectionType } from '#/types'
import { TOOLS } from './tools'
import type { Tool } from './tools'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'

interface ToolRailProps {
  tool: Tool
  onSelect: (tool: Tool) => void
  /** M13 — connection type scrubber while the Connector tool is active. */
  connectionType?: ConnectionType
  onConnectionTypeChange?: (type: ConnectionType) => void
  /** M18 UI — Ask assistant lives in the left rail so it is always reachable. */
  aiOpen?: boolean
  onToggleAI?: () => void
}

function ToolIcon({ tool }: { tool: Tool }) {
  switch (tool) {
    case 'move':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M5.2 2 12 8.8 8.4 9.6 10.4 13.2 8.8 14 6.8 10.4 4.4 12.8Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'hand':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M5 8.5V6a1 1 0 0 1 2 0v1m0-1a1 1 0 0 1 2 0v1m0-.5a1 1 0 0 1 2 0V9c0 3-1.5 5-4 5-2.5 0-4-1.5-4-4l-.5-2.5A1.2 1.2 0 0 1 5.7 6.9L7 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'text':
      return (
        <span className="tool-letter" aria-hidden="true">
          T
        </span>
      )
    case 'link':
      return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="3.5" cy="12.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="12.5" cy="3.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M5 11.2 C 6.5 7.5, 8.5 8.5, 11 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

export function ToolRail({
  tool,
  onSelect,
  connectionType,
  onConnectionTypeChange,
  aiOpen = false,
  onToggleAI,
}: ToolRailProps) {
  return (
    <nav className="tool-rail" aria-label="Tools">
      <ToggleGroup
        orientation="vertical"
        value={[tool]}
        multiple={false}
        onValueChange={(values) => {
          const next = values[0]
          if (next) onSelect(next as Tool)
        }}
      >
        {TOOLS.map(({ id, label, shortcut }) => (
          <ToggleGroupItem
            key={id}
            value={id}
            className="tool-button w-8"
            aria-label={`${label} (${shortcut})`}
            title={`${label} (${shortcut})`}
            // A single-value ToggleGroup deselects the active item instead of
            // re-emitting it, so `onValueChange` never fires for a repeat click.
            // That made the active tool look dead; select on click as well.
            onClick={() => onSelect(id as Tool)}
          >
            <ToolIcon tool={id} />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {tool === 'link' && connectionType && onConnectionTypeChange && (
        <ToggleGroup
          className="conn-type-picker"
          data-slot="conn-type-picker"
          orientation="vertical"
          value={[connectionType]}
          multiple={false}
          onValueChange={(values) => {
            const next = values[0]
            if (next) onConnectionTypeChange(next as ConnectionType)
          }}
          aria-label="Connection type"
        >
          {CONNECTION_TYPES.map((type) => (
            <ToggleGroupItem key={type} value={type} title={`Connect as ${CONNECTION_TYPE_LABELS[type]}`}>
              <span
                className="conn-type-dot"
                style={{ background: CONNECTION_TYPE_COLORS[type] }}
                aria-hidden="true"
              />
              {CONNECTION_TYPE_LABELS[type]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {onToggleAI && (
        <>
          <div className="tool-rail-spacer" aria-hidden="true" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`tool-button ai-rail-button${aiOpen ? ' is-active' : ''}`}
            onClick={onToggleAI}
            aria-label="Ask — the AI assistant (Ctrl+I)"
            aria-pressed={aiOpen}
            title="Ask — the AI assistant (Ctrl+I)"
          >
            <span className="tool-ai-glyph" aria-hidden="true">
              ✦
            </span>
          </Button>
        </>
      )}
    </nav>
  )
}
