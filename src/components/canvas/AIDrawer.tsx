import type { ReactNode } from 'react'

/**
 * M18 UI — the AI assistant takes over the left panel in place of the
 * Layers/Assets/Types dock when toggled from the tool rail: the dock is not
 * mounted while open, so "the bar" shows the Ask UI instead of layers.
 * Chat content is durable (per-thread localStorage persistence in AskThread),
 * so it restores on every open.
 */
export function AIDrawer({
  onClose,
  children,
}: {
  onClose: () => void
  children: ReactNode
}) {
  return (
    <aside className="ai-drawer" aria-label="Ask assistant">
      <div className="ai-drawer-head">
        <span className="ai-drawer-title">
          <span className="ai-drawer-glyph" aria-hidden="true">
            ✦
          </span>
          Ask
        </span>
        <button
          type="button"
          className="ai-drawer-close"
          onClick={onClose}
          title="Back to layers"
          aria-label="Back to layers"
        >
          ×
        </button>
      </div>
      <div className="ai-drawer-body">{children}</div>
    </aside>
  )
}