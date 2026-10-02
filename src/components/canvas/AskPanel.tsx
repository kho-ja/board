import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Markdown } from '@tanstack/markdown/react'

import type { UIMessage } from '@tanstack/ai-client'

import { listAiProvidersFn } from '#/lib/ai/providers.functions'
import { AI_TOOL_NAMES, aiTools } from '#/lib/ai/tools'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Plus, Settings } from 'lucide-react'
import { AskSettings } from './AskSettings'
import { markdownComponents } from '#/lib/markdown/components'
import {
  CHAT_PREFIX,
  DEFAULT_TITLE,
  loadActiveThreadId,
  loadThreadIndex,
  migrateLegacyThread,
  newThreadId,
  readThreadBlob,
  saveActiveThreadId,
  saveThreadIndex,
  searchThreads,
  threadMetaFromMessages,
  type ChatSearchHit,
  type ThreadMeta,
} from '#/lib/chat/history'

import type { AiProviderInfo } from '#/lib/ai/providers.server'
import {
  markSelectionWorking,
  modelsFor,
  reconcileModel,
  resolveInitialSelection,
  writeSelection,
} from '#/lib/ai/selection'

const TOOL_LABELS: Record<string, string> = {
  [AI_TOOL_NAMES.context]: 'Read board snapshot',
  [AI_TOOL_NAMES.createBlocks]: 'Create blocks',
  [AI_TOOL_NAMES.connectBlocks]: 'Connect blocks',
  [AI_TOOL_NAMES.editBlocks]: 'Edit blocks',
  [AI_TOOL_NAMES.createFiles]: 'Create files',
  [AI_TOOL_NAMES.makeDiagram]: 'Make diagram',
}

const SUGGESTIONS = [
  'What is on my board right now?',
  'Summarize my notes.',
  'Create a block for "Things to follow up" and connect it to my other notes.',
]

/**
 * Renders an interrupt/run failure for the user.
 *
 * `interruptErrors` entries are plain `BatchInterruptError`/`ItemInterruptError`
 * objects, not `Error` instances, so the previous `String(lastError)` fallback
 * rendered a bare "[object Object]" -- shown even when the approved tool had
 * already run successfully, which reads as a failure that never happened.
 *
 * The resume handshake reports `code: 'transport'` with a fixed message and no
 * underlying cause. Left as-is it tells the user nothing actionable, so the
 * common real cause (a rate-limited or unreachable provider) is spelled out.
 */
function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const { message, code } = error as {
      message?: unknown
      code?: unknown
    }
    if (typeof message === 'string' && message.trim()) {
      const suffix =
        typeof code === 'string' && code ? ` (${code})` : ''
      const base = `${message}${suffix}`
      if (code === 'transport') {
        return `${base} The approved action may already have been applied — check the board before retrying.`
      }
      return base
    }
    try {
      return JSON.stringify(error)
    } catch {
      return 'Unknown error'
    }
  }
  return String(error)
}

function summarizeToolCallOutput(name: string, parsed: unknown): string {
  if (
    name === AI_TOOL_NAMES.context &&
    parsed !== null &&
    typeof parsed === 'object'
  ) {
    const snapshot = parsed as {
      blocks?: unknown[]
      connections?: unknown[]
      types?: unknown[]
    }
    return `${snapshot.blocks?.length ?? 0} blocks · ${
      snapshot.connections?.length ?? 0
    } connections · ${snapshot.types?.length ?? 0} types`
  }
  try {
    return JSON.stringify(parsed).slice(0, 500)
  } catch {
    return String(parsed)
  }
}

/** M16 — pull the created block ids out of a completed board_make_diagram
 *  tool-call (or its archived tool-result) so the client can pan to them. */
function extractCreatedBlockIds(part: {
  type: string
  state?: string
  output?: unknown
  content?: unknown
}): string[] {
  let parsed: unknown = null
  if (part.type === 'tool-call' && part.state === 'complete') {
    parsed = part.output
  } else if (part.type === 'tool-result') {
    if (typeof part.content === 'string') {
      try {
        parsed = JSON.parse(part.content)
      } catch {
        parsed = null
      }
    } else {
      parsed = part.content
    }
  }
  if (!parsed || typeof parsed !== 'object') return []
  const { results } = parsed as { results?: unknown }
  if (!Array.isArray(results)) return []
  return results
    .filter(
      (result): result is { id?: string } =>
        Boolean(result) &&
        typeof result === 'object' &&
        typeof (result as { id?: string }).id === 'string',
    )
    .map((result) => (result as { id: string }).id)
}

function makeEmptyThread(): ThreadMeta {
  return {
    id: newThreadId(),
    title: DEFAULT_TITLE,
    createdAt: Date.now(),
    lastMessageAt: Date.now(),
    messageCount: 0,
  }
}

/** One-time mount: load the thread index, migrating the legacy single-thread
 *  blob on first run, and never leave an index without at least one thread. */
function initializeThreads(): ThreadMeta[] {
  let threads = loadThreadIndex()
  if (threads.length === 0) {
    const migrated = migrateLegacyThread()
    threads = [migrated ?? makeEmptyThread()]
    saveThreadIndex(threads)
  }
  return threads
}

function formatWhen(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const days = Math.floor((now.getTime() - ts) / 86_400_000)
  if (days > 0 && days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

/** Wrap the query's occurrences in a snippet with <mark> (case-insensitive). */
function highlight(snippet: string, query: string): React.ReactNode[] {
  const q = query.trim()
  if (!q) return [snippet]
  const ql = q.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  let at = snippet.toLowerCase().indexOf(ql)
  let key = 0
  while (at >= 0) {
    if (at > i) out.push(snippet.slice(i, at))
    out.push(
      <mark key={key++}>{snippet.slice(at, at + q.length)}</mark>,
    )
    i = at + q.length
    at = snippet.toLowerCase().indexOf(ql, i)
  }
  if (i < snippet.length) out.push(snippet.slice(i))
  return out
}

/**
 * M18 — one live Ask conversation. Remounted with `key={threadId}` so each
 * thread owns its own `useChat` client and persists under its own
 * `khoja.chat.<threadId>` blob.
 */
function AskThread({
  threadId,
  body,
  canSend,
  disabledReason,
  onFocusBlock,
  onConversationChanged,
  onOpenSettings,
  onReplied,
}: {
  threadId: string
  body: Record<string, unknown>
  canSend: boolean
  disabledReason: string | null
  onFocusBlock?: (blockId: string) => void
  onConversationChanged: (messages: UIMessage[]) => void
  onOpenSettings?: () => void
  onReplied?: () => void
}) {
  const chat = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    body,
    tools: aiTools,
    persistence: localStoragePersistence({ keyPrefix: CHAT_PREFIX }),
  })

  const { messages, sendMessage, interrupts, resuming, interruptErrors, error, reload } =
    chat

  const approvalInterrupts = interrupts.filter(
    (i) =>
      (i as { kind?: string }).kind === 'tool-approval',
  ) as unknown as Array<{
    id: string
    kind: 'tool-approval'
    toolName: string
    originalArgs: unknown
    resolveInterrupt: (approved: boolean) => void
    cancel: () => void
  }>

  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Drop approvals left over from a run that has already failed.
   *
   * A pending approval is persisted with the thread, so a run that dies between
   * "tool needs approval" and the resume (a provider 429, a dropped connection)
   * leaves a card behind on every later visit. The server holds no state for that
   * run, so the card is a dead end: answering it just re-fails. Clearing it and
   * leaving the error plus "Try again" gives one honest way forward instead of a
   * button that appears live and cannot succeed.
   *
   * Guarded by a ref so the effect runs once per failed run rather than on every
   * render while the error is still set.
   */
  const expiredRun = useRef<string | null>(null)
  useEffect(() => {
    if (!error || approvalInterrupts.length === 0) {
      if (!error) expiredRun.current = null
      return
    }
    if (expiredRun.current === error.message) return
    expiredRun.current = error.message
    for (const interrupt of approvalInterrupts) interrupt.cancel()
  }, [error, approvalInterrupts])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, approvalInterrupts.length, resuming])

  useEffect(() => {
    onConversationChanged(messages)
  }, [messages, onConversationChanged])

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim() || !canSend || resuming) return
      void sendMessage(input.trim())
      setInput('')
      inputRef.current?.focus()
    },
    [input, canSend, resuming, sendMessage],
  )

  const sendSuggestion = (text: string) => {
    if (!canSend || resuming) return
    void sendMessage(text)
  }

  /**
   * Two different failures can land here.
   *
   * `error` is the run-level failure from the stream, so it carries the real
   * reason — a provider 429, a 404 for an unknown model, a 402. `interruptErrors`
   * only covers the resume handshake and reports a generic
   * "Interrupt continuation could not be started. (transport)", which on its own
   * hides the actual cause (e.g. a rate-limited provider during resume).
   *
   * Prefer the run error when present so the user sees the actionable message.
   */
  const lastError = error ?? (interruptErrors.length
    ? interruptErrors[interruptErrors.length - 1]
    : null)

  // M16 — after an approved diagram run, pan/select the first created node so
  // the freshly-drawn diagram is immediately in view.
  const handledDiagramRuns = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!onFocusBlock) return
    let firstCreatedId: string | null = null
    outer: for (const message of messages) {
      if (message.role !== 'assistant') continue
      for (const [index, part] of message.parts.entries()) {
        if (part.type !== 'tool-call' && part.type !== 'tool-result') continue
        if (part.name !== AI_TOOL_NAMES.makeDiagram) continue
        const key = `${message.id}:${index}`
        if (handledDiagramRuns.current.has(key)) continue
        const ids = extractCreatedBlockIds(part)
        if (!ids.length) continue
        handledDiagramRuns.current.add(key)
        firstCreatedId = ids[0]
        break outer
      }
    }
    if (firstCreatedId) onFocusBlock(firstCreatedId)
  }, [messages, onFocusBlock])

  /**
   * A provider/model pair counts as "working" only once it has actually produced
   * assistant output. Fire-and-forget so it cannot delay the first paint.
   */
  const reportedReply = useRef<string>('')
  useEffect(() => {
    if (!onReplied) return
    const latest = messages[messages.length - 1]
    if (!latest || latest.role !== 'assistant') return
    const hasOutput = latest.parts.some((part) => {
      if (part.type === 'text') return Boolean(part.content?.trim())
      return (
        part.type === 'tool-call' || part.type === 'tool-result'
      )
    })
    if (!hasOutput) return
    const signature = `${threadId}:${latest.id}`
    if (reportedReply.current === signature) return
    reportedReply.current = signature
    onReplied()
  }, [messages, onReplied, threadId])

  return (
    <>
      <div className="ask-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="ask-empty">
            <p>Ask anything about this board — its blocks, notes, files,
              connections and custom types.</p>
            {canSend && (
              <div className="ask-suggestions">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    className="ask-suggestion"
                    onClick={() => sendSuggestion(s)}
                    title={s}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
            {!canSend && disabledReason && (
              <p className="ask-notconfigured">
                {disabledReason}
                {onOpenSettings && (
                  <Button
                    type="button"
                    variant="link"
                    className="ask-notconfigured-link"
                    onClick={onOpenSettings}
                  >
                    Open settings
                  </Button>
                )}
              </p>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`ask-msg is-${message.role}`}
            >
              <div className="ask-msg-role">
                {message.role === 'user' ? 'You' : 'Ask'}
              </div>
              {message.parts.map((part, index) => {
                switch (part.type) {
                  case 'text':
                    return message.role === 'assistant' ? (
                      <div key={index} className="ask-text md-block">
                        <Markdown components={markdownComponents}>
                          {part.content}
                        </Markdown>
                      </div>
                    ) : (
                      <p key={index} className="ask-text">
                        {part.content}
                      </p>
                    )
                  case 'thinking':
                    return (
                      <details key={index} className="ask-thinking">
                        <summary>Thinking</summary>
                        {part.content}
                      </details>
                    )
                  case 'tool-call':
                    return (
                      <div key={index} className="ask-tool">
                        <span
                          className={`ask-tool-chip is-${part.state}`}
                        >
                          {TOOL_LABELS[part.name] ?? part.name}
                        </span>
                        {part.state === 'approval-requested' && (
                          <span className="ask-tool-waiting">
                            awaiting approval…
                          </span>
                        )}
                        {part.state === 'complete' &&
                          part.output !== undefined && (
                            <pre className="ask-tool-output">
                              {summarizeToolCallOutput(
                                part.name,
                                part.output,
                              )}
                            </pre>
                          )}
                      </div>
                    )
                  case 'tool-result':
                    return (
                      <div key={index} className="ask-tool">
                        <span className="ask-tool-chip is-done">
                          {part.name ? (TOOL_LABELS[part.name] ?? part.name) : 'Tool'}
                        </span>
                        <pre className="ask-tool-output">
                          {summarizeToolCallOutput(
                            part.name ?? '',
                            typeof part.content === 'string'
                              ? part.content
                              : part.content ?? '',
                          )}
                        </pre>
                      </div>
                    )
                  default:
                    return null
                }
              })}
            </div>
          ))
        )}

        {approvalInterrupts.map((interrupt) => (
          <div key={interrupt.id} className="ask-approval">
            <div className="ask-approval-title">
              Approve “{TOOL_LABELS[interrupt.toolName] ?? interrupt.toolName}”?
            </div>
            <pre className="ask-approval-args">
              {JSON.stringify(interrupt.originalArgs, null, 2)}
            </pre>
            <div className="ask-approval-actions">
              <Button
                type="button"
                size="sm"
                onClick={() => interrupt.resolveInterrupt(true)}
              >
                Approve
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => interrupt.resolveInterrupt(false)}
              >
                Deny
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => interrupt.cancel()}
              >
                Cancel
              </Button>
            </div>
          </div>
        ))}

        {resuming && <div className="ask-resuming">Working…</div>}

        {lastError && (
          <div className="ask-error" role="alert">
            <span className="ask-error-text">{describeFailure(lastError)}</span>
            {/* A failed run leaves no way back otherwise, and a stale pending
                approval in particular cannot be cleared from here. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ask-error-retry"
              onClick={() => {
                void reload()
                inputRef.current?.focus()
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </div>

      <form className="ask-composer" onSubmit={onSubmit}>
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            // Kept short: the composer input is ~140px wide in the 224px drawer
            // and clipped "Ask about your board…" mid-word.
            canSend ? 'Ask your board…' : 'Configure a provider'
          }
          disabled={!canSend}
        />
        <Button
          type="submit"
          className="flex-none"
          disabled={!canSend || !input.trim() || resuming}
        >
          {resuming ? '…' : 'Send'}
        </Button>
      </form>
    </>
  )
}

export function AskPanel({
  onFocusBlock,
}: {
  /** Given a block id that a tool just created, pans/selects it on the canvas
   *  (used to bring freshly-drawn diagrams into view). */
  onFocusBlock?: (blockId: string) => void
}) {
  const { data: providers = [] } = useQuery<AiProviderInfo[]>({
    queryKey: ['ask-providers'],
    queryFn: () => listAiProvidersFn(),
    staleTime: 60_000,
  })

  const encryptionConfigured = providers.some((p) => p.encryptionConfigured)

  const [providerId, setProviderId] = useState<string>('')
  const [model, setModel] = useState<string>('')

  /**
   * Provider and model are persisted as one atomic pair and validated against
   * the live provider list, so a reload can never restore a model the chosen
   * provider does not offer.
   */
  const setModelValue = useCallback(
    (value: string) => {
      setModel(value)
      writeSelection({ provider: providerId, model: value })
    },
    [providerId],
  )

  // M18 UI — provider/model live in a settings dialog, not the chat panel.
  const [settingsOpen, setSettingsOpen] = useState(false)

  // M18 — thread history state
  const [threads, setThreads] = useState<ThreadMeta[]>(initializeThreads)
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const saved = loadActiveThreadId()
    const index = loadThreadIndex()
    if (saved && index.some((t) => t.id === saved)) return saved
    if (index[0]) {
      saveActiveThreadId(index[0].id)
      return index[0].id
    }
    const fresh = makeEmptyThread()
    saveThreadIndex([fresh])
    saveActiveThreadId(fresh.id)
    return fresh.id
  })
  // Landing view: chat list + search first; clicking a thread enters it.
  const [home, setHome] = useState(true)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ChatSearchHit[]>([])
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Providers arrive asynchronously, so the stored pair is resolved as soon as
  // the list lands — and re-validated if the stored model is no longer offered.
  useEffect(() => {
    if (!providers.length) return
    const resolved = resolveInitialSelection(providers)
    if (!resolved) return
    setProviderId((prev) => {
      setModel((prevModel) => {
        const nextModel =
          prev && prev === resolved.model
            ? prevModel
            : resolved.model
        if (prev !== resolved.provider || prevModel !== nextModel) {
          writeSelection({ provider: resolved.provider, model: nextModel })
        }
        return nextModel
      })
      return resolved.provider
    })
  }, [providers])

  // Never leave a stored model that the active provider cannot serve.
  useEffect(() => {
    if (!providerId || !providers.length) return
    const next = reconcileModel(providers, providerId, model)
    if (next !== model) {
      setModel(next)
      writeSelection({ provider: providerId, model: next })
    }
  }, [providers, providerId, model])

  const activeProvider = providers.find((p) => p.id === providerId)
  const providerModels = modelsFor(providers, providerId)
  const canSend = Boolean(activeProvider?.available && model.trim() && providers.length)
  const disabledReason =
    !canSend && providers.length > 0
      ? activeProvider?.available
        ? 'Pick a model in Ask settings to continue.'
        : `No AI provider is configured yet. Add an API key in Ask settings or set ${activeProvider?.configHint} in .env.local.`
      : null

  const selectProvider = (id: string) => {
    const next = providers.find((p) => p.id === id)
    const nextModel = reconcileModel(providers, id, '')
    setProviderId(id)
    setModel(nextModel)
    writeSelection({ provider: id, model: nextModel || next?.defaultModel || '' })
  }

  /** Called when a reply actually arrives, so the working pair is proven. */
  const noteSelectionWorked = useCallback(() => {
    if (!providerId || !model) return
    markSelectionWorking({ provider: providerId, model })
  }, [providerId, model])

  const body = useMemo(() => ({ provider: providerId, model }), [providerId, model])

  const syncThread = useCallback(
    (messages: UIMessage[]) => {
      setThreads((prev) => {
        if (!activeThreadId) return prev
        const meta = threadMetaFromMessages(activeThreadId, messages)
        let changed = false
        const next = prev.map((t) => {
          if (t.id !== activeThreadId) return t
          if (
            t.title === meta.title &&
            t.lastMessageAt === meta.lastMessageAt &&
            t.messageCount === meta.messageCount
          ) {
            return t
          }
          changed = true
          return {
            ...t,
            title: meta.title,
            lastMessageAt: meta.lastMessageAt,
            messageCount: meta.messageCount,
          }
        })
        if (!changed) return prev
        next.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        saveThreadIndex(next)
        return next
      })
    },
    [activeThreadId],
  )

  const switchTo = useCallback(
    (id: string) => {
      if (id === activeThreadId) return
      saveActiveThreadId(id)
      setActiveThreadId(id)
    },
    [activeThreadId],
  )

  const startNewChat = useCallback(() => {
    setQuery('')
    setHits([])
    const active = threads.find((t) => t.id === activeThreadId)
    if (active && active.messageCount === 0) return
    const fresh = makeEmptyThread()
    const next = [fresh, ...threads].sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt,
    )
    saveThreadIndex(next)
    setThreads(next)
    saveActiveThreadId(fresh.id)
    setActiveThreadId(fresh.id)
  }, [threads, activeThreadId])

  /** Enter a conversation from the home list/search. */
  const enterThread = useCallback(
    (id: string) => {
      switchTo(id)
      setHome(false)
    },
    [switchTo],
  )

  const enterNewChat = useCallback(() => {
    startNewChat()
    setHome(false)
  }, [startNewChat])

const deleteThread = useCallback(
  (id: string) => {
    setDeleteTargetId(id)
  },
  [],
)

  const confirmDelete = useCallback(() => {
    const id = deleteTargetId
    if (!id) return
    setDeleteTargetId(null)
    try {
      localStorage.removeItem(`${CHAT_PREFIX}${id}`)
    } catch {
      // best-effort
    }
    let next = threads.filter((t) => t.id !== id)
    if (next.length === 0) next = [makeEmptyThread()]
    next.sort((a, b) => b.lastMessageAt - a.lastMessageAt)
    saveThreadIndex(next)
    setThreads(next)
    if (activeThreadId === id) {
      const fallback = next[0]
      saveActiveThreadId(fallback.id)
      setActiveThreadId(fallback.id)
    }
  }, [deleteTargetId, threads, activeThreadId])

  // M18 — search across every thread blob, re-run as the index or query moves.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits([])
      return
    }
    setHits(searchThreads(q, threads, (id) => readThreadBlob(id)))
  }, [query, threads])

  const clearSearch = useCallback(() => {
    setQuery('')
    setHits([])
  }, [])

  const activeThread = threads.find((t) => t.id === activeThreadId)

  return (
    <div className="ask-panel">
      {home ? (
        <div className="ask-home">
          <div className="ask-home-head">
            <span className="ask-home-title">Chats</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ask-newchat"
              onClick={enterNewChat}
              title="Start a new chat"
            >
              <span aria-hidden="true">+</span> New chat
            </Button>
          </div>

          <Input
              type="search"
              className="ask-search-input ask-search-main"
              aria-label="Search past chats"
              placeholder="Search past chats…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') clearSearch()
              }}
            />

          {query.trim() ? (
            <div className="ask-home-list ask-search-results">
              {hits.length === 0 ? (
                <p className="ask-search-empty">
                  No matches for “{query.trim()}”.
                </p>
              ) : (
                hits.map((hit, i) => (
                  <Button
                    key={`${hit.threadId}:${hit.messageIndex}:${i}`}
                    type="button"
                    className={`ask-search-hit${
                      hit.threadId === activeThreadId ? ' is-active' : ''
                    }`}
                    onClick={() => enterThread(hit.threadId)}
                  >
                    <span className="ask-search-hit-title">
                      {hit.threadTitle}
                    </span>
                    <span className="ask-search-hit-snippet">
                      {highlight(hit.snippet, query)}
                    </span>
                    <span className="ask-search-hit-meta">
                      {hit.role === 'user' ? 'You' : 'Ask'}
                    </span>
                  </Button>
                ))
              )}
            </div>
          ) : (
            <div className="ask-home-list">
              {threads.map((t) => (
                <div
                  key={t.id}
                  className={`ask-history-row${
                    t.id === activeThreadId ? ' is-active' : ''
                  }`}
                >
                  <Button
                    type="button"
                    className="ask-history-main"
                    onClick={() => enterThread(t.id)}
                  >
                    <span className="ask-history-title">{t.title}</span>
                    <span className="ask-history-meta">
                      {t.messageCount === 0
                        ? 'No messages yet'
                        : `${t.messageCount} message${t.messageCount === 1 ? '' : 's'}`}{' '}
                      · {formatWhen(t.lastMessageAt)}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ask-history-del"
                    title="Delete chat"
                    aria-label={`Delete chat ${t.title}`}
                    onClick={() => deleteThread(t.id)}
                  >
                    ×
                  </Button>
                </div>
              ))}
              {/* Nothing to search or resume yet, so the search box alone is a
                  dead end. Say what Ask is for and give a way in. */}
              {threads.every((t) => t.messageCount === 0) && (
                <div className="ask-home-blank">
                  <p className="ask-home-blank-text">
                    Ask about this board — its blocks, notes, files,
                    connections and custom types.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ask-newchat"
                    onClick={enterNewChat}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    Start your first chat
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="ask-chat-head">
            <div className="ask-chat-head-top">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setHome(true)}
                aria-label="All chats"
                title="All chats"
              >
                <ArrowLeft className="size-3.5" />
              </Button>
              <span className="ask-chat-title" title={activeThread?.title}>
                {activeThread?.title ?? 'Chat'}
              </span>
              {/* Reachable from inside a conversation. Without this, starting a
                  new chat means going back to the list first, which reads as
                  the panel having no way to move on. */}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={enterNewChat}
                title="New chat"
                aria-label="New chat"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSettingsOpen(true)}
                title="Provider & model settings"
                aria-label="Provider & model settings"
              >
                <Settings className="size-3.5" />
              </Button>
            </div>
            <div className="ask-model-inline" title="Switch model">
              <span className="ask-model-inline-label">Model</span>
              <Select
                value={
                  providerModels.includes(model) ? model : undefined
                }
                onValueChange={(v) => {
                  if (v !== null) setModelValue(v)
                }}
                disabled={!activeProvider?.available || providerModels.length === 0}
              >
                <SelectTrigger
                  className="ask-model-select"
                  aria-label="Model"
                >
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {providerModels.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AskThread
            key={activeThreadId}
            threadId={activeThreadId}
            body={body}
            canSend={canSend}
            disabledReason={disabledReason}
            onFocusBlock={onFocusBlock}
            onConversationChanged={syncThread}
            onOpenSettings={() => setSettingsOpen(true)}
            onReplied={noteSelectionWorked}
          />
        </>
      )}

      <AskSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        providers={providers}
        providerId={providerId}
        model={model}
        onProviderChange={selectProvider}
        onModelChange={setModelValue}
        encryptionConfigured={encryptionConfigured}
      />

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the chat and its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}