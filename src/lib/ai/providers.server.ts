import type { AnyTextAdapter } from '@tanstack/ai'
import { ollamaText } from '@tanstack/ai-ollama'
import { openaiText } from '@tanstack/ai-openai'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'
import { openRouterText } from '@tanstack/ai-openrouter'

import { decryptApiKey } from './encryption'
import { getApiKey } from '#/db/queries.server'

/**
 * M15 — multi-provider AI configuration.
 *
 * Providers are resolved from database (user-configured) first, then fall back
 * to environment variables. This allows users to add their own API keys via UI.
 */

export type AiProviderId = 'openai' | 'openrouter' | 'ollama' | 'custom'

export interface AiProviderInfo {
  id: AiProviderId
  label: string
  defaultModel: string
  models: string[]
  configHint: string
  available: boolean
  // whether the key comes from user config (DB) vs env
  userConfigured: boolean
}

const BUILTIN_PROVIDERS: readonly Omit<AiProviderInfo, 'available' | 'userConfigured'>[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5.4-mini',
    models: ['gpt-5.4-mini', 'gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'],
    configHint: 'OPENAI_API_KEY',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openrouter/auto',
    models: ['openrouter/auto', 'openrouter/free'],
    configHint: 'OPENROUTER_API_KEY',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultModel: 'llama3.3',
    models: ['llama3.3', 'llama3.2', 'qwen3:8b', 'gemma3'],
    configHint: 'OLLAMA_HOST (default http://localhost:11434)',
  },
]

function customProviderConfig(): {
  name: string
  baseURL: string
  apiKey?: string
  defaultModel: string
} | null {
  const baseURL = process.env.AI_CUSTOM_BASE_URL
  if (!baseURL) return null
  return {
    name: process.env.AI_CUSTOM_NAME ?? 'custom',
    baseURL,
    apiKey: process.env.AI_CUSTOM_API_KEY,
    defaultModel: process.env.AI_CUSTOM_MODEL ?? 'custom-model',
  }
}

/** Check if provider has a key in DB or env. */
async function checkProviderAvailable(id: AiProviderId): Promise<{ available: boolean; userConfigured: boolean }> {
  switch (id) {
    case 'openai': {
      const dbKey = await getApiKey('openai')
      if (dbKey) return { available: true, userConfigured: true }
      return { available: Boolean(process.env.OPENAI_API_KEY), userConfigured: false }
    }
    case 'openrouter': {
      const dbKey = await getApiKey('openrouter')
      if (dbKey) return { available: true, userConfigured: true }
      return { available: Boolean(process.env.OPENROUTER_API_KEY), userConfigured: false }
    }
    case 'ollama':
      return { available: true, userConfigured: false }
    case 'custom': {
      const dbKey = await getApiKey('custom')
      if (dbKey) return { available: true, userConfigured: true }
      return { available: Boolean(process.env.AI_CUSTOM_BASE_URL), userConfigured: false }
    }
  }
}

/** Get the decrypted API key for a provider (DB first, then env). */
async function getProviderKey(id: AiProviderId): Promise<string | undefined> {
  switch (id) {
    case 'openai': {
      const dbKey = await getApiKey('openai')
      if (dbKey) return decryptApiKey(dbKey.encryptedKey)
      return process.env.OPENAI_API_KEY
    }
    case 'openrouter': {
      const dbKey = await getApiKey('openrouter')
      if (dbKey) return decryptApiKey(dbKey.encryptedKey)
      return process.env.OPENROUTER_API_KEY
    }
    case 'ollama':
      return undefined
    case 'custom': {
      const dbKey = await getApiKey('custom')
      if (dbKey) return decryptApiKey(dbKey.encryptedKey)
      return process.env.AI_CUSTOM_API_KEY
    }
  }
}

/** Get custom provider base URL (DB first, then env). */
async function getCustomBaseUrl(): Promise<string | undefined> {
  const dbKey = await getApiKey('custom')
  if (dbKey?.baseUrl) return dbKey.baseUrl
  return process.env.AI_CUSTOM_BASE_URL
}

/** Called at request time so DB/env-driven `available` flags stay fresh. */
export async function listAiProviders(): Promise<AiProviderInfo[]> {
  const providers: AiProviderInfo[] = []

  for (const p of BUILTIN_PROVIDERS) {
    const { available, userConfigured } = await checkProviderAvailable(p.id)
    providers.push({ ...p, available, userConfigured })
  }

  const custom = customProviderConfig()
  if (custom) {
    const { available, userConfigured } = await checkProviderAvailable('custom')
    providers.push({
      id: 'custom',
      label: custom.name,
      defaultModel: custom.defaultModel,
      models: [custom.defaultModel],
      configHint: 'AI_CUSTOM_BASE_URL',
      available,
      userConfigured,
    })
  }

  return providers
}

export async function isProviderAvailable(id: AiProviderId): Promise<boolean> {
  const { available } = await checkProviderAvailable(id)
  return available
}

/**
 * Builds the adapter for a provider/model pair. Resolved inside the request
 * handler so DB/env vars are read server-side, never at module scope.
 */
export async function resolveAdapter(
  providerId: AiProviderId,
  model: string,
): Promise<AnyTextAdapter> {
  const available = await isProviderAvailable(providerId)
  if (!available) {
    const info = BUILTIN_PROVIDERS.find((p) => p.id === providerId)
    const hint = info?.configHint
    throw new Error(
      hint
        ? `${info?.label} is not configured. Add an API key in the Ask panel or set ${hint} in your .env.local to enable it.`
        : `AI provider "${providerId}" is not configured.`,
    )
  }
  if (!model || !model.trim()) {
    throw new Error('A model must be selected for the active AI provider.')
  }

  const key = await getProviderKey(providerId)

  switch (providerId) {
    case 'openai':
      return openaiText(model as Parameters<typeof openaiText>[0])
    case 'openrouter':
      return openRouterText(model as Parameters<typeof openRouterText>[0])
    case 'ollama':
      return ollamaText(model)
    case 'custom': {
      const baseURL = await getCustomBaseUrl()
      if (!baseURL) throw new Error('custom AI provider base URL is not configured')
      return openaiCompatibleText(model, {
        baseURL,
        apiKey: key ?? 'not-required',
      })
    }
  }
}