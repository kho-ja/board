import type { ObservableBlock } from '#/components/canvas/BlockShell'
import type { FileBlockData, SchemaDef } from '#/types'

export function getAssetCategory(
  block: ObservableBlock,
  types: readonly SchemaDef[] = [],
): string {
  if (block.kind === 'file') {
    const data = block.data as FileBlockData
    const mime = (data.mimeType || '').toLowerCase()
    const name = (data.name || '').toLowerCase()
    const ext = name.includes('.') ? name.split('.').pop() || '' : ''

    if (
      mime.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)
    ) {
      return 'Images'
    }

    if (
      mime.startsWith('video/') ||
      mime.startsWith('audio/') ||
      ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)
    ) {
      return 'Media'
    }

    if (
      mime.includes('pdf') ||
      mime.includes('word') ||
      mime.includes('document') ||
      mime.includes('text/plain') ||
      mime.includes('text/markdown') ||
      ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)
    ) {
      return 'Documents'
    }

    if (
      mime.includes('json') ||
      mime.includes('javascript') ||
      mime.includes('typescript') ||
      mime.includes('html') ||
      mime.includes('css') ||
      mime.includes('csv') ||
      mime.includes('xml') ||
      ['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'html', 'css', 'sql', 'csv', 'yaml', 'yml', 'sh'].includes(ext)
    ) {
      return 'Code & Data'
    }

    return 'Files'
  }

  if (block.kind === 'text') {
    return 'Notes & Text'
  }

  if (block.kind === 'file-group') {
    return 'File Groups'
  }

  const schemaId = (block.data as { schemaId?: string })?.schemaId || block.kind
  const schema = types.find((t) => t.id === schemaId || t.id === block.kind)
  if (schema) {
    return schema.name
  }

  return 'Custom Objects'
}
