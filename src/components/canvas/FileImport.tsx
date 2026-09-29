import { useRef } from 'react'

import { Button } from '@/components/ui/button'

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
  className = 'group-create-button',
}: FileImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => inputRef.current?.click()}
        title="Pick files to place on the board"
      >
        {label}
      </Button>
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
