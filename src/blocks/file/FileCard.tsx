import type { FileBlockData } from '#/types'

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
      </div>
    </div>
  )
}