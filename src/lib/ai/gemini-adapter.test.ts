// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'

import { GeminiThoughtSignatureAdapter } from './gemini-adapter'

/** A logger that keeps the test output clean. */
const logger = resolveDebugOption(false)

/**
 * Gemini's OpenAI-compatible endpoint rejects a follow-up request whose
 * function-call part carries no `thought_signature`:
 *
 * ```
 * 400 INVALID_ARGUMENT: Function call is missing a thought_signature in
 * functionCall parts.
 * ```
 *
 * These tests drive the adapter against a fake server that behaves the way
 * Google's does, and assert that the signature survives the round trip.
 */

const SIGNATURE = 'EnMKcQFpFH0Ty1yl0b6PYOxl0DjiQSsndH4OaJSCiNxWD7jgU5thAXe5X5bIz'

/** A message as it appears on the wire. */
interface WireMessage {
  role: string
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: string
    function: { name: string; arguments: string }
    extra_content?: { google?: { thought_signature?: string } }
  }>
}

/** A request body as the fake server received it. */
interface WireRequest {
  model: string
  messages: Array<WireMessage>
  tools: unknown[]
}

interface FakeCall {
  /** Bodies the fake server received, in order. */
  bodies: Array<WireRequest>
}

/** A tool call as Gemini streams it: the signature rides in `extra_content`. */
function geminiToolCallChunk(callId: string) {
  return {
    id: 'chatcmpl-fake',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gemini-3.1-flash-lite',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id: callId,
              type: 'function',
              function: { name: 'board_context', arguments: '{}' },
              extra_content: { google: { thought_signature: SIGNATURE } },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  }
}

/**
 * Build an adapter whose OpenAI client talks to a fake server.
 *
 * The first response is a tool call carrying a signature; the second response
 * is plain text, so we can inspect exactly what the follow-up request looked
 * like on the wire.
 */
async function makeAdapter(callId: string) {
  const seen: FakeCall = { bodies: [] }
  let requestIndex = 0

  const fetchImpl = (async (_url: string, init: RequestInit) => {
    seen.bodies.push(JSON.parse(String(init.body)))
    requestIndex += 1

    if (requestIndex === 1) {
      const chunk = geminiToolCallChunk(callId)
      return new Response(
        `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }

    const chunk = {
      id: 'chatcmpl-fake',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'gemini-3.1-flash-lite',
      choices: [
        {
          index: 0,
          delta: { content: 'The board is empty.' },
          finish_reason: 'stop',
        },
      ],
    }
    return new Response(
      `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )
  }) as unknown as typeof fetch

  // The OpenAI client takes a `fetch` override, so the fake server needs no
  // network at all.
  const { default: OpenAI } = await import('openai')
  const adapter = new GeminiThoughtSignatureAdapter(
    new OpenAI({
      baseURL: 'https://fake.invalid/v1',
      apiKey: 'test-key',
      fetch: fetchImpl,
    }),
    'gemini-3.1-flash-lite',
  )
  return { adapter, seen }
}

describe('GeminiThoughtSignatureAdapter', () => {
  it('publishes the thought signature on the tool call', async () => {
    const { adapter } = await makeAdapter('call_123')

    const events: Array<{
      type: string
      toolCallId?: string
      metadata?: Record<string, unknown>
    }> = []
    for await (const event of adapter.chatStream({
      model: 'gemini-3.1-flash-lite',
      messages: [{ role: 'user', content: 'read the board' }],
      logger,
    })) {
      events.push(event)
    }

    const start = events.find((e) => e.type === 'TOOL_CALL_START')
    expect(start).toBeDefined()
    expect(start?.metadata?.thoughtSignature).toBe(SIGNATURE)
  })

  it('echoes the signature back on the follow-up request', async () => {
    const { adapter, seen } = await makeAdapter('call_123')

    for await (const _event of adapter.chatStream({
      model: 'gemini-3.1-flash-lite',
      messages: [{ role: 'user', content: 'read the board' }],
      logger,
    })) {
      // drain the first response
    }

    // The follow-up request: the model called a tool, the tool ran, and the
    // assistant message with that call goes back to Gemini alongside the
    // result. This is the request Google rejects without a signature.
    for await (const _event of adapter.chatStream({
      model: 'gemini-3.1-flash-lite',
      messages: [
        { role: 'user', content: 'read the board' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_123',
              type: 'function',
              function: { name: 'board_context', arguments: '{}' },
              metadata: { thoughtSignature: SIGNATURE },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_123', content: '{"blocks":[]}' },
      ],
      logger,
    })) {
      // drain the second response
    }

    const followUp = seen.bodies[1]
    const assistant = followUp.messages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    expect(assistant?.tool_calls?.[0].extra_content?.google?.thought_signature).toBe(
      SIGNATURE,
    )
  })

  it('leaves a call without a signature untouched', async () => {
    const { adapter, seen } = await makeAdapter('call_123')

    for await (const _event of adapter.chatStream({
      model: 'gemini-3.1-flash-lite',
      messages: [{ role: 'user', content: 'hi' }],
      logger,
    })) {
      // drain
    }

    for await (const _event of adapter.chatStream({
      model: 'gemini-3.1-flash-lite',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_123',
              type: 'function',
              function: { name: 'board_context', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', toolCallId: 'call_123', content: '{"blocks":[]}' },
      ],
      logger,
    })) {
      // drain
    }

    const assistant = seen.bodies[1].messages.find((m) => m.role === 'assistant')
    expect(assistant?.tool_calls?.[0].extra_content).toBeUndefined()
  })

  it('re-attaches a signature that arrived over the wire', async () => {
    // The second user turn: the client replays the transcript, and the tool
    // call's signature has to survive that hop (client -> AG-UI wire ->
    // server -> Gemini). The wire carries it in two places -- the tool call's
    // `encryptedValue` and the message's `toolCallMetadata` bag -- and the
    // framework restores it to `metadata.thoughtSignature` before the adapter
    // ever sees it. This test drives that whole path, because the signature is
    // dropped in either direction otherwise, and the failure it causes is a
    // 400 from Google rather than anything the adapter reports.
    const { uiMessagesToWire, chatParamsFromRequestBody, convertMessagesToModelMessages } =
      await import('@tanstack/ai')

    const wire = uiMessagesToWire([
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', content: 'How many blocks are on the board?' }],
      },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call_123',
            name: 'board_context',
            arguments: '{}',
            input: {},
            state: 'input-complete',
            metadata: { thoughtSignature: SIGNATURE },
          },
          {
            type: 'tool-result',
            toolCallId: 'call_123',
            name: 'board_context',
            content: '{"blocks":[]}',
            state: 'complete',
          },
        ],
      },
    ])

    const params = await chatParamsFromRequestBody({
      threadId: 't1',
      runId: 'r1',
      tools: [],
      context: [],
      messages: wire,
      state: {},
    })
    const messages = convertMessagesToModelMessages(params.messages)

    const { adapter, seen } = await makeAdapter('call_123')
    for await (const _event of adapter.chatStream({
      model: 'gemini-3.1-flash-lite',
      messages,
      logger,
    })) {
      // drain
    }

    const assistant = seen.bodies[0].messages.find((m) => m.role === 'assistant')
    expect(
      assistant?.tool_calls?.[0].extra_content?.google?.thought_signature,
    ).toBe(SIGNATURE)
  })
})
