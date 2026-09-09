/**
 * M11 — canvas PNG export.
 *
 * Renders the board with the 2D canvas API (cards, plain-text blocks, and the
 * same cubic-bezier link curves as the live SVG layer) so the export needs no
 * external resources. An SVG-foreignObject approach was tried first, but
 * Chromium taints the canvas for any SVG containing foreignObject, which
 * makes toBlob throw — canvas drawing stays clean.
 */

import {
  CONNECTION_TYPE_COLORS,
  DEFAULT_CONNECTION_TYPE,
  isDirected,
  resolveType,
} from './connections'
import type { ConnectionType } from '#/types'

export interface BoardPngBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface PngBlockRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PngBlockInput {
  rect: PngBlockRect
  kind: string
  title: string
  subtitle?: string
  /** Text lines (text markdown), member names (groups), or `key: value` rows. */
  body?: string[]
}

export interface PngLinkCurve {
  d: string
  startX: number
  startY: number
  endX: number
  endY: number
  /** M13 typed connection — drives the arrowhead and stroke color. */
  type?: ConnectionType
}

const PNG_PAD_PX = 64
const PNG_MAX_SIDE_PX = 4096
const PNG_SCALE = 2
const FONT_STACK = 'Manrope, system-ui, -apple-system, sans-serif'

interface Palette {
  background: string
  card: string
  border: string
  ink: string
  soft: string
  lagoon: string
  lagoonDeep: string
  chip: string
  connections: Record<string, string>
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const viewport = document.querySelector<HTMLElement>('.canvas-viewport')
  const background = viewport ? getComputedStyle(viewport).backgroundColor : ''
  const connections: Record<string, string> = {}
  for (const [type, varName] of Object.entries(CONNECTION_TYPE_COLORS)) {
    connections[type] = v(varName, type === DEFAULT_CONNECTION_TYPE ? '#4fb8b2' : '#416166')
  }
  return {
    background: background && background !== 'rgba(0, 0, 0, 0)' ? background : '#ffffff',
    card: v('--surface-strong', 'rgba(255, 255, 255, 0.92)'),
    border: v('--line', 'rgba(23, 58, 64, 0.14)'),
    ink: v('--sea-ink', '#173a40'),
    soft: v('--sea-ink-soft', '#416166'),
    lagoon: v('--lagoon', '#4fb8b2'),
    lagoonDeep: v('--lagoon-deep', '#328f97'),
    chip: v('--chip-bg', 'rgba(255, 255, 255, 0.8)'),
    connections,
  }
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid + 1
    else hi = mid
  }
  return `${text.slice(0, Math.max(0, lo - 1))}…`
}

/** Greedy word wrap; overlong words are hard-split. */
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      const trial = line ? `${line} ${word}` : word
      if (ctx.measureText(trial).width <= maxWidth || !line) {
        if (ctx.measureText(word).width > maxWidth) {
          // Hard-split an overlong word.
          let rest = word
          const prefix = line ? `${line} ` : ''
          line = prefix
          while (rest) {
            let i = rest.length
            while (i > 0 && ctx.measureText(line + rest.slice(0, i)).width > maxWidth) i--
            if (i === 0) break
            line += rest.slice(0, i)
            rest = rest.slice(i)
            if (rest) {
              out.push(line)
              line = ''
            }
          }
        } else {
          line = trial
        }
      } else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

function drawFileGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  // Minimal document outline with a folded corner, in the current stroke style.
  const w = s * 0.62
  const h = s * 0.78
  const fold = s * 0.2
  ctx.beginPath()
  ctx.moveTo(x + (s - w) / 2, y + (s - h) / 2)
  ctx.lineTo(x + (s - w) / 2 + w - fold, y + (s - h) / 2)
  ctx.lineTo(x + (s - w) / 2 + w, y + (s - h) / 2 + fold)
  ctx.lineTo(x + (s - w) / 2 + w, y + (s + h) / 2)
  ctx.lineTo(x + (s - w) / 2, y + (s + h) / 2)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + (s - w) / 2 + w - fold, y + (s - h) / 2)
  ctx.lineTo(x + (s - w) / 2 + w - fold, y + (s - h) / 2 + fold)
  ctx.lineTo(x + (s - w) / 2 + w, y + (s - h) / 2 + fold)
  ctx.stroke()
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  rect: PngBlockRect,
  radius = 10,
): void {
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
  ctx.fillStyle = pal.card
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = pal.border
  ctx.stroke()
}

function drawFileBlock(ctx: CanvasRenderingContext2D, pal: Palette, block: PngBlockInput): void {
  const { rect, title, subtitle } = block
  drawCard(ctx, pal, rect)
  const pad = 12
  const chip = 30
  const cx = rect.x + pad
  const cy = rect.y + (rect.height - chip) / 2
  ctx.beginPath()
  ctx.roundRect(cx, cy, chip, chip, 7)
  ctx.fillStyle = pal.chip
  ctx.fill()
  ctx.lineWidth = 1.4
  ctx.strokeStyle = pal.lagoonDeep
  drawFileGlyph(ctx, cx, cy, chip)
  const textX = cx + chip + 9
  const maxW = Math.max(10, rect.x + rect.width - pad - textX)
  ctx.fillStyle = pal.ink
  ctx.font = `700 13px ${FONT_STACK}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(ellipsize(ctx, title, maxW), textX, cy + 13)
  if (subtitle) {
    ctx.fillStyle = pal.soft
    ctx.font = `400 11px ${FONT_STACK}`
    ctx.fillText(ellipsize(ctx, subtitle, maxW), textX, cy + 27)
  }
}

function drawTextBlock(ctx: CanvasRenderingContext2D, pal: Palette, block: PngBlockInput): void {
  // Figma-style: plain text, no card chrome — mirrors .block-shell.is-text.
  const { rect, body } = block
  ctx.fillStyle = pal.ink
  ctx.font = `400 14px ${FONT_STACK}`
  ctx.textBaseline = 'alphabetic'
  const lineHeight = 20
  let y = rect.y + 16
  const maxY = rect.y + rect.height
  for (const paragraph of body ?? [block.title]) {
    for (const line of wrapLines(ctx, paragraph, Math.max(10, rect.width))) {
      if (y > maxY + 4) return
      ctx.fillText(line, rect.x, y)
      y += lineHeight
    }
  }
}

function drawRowList(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  rect: PngBlockRect,
  rows: string[],
  startY: number,
): void {
  const rowH = 26
  const pad = 12
  ctx.font = `400 12px ${FONT_STACK}`
  ctx.textBaseline = 'alphabetic'
  let y = startY
  const maxRows = Math.max(0, Math.floor((rect.y + rect.height - pad - y) / rowH))
  const visible = rows.slice(0, maxRows)
  for (const row of visible) {
    ctx.beginPath()
    ctx.roundRect(rect.x + pad, y, rect.width - pad * 2, rowH - 6, 6)
    ctx.fillStyle = pal.chip
    ctx.fill()
    ctx.fillStyle = pal.ink
    ctx.fillText(
      ellipsize(ctx, row, rect.width - pad * 2 - 16),
      rect.x + pad + 8,
      y + 16,
    )
    y += rowH
  }
  const hidden = rows.length - visible.length
  if (hidden > 0 && y + 14 <= rect.y + rect.height - 6) {
    ctx.fillStyle = pal.soft
    ctx.fillText(`+${hidden} more`, rect.x + pad + 8, y + 14)
  }
}

function drawGroupBlock(ctx: CanvasRenderingContext2D, pal: Palette, block: PngBlockInput): void {
  const { rect, title, subtitle, body } = block
  drawCard(ctx, pal, rect, 12)
  const pad = 14
  ctx.fillStyle = pal.ink
  ctx.font = `700 13px ${FONT_STACK}`
  ctx.textBaseline = 'alphabetic'
  const count = subtitle ?? `${body?.length ?? 0} files`
  const countW = ctx.measureText(count)
  ctx.font = `400 11px ${FONT_STACK}`
  ctx.fillStyle = pal.soft
  ctx.fillText(count, rect.x + rect.width - pad - countW.width, rect.y + 24)
  ctx.fillStyle = pal.ink
  ctx.font = `700 13px ${FONT_STACK}`
  ctx.fillText(
    ellipsize(ctx, title, Math.max(10, rect.width - pad * 2 - countW.width - 8)),
    rect.x + pad,
    rect.y + 24,
  )
  drawRowList(ctx, pal, rect, body ?? [], rect.y + 38)
}

function drawObjectBlock(ctx: CanvasRenderingContext2D, pal: Palette, block: PngBlockInput): void {
  const { rect, title, subtitle, body } = block
  drawCard(ctx, pal, rect, 10)
  const pad = 12
  ctx.fillStyle = pal.ink
  ctx.font = `700 13px ${FONT_STACK}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(ellipsize(ctx, title, rect.width - pad * 2), rect.x + pad, rect.y + 24)
  let y = rect.y + 44
  ctx.font = `400 12px ${FONT_STACK}`
  const rows = [...(subtitle ? [subtitle] : []), ...(body ?? [])]
  for (const row of rows.slice(0, 5)) {
    if (y > rect.y + rect.height - 8) break
    ctx.fillStyle = pal.soft
    ctx.fillText(ellipsize(ctx, row, rect.width - pad * 2), rect.x + pad, y)
    y += 19
  }
}

/**
 * Render the given blocks + link curves inside `bounds` to a PNG blob.
 * All coordinates are world units; the export is drawn at 2x (capped so the
 * longest side stays within 4096px).
 */
export async function renderBoardPng(
  blocks: PngBlockInput[],
  links: PngLinkCurve[],
  bounds: BoardPngBounds,
): Promise<Blob> {
  const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + PNG_PAD_PX * 2))
  const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + PNG_PAD_PX * 2))
  const scale = Math.min(PNG_SCALE, PNG_MAX_SIDE_PX / Math.max(width, height))
  const pal = readPalette()

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d is not available')

  ctx.setTransform(scale, 0, 0, scale, -(bounds.minX - PNG_PAD_PX) * scale, -(bounds.minY - PNG_PAD_PX) * scale)
  ctx.fillStyle = pal.background
  ctx.fillRect(bounds.minX - PNG_PAD_PX, bounds.minY - PNG_PAD_PX, width, height)

  ctx.lineCap = 'round'
  for (const link of links) {
    const type = resolveType({ type: link.type })
    const color = pal.connections[type] ?? pal.soft
    ctx.strokeStyle = color
    ctx.fillStyle = color

    ctx.beginPath()
    ctx.lineWidth = 1.8
    ctx.stroke(new Path2D(link.d))

    // Directed types get an arrowhead at the tip.
    if (isDirected(type)) {
      const dx = link.endX - link.startX
      const dy = link.endY - link.startY
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      const arrowLen = 12
      const arrowHalf = 5.5
      const tipX = link.endX - ux * (arrowLen * 0.35)
      const tipY = link.endY - uy * (arrowLen * 0.35)
      ctx.beginPath()
      ctx.moveTo(tipX + ux * arrowLen, tipY + uy * arrowLen)
      ctx.lineTo(
        tipX - uy * arrowHalf,
        tipY + ux * arrowHalf,
      )
      ctx.lineTo(
        tipX + uy * arrowHalf,
        tipY - ux * arrowHalf,
      )
      ctx.closePath()
      ctx.fill()
    }

    for (const [x, y] of [
      [link.startX, link.startY],
      [link.endX, link.endY],
    ] as const) {
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  for (const block of blocks) {
    if (block.kind === 'text') drawTextBlock(ctx, pal, block)
    else if (block.kind === 'file-group') drawGroupBlock(ctx, pal, block)
    else if (block.kind === 'file') drawFileBlock(ctx, pal, block)
    else drawObjectBlock(ctx, pal, block)
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('could not encode the PNG')
  return blob
}

export function pngFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `kho-ja-board-${stamp}.png`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
