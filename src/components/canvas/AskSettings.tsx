import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { deleteApiKeyFn, upsertApiKeyFn } from '#/db/queries.functions'
import type { AiProviderInfo } from '#/lib/ai/providers.server'

/**
 * M18 UI — provider & model configuration, opened from the Ask panel as a
 * settings dialog so the chat keeps the full panel width. Holds the API-key
 * management UI that previously lived inline in the panel.
 */
export function AskSettings({
  open,
  onClose,
  providers,
  providerId,
  model,
  onProviderChange,
  onModelChange,
}: {
  open: boolean
  onClose: () => void
  providers: AiProviderInfo[]
  providerId: string
  model: string
  onProviderChange: (id: string) => void
  onModelChange: (model: string) => void
}) {
  const queryClient = useQueryClient()

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [upsertKeyPending, setUpsertKeyPending] = useState<string | null>(null)
  const [deleteKeyPending, setDeleteKeyPending] = useState<string | null>(null)

  const activeProvider = providers.find((p) => p.id === providerId)

  useEffect(() => {
    if (!open) {
      setEditingKey(null)
      setKeyInput('')
      setBaseUrlInput('')
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

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

  return createPortal(
    <div className="ask-settings-overlay">
      <div
        className="ask-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Ask settings"
      >
        <div className="ask-settings-head">
          <span className="ask-settings-title">Ask — Settings</span>
          <button
            type="button"
            className="ai-drawer-close"
            onClick={onClose}
            title="Close settings"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="ask-settings-body">
          <div className="ask-config-row">
            <label className="ask-label" htmlFor="ask-provider">
              Provider
            </label>
            <select
              id="ask-provider"
              className="ask-select"
              value={providerId}
              onChange={(e) => onProviderChange(e.target.value)}
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
              onChange={(e) => onModelChange(e.target.value)}
              spellCheck={false}
              placeholder="e.g. gpt-5.4-mini"
            />
            <datalist id="ask-model-options">
              {(activeProvider?.models ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <details className="ask-keys-section">
            <summary className="ask-keys-summary">
              API Keys{' '}
              {providers.some((p) => p.userConfigured) && (
                <span className="ask-keys-badge">
                  {providers.filter((p) => p.userConfigured).length}
                </span>
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
                            onClick={() => void saveKey(p.id)}
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
                            <span className="ask-key-configured">
                              Configured ✓
                            </span>
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
                              onClick={() => void deleteKey(p.id)}
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

        <div className="ask-settings-footer">
          <button type="button" className="ask-btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}