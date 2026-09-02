import { FileCard } from '#/blocks/file/FileCard'
import { TextBlockView } from '#/blocks/text/TextBlock'
import type {
  FileBlockData,
  FileGroupBlockData,
  ObjectBlockData,
  TextBlockData,
} from '#/types'
import type { ObservableBlock } from './BlockShell'

export function blockTitle(block: ObservableBlock): string {
  switch (block.kind) {
    case 'text':
      return (block.data as TextBlockData).markdown.trim() || 'Empty text block'
    case 'file':
      return (block.data as FileBlockData).name
    case 'file-group':
      return (block.data as FileGroupBlockData).name
    default:
      return (block.data as ObjectBlockData).schemaId
  }
}

export function BlockRenderer({ block }: { block: ObservableBlock }) {
  if (block.kind === 'text') {
    return <TextBlockView data={block.data as TextBlockData} />
  }
  if (block.kind === 'file') {
    return <FileCard data={block.data as FileBlockData} />
  }
  return <p className="block-title">{blockTitle(block)}</p>
}
