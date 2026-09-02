import { useRef } from 'react'

interface FileImportProps {
  onPick: (files: File[]) => void
}

/**
 * Visible "Paste files" affordance: a button that opens a hidden multiple-file
 * picker. Metadata-only — the bytes never leave the browser. Shared import
 * logic lives in the board route (`importFiles`); this mirror path complements
 * the whole-canvas drop zone.
 */
export function FileImport({ onPick }: FileImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        type="button"
        className="file-import-button"
        onClick={() => inputRef.current?.click()}
        title="Pick files to add to the board"
      >
        Paste files
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