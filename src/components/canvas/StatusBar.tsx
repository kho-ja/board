import type { ViewportTransform } from '#/lib/canvas/transform'

interface StatusBarProps {
  viewport: ViewportTransform
  placedCount: number
  blockCount: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function StatusBar({
  viewport,
  placedCount,
  blockCount,
  onZoomIn,
  onZoomOut,
  onReset,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-counts">
        {placedCount} placed · {blockCount} total
      </span>
      <span className="status-hint" aria-hidden="true">
        <kbd>V</kbd> Move &middot; <kbd>H</kbd> Hand &middot; <kbd>T</kbd> Text &middot; <kbd>Space</kbd> Pan &middot; <kbd>Del</kbd> Unplace &middot; <kbd>Ctrl+Z</kbd> Undo
      </span>
      <div className="zoom-cluster">
        <button type="button" className="chrome-icon" onClick={onZoomOut} aria-label="Zoom out">
          −
        </button>
        <button
          type="button"
          className="zoom-percent"
          onClick={onReset}
          title="Reset view"
          aria-label={`Zoom ${Math.round(viewport.scale * 100)} percent. Click to reset view.`}
        >
          {Math.round(viewport.scale * 100)}%
        </button>
        <button type="button" className="chrome-icon" onClick={onZoomIn} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          className="zoom-fit"
          onClick={onReset}
          title="Reset view"
          aria-label="Reset view"
        >
          ⤢
        </button>
      </div>
      <span className="status-viewport">
        {Math.round(viewport.offset.x)}, {Math.round(viewport.offset.y)}
      </span>
    </footer>
  )
}
