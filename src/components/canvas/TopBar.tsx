import ThemeToggle from '#/components/ThemeToggle'
import { FileImport } from './FileImport'

interface TopBarProps {
  onPickFiles?: (files: File[]) => void
  onCreateGroup?: () => void
  onCreateType?: () => void
}

export function TopBar({
  onPickFiles,
  onCreateGroup,
  onCreateType,
}: TopBarProps) {
  return (
    <header className="board-topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div className="brand-copy">
          <p className="brand-name">Kho-ja</p>
          <p className="brand-file">Board</p>
        </div>
      </div>
      <div className="topbar-actions">
        <span className="topbar-hint">V Move · H Hand · T Text · A Assets · Space pan</span>
        {onCreateType && (
          <button
            type="button"
            className="group-create-button"
            onClick={onCreateType}
            title="Create a custom object type schema"
          >
            + Type
          </button>
        )}
        {onCreateGroup && (
          <button
            type="button"
            className="group-create-button"
            onClick={onCreateGroup}
            title="Create an empty File Group on the board"
          >
            File Group
          </button>
        )}
        {onPickFiles && <FileImport onPick={onPickFiles} label="Place files" />}
        <ThemeToggle className="theme-toggle" />
      </div>
    </header>
  )
}
