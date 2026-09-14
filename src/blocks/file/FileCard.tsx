import type { FileBlockData } from '#/types'
import {
  FILE_DEFAULT_VIEW,
  resolveView,
} from '#/lib/blocks/views'

/** Format a byte count as a compact size label (B / KB / MB / GB / TB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[index]}`
}

export const FILE_ICON = (
  <svg
    className="file-card-icon"
    viewBox="0 0 16 16"
    width="16"
    height="16"
    aria-hidden="true"
  >
    <path
      d="M3 1.5h7l3 3V14a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path
      d="M10 1.5V5h3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
)

export function FileCard({ data }: { data: FileBlockData }) {
  const view = resolveView('file', data.view) ?? FILE_DEFAULT_VIEW

  // Content view — the media fills the card (image rendered, text scrolls);
  // no meta header. Metadata-only uploads fall back to an oversized icon.
  if (view === 'content') {
    const hasContent = Boolean((data.content ?? '').trim())
    return (
      <div className="file-card is-view-content">
        {hasContent ? (
          <FileContentPreview
            name={data.name}
            mimeType={data.mimeType}
            content={data.content!}
          />
        ) : (
          <span className="file-card-content-empty" title={data.name}>
            <span className="file-card-icon-emblem">{FILE_ICON}</span>
            <span className="file-card-name">{data.name}</span>
          </span>
        )}
      </div>
    )
  }

  // Meta view — compact chip: name, size, and type only.
  if (view === 'meta') {
    return (
      <div className="file-card is-view-meta">
        <span className="file-card-icon-wrap">{FILE_ICON}</span>
        <div className="file-card-copy">
          <p className="file-card-name" title={data.name}>
            {data.name}
          </p>
          <p className="file-card-meta">
            {formatBytes(data.size)}
            {data.mimeType ? ` · ${data.mimeType}` : ''}
          </p>
        </div>
      </div>
    )
  }

  // Card view — the default: meta header plus the inline preview.
  return (
    <div className="file-card">
      <span className="file-card-icon-wrap">{FILE_ICON}</span>
      <div className="file-card-copy">
        <p className="file-card-name" title={data.name}>
          {data.name}
        </p>
        <p className="file-card-meta">
          {formatBytes(data.size)}
          {data.mimeType ? ` · ${data.mimeType}` : ''}
        </p>
        {(data.content ?? '').trim() && (
          <FileContentPreview
            name={data.name}
            mimeType={data.mimeType}
            content={data.content!}
          />
        )}
      </div>
    </div>
  )
}

const TEXT_PREVIEW_CHARS = 400

function isSvgContent(name: string, mimeType: string, content: string): boolean {
  const trimmed = content.trim()
  return (
    mimeType === 'image/svg+xml' ||
    /\.svg$/i.test(name) ||
    trimmed.startsWith('<svg')
  )
}

/** Preview for M16 AI-authored inline files: render SVG as an image and other
 *  text content as an escaped monospace snippet. */
function FileContentPreview({
  name,
  mimeType,
  content,
}: {
  name: string
  mimeType: string
  content: string
}) {
  if (isSvgContent(name, mimeType, content)) {
    const encoded = encodeURIComponent(content)
    return (
      <div className="file-card-preview is-svg">
        <img
          className="file-card-svg"
          alt={name}
          src={`data:image/svg+xml,${encoded}`}
        />
      </div>
    )
  }
  const slice =
    content.length > TEXT_PREVIEW_CHARS
      ? `${content.slice(0, TEXT_PREVIEW_CHARS)}\n…`
      : content
  return (
    <div className="file-card-preview is-text">
      <pre className="file-card-text">{slice}</pre>
    </div>
  )
}