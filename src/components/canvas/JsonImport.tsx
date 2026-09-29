import { useRef } from 'react'

import { Button } from '@/components/ui/button'

interface JsonImportProps {
  onPick: (file: File) => void
  label?: string
  className?: string
}

/**
 * Board JSON import affordance: a button opening a hidden single-file picker
 * for `kho-ja.board` exports. Parsing, validation, and the replace-board
 * commit live in the board route (`handleImportBoardFile`).
 */
export function JsonImport({
  onPick,
  label = 'Import',
  className = 'group-create-button',
}: JsonImportProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => inputRef.current?.click()}
        title="Import a board JSON file (replaces the current board, undoable)"
      >
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onPick(file)
          e.target.value = ''
        }}
      />
    </>
  )
}
