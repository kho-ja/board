import { FileGroupBlock } from '#/blocks/file-group/FileGroupBlock'
import { FileCard } from '#/blocks/file/FileCard'
import { ObjectCard } from '#/blocks/object/ObjectCard'
import { TextBlockView } from '#/blocks/text/TextBlock'
import type {
  FileBlockData,
  FileGroupBlockData,
  ObjectBlockData,
  SchemaDef,
  TextBlockData,
} from '#/types'
import type { ObservableBlock } from './BlockShell'

export function blockTitle(
  block: ObservableBlock,
  types?: readonly SchemaDef[],
): string {
  switch (block.kind) {
    case 'text':
      return (block.data as TextBlockData).markdown.trim() || 'Empty text block'
    case 'file':
      return (block.data as FileBlockData).name
    case 'file-group':
      return (block.data as FileGroupBlockData).name
    default: {
      const data = block.data as ObjectBlockData
      const typeDef = types?.find(
        (t) => t.id === data.schemaId || t.id === block.kind,
      )
      const typeName = typeDef?.name ?? data.schemaId ?? block.kind
      const values = data.values ?? {}

      const titleField = typeDef?.fields.find((f) =>
        ['title', 'name', 'label'].includes(f.name.toLowerCase()),
      )
      const titleVal = titleField
        ? values[titleField.id] ?? values[titleField.name]
        : undefined

      if (typeof titleVal === 'string' && titleVal.trim()) {
        return `${typeName}: ${titleVal.trim()}`
      }

      const firstText = Object.values(values).find(
        (v) => typeof v === 'string' && v.trim(),
      )
      if (typeof firstText === 'string' && firstText.trim()) {
        return `${typeName}: ${firstText.trim()}`
      }

      return `New ${typeName}`
    }
  }
}

interface BlockRendererProps {
  block: ObservableBlock
  schema?: SchemaDef | null
  members?: ObservableBlock[]
  onGroupViewChange?: (view: 'card' | 'list') => void
  onMemberClick?: (blockId: string) => void
  fromGroupId?: string
}

export function BlockRenderer({
  block,
  schema,
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
  return (
    <ObjectCard
      data={block.data as ObjectBlockData}
      schema={schema}
    />
  )
}
