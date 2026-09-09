import type { ConnectionType, ObservableLink } from '#/types'

/**
 * M13 — typed connections (DECISIONS.md "typed connection set").
 *
 * The connection types are a small, fixed enum; each new type must earn its
 * place. `related-to` is the only **symmetric** type and the generic fallback;
 * the rest are **directional** — the drawn arrow expresses the canonical
 * meaning (depends-on: dependant → dependency, responsible-for: person →
 * thing, part-of: part → whole) — so the stored pair follows the draw order.
 */

export const CONNECTION_TYPES = [
  'depends-on',
  'responsible-for',
  'part-of',
  'related-to',
] as const satisfies readonly ConnectionType[]

export type ConnectionTypeDef = (typeof CONNECTION_TYPES)[number]

export const DEFAULT_CONNECTION_TYPE: ConnectionType = 'related-to'

/** Human labels for the picker and link labels. */
export const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  'depends-on': 'Depends on',
  'responsible-for': 'Responsible for',
  'part-of': 'Part of',
  'related-to': 'Related to',
}

/** CSS-var names; values live in styles.css (`--conn-*`). */
export const CONNECTION_TYPE_COLORS: Record<ConnectionType, string> = {
  'depends-on': 'var(--conn-depends)',
  'responsible-for': 'var(--conn-responsible)',
  'part-of': 'var(--conn-part)',
  'related-to': 'var(--conn-related)',
}

export function isDirected(type: ConnectionType): boolean {
  return type !== 'related-to'
}

/** Missing/legacy type resolves to the generic fallback. */
export function resolveType(link: Pick<ObservableLink, 'type'>): ConnectionType {
  return link.type ?? DEFAULT_CONNECTION_TYPE
}

/** Type used to accept an edge as drawn (blockA → blockB). */
export type DirectedEdge = { a: string; b: string; type: ConnectionType }

/**
 * Identity of a connection for dedupe. `related-to` is symmetric, so its
 * identity is order-independent (both draw directions are the same edge);
 * directional edges keep their orientation (reversing them is a different
 * fact). Multiple edges of *different* types are always allowed between a
 * pair (DECISIONS.md "Relationship cardinality & edge data").
 */
export function semanticKey(edge: DirectedEdge): string {
  if (edge.type === 'related-to') {
    const [lo, hi] = edge.a < edge.b ? [edge.a, edge.b] : [edge.b, edge.a]
    return `${lo}:${hi}:related-to`
  }
  return `${edge.a}->${edge.b}:${edge.type}`
}

/** Shorthand for checking whether an identical connection already exists. */
export function connectionExists(
  links: Pick<ObservableLink, 'id' | 'blockAId' | 'blockBId' | 'type'>[],
  a: string,
  b: string,
  type: ConnectionType = DEFAULT_CONNECTION_TYPE,
): boolean {
  return links.some((l) => semanticKey({ a: l.blockAId, b: l.blockBId, type: resolveType(l) }) === semanticKey({ a, b, type }))
}