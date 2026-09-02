import ThemeToggle from '#/components/ThemeToggle'
import { FileImport } from './FileImport'

interface TopBarProps {
  onPickFiles?: (files: File[]) => void
}

export function TopBar({ onPickFiles }: TopBarProps) {
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
        <span className="topbar-hint">V Move · H Hand · T Text · Space pan</span>
        {onPickFiles && <FileImport onPick={onPickFiles} />}
        <ThemeToggle className="theme-toggle" />
      </div>
    </header>
  )
}