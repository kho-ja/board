import type { AiProviderInfo } from '#/lib/ai/providers.server'

/**
 * Provider + model selection state.
 *
 * Three separate concerns used to be spread across `AskPanel` as two
 * independent `localStorage` writes (`khoja.ai.provider`, `khoja.ai.model`).
 * That let the pair drift: a stored provider could come back paired with a model
 * it does not offer, which fails at request time with an opaque provider error.
 *
 * Now the pair is stored together under one key, validated against the live
 * provider list on read, and the last pair that produced a reply is remembered
 * separately so a known-good configuration is preferred on reload.
 */

const PAIR_KEY = 'khoja.ai.selection'
const WORKING_KEY = 'khoja.ai.working'
/** Retained so an existing install does not silently lose its selection. */
const LEGACY_PROV_KEY = 'khoja.ai.provider'
const LEGACY_MODEL_KEY = 'khoja.ai.model'

export interface ModelSelection {
  provider: string
  model: string
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // Private mode / disabled storage — fall back to defaults.
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Non-fatal: selection just will not survive a reload.
  }
}

function parsePair(raw: string | null): ModelSelection | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { provider, model } = parsed as Record<string, unknown>
    if (typeof provider !== 'string' || typeof model !== 'string') return null
    if (!provider || !model) return null
    return { provider, model }
  } catch {
    return null
  }
}

export function readSelection(): ModelSelection | null {
  return parsePair(safeRead(PAIR_KEY))
}

export function readWorkingSelection(): ModelSelection | null {
  return parsePair(safeRead(WORKING_KEY))
}

/** Writes both halves together, so the pair can never be read half-updated. */
export function writeSelection(selection: ModelSelection): void {
  safeWrite(PAIR_KEY, JSON.stringify(selection))
  // Drop the split keys so nothing can fall back to a stale half.
  try {
    localStorage.removeItem(LEGACY_PROV_KEY)
    localStorage.removeItem(LEGACY_MODEL_KEY)
  } catch {
    // ignore
  }
}

/** Called only after a provider/model pair actually returned a reply. */
export function markSelectionWorking(selection: ModelSelection): void {
  safeWrite(WORKING_KEY, JSON.stringify(selection))
}

/**
 * Migrates the pre-atomic split keys on first read. Runs once and is a no-op
 * afterwards, so an existing install keeps its configured provider.
 */
function readLegacySelection(): ModelSelection | null {
  const provider = safeRead(LEGACY_PROV_KEY)
  const model = safeRead(LEGACY_MODEL_KEY)
  if (!provider || !model) return null
  return { provider, model }
}

/**
 * Resolves the selection to start from, in priority order:
 *
 *  1. the stored pair -- an explicit choice the user made and that has not been
 *     changed since
 *  2. the last pair known to have worked, when still valid
 *  3. a migrated legacy pair, when still valid
 *  4. the first available provider's default model
 *
 * The stored pair outranks the working pair deliberately. The working pair is a
 * hint about what *used* to succeed, not a lock: ranking it first meant that once
 * any provider had answered, every reload silently reverted to it and a user
 * could never switch providers and have the change stick. An explicit choice has
 * to win, and the working pair only decides the question when nothing has been
 * chosen.
 *
 * "Valid" means the provider is present and, if its model list is non-empty,
 * the model is actually one it offers. A stored model that is no longer offered
 * is replaced by that provider's default rather than left to fail at send time.
 */
export function resolveInitialSelection(
  providers: readonly AiProviderInfo[],
): ModelSelection | null {
  const usable = (s: ModelSelection | null): ModelSelection | null => {
    if (!s) return null
    const provider = providers.find((p) => p.id === s.provider)
    if (!provider) return null
    if (provider.models.length === 0) return s
    if (provider.models.includes(s.model)) return s
    return { provider: provider.id, model: provider.defaultModel }
  }

  for (const candidate of [
    readSelection(),
    readWorkingSelection(),
    readLegacySelection(),
  ]) {
    const resolved = usable(candidate)
    if (resolved) return resolved
  }

  const available =
    providers.find((p) => p.available) ?? providers.find((p) => p.id === 'gemini')
  if (available) return { provider: available.id, model: available.defaultModel }
  return null
}

/** Models offered for a provider, tolerating an unknown id. */
export function modelsFor(
  providers: readonly AiProviderInfo[],
  providerId: string,
): string[] {
  return providers.find((p) => p.id === providerId)?.models ?? []
}

/**
 * Keeps the model valid for the chosen provider. Switching provider must not
 * carry over a model name the new provider has never heard of.
 */
export function reconcileModel(
  providers: readonly AiProviderInfo[],
  providerId: string,
  model: string,
): string {
  const models = modelsFor(providers, providerId)
  if (models.length === 0) return model
  if (model && models.includes(model)) return model
  const provider = providers.find((p) => p.id === providerId)
  return provider?.defaultModel ?? models[0] ?? ''
}
