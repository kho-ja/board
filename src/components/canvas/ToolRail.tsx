import { TOOLS } from './tools'
import type { Tool } from './tools'

interface ToolRailProps {
  tool: Tool
  onSelect: (tool: Tool) => void
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

export function ToolRail({ tool, onSelect }: ToolRailProps) {
  return (
    <nav className="tool-rail" aria-label="Tools">
      {TOOLS.map(({ id, label, shortcut }) => (
        <button
          key={id}
          type="button"
          className={`tool-button${tool === id ? ' is-active' : ''}`}
          onClick={() => onSelect(id)}
          aria-label={`${label} (${shortcut})`}
          aria-pressed={tool === id}
          title={`${label} (${shortcut})`}
        >
          <ToolIcon tool={id} />
          <span className="tool-shortcut" aria-hidden="true">
            {shortcut}
          </span>
        </button>
      ))}
    </nav>
  )
}
