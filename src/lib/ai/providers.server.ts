import type { AnyTextAdapter } from '@tanstack/ai'
import { ollamaText } from '@tanstack/ai-ollama'
import { createOpenaiChat, openaiText } from '@tanstack/ai-openai'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'
import {
  createOpenRouterText,
  openRouterText,
} from '@tanstack/ai-openrouter'

import { decryptApiKey } from './encryption'
import { getApiKey } from '#/db/queries.server'

/**
 * M15 — multi-provider AI configuration.
 *
 * Providers are resolved from database (user-configured) first, then fall back
 * to environment variables. This allows users to add their own API keys via UI.
 */

export type AiProviderId = 'gemini' | 'openai' | 'openrouter' | 'ollama' | 'custom'

/**
 * Google's OpenAI-compatible surface. We talk to Gemini through it rather than
 * `@tanstack/ai-gemini` because no published adapter release has a peer range
 * covering `@tanstack/ai@0.53.0` (the adapter line jumps 0.52.3 -> 0.55.0), and
 * upgrading the whole AI stack to add one provider is not worth the blast
 * radius. Tool calling is verified working through this endpoint.
 */
const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/'

export interface AiProviderInfo {
  id: AiProviderId
  label: string
  defaultModel: string
  models: string[]
  configHint: string
  available: boolean
  // whether the key comes from user config (DB) vs env
  userConfigured: boolean
  // whether the master AI_ENCRYPTION_KEY is set (server truth — the client
  // cannot read process.env, so this is reported through the provider query)
  encryptionConfigured: boolean
  /**
   * Explicit output ceiling sent as `modelOptions.max_tokens`.
   *
   * Required, not cosmetic: adapters otherwise derive the ceiling from the
   * model's advertised `max_output_tokens`. For `openrouter/auto` that is
   * 131072, and OpenRouter rejects the request up front with 402 ("requested up
   * to 131072 tokens, but can only afford 22812") even when the account has
   * credits. Capping to 4096 makes the same call succeed.
   */
  maxTokens?: number
}

/**
 * Output ceiling. Deliberately generous but far below the 131072 that adapters
 * infer from model metadata. Too low is its own failure mode: Gemini thinking
 * tokens eat the budget and the call returns 200 with an empty body.
 */
const DEFAULT_MAX_TOKENS = 8192

const BUILTIN_PROVIDERS: readonly Omit<
  AiProviderInfo,
  'available' | 'userConfigured' | 'encryptionConfigured'
>[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    // Defaults to the cheapest model with real free-tier headroom. The 3.5/3.6
    // flash tiers answer better but burn the (very small) free quota fast and
    // start returning 429 within a handful of board edits, so they are offered
    // but not chosen for the user.
    defaultModel: 'gemini-3.1-flash-lite',
    // Probed against this project's key. 3.8/3.7 and *-latest are currently
    // demand-gated (503); 2.5-pro is retired for new users and the pro tier has
    // no free-tier quota. Kept listed so they recover without a code change.
    models: [
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.8-flash',
    ],
    configHint: 'GEMINI_API_KEY (or GOOGLE_API_KEY)',
    maxTokens: DEFAULT_MAX_TOKENS,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5.2',
    models: ['gpt-5.2', 'gpt-5.2-mini', 'gpt-5-mini'],
    configHint: 'OPENAI_API_KEY',
    maxTokens: DEFAULT_MAX_TOKENS,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openrouter/auto',
    models: ['openrouter/auto', 'openrouter/free'],
    configHint: 'OPENROUTER_API_KEY',
    maxTokens: DEFAULT_MAX_TOKENS,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    defaultModel: 'llama3.3',
    models: ['llama3.3', 'llama3.2', 'qwen3:8b', 'gemma3'],
    configHint: 'OLLAMA_HOST (default http://localhost:11434)',
    maxTokens: DEFAULT_MAX_TOKENS,
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
    case 'gemini': {
      const dbKey = await getApiKey('gemini')
      if (dbKey) return { available: true, userConfigured: true }
      return { available: Boolean(geminiEnvKey()), userConfigured: false }
    }
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

/** The Gemini adapter checks GOOGLE_API_KEY before GEMINI_API_KEY; match that. */
function geminiEnvKey(): string | undefined {
  return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
}

/** Get the decrypted API key for a provider (DB first, then env). */
async function getProviderKey(id: AiProviderId): Promise<string | undefined> {
  switch (id) {
    case 'gemini': {
      const dbKey = await getApiKey('gemini')
      if (dbKey) return decryptApiKey(dbKey.encryptedKey)
      return geminiEnvKey()
    }
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
  const encryptionConfigured = Boolean(process.env.AI_ENCRYPTION_KEY)

  for (const p of BUILTIN_PROVIDERS) {
    const { available, userConfigured } = await checkProviderAvailable(p.id)
    providers.push({ ...p, available, userConfigured, encryptionConfigured })
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
      encryptionConfigured,
    })
  }

  return providers
}

export async function isProviderAvailable(id: AiProviderId): Promise<boolean> {
  const { available } = await checkProviderAvailable(id)
  return available
}

/** Config the adapter layer needs, so `/api/chat` can pass `modelOptions`. */
export interface ResolvedChatConfig {
  adapter: AnyTextAdapter
  modelOptions: Record<string, unknown>
}

/**
 * Builds the adapter for a provider/model pair. Resolved inside the request
 * handler so DB/env vars are read server-side, never at module scope.
 */
export async function resolveAdapter(
  providerId: AiProviderId,
  model: string,
): Promise<ResolvedChatConfig> {
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
  const maxTokens =
    BUILTIN_PROVIDERS.find((p) => p.id === providerId)?.maxTokens ??
    DEFAULT_MAX_TOKENS

  switch (providerId) {
    case 'gemini':
      return {
        adapter: openaiCompatibleText(model, {
          baseURL: GEMINI_BASE_URL,
          apiKey: key ?? '',
        }),
        modelOptions: { max_tokens: maxTokens },
      }
    case 'openai':
      // `openaiText` reads OPENAI_API_KEY from env and its config type excludes
      // `apiKey`, so a DB-stored key needs the `create*` factory instead.
      return {
        adapter: key
          ? createOpenaiChat(model as Parameters<typeof createOpenaiChat>[0], key)
          : openaiText(model as Parameters<typeof openaiText>[0]),
        modelOptions: { max_tokens: maxTokens },
      }
    case 'openrouter':
      return {
        adapter: key
          ? createOpenRouterText(
              model as Parameters<typeof createOpenRouterText>[0],
              key,
            )
          : openRouterText(model as Parameters<typeof openRouterText>[0]),
        // Not `max_tokens`: the OpenRouter adapter spells this
        // `maxCompletionTokens` and ignores the snake_case spelling entirely.
        // Sending the wrong key leaves it free to infer the ceiling from model
        // metadata (131072 for `openrouter/auto`), which OpenRouter rejects
        // up front with a 402 credit error.
        modelOptions: { maxCompletionTokens: maxTokens },
      }
    case 'ollama':
      return {
        adapter: ollamaText(model),
        // Ollama nests sampling params under `options` and calls the output
        // ceiling `num_predict`.
        modelOptions: { options: { num_predict: maxTokens } },
      }
    case 'custom': {
      const baseURL = await getCustomBaseUrl()
      if (!baseURL) throw new Error('custom AI provider base URL is not configured')
      return {
        adapter: openaiCompatibleText(model, {
          baseURL,
          apiKey: key ?? 'not-required',
        }),
        modelOptions: { max_tokens: maxTokens },
      }
    }
  }
}
