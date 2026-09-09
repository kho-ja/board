/**
 * M12 — mini-map projection (pure, no React). Maps world coordinates into a
 * small fixed-size frame that fits the board content.
 */

export interface MiniBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface MiniRect {
  x: number
  y: number
  width: number
  height: number
}

export interface MiniFit {
  /** World units per mini pixel. */
  k: number
  /** Mini-space origin offset (letterboxing). */
  ox: number
  oy: number
}

export const MINIMAP_MARGIN_PX = 160
/** Degenerate content (a single point) still gets a usable frame. */
const MIN_SPAN_PX = 200

/** Bounding box of the given world rects, or null when there is nothing. */
export function contentBounds(rects: MiniRect[]): MiniBounds | null {
  if (rects.length === 0) return null
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxX: Math.max(...rects.map((r) => r.x + r.width)),
    maxY: Math.max(...rects.map((r) => r.y + r.height)),
  }
}

export function expandBounds(b: MiniBounds, pad: number): MiniBounds {
  return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad }
}

export function unionBounds(a: MiniBounds, b: MiniBounds): MiniBounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

/** Fit `bounds` into a fw×fh frame with `pad` mini-px of inset. */
export function fitView(bounds: MiniBounds, fw: number, fh: number, pad: number): MiniFit {
  const spanX = Math.max(MIN_SPAN_PX, bounds.maxX - bounds.minX)
  const spanY = Math.max(MIN_SPAN_PX, bounds.maxY - bounds.minY)
  const k = Math.min((fw - pad * 2) / spanX, (fh - pad * 2) / spanY)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return { k, ox: fw / 2 - cx * k, oy: fh / 2 - cy * k }
}

export function worldToMini(p: { x: number; y: number }, fit: MiniFit) {
  return { x: p.x * fit.k + fit.ox, y: p.y * fit.k + fit.oy }
}

export function miniToWorld(m: { x: number; y: number }, fit: MiniFit) {
  return { x: (m.x - fit.ox) / fit.k, y: (m.y - fit.oy) / fit.k }
}

/**
 * Viewport offset that centers world point `p` in a W×H container without
 * changing the zoom level.
 */
export function centerOffset(
  p: { x: number; y: number },
  scale: number,
  container: { width: number; height: number },
): { x: number; y: number } {
  return { x: container.width / 2 - p.x * scale, y: container.height / 2 - p.y * scale }
}
