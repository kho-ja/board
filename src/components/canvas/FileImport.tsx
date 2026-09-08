import { useRef } from 'react'

interface FileImportProps {
  onPick: (files: File[]) => void
  label?: string
  className?: string
}

/**
 * Visible "Place files" affordance: a button that opens a hidden multiple-file
 * picker. Metadata-only — the bytes never leave the browser. Shared import
 * logic lives in the board route (`importFiles`); this mirror path complements
 * the whole-canvas drop zone.
 */
export function FileImport({
  onPick,
  label = 'Place files',
  className = 'file-import-button',
}: FileImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => inputRef.current?.click()}
        title="Pick files to place on the board"
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length > 0) onPick(files)
          e.target.value = ''
        }}
      />
    </>
  )
}
