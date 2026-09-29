import { useEffect, useRef } from 'react'
import { Markdown } from '@tanstack/markdown/react'

import { markdownComponents } from '#/lib/markdown/components'
import { Textarea } from '@/components/ui/textarea'

import type { TextBlockData } from '#/types'

export function TextBlockView({ data }: { data: TextBlockData }) {
  return (
    <div className="md-block">
      <Markdown components={markdownComponents}>{data.markdown}</Markdown>
    </div>
  )
}

interface TextBlockEditorProps {
  data: TextBlockData
  onCommit: (markdown: string) => void
  onCancel: () => void
}

export function TextBlockEditor({ data, onCommit, onCancel }: TextBlockEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow the transparent textarea to match the height of the rendered
  // markdown, so entering edit mode doesn't shift or clip the text (in-place
  // Figma-style editing).
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [data.markdown])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onCommit(e.currentTarget.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <Textarea
      ref={textareaRef}
      className="block-editor min-h-0 p-0 rounded-none border-0 bg-transparent field-sizing-none dark:bg-transparent"
      defaultValue={data.markdown}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={handleKeyDown}
      // Commit when focus leaves the editor (clicking away, tabbing, etc.)
      onBlur={(e) => onCommit(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      rows={1}
    />
  )
}