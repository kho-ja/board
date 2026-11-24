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
import { createAiServerTools } from '#/lib/ai/tools.server'
import { getSessionUser } from '#/lib/auth/session.server'
import { getBoardMembership } from '#/lib/auth/guards.server'
import { canEditBoard } from '#/lib/boards/roles'

/**
 * Reads a whitelisted string field out of the request.
 *
 * The chat client does not send provider/model at the top level: `useChat`'s
 * `body` is merged into the AG-UI `RunAgentInput.forwardedProps` field (and
 * mirrored under the legacy `data` field). Reading only `raw.provider` meant the
 * user's selection was silently discarded and the server always fell back to
 * the first available provider — which happened to be correct by luck when there
 * was only one usable provider, and wrong the moment a second was configured.
 *
 * Deliberately allowlisted field-by-field rather than spreading
 * `forwardedProps`, which is client-controlled and could otherwise be used to
 * inject `adapter` / `tools` / `model` into `chat()`.
 */
function readClientField(
  raw: Record<string, unknown>,
  field: string,
): string | undefined {
  const candidates: unknown[] = [
    raw[field],
    (raw.forwardedProps as Record<string, unknown> | undefined)?.[field],
    (raw.data as Record<string, unknown> | undefined)?.[field],
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return undefined
}

async function providerFor(
  raw: Record<string, unknown>,
  userId: string,
): Promise<{
  provider: AiProviderId
  model: string
}> {
  const providers = await listAiProviders(userId)
  const requested = readClientField(raw, 'provider') as AiProviderId | null

  let provider: AiProviderId | null = null
  if (requested) {
    const match = providers.find((p) => p.id === requested)
    if (match?.available) provider = requested
  }

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
    readClientField(raw, 'model') ??
    providers.find((p) => p.id === provider)?.defaultModel ??
    ''

  return { provider, model }
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // The assistant is bound to one board, and that board is decided here —
        // from the session and the membership table — not from the request
        // body. The body only says which board the user *asked* about.
        const user = await getSessionUser()
        if (!user) {
          return Response.json(
            { error: 'Sign in to use Ask.' },
            { status: 401 },
          )
        }

        let raw: Record<string, unknown>
        try {
          raw = (await request.json()) as Record<string, unknown>
        } catch {
          return Response.json({ error: 'Invalid request body.' }, { status: 400 })
        }

        const boardId = readClientField(raw, 'boardId')
        if (!boardId) {
          return Response.json(
            { error: 'No board selected for this conversation.' },
            { status: 400 },
          )
        }

        const membership = await getBoardMembership(boardId, user.id)
        if (!membership) {
          return Response.json({ error: 'Board not found.' }, { status: 404 })
        }

        let params
        try {
          params = await chatParamsFromRequestBody(raw)
        } catch {
          return new Response('Invalid AG-UI request body.', { status: 400 })
        }

        let config: { provider: AiProviderId; model: string }
        try {
          config = await providerFor(raw, user.id)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Bad request.' },
            { status: 400 },
          )
        }

        let adapter
        let modelOptions: Record<string, unknown>
        try {
          const resolved = await resolveAdapter(
            config.provider,
            config.model,
            user.id,
          )
          adapter = resolved.adapter
          modelOptions = resolved.modelOptions
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Adapter error.' },
            { status: 400 },
          )
        }

        // A viewer gets the read-only tool only — the assistant cannot write
        // to a board its owner did not let them change.
        const tools = createAiServerTools(boardId, {
          canEdit: canEditBoard(membership.role),
        })

        const stream = chat({
          adapter,
          messages: params.messages,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
          ...(params.resume ? { resume: params.resume } : {}),
          tools,
          systemPrompts: [AI_SYSTEM_PROMPT],
          agentLoopStrategy: maxIterations(8),
          // Always explicit, and spelled per-provider by `resolveAdapter`. Left
          // unset, adapters infer the ceiling from the model's advertised max
          // output, which makes OpenRouter reject `openrouter/auto` with a 402
          // before the request is ever sent.
          modelOptions,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
