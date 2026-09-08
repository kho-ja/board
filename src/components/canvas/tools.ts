export type Tool = 'move' | 'hand' | 'text' | 'link'

export const TOOLS: { id: Tool; label: string; shortcut: string }[] = [
  { id: 'move', label: 'Move', shortcut: 'V' },
  { id: 'hand', label: 'Hand', shortcut: 'H' },
  { id: 'text', label: 'Text', shortcut: 'T' },
  { id: 'link', label: 'Connector', shortcut: 'C' },
]
