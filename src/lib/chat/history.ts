import type { ChatPersistedState, UIMessage } from '@tanstack/ai-client'

/**
 * M18 — Ask history: every Ask thread is one `ChatPersistedState` blob in
 * localStorage under `khoja.chat.<threadId>` (the same client-authoritative
 * storage `useChat` already uses, just namespaced per thread instead of a
 * single fixed thread). A small index keeps thread metadata so the panel can
 * list, resume, delete, and search across all past conversations.
 *
 * All functions here are pure/IO-light so they're unit-testable; the UI owns
 * rendering.
 */

/** Storage keys (namespaced apart from the per-thread blobs). */
export const CHAT_PREFIX = 'khoja.chat.'
export const CHAT_INDEX_KEY = `${CHAT_PREFIX}index`
export const CHAT_ACTIVE_KEY = `${CHAT_PREFIX}active`

/** The pre-M18 single-thread blob (`tanstack-ai:` default prefix + fixed id). */
export const LEGACY_CHAT_KEY = 'tanstack-ai:khoja-board-ask'

export interface ThreadMeta {
  id: string
  title: string
  createdAt: number
  lastMessageAt: number
  messageCount: number
}

export const DEFAULT_TITLE = 'New chat'

export function newThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- thread index (localStorage) ----------

export function loadThreadIndex(): ThreadMeta[] {
  try {
    const raw = localStorage.getItem(CHAT_INDEX_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (t): t is ThreadMeta =>
        Boolean(t) &&
        typeof t.id === 'string' &&
        typeof t.title === 'string',
    )
  } catch {
    return []
  }
}

export function saveThreadIndex(threads: ThreadMeta[]): void {
  try {
    localStorage.setItem(CHAT_INDEX_KEY, JSON.stringify(threads))
  } catch {
    // best-effort, mirroring the chat persistence layer
  }
}

export function loadActiveThreadId(): string | null {
  try {
    return localStorage.getItem(CHAT_ACTIVE_KEY)
  } catch {
    return null
  }
}

export function saveActiveThreadId(id: string): void {
  try {
    localStorage.setItem(CHAT_ACTIVE_KEY, id)
  } catch {
    // best-effort
  }
}

/** Read one thread blob, returned either way for tests that fake storage. */
export function readThreadBlob(
  threadId: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): ChatPersistedState | null {
  try {
    const raw = storage.getItem(`${CHAT_PREFIX}${threadId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.messages)) return parsed
    if (Array.isArray(parsed)) return { messages: parsed }
    return null
  } catch {
    return null
  }
}

/**
 * Migrate the pre-M18 single fixed thread into the per-thread model. Writes
 * the migrated blob under its new per-thread key and deletes the legacy key.
 * Returns the migrated thread metadata, or null when there was nothing to
 * migrate.
 */
export function migrateLegacyThread(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): ThreadMeta | null {
  try {
    const raw = storage.getItem(LEGACY_CHAT_KEY)
    if (!raw) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }
    const messages = Array.isArray(parsed) ? parsed : parsed && Array.isArray((parsed as { messages?: unknown }).messages) ? (parsed as { messages: UIMessage[] }).messages : null
    if (!messages) return null
    const id = newThreadId()
    storage.setItem(`${CHAT_PREFIX}${id}`, JSON.stringify({ messages }))
    storage.removeItem(LEGACY_CHAT_KEY)
    return threadMetaFromMessages(id, messages as UIMessage[])
  } catch {
    return null
  }
}

// ---------- messages -> metadata ----------

/** Plain text for one part (search index + titles). */
export function partText(part: {
  type: string
  content?: unknown
  name?: string
  output?: unknown
  arguments?: string
  state?: string
}): string {
  switch (part.type) {
    case 'text':
    case 'thinking':
      return typeof part.content === 'string' ? part.content : ''
    case 'tool-call':
      return [part.name, part.arguments, summarize(part.output)].filter(Boolean).join(' ')
    case 'tool-result':
      return [part.name, contentToText(part.content)].filter(Boolean).join(' ')
    default:
      return contentToText(part.content)
  }
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object') {
          const maybe = c as { type?: string; text?: string }
          return typeof maybe.text === 'string' ? maybe.text : ''
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  if (content === null || content === undefined) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value).slice(0, 500)
  } catch {
    return String(value)
  }
}

/** Searchable text for one full message. */
export function messageText(message: UIMessage): string {
  return (message.parts ?? [])
    .map((part) => partText(part as never))
    .filter(Boolean)
    .join(' ')
}

/** Searchable text for the whole thread. */
export function threadText(messages: UIMessage[]): string {
  return messages.map(messageText).join('\n')
}

export function threadTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = firstUser ? messageText(firstUser).trim() : ''
  const collapsed = text.replace(/\s+/g, ' ')
  return collapsed ? collapsed.slice(0, 60) : DEFAULT_TITLE
}

function toEpoch(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? null : t
  }
  return null
}

export function threadMetaFromMessages(
  id: string,
  messages: UIMessage[],
): ThreadMeta {
  const now = Date.now()
  const timestamps = messages
    .map((m) => toEpoch(m.createdAt))
    .filter((t): t is number => t !== null)
  return {
    id,
    title: threadTitle(messages),
    createdAt: Math.min(...(timestamps.length ? timestamps : [now])),
    lastMessageAt: Math.max(...(timestamps.length ? timestamps : [now])),
    messageCount: messages.length,
  }
}

// ---------- search across threads ----------

export interface ChatSearchHit {
  threadId: string
  threadTitle: string
  messageIndex: number
  role: 'user' | 'assistant'
  snippet: string
}

const SNIPPET_WINDOW = 36

export function snippetAround(text: string, query: string): string {
  const hay = text
  const idx = hay.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) {
    const t = collapse(hay)
    return t.slice(0, SNIPPET_WINDOW * 2)
  }
  const start = Math.max(0, idx - SNIPPET_WINDOW)
  const end = Math.min(hay.length, idx + query.length + SNIPPET_WINDOW)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < hay.length ? '…' : ''
  return `${prefix}${hay.slice(start, end)}${suffix}`
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Match every message in every thread against the query (case-insensitive).
 * Hits are sorted by thread recency, then message order. `reader` lets tests
 * inject fake blobs instead of touching real localStorage.
 */
export function searchThreads(
  query: string,
  threads: ThreadMeta[],
  reader: (threadId: string) => ChatPersistedState | null,
  maxHits = 50,
): ChatSearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const ordered = [...threads].sort(
    (a, b) => b.lastMessageAt - a.lastMessageAt,
  )
  const hits: ChatSearchHit[] = []
  for (const thread of ordered) {
    const blob = reader(thread.id)
    if (!blob) continue
    blob.messages.forEach((message, messageIndex) => {
      if (message.role === 'system') return
      const text = messageText(message)
      if (!text.toLowerCase().includes(q)) return
      hits.push({
        threadId: thread.id,
        threadTitle: thread.title,
        messageIndex,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        snippet: snippetAround(collapse(text), query.trim()),
      })
    })
  }
  return hits.slice(0, maxHits)
}