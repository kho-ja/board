import { OpenAICompatibleChatAdapter } from '@tanstack/ai-openai/compatible'
import OpenAI from 'openai'
import type { AdapterYieldChunk, ModelMessage, TextOptions } from '@tanstack/ai'
import type {
  ChatCompletionChunk,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions/completions'

/**
 * Gemini's OpenAI-compatible endpoint requires a `thought_signature` to be
 * echoed back on the function-call part of the assistant message whenever a
 * tool result follows it.
 *
 * Gemini 3.x returns that signature alongside the call:
 *
 * ```json
 * {"extra_content":{"google":{"thought_signature":"EnMKcQFpFH0..."}},
 *  "function":{"arguments":"{}","name":"board_context"},
 *  "id":"call_735330","type":"function"}
 * ```
 *
 * and rejects the follow-up request with
 *
 * ```
 * 400 INVALID_ARGUMENT: Function call is missing a thought_signature in
 * functionCall parts. This is required for tools to work correctly, and
 * missing thought_signature may lead to degraded model performance.
 * ```
 *
 * The generic OpenAI-compatible adapter drops it in both directions: the
 * stream reader keeps only id/name/arguments, and the request builder
 * re-creates each `tool_calls` entry from scratch. The framework already has
 * a channel for exactly this -- `ToolCall.metadata.thoughtSignature`, which
 * `@tanstack/ai-gemini` uses -- so this adapter implements the same contract
 * and lets the core carry the signature between the response and the next
 * request.
 */

/** Google's envelope for the signature on a function-call part. */
interface GeminiExtraContent {
  google?: {
    thought_signature?: string
  }
}

/** The `tool_calls` entry shape Gemini uses, including the signature. */
type GeminiToolCall = {
  id?: string
  extra_content?: GeminiExtraContent
}

const THOUGHT_SIGNATURE = 'thoughtSignature'

/**
 * Read a thought signature out of arbitrary tool-call metadata.
 *
 * `ToolCall.metadata` is untyped at the framework layer (each adapter narrows
 * it via its own generic), so the shape is validated at runtime rather than
 * asserted.
 */
function thoughtSignatureOf(metadata: unknown): string | undefined {
  if (metadata == null || typeof metadata !== 'object') return undefined
  const value = (metadata as Record<string, unknown>)[THOUGHT_SIGNATURE]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** Read the signature Gemini attached to a streamed function-call part. */
function signatureOfDelta(call: unknown): string | undefined {
  if (call == null || typeof call !== 'object') return undefined
  const signature = (call as GeminiToolCall).extra_content?.google
    ?.thought_signature
  return typeof signature === 'string' && signature !== '' ? signature : undefined
}

/**
 * An OpenAI-compatible adapter that round-trips Gemini's thought signature.
 *
 * The signature is captured from the response, published as
 * `TOOL_CALL_START.metadata.thoughtSignature` (the framework's carrier for
 * provider-specific tool-call metadata), and re-attached to the
 * `extra_content` of the function-call part on the next request.
 */
export class GeminiThoughtSignatureAdapter extends OpenAICompatibleChatAdapter<string> {
  constructor(client: OpenAI, model: string) {
    super(client, model, 'gemini')
  }

  /**
   * Tap the raw chunk stream for thought signatures, then publish each one on
   * the `TOOL_CALL_START` event for that call.
   *
   * The signature arrives in the same delta as the call's id and name, so by
   * the time the base implementation emits `TOOL_CALL_START` for that call the
   * signature is already known.
   */
  protected override async *processStreamChunks(
    stream: AsyncIterable<ChatCompletionChunk>,
    options: TextOptions,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<AdapterYieldChunk> {
    const signatures = new Map<string, string>()
    const tapped = (async function* (): AsyncGenerator<ChatCompletionChunk> {
      for await (const chunk of stream) {
        for (const call of chunk.choices?.[0]?.delta?.tool_calls ?? []) {
          const signature = signatureOfDelta(call)
          const id = (call as GeminiToolCall).id
          if (signature && id) signatures.set(id, signature)
        }
        yield chunk
      }
    })()

    for await (const event of super.processStreamChunks(
      tapped,
      options,
      aguiState,
    )) {
      if (event.type === 'TOOL_CALL_START') {
        const signature = signatures.get(event.toolCallId)
        if (signature) {
          yield {
            ...event,
            metadata: {
              ...(event.metadata ?? {}),
              [THOUGHT_SIGNATURE]: signature,
            },
          }
          continue
        }
      }
      yield event
    }
  }

  /**
   * Re-attach the signature to the function-call parts of an assistant
   * message on its way back to Google.
   *
   * Without this Google rejects every follow-up request that carries a tool
   * result with `400 INVALID_ARGUMENT`.
   */
  protected override convertMessage(
    message: ModelMessage,
  ): ChatCompletionMessageParam {
    const converted = super.convertMessage(message)
    if (message.role !== 'assistant' || !message.toolCalls?.length) {
      return converted
    }
    if (converted.role !== 'assistant' || !converted.tool_calls) return converted

    const signatures = new Map(
      message.toolCalls.map((call) => [call.id, thoughtSignatureOf(call.metadata)]),
    )
    const toolCalls = converted.tool_calls.map((call) => {
      const signature = signatures.get(call.id)
      if (!signature) return call
      return {
        ...call,
        extra_content: { google: { thought_signature: signature } },
      }
    })
    return { ...converted, tool_calls: toolCalls } as ChatCompletionMessageParam
  }
}

/**
 * Build a Gemini adapter that speaks the OpenAI-compatible API while
 * preserving thought signatures.
 */
export function createGeminiAdapter(options: {
  model: string
  baseURL: string
  apiKey: string
}): GeminiThoughtSignatureAdapter {
  return new GeminiThoughtSignatureAdapter(
    new OpenAI({ baseURL: options.baseURL, apiKey: options.apiKey }),
    options.model,
  )
}
