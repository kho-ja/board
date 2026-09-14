import type { FileView } from '#/types'

/**
 * M17 — the block-view registry. A view is a purely presentational projection:
 * it decides which parts of a block's existing data are rendered, never what
 * the data is. Each block kind ships a small fixed set; a block stores its
 * active view in its own `data.view` and falls back to the kind default.
 *
 * v1 ships file views only (card/content/meta); text, card, and group kinds
 * keep today's hard-coded rendering until their views land (group already has
 * its own card/list toggle for layout).
 */
export interface BlockViewDef {
  id: string
  label: string
}

export const FILE_VIEWS: readonly BlockViewDef[] = [
  { id: 'card', label: 'Card' },
  { id: 'content', label: 'Content' },
  { id: 'meta', label: 'Meta' },
]

export const FILE_DEFAULT_VIEW: FileView = 'card'

const KIND_VIEWS: Readonly<Record<string, readonly BlockViewDef[]>> = {
  file: FILE_VIEWS,
}

/** The switchable views a block kind offers (empty = no view menu yet). */
export function viewsForKind(kind: string): readonly BlockViewDef[] {
  return KIND_VIEWS[kind] ?? []
}

/** Strip an invalid stored view down to the kind's default. */
export function resolveView(
  kind: string,
  stored: string | null | undefined,
): string | undefined {
  const defs = viewsForKind(kind)
  if (!defs.length) return undefined
  return defs.some((v) => v.id === stored) ? stored ?? undefined : undefined
}