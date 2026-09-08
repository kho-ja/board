import { FileGroupBlock } from '#/blocks/file-group/FileGroupBlock'
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

interface BlockRendererProps {
  block: ObservableBlock
  members?: ObservableBlock[]
  onGroupViewChange?: (view: 'card' | 'list') => void
  onMemberClick?: (blockId: string) => void
  fromGroupId?: string
}

export function BlockRenderer({
  block,
  members = [],
  onGroupViewChange,
  onMemberClick,
  fromGroupId,
}: BlockRendererProps) {
  if (block.kind === 'text') {
    return <TextBlockView data={block.data as TextBlockData} />
  }
  if (block.kind === 'file') {
    return <FileCard data={block.data as FileBlockData} />
  }
  if (block.kind === 'file-group') {
    return (
      <FileGroupBlock
        data={block.data as FileGroupBlockData}
        members={members}
        onViewChange={onGroupViewChange}
        onMemberClick={onMemberClick}
        fromGroupId={fromGroupId}
      />
    )
  }
  return <p className="block-title">{blockTitle(block)}</p>
}