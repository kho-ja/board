import { createServerFn } from '@tanstack/react-start'

import { listAiProviders } from './providers.server'

/** Client-safe AI provider menu (no secrets — just presence + defaults). */
export const listAiProvidersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const providers = await listAiProviders()
    return providers.map((p) => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      models: p.models,
      configHint: p.configHint,
      available: p.available,
      userConfigured: p.userConfigured,
      encryptionConfigured: p.encryptionConfigured,
    }))
  },
)