import { beforeEach, describe, expect, it } from 'vitest'

import type { AiProviderInfo } from '#/lib/ai/providers.server'
import {
  markSelectionWorking,
  modelsFor,
  readSelection,
  readWorkingSelection,
  reconcileModel,
  resolveInitialSelection,
  writeSelection,
} from './selection'

function provider(
  id: string,
  overrides: Partial<AiProviderInfo> = {},
): AiProviderInfo {
  return {
    id: id as AiProviderInfo['id'],
    label: id,
    defaultModel: `${id}-default`,
    models: [`${id}-default`, `${id}-alt`],
    configHint: `${id.toUpperCase()}_API_KEY`,
    available: true,
    userConfigured: false,
    encryptionConfigured: false,
    ...overrides,
  }
}

const GEMINI = provider('gemini', {
  defaultModel: 'gemini-3.1-flash-lite',
  models: ['gemini-3.1-flash-lite', 'gemini-3.6-flash'],
})
const OPENROUTER = provider('openrouter', {
  defaultModel: 'openrouter/auto',
  models: ['openrouter/auto', 'openrouter/free'],
})

beforeEach(() => {
  localStorage.clear()
})

describe('atomic pair persistence', () => {
  it('stores provider and model as one value', () => {
    writeSelection({ provider: 'gemini', model: 'gemini-3.6-flash' })
    expect(readSelection()).toEqual({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    })
  })

  it('clears the legacy split keys so no stale half can win', () => {
    localStorage.setItem('khoja.ai.provider', 'openrouter')
    localStorage.setItem('khoja.ai.model', 'openrouter/auto')
    writeSelection({ provider: 'gemini', model: 'gemini-3.1-flash-lite' })
    expect(localStorage.getItem('khoja.ai.provider')).toBeNull()
    expect(localStorage.getItem('khoja.ai.model')).toBeNull()
  })

  it('survives corrupt stored JSON', () => {
    localStorage.setItem('khoja.ai.selection', '{not json')
    expect(readSelection()).toBeNull()
  })

  it('rejects a half-written pair', () => {
    localStorage.setItem(
      'khoja.ai.selection',
      JSON.stringify({ provider: 'gemini' }),
    )
    expect(readSelection()).toBeNull()
  })
})

describe('resolveInitialSelection', () => {
  it('prefers the stored choice over the pair that last worked', () => {
    // Regression: ranking the working pair first meant that once any provider
    // had answered, every reload reverted to it and an explicit switch could
    // never stick.
    markSelectionWorking({ provider: 'gemini', model: 'gemini-3.6-flash' })
    writeSelection({ provider: 'openrouter', model: 'openrouter/free' })
    expect(resolveInitialSelection([OPENROUTER, GEMINI])).toEqual({
      provider: 'openrouter',
      model: 'openrouter/free',
    })
  })

  it('falls back to the working pair when nothing is stored', () => {
    markSelectionWorking({ provider: 'gemini', model: 'gemini-3.6-flash' })
    expect(resolveInitialSelection([OPENROUTER, GEMINI])).toEqual({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    })
  })

  it('falls back to the stored pair when nothing is proven working', () => {
    writeSelection({ provider: 'openrouter', model: 'openrouter/free' })
    expect(resolveInitialSelection([OPENROUTER, GEMINI])).toEqual({
      provider: 'openrouter',
      model: 'openrouter/free',
    })
  })

  it('replaces a stored model the provider no longer offers', () => {
    // The drift that split storage allowed: openrouter paired with a Gemini id.
    writeSelection({ provider: 'openrouter', model: 'gemini-3.6-flash' })
    expect(resolveInitialSelection([OPENROUTER, GEMINI])).toEqual({
      provider: 'openrouter',
      model: 'openrouter/auto',
    })
  })

  it('drops a stored provider that is no longer registered', () => {
    writeSelection({ provider: 'ollama', model: 'llama3.3' })
    expect(resolveInitialSelection([GEMINI])).toEqual({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
    })
  })

  it('migrates the legacy split keys', () => {
    localStorage.setItem('khoja.ai.provider', 'gemini')
    localStorage.setItem('khoja.ai.model', 'gemini-3.6-flash')
    expect(resolveInitialSelection([GEMINI])).toEqual({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    })
  })

  it('ignores a legacy pair whose model is invalid for its provider', () => {
    localStorage.setItem('khoja.ai.provider', 'gemini')
    localStorage.setItem('khoja.ai.model', 'gpt-5.4-mini')
    expect(resolveInitialSelection([GEMINI])).toEqual({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
    })
  })

  it('prefers the first available provider when nothing is stored', () => {
    expect(resolveInitialSelection([GEMINI, OPENROUTER])).toEqual({
      provider: 'gemini',
      model: 'gemini-3.1-flash-lite',
    })
  })

  it('skips unavailable providers when nothing is stored', () => {
    const off = provider('gemini', { available: false })
    expect(resolveInitialSelection([off, OPENROUTER])).toEqual({
      provider: 'openrouter',
      model: 'openrouter/auto',
    })
  })

  it('returns null with no providers at all', () => {
    expect(resolveInitialSelection([])).toBeNull()
  })

  it('keeps a custom model verbatim when the provider lists no models', () => {
    // Ollama reports models only when it can reach the host; an empty list must
    // not silently rewrite whatever the user picked.
    const ollama = provider('ollama', { models: [] })
    writeSelection({ provider: 'ollama', model: 'qwen3:8b' })
    expect(resolveInitialSelection([ollama])).toEqual({
      provider: 'ollama',
      model: 'qwen3:8b',
    })
  })
})

describe('reconcileModel', () => {
  it('keeps a model the provider offers', () => {
    expect(
      reconcileModel([GEMINI], 'gemini', 'gemini-3.6-flash'),
    ).toBe('gemini-3.6-flash')
  })

  it('swaps in the default when the model is from another provider', () => {
    expect(
      reconcileModel([OPENROUTER, GEMINI], 'openrouter', 'gemini-3.6-flash'),
    ).toBe('openrouter/auto')
  })

  it('uses the default when no model is chosen yet', () => {
    expect(reconcileModel([GEMINI], 'gemini', '')).toBe(
      'gemini-3.1-flash-lite',
    )
  })

  it('passes the model through when the provider lists none', () => {
    expect(
      reconcileModel([provider('ollama', { models: [] })], 'ollama', 'x'),
    ).toBe('x')
  })

  it('returns the model unchanged for an unknown provider', () => {
    expect(reconcileModel([], 'nope', 'x')).toBe('x')
  })
})

describe('modelsFor', () => {
  it('returns the provider model list', () => {
    expect(modelsFor([GEMINI], 'gemini')).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-3.6-flash',
    ])
  })

  it('returns empty for an unknown provider', () => {
    expect(modelsFor([GEMINI], 'nope')).toEqual([])
  })
})

describe('markSelectionWorking', () => {
  it('records the pair without disturbing the stored selection', () => {
    writeSelection({ provider: 'openrouter', model: 'openrouter/auto' })
    markSelectionWorking({ provider: 'gemini', model: 'gemini-3.6-flash' })
    expect(readWorkingSelection()).toEqual({
      provider: 'gemini',
      model: 'gemini-3.6-flash',
    })
    expect(readSelection()).toEqual({
      provider: 'openrouter',
      model: 'openrouter/auto',
    })
  })
})
