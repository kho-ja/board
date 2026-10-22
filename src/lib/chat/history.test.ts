import { beforeEach, describe, expect, it } from 'vitest'

import type { ChatPersistedState, UIMessage } from '@tanstack/ai-client'
import {
  CHAT_PREFIX,
  DEFAULT_TITLE,
  LEGACY_CHAT_KEY,
  UNSCOPED_ACTIVE_KEY,
  UNSCOPED_INDEX_KEY,
  activeThreadKey,
  chatScope,
  loadActiveThreadId,
  loadThreadIndex,
  messageText,
  migrateLegacyThread,
  migrateUnscopedThreads,
  newThreadId,
  partText,
  readThreadBlob,
  saveActiveThreadId,
  saveThreadIndex,
  searchThreads,
  snippetAround,
  threadIndexKey,
  threadKey,
  threadMetaFromMessages,
  threadTitle,
} from './history'

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

function msg(
  id: string,
  role: 'user' | 'assistant' | 'system',
  text: string,
  createdAt = new Date('2026-01-02T03:04:05Z'),
): UIMessage {
  return {
    id,
    role,
    createdAt,
    content: [{ type: 'text', text } as never],
    parts: [{ type: 'text', content: text } as never],
  } as UIMessage
}

function userMsg(id: string, text: string, createdAt?: Date): UIMessage {
  return msg(id, 'user', text, createdAt)
}

function blobFor(messages: UIMessage[]): ChatPersistedState {
  return { messages }
}

describe('thread metadata', () => {
  it('derives title from the first user message, collapsing whitespace', () => {
    const messages = [
      userMsg('1', '  Make me\n   a tiny\n flag '),
      msg('2', 'assistant', 'Here you go'),
    ]
    const meta = threadMetaFromMessages('t1', messages)
    expect(meta.title).toBe('Make me a tiny flag')
    expect(meta.messageCount).toBe(2)
    expect(meta.id).toBe('t1')
  })

  it('truncates long titles', () => {
    const meta = threadMetaFromMessages('t1', [
      userMsg('1', 'a'.repeat(120)),
    ])
    expect(meta.title.length).toBe(60)
  })

  it('falls back to the default title with no user message', () => {
    const meta = threadMetaFromMessages('t1', [
      msg('2', 'assistant', 'Hello!'),
    ])
    expect(meta.title).toBe(DEFAULT_TITLE)
  })

  it('uses createdAt timestamps for recency ordering', () => {
    const early = new Date('2026-01-01T00:00:00Z')
    const late = new Date('2026-01-05T00:00:00Z')
    const meta = threadMetaFromMessages('t1', [
      userMsg('1', 'first', late),
      msg('2', 'assistant', 'second', early),
    ])
    expect(meta.lastMessageAt).toBe(late.getTime())
    expect(meta.createdAt).toBe(early.getTime())
  })

  it('falls back to now when messages have no timestamps', () => {
    const meta = threadMetaFromMessages('t1', [userMsg('1', 'hi', undefined)])
    expect(meta.lastMessageAt).toBeGreaterThan(0)
  })
})

describe('part / message text extraction', () => {
  it('extracts text and thinking parts', () => {
    expect(partText({ type: 'text', content: 'hello' })).toBe('hello')
    expect(partText({ type: 'thinking', content: 'hmm' })).toBe('hmm')
  })

  it('combines tool-call name, arguments and output', () => {
    const text = partText({
      type: 'tool-call',
      name: 'file-lookup',
      arguments: '{"path":"a.svg"}',
      output: { title: 'flag' },
    })
    expect(text).toContain('file-lookup')
    expect(text).toContain('a.svg')
    expect(text).toContain('flag')
  })

  it('extracts tool-result content, including content arrays', () => {
    const array = partText({
      type: 'tool-result',
      name: 'file-lookup',
      content: [{ type: 'text', text: 'found svg' }],
    })
    expect(array).toContain('found svg')
    const singular = partText({ type: 'tool-result', content: 'plain' })
    expect(singular).toBe('plain')
  })

  it('flattens a message parts into one searchable string', () => {
    const messages = [
      userMsg('1', 'Make a flag'),
      {
        ...msg('2', 'assistant', 'Done'),
        parts: [
          { type: 'text', content: 'Done' },
          { type: 'tool-call', name: 'svg-draw', arguments: '{"px":2}' },
        ] as never,
      } as UIMessage,
    ]
    const text = messageText(messages[1])
    expect(text).toContain('Done')
    expect(text).toContain('svg-draw')
  })
})

describe('snippets', () => {
  it('highlights around the match with ellipses', () => {
    const text = 'x'.repeat(50) + 'needle' + 'y'.repeat(50)
    const snippet = snippetAround(text, 'needle')
    expect(snippet).toContain('needle')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet.length).toBeLessThan(text.length)
  })

  it('is case-insensitive for the match position', () => {
    const text = 'line about FLAG data'
    const snippet = snippetAround(text, 'flag')
    expect(snippet.toLowerCase()).toContain('flag')
  })

  it('returns a lead-in for strings without the query', () => {
    const text = 'a long but unmatched sentence to preview'
    expect(snippetAround(text, 'zzz')).toBe(text.slice(0, 72))
  })
})

describe('cross-thread search', () => {
  it('finds matching messages in multiple threads, sorted by recency', () => {
    const oldThread = {
      id: 'old',
      title: 'Old flag thread',
      createdAt: 1,
      lastMessageAt: 1,
      messageCount: 2,
    }
    const newThread = {
      id: 'new',
      title: 'New chart thread',
      createdAt: 3,
      lastMessageAt: 3,
      messageCount: 1,
    }
    const reader = (id: string) =>
      id === 'old'
        ? blobFor([userMsg('a', 'please draw a red flag', new Date('2026-01-01'))])
        : id === 'new'
          ? blobFor([userMsg('b', 'make a pie chart with flags', new Date('2026-01-03'))])
          : null

    const hits = searchThreads('flag', [oldThread, newThread], reader)
    expect(hits.map((h) => h.threadId)).toEqual(['new', 'old'])
    expect(hits[0].role).toBe('user')
  })

  it('ignores case and system messages', () => {
    const thread = { id: 't', title: 'T', createdAt: 1, lastMessageAt: 1, messageCount: 1 }
    const reader = () =>
      blobFor([msg('s', 'system', 'FLAG policy: be safe')])
    expect(searchThreads('flag', [thread], reader)).toEqual([])
  })

  it('returns everything when the query is empty', () => {
    const thread = { id: 't', title: 'T', createdAt: 1, lastMessageAt: 1, messageCount: 1 }
    const reader = () => blobFor([userMsg('u', 'hello')])
    expect(searchThreads('  ', [thread], reader)).toEqual([])
  })

  it('caps hits at maxHits', () => {
    const thread = { id: 't', title: 'T', createdAt: 1, lastMessageAt: 1, messageCount: 10 }
    const reader = () =>
      blobFor(Array.from({ length: 10 }, (_, i) => userMsg(String(i), 'needle text')))
    expect(searchThreads('needle', [thread], reader, 3)).toHaveLength(3)
  })
})

describe('thread index + active (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the index and active thread', () => {
    expect(loadThreadIndex('b1')).toEqual([])
    const threads = [
      { id: 'a', title: 'One', createdAt: 1, lastMessageAt: 2, messageCount: 1 },
    ]
    saveThreadIndex('b1', threads)
    saveActiveThreadId('b1', 'a')
    expect(loadThreadIndex('b1')).toEqual(threads)
    expect(loadActiveThreadId('b1')).toBe('a')
  })

  it('tolerates a corrupt index', () => {
    localStorage.setItem(threadIndexKey('b1'), '{not json')
    expect(loadThreadIndex('b1')).toEqual([])
  })

  it('reads per-thread blobs through the prefixed key', () => {
    const storage = makeStorage()
    storage.setItem(threadKey('b1', 't1'), JSON.stringify({ messages: [userMsg('1', 'hi')] }))
    const blob = readThreadBlob('b1', 't1', storage)
    expect(blob?.messages).toHaveLength(1)
    expect(readThreadBlob('b1', 'missing', storage)).toBeNull()
    expect(readThreadBlob('b1', 't1', makeStorage())).toBeNull()
  })

  it('produces unique thread ids', () => {
    expect(newThreadId()).not.toBe(newThreadId())
  })
})

describe('board scoping', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('keeps one board\'s threads out of another board\'s list', () => {
    const threads = [
      { id: 'a', title: 'Board A chat', createdAt: 1, lastMessageAt: 2, messageCount: 1 },
    ]
    saveThreadIndex('board-a', threads)

    expect(loadThreadIndex('board-a')).toEqual(threads)
    expect(loadThreadIndex('board-b')).toEqual([])
  })

  it('keeps one board\'s active thread out of another board\'s', () => {
    saveActiveThreadId('board-a', 'a')
    expect(loadActiveThreadId('board-a')).toBe('a')
    expect(loadActiveThreadId('board-b')).toBeNull()
  })

  it('keeps one board\'s transcript out of another board\'s', () => {
    const storage = makeStorage()
    storage.setItem(
      threadKey('board-a', 't1'),
      JSON.stringify({ messages: [userMsg('1', 'secret note')] }),
    )

    expect(readThreadBlob('board-a', 't1', storage)?.messages).toHaveLength(1)
    expect(readThreadBlob('board-b', 't1', storage)).toBeNull()
  })

  it('namespaces every key under the board', () => {
    expect(chatScope('board-a')).toBe(`${CHAT_PREFIX}board-a.`)
    expect(threadIndexKey('board-a')).toBe(`${CHAT_PREFIX}board-a.index`)
    expect(activeThreadKey('board-a')).toBe(`${CHAT_PREFIX}board-a.active`)
    expect(threadKey('board-a', 't1')).toBe(`${CHAT_PREFIX}board-a.t1`)
  })
})

describe('legacy migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('moves the old single-thread blob into the per-thread model and deletes it', () => {
    const storage = makeStorage()
    storage.setItem(LEGACY_CHAT_KEY, JSON.stringify({ messages: [userMsg('1', 'legacy hello')] }))

    const migrated = migrateLegacyThread('b1', storage)
    expect(migrated).not.toBeNull()
    expect(migrated!.title).toBe('legacy hello')
    expect(migrated!.messageCount).toBe(1)
    expect(storage.getItem(LEGACY_CHAT_KEY)).toBeNull()
    expect(storage.getItem(threadKey('b1', migrated!.id))).toContain('legacy hello')
  })

  it('is a no-op when the legacy blob is missing', () => {
    expect(migrateLegacyThread('b1', makeStorage())).toBeNull()
  })

  it('is a no-op on a corrupt legacy blob', () => {
    const storage = makeStorage()
    storage.setItem(LEGACY_CHAT_KEY, 'nope')
    expect(migrateLegacyThread('b1', storage)).toBeNull()
  })
})

describe('unscoped (pre-board) thread migration', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('adopts old global conversations into the board and clears the global bucket', () => {
    const storage = makeStorage()
    storage.setItem(
      UNSCOPED_INDEX_KEY,
      JSON.stringify([
        { id: 'old-1', title: 'Old chat', createdAt: 1, lastMessageAt: 2, messageCount: 1 },
      ]),
    )
    storage.setItem(
      `${CHAT_PREFIX}old-1`,
      JSON.stringify({ messages: [userMsg('1', 'old content')] }),
    )
    storage.setItem(UNSCOPED_ACTIVE_KEY, 'old-1')

    const adopted = migrateUnscopedThreads('b1', storage)

    expect(adopted).toHaveLength(1)
    expect(adopted![0].id).toBe('old-1')
    // The transcript moved into the board's namespace...
    expect(storage.getItem(threadKey('b1', 'old-1'))).toContain('old content')
    expect(storage.getItem(`${CHAT_PREFIX}old-1`)).toBeNull()
    // ...and the global bucket is gone.
    expect(storage.getItem(UNSCOPED_INDEX_KEY)).toBeNull()
    expect(storage.getItem(UNSCOPED_ACTIVE_KEY)).toBeNull()
    expect(storage.getItem(activeThreadKey('b1'))).toBe('old-1')
  })

  it('is a no-op when there is no global bucket', () => {
    expect(migrateUnscopedThreads('b1', makeStorage())).toBeNull()
  })

  it('drops a corrupt global bucket rather than failing', () => {
    const storage = makeStorage()
    storage.setItem(UNSCOPED_INDEX_KEY, '{not json')
    expect(migrateUnscopedThreads('b1', storage)).toBeNull()
    expect(storage.getItem(UNSCOPED_INDEX_KEY)).toBeNull()
  })
})

describe('Titles', () => {
  it('threadTitle reads from history module defaults', () => {
    expect(threadTitle([])).toBe(DEFAULT_TITLE)
    const meta = threadMetaFromMessages('x', [userMsg('u', 'Make me a banner')])
    expect(meta.title).toBe('Make me a banner')
  })
})

describe('index storage keying', () => {
  it('uses namespaced keys', () => {
    expect(UNSCOPED_INDEX_KEY).toBe(`${CHAT_PREFIX}index`)
    expect(UNSCOPED_ACTIVE_KEY).toBe(`${CHAT_PREFIX}active`)
    expect(LEGACY_CHAT_KEY).toContain('khoja-board-ask')
  })
})