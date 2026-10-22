import { createServerFn } from '@tanstack/react-start'

import { requireUser } from '#/lib/auth/guards.server'

import { listAiProviders } from './providers.server'

/**
 * Client-safe AI provider menu (no secrets — just presence + defaults).
 *
 * Provider keys are per-user, so this is scoped to the signed-in account.
 */
export const listAiProvidersFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    const providers = await listAiProviders(user.id)
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
