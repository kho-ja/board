import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createFileRoute } from '@tanstack/react-router'

import { AI_SYSTEM_PROMPT } from '#/lib/ai/system'
import {
  listAiProviders,
  resolveAdapter,
  type AiProviderId,
} from '#/lib/ai/providers.server'
import { aiServerTools } from '#/lib/ai/tools.server'

async function providerFor(raw: Record<string, unknown>): Promise<{
  provider: AiProviderId
  model: string
}> {
  const providers = await listAiProviders()
  const requested =
    typeof raw.provider === 'string' ? (raw.provider as AiProviderId) : null

  let provider: AiProviderId | null = null
  if (requested && (await isProviderAvailable(requested))) provider = requested

  if (!provider) {
    const firstAvailable = providers.find((p) => p.available)
    if (!firstAvailable) {
      throw new Error(
        'No AI provider is configured. Add an API key in the Ask panel.',
      )
    }
    provider = firstAvailable.id
  }

  const model =
    typeof raw.model === 'string' && raw.model.trim()
      ? raw.model.trim()
      : providers.find((p) => p.id === provider)?.defaultModel ?? ''

  return { provider, model }
}

async function isProviderAvailable(id: AiProviderId): Promise<boolean> {
  const providers = await listAiProviders()
  return providers.find((p) => p.id === id)?.available ?? false
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let raw: Record<string, unknown>
        try {
          raw = (await request.json()) as Record<string, unknown>
        } catch {
          return Response.json({ error: 'Invalid request body.' }, { status: 400 })
        }

        let params
        try {
          params = await chatParamsFromRequestBody(raw)
        } catch {
          return new Response('Invalid AG-UI request body.', { status: 400 })
        }

        let config: { provider: AiProviderId; model: string }
        try {
          config = await providerFor(raw)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Bad request.' },
            { status: 400 },
          )
        }

        let adapter
        try {
          adapter = await resolveAdapter(config.provider, config.model)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Adapter error.' },
            { status: 400 },
          )
        }

        const stream = chat({
          adapter,
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
          ...(params.resume ? { resume: params.resume } : {}),
          tools: aiServerTools,
          systemPrompts: [AI_SYSTEM_PROMPT],
          agentLoopStrategy: maxIterations(8),
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})