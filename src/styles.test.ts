import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the Tailwind v4 cascade-layer trap.
 *
 * shadcn primitives ship their look as *utilities* in JSX. Tailwind emits
 * `@layer theme, base, components, utilities`, and cascade layers are applied
 * before specificity -- so a brand rule for a primitive-composed element that
 * lives in `@layer components` loses to a plain `text-sm` no matter how
 * specific the selector. It is silently dead: no error, the rule just never
 * applies.
 *
 * That has bitten this stylesheet repeatedly (the dock tab strip, the Ask search
 * box, the chat list rows, the suggestion chips, the "new chat" button, the
 * inspector buttons and inputs, the block text editor, the status-bar zoom
 * control), each time surfacing as a visual bug rather than a build failure.
 * Every rule targeting one of the classes below therefore has to live in
 * `@layer brand-overrides`.
 */

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), 'styles.css')

/**
 * Classes applied to an element that composes a shadcn primitive.
 *
 * The non-Ask entries came out of a sweep that walked every app component,
 * matched each className passed to a primitive against the layer map, and then
 * compared the properties each brand rule declares against the ones the
 * primitive's own variant string sets. Only classes with a real overlap are
 * listed -- e.g. `.block-shell` is applied to a `ContextMenuTrigger`, whose only
 * utility is `select-none`, so it is safe in `components` and is not listed.
 */
const PRIMITIVE_BACKED = [
  'ai-drawer-close',
  'ask-error-retry',
  'ask-history-del',
  'ask-history-main',
  'ask-model-select',
  'ask-newchat',
  'ask-notconfigured-link',
  'ask-search-hit',
  'ask-search-main',
  'ask-suggestion',
  'block-editor',
  'chrome-icon',
  'conn-type-picker',
  'file-group-member',
  'group-create-button',
  'inspector-align-btn',
  'inspector-btn',
  'inspector-input',
  'object-edit-schema-btn',
  'tool-button',
  'view-selector',
  'view-selector-btn',
  'zoom-percent',
] as const

/**
 * Maps each class to the `@layer` it is declared in.
 *
 * A character-level scan rather than a line-based one: a selector is only the
 * text immediately preceding a `{`, and rules nested in `@media`/`@keyframes`
 * inherit the enclosing `@layer`. Comments are stripped first -- they name these
 * very classes in the explanatory notes, and they contain braces that would
 * corrupt depth tracking.
 */
function layerBySelector(css: string): Map<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found = new Map<string, string>()
  const layerStack: string[] = []
  let layer = 'unlayered'
  let buffer = ''
  let depth = 0

  const record = (selectorText: string, currentLayer: string) => {
    for (const part of selectorText.split(',')) {
      // `.ask-search-hit:last-child` -> `ask-search-hit`; the class name is the
      // run of name characters immediately after the dot.
      const match = part.trim().match(/^\.([a-z][a-z0-9_-]*)/i)
      if (match && !found.has(match[1])) found.set(match[1], currentLayer)
    }
  }

  for (const ch of source) {
    if (ch === '{') {
      const selector = buffer.trim()
      buffer = ''
      const layerDecl = selector.match(/^@layer\s+([\w-]+)$/)
      if (layerDecl) {
        layerStack.push(layer)
        layer = layerDecl[1]
      } else if (selector && !selector.startsWith('@')) {
        record(selector, layer)
      }
      depth++
    } else if (ch === '}') {
      depth--
      buffer = ''
      // Only a layer block closing brings depth back to 0 with a layer open.
      if (depth === 0 && layerStack.length > 0) {
        layer = layerStack.pop() as string
      }
    } else {
      buffer += ch
    }
  }
  return found
}

const layers = layerBySelector(readFileSync(cssPath, 'utf8'))

describe('shadcn primitive overrides live in brand-overrides', () => {
  it('finds the stylesheet', () => {
    expect(layers.size).toBeGreaterThan(150)
  })

  for (const cls of PRIMITIVE_BACKED) {
    it(`.${cls} is not declared in @layer components`, () => {
      const layer = layers.get(cls)
      // Not being styled at all is also a failure: the element exists.
      expect(layer, `.${cls} has no rule in styles.css`).toBeDefined()
      expect(layer, `.${cls} must live in brand-overrides, found in ${layer}`)
        .toBe('brand-overrides')
    })
  }

  it('brand-overrides is declared after components in source order', () => {
    // Cascade layers are applied in declaration order, so a later
    // `@layer brand-overrides` wins against utilities only because utilities
    // are unlayered-equivalent-later. Renaming or reordering breaks it.
    const css = readFileSync(cssPath, 'utf8')
    const firstComponents = css.indexOf('@layer components')
    const brandOverrides = css.indexOf('@layer brand-overrides')
    expect(firstComponents).toBeGreaterThan(-1)
    expect(brandOverrides).toBeGreaterThan(firstComponents)
  })
})
