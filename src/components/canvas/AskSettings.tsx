import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { deleteApiKeyFn, upsertApiKeyFn } from '#/db/queries.functions'
import type { AiProviderInfo } from '#/lib/ai/providers.server'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

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
  encryptionConfigured,
}: {
  open: boolean
  onClose: () => void
  providers: AiProviderInfo[]
  providerId: string
  model: string
  onProviderChange: (id: string) => void
  onModelChange: (model: string) => void
  encryptionConfigured: boolean
}) {
  const queryClient = useQueryClient()

  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [upsertKeyPending, setUpsertKeyPending] = useState<string | null>(null)
  const [deleteKeyPending, setDeleteKeyPending] = useState<string | null>(null)

  const activeProvider = providers.find((p) => p.id === providerId)

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

  const configuredCount = providers.filter((p) => p.userConfigured).length

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Ask — Settings</DialogTitle>
          <DialogDescription>Configure the AI provider and model.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-4 px-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ask-provider">Provider</Label>
              <Select
                value={providerId}
                onValueChange={(v) => {
                  if (v !== null) onProviderChange(v)
                }}
              >
                <SelectTrigger id="ask-provider" className="w-full">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={!p.available}>
                      {p.label}
                      {p.available ? '' : ' (not configured)'}
                      {p.userConfigured ? ' ✓' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ask-model">Model</Label>
              <Input
                id="ask-model"
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

            <Separator />

            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                API Keys
                {configuredCount > 0 && <Badge variant="outline">{configuredCount}</Badge>}
              </p>
              {providers
                .filter((p) => p.id !== 'ollama')
                .map((p) => (
                  <div key={p.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{p.label}</span>
                      {editingKey === p.id ? (
                        <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)}>
                          Close
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          {p.userConfigured ? (
                            <>
                              <span className="text-xs text-muted-foreground">Configured ✓</span>
                              <Button variant="ghost" size="sm" onClick={() => startEditKey(p.id)}>
                                Change
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => void deleteKey(p.id)}
                                disabled={deleteKeyPending === p.id}
                              >
                                {deleteKeyPending === p.id ? 'Removing…' : 'Remove'}
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" onClick={() => startEditKey(p.id)}>
                              Add Key
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    {editingKey === p.id && (
                      <div className="space-y-2 rounded-lg border p-3">
                        <Input
                          type="password"
                          placeholder="Enter API key"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value)}
                          autoFocus
                        />
                        {(p.id === 'custom' || p.id === 'openrouter') && (
                          <Input
                            type="text"
                            placeholder="Base URL (optional)"
                            value={baseUrlInput}
                            onChange={(e) => setBaseUrlInput(e.target.value)}
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => void saveKey(p.id)}
                            disabled={upsertKeyPending === p.id}
                          >
                            {upsertKeyPending === p.id ? 'Saving…' : 'Save'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingKey(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              {!encryptionConfigured && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Set AI_ENCRYPTION_KEY in .env.local for production encryption.
                  </AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">
                Keys are encrypted at rest. Ollama runs locally and needs no key.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter showCloseButton={false}>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}