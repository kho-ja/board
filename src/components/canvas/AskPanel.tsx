import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Markdown } from '@tanstack/markdown/react'

import { listAiProvidersFn } from '#/lib/ai/providers.functions'
import {
  deleteApiKeyFn,
  upsertApiKeyFn,
} from '#/db/queries.functions'
import { AI_TOOL_NAMES, aiTools } from '#/lib/ai/tools'
import { markdownComponents } from '#/lib/markdown/components'

import type { AiProviderInfo } from '#/lib/ai/providers.server'

const THREAD_ID = 'khoja-board-ask'
const PROV_STORAGE = 'khoja.ai.provider'
const MODEL_STORAGE = 'khoja.ai.model'

const TOOL_LABELS: Record<string, string> = {
  [AI_TOOL_NAMES.context]: 'Read board snapshot',
  [AI_TOOL_NAMES.createBlocks]: 'Create blocks',
  [AI_TOOL_NAMES.connectBlocks]: 'Connect blocks',
}

const SUGGESTIONS = [
  'What is on my board right now?',
  'Summarize my notes.',
  'Create a block for "Things to follow up" and connect it to my other notes.',
]

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

export function AskPanel() {
  const queryClient = useQueryClient()

  const { data: providers = [] } = useQuery<AiProviderInfo[]>({
    queryKey: ['ask-providers'],
    queryFn: () => listAiProvidersFn(),
    staleTime: 60_000,
  })

  const firstAvailable = providers.find((p) => p.available)

  const [providerId, setProviderId] = useState<string>(() => {
    const stored = localStorage.getItem(PROV_STORAGE)
    return stored ?? ''
  })
  const [model, setModel] = useState<string>(
    () => localStorage.getItem(MODEL_STORAGE) ?? '',
  )

  // API key management state
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [upsertKeyPending, setUpsertKeyPending] = useState<string | null>(null)
  const [deleteKeyPending, setDeleteKeyPending] = useState<string | null>(null)

  useEffect(() => {
    if (providerId) {
      if (!providers.some((p) => p.id === providerId && p.available)) {
        if (firstAvailable) {
          setProviderId(firstAvailable.id)
          setModel(firstAvailable.defaultModel)
        }
      }
      return
    }
    if (firstAvailable) {
      setProviderId(firstAvailable.id)
      setModel(firstAvailable.defaultModel)
    } else {
      const first = providers[0]
      if (first) {
        setProviderId(first.id)
        setModel(first.defaultModel)
      }
    }
  }, [providers, providerId, firstAvailable])

  const activeProvider = providers.find((p) => p.id === providerId)
  const canSend = Boolean(activeProvider?.available && model.trim() && providers.length)

  const selectProvider = (id: string) => {
    setProviderId(id)
    const next = providers.find((p) => p.id === id)
    if (next) {
      const modelValue = next.defaultModel
      setModel(modelValue)
      localStorage.setItem(MODEL_STORAGE, modelValue)
    }
    localStorage.setItem(PROV_STORAGE, id)
  }

  const saveKey = async (provider: string) => {
    if (!keyInput.trim()) return
    setUpsertKeyPending(provider)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (upsertApiKeyFn as any)({
        provider,
        encryptedKey: keyInput.trim(),
        baseUrl: baseUrlInput.trim() || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['ask-providers'] })
      setEditingKey(null)
      setKeyInput('')
      setBaseUrlInput('')
    } finally {
      setUpsertKeyPending(null)
    }
  }

  const deleteKey = async (provider: string) => {
    setDeleteKeyPending(provider)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (deleteApiKeyFn as any)({ provider })
      queryClient.invalidateQueries({ queryKey: ['ask-providers'] })
    } finally {
      setDeleteKeyPending(null)
    }
  }

  const startEditKey = (provider: string, currentBaseUrl?: string) => {
    setEditingKey(provider)
    setKeyInput('')
    setBaseUrlInput(currentBaseUrl ?? '')
  }

  const body = useMemo(() => ({ provider: providerId, model }), [providerId, model])

  const chat = useChat({
    threadId: THREAD_ID,
    connection: fetchServerSentEvents('/api/chat'),
    body,
    tools: aiTools,
    persistence: localStoragePersistence(),
  })

  const { messages, sendMessage, interrupts, resuming, interruptErrors } = chat
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

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, approvalInterrupts.length, resuming])

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

  const lastError = interruptErrors.length
    ? interruptErrors[interruptErrors.length - 1]
    : null

  return (
    <div className="ask-panel">
      <div className="ask-config">
        <div className="ask-config-row">
          <label className="ask-label" htmlFor="ask-provider">
            Provider
          </label>
          <select
            id="ask-provider"
            className="ask-select"
            value={providerId}
            onChange={(e) => selectProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.label}
                {p.available ? '' : ' (not configured)'}
                {p.userConfigured ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="ask-config-row">
          <label className="ask-label" htmlFor="ask-model">
            Model
          </label>
          <input
            id="ask-model"
            className="ask-model-input"
            list="ask-model-options"
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              localStorage.setItem(MODEL_STORAGE, e.target.value)
            }}
            spellCheck={false}
            placeholder="e.g. gpt-5.4-mini"
          />
          <datalist id="ask-model-options">
            {(activeProvider?.models ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        {/* API Key Management */}
        <details className="ask-keys-section">
          <summary className="ask-keys-summary">
            API Keys {providers.some((p) => p.userConfigured) && (
              <span className="ask-keys-badge">{providers.filter((p) => p.userConfigured).length}</span>
            )}
          </summary>
          <div className="ask-keys-list">
            {providers
              .filter((p) => p.id !== 'ollama')
              .map((p) => (
                <div key={p.id} className="ask-key-row">
                  <span className="ask-key-label">{p.label}</span>
                  {editingKey === p.id ? (
                    <div className="ask-key-edit">
                      <input
                        type="password"
                        className="ask-key-input"
                        placeholder="Enter API key"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        autoFocus
                      />
                      {(p.id === 'custom' || p.id === 'openrouter') && (
                        <input
                          type="text"
                          className="ask-key-input ask-base-url-input"
                          placeholder="Base URL (optional)"
                          value={baseUrlInput}
                          onChange={(e) => setBaseUrlInput(e.target.value)}
                        />
                      )}
                      <div className="ask-key-actions">
                        <button
                          type="button"
                          className="ask-btn primary ask-btn-sm"
                          onClick={() => saveKey(p.id)}
                          disabled={upsertKeyPending === p.id}
                        >
                          {upsertKeyPending === p.id ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="ask-btn ghost ask-btn-sm"
                          onClick={() => setEditingKey(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="ask-key-status">
                      {p.userConfigured ? (
                        <>
                          <span className="ask-key-configured">Configured ✓</span>
                          <button
                            type="button"
                            className="ask-btn ghost ask-btn-sm"
                            onClick={() => startEditKey(p.id)}
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            className="ask-btn ghost ask-btn-sm ask-btn-danger"
                            onClick={() => deleteKey(p.id)}
                            disabled={deleteKeyPending === p.id}
                          >
                            {deleteKeyPending === p.id ? 'Removing…' : 'Remove'}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ask-btn primary ask-btn-sm"
                          onClick={() => startEditKey(p.id)}
                        >
                          Add Key
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
          <p className="ask-keys-note">
            Keys are encrypted at rest. Ollama runs locally and needs no key.
            {process.env.AI_ENCRYPTION_KEY ? '' : ' ⚠️ Set AI_ENCRYPTION_KEY in .env.local for production encryption.'}
          </p>
        </details>
      </div>

      <div className="ask-thread" ref={threadRef}>
        {messages.length === 0 ? (
          <div className="ask-empty">
            <p>Ask anything about this board — its blocks, notes, files,
              connections and custom types.</p>
            {canSend && (
              <div className="ask-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ask-suggestion"
                    onClick={() => sendSuggestion(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {!canSend && providers.length > 0 && (
              <p className="ask-notconfigured">
                {!activeProvider?.available
                  ? `No AI provider is configured yet. Add an API key above or set ${activeProvider?.configHint} in .env.local.`
                  : 'Enter a model name above to continue.'}
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
              <button
                type="button"
                className="ask-btn primary"
                onClick={() => interrupt.resolveInterrupt(true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="ask-btn"
                onClick={() => interrupt.resolveInterrupt(false)}
              >
                Deny
              </button>
              <button
                type="button"
                className="ask-btn ghost"
                onClick={() => interrupt.cancel()}
              >
                Cancel
              </button>
            </div>
          </div>
        ))}

        {resuming && <div className="ask-resuming">Working…</div>}

        {lastError && (
          <div className="ask-error">
            {lastError instanceof Error
              ? lastError.message
              : String(lastError)}
          </div>
        )}
      </div>

      <form className="ask-composer" onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className="ask-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={canSend ? 'Ask about your board…' : 'Configure a provider to chat'}
          disabled={!canSend}
        />
        <button
          type="submit"
          className="ask-send"
          disabled={!canSend || !input.trim() || resuming}
        >
          {resuming ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}