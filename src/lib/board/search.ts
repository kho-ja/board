export interface SearchableBlock {
  blockId: string
  title: string
  caption: string
  terms: string[]
}

export interface SearchResult {
  blockId: string
  title: string
  caption: string
  score: number
  matchTitle: boolean
}

export const DEFAULT_SEARCH_LIMIT = 12

function normalize(input: string): string {
  return input.toLowerCase()
}

/** Every whitespace-separated query word must appear somewhere in the block's
 * title or index terms. */
export function matchesQuery(query: string, item: SearchableBlock): boolean {
  const words = normalize(query.trim()).split(/\s+/)
  if (words.length === 0 || words[0] === '') return false
  const haystack = normalize([item.title, ...item.terms].join(' '))
  return words.every((word) => haystack.includes(word))
}

/** Lower is better. Single-word queries rank by how strongly the word matches:
 *  0 = title starts with it, 1 = another term starts with it, 2 = title
 *  contains it, 3 = a term merely contains it. Multi-word queries rank by the
 *  first word and rely on `matchesQuery` for the AND across all words. */
function scoreFor(query: string, item: SearchableBlock): number {
  const words = normalize(query.trim()).split(/\s+/)
  const first = words[0]
  const title = normalize(item.title)
  const terms = item.terms.map(normalize)

  if (title.startsWith(first)) return 0
  if (terms.some((term) => term.startsWith(first))) return 1
  if (title.includes(first)) return 2
  return 3
}

export function searchBlocks(
  query: string,
  items: SearchableBlock[],
  limit = DEFAULT_SEARCH_LIMIT,
): SearchResult[] {
  const trimmed = query.trim()
  if (!trimmed) return []
  const firstWord = normalize(trimmed).split(/\s+/)[0]

  return items
    .filter((item) => matchesQuery(trimmed, item))
    .map((item) => ({
      blockId: item.blockId,
      title: item.title,
      caption: item.caption,
      score: scoreFor(trimmed, item),
      matchTitle: normalize(item.title).includes(firstWord),
    }))
    .sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
    .slice(0, limit)
}