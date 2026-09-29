import ThemeToggle from '#/components/ThemeToggle'
import { FileImport } from './FileImport'
import { JsonImport } from './JsonImport'
import { Button } from '@/components/ui/button'

interface TopBarProps {
  onPickFiles?: (files: File[]) => void
  onCreateGroup?: () => void
  onCreateType?: () => void
  onExportJson?: () => void
  onImportBoardFile?: (file: File) => void
  onExportPng?: () => void
}

export function TopBar({
  onPickFiles,
  onCreateGroup,
  onCreateType,
  onExportJson,
  onImportBoardFile,
  onExportPng,
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
        <span className="topbar-hint">V Move · H Hand · T Text · C Connect · A Assets · M Map · Ctrl+I Ask · Space pan</span>
        {onCreateType && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="group-create-button"
            onClick={onCreateType}
            title="Create a custom object type schema"
          >
            + Type
          </Button>
        )}
        {onCreateGroup && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="group-create-button"
            onClick={onCreateGroup}
            title="Create an empty File Group on the board"
          >
            File Group
          </Button>
        )}
        {onPickFiles && <FileImport onPick={onPickFiles} label="Place files" />}
        {onExportJson && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="group-create-button"
            onClick={onExportJson}
            title="Download the full board as JSON"
          >
            Export
          </Button>
        )}
        {onImportBoardFile && <JsonImport onPick={onImportBoardFile} label="Import" />}
        {onExportPng && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="group-create-button"
            onClick={onExportPng}
            title="Download the board as a PNG image"
          >
            PNG
          </Button>
        )}
        <ThemeToggle className="theme-toggle" />
      </div>
    </header>
  )
}
