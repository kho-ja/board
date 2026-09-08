import type { ViewportTransform } from '#/lib/canvas/transform'

interface StatusBarProps {
  viewport: ViewportTransform
  placedCount: number
  blockCount: number
  linksCount?: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export function StatusBar({
  viewport,
  placedCount,
  blockCount,
  linksCount = 0,
  onZoomIn,
  onZoomOut,
  onReset,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <span className="status-counts">
        {placedCount} placed &middot; {blockCount} total
        {linksCount > 0 && ` \u00b7 ${linksCount} ${linksCount === 1 ? 'link' : 'links'}`}
      </span>
      <span className="status-hint" aria-hidden="true">
        <kbd>V</kbd> Move &middot; <kbd>H</kbd> Hand &middot; <kbd>T</kbd> Text &middot; <kbd>C</kbd> Connect &middot; <kbd>A</kbd> Assets &middot; <kbd>Space</kbd> Pan &middot; <kbd>Del</kbd> Unplace &middot; <kbd>Ctrl+Z</kbd> Undo
      </span>
      <div className="zoom-cluster">
        <button type="button" className="chrome-icon" onClick={onZoomOut} aria-label="Zoom out">
          &minus;
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
      </div>
    </footer>
  )
}
