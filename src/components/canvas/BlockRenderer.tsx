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
  return <p className="block-title">{blockTitle(block)}</p>
}
