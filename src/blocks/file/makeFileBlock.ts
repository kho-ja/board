import type { FileBlockData } from '#/types'

/**
 * Build a `file` block row from a picked/dropped File. Only metadata is stored
 * (name, size, mimeType — no bytes); both `kind` and `data.kind` are set to
 * `'file'` so the discriminated union stays consistent (Q-M4.4).
 */
export function makeFileBlock(file: Pick<File, 'name' | 'size' | 'type'>): {
  kind: 'file'
  data: FileBlockData
} {
  return {
    kind: 'file',
    data: {
      kind: 'file',
      name: file.name,
      size: file.size,
      mimeType: file.type,
    },
  }
}