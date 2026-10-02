# AI provider & Ask panel findings

Working notes from diagnosing "AI is not working" and the Ask panel layout bugs.
Every provider claim below was verified by calling the live APIs with the keys in
`.env.local`; every layout claim was measured in the browser.

## Status: complete and pushed

All items below are done and verified. Typecheck clean, 178 tests pass, build
succeeds. Remaining known limitations are listed under "Still open".

## Root causes found

### 1. OpenRouter 402 was NOT a billing problem

The account has credits. The failure came from the request advertising a huge
output ceiling:

```
402 Payment Required
"This request requires more credits, or fewer max_tokens.
 You requested up to 131072 tokens, but can only afford 22812."
```

`@tanstack/ai-openrouter` derives the ceiling from the model's
`max_output_tokens` in its own `model-meta.ts`. For `openrouter/auto` that
resolves to **131072**, so the credit pre-check rejects the request before it is
ever sent.

Verified — capping the ceiling makes the same request succeed:

| ceiling | Result |
| --- | --- |
| unset (adapter default 131072) | 402 Payment Required |
| 8192 | 200, routed to `z-ai/glm-5.3-flash` |
| 4096 | 200, routed to `z-ai/glm-5.3-flash` |

### 2. Resolved API keys were never passed to the adapters

In `src/lib/ai/providers.server.ts` `resolveAdapter`, `key` is resolved via
`getProviderKey()` but then discarded for two providers:

```ts
case 'openai':
  return openaiText(model)          // key unused
case 'openrouter':
  return openRouterText(model)      // key unused
```

Only the `custom` branch passed `apiKey`. The others fell back to the adapters'
own `process.env` lookup, so a key stored in the DB via Ask settings was ignored.

Worth noting: neither factory can accept a key directly — both config types are
`Omit<..., 'apiKey'>` because the key is required and typed. Passing `{ apiKey }`
is a type error. The supported route is the `create*` factory
(`createOpenaiChat`, `createOpenRouterText`), which is what the fix uses.

### 3. The OpenAI model list was fictional

`BUILTIN_PROVIDERS` listed `gpt-5.4-mini`, `gpt-5.6-luna`, `gpt-5.6-terra`,
`gpt-5.6-sol`. None exist. With `OPENAI_API_KEY` also commented out in
`.env.local`, that provider could not work at all.

### 4. Gemini was never wired up

`GEMINI_API_KEY` is present and valid, but `rg gemini src/` returned zero
matches. `AiProviderId` was only `'openai' | 'openrouter' | 'ollama' | 'custom'`,
so the key was never read.

### 5. Model picker was free text, and persistence was split

The panel used `<Input list="ask-model-options-header">` (a datalist), so any
string could be submitted — including typos that fail at request time.
`AskPanel` also wrote `PROV_STORAGE` and `MODEL_STORAGE` separately, so a stored
provider could end up paired with a model it does not have. Nothing recorded
which provider/model combination actually returned a successful reply.

### 6. The provider selection never reached the server

The most consequential bug, and invisible until a wire capture.

`useChat({ body })` does **not** put `provider`/`model` at the top level of the
POST. It merges them into the AG-UI `RunAgentInput.forwardedProps` field and
mirrors them under legacy `data`. A captured request:

```json
{
  "threadId": "...", "runId": "...", "state": {}, "messages": [...],
  "tools": [...], "context": [],
  "forwardedProps": { "provider": "gemini", "model": "gemini-3.6-flash" },
  "data": { "provider": "gemini", "model": "gemini-3.6-flash" }
}
```

But `providerFor()` read `raw.provider` — top level only — so it was always
`undefined` and the server silently fell back to `providers.find(p => p.available)`.
It *looked* correct whenever only one provider was usable, and would have used
the wrong provider the moment a second was configured.

Fixed with a `readClientField()` helper that checks top level, `forwardedProps`,
then `data`. Fields stay allowlisted one by one rather than spreading
`forwardedProps` into `chat()`, which is client-controlled and could otherwise
inject `adapter`/`tools`/`model`.

**Proof the fix works:** requesting `provider: 'gemini', model: 'gemini-NOT-A-MODEL'`
now returns a 400 from Google. Before the fix it would have quietly succeeded via
OpenRouter, since a bogus Gemini model never reached Gemini.

### 7. `modelOptions` is spelled differently per provider

Sending `max_tokens` fixed nothing for OpenRouter — it still asked for 131072.
The adapters do not share a spelling:

| Provider | Key | Shape |
| --- | --- | --- |
| OpenAI, Gemini, custom (OpenAI-compatible) | `max_tokens` | flat |
| OpenRouter | `maxCompletionTokens` | flat |
| Ollama | `num_predict` | nested under `options` |

`resolveAdapter()` now returns a ready-made `modelOptions` object with the right
key per provider instead of a bare number.

## Gemini integration: dependency decision

`@tanstack/ai-gemini` is the official adapter, but **no published version has a
peer range matching this repo's `@tanstack/ai@0.53.0`**:

| `@tanstack/ai-gemini` | peer `@tanstack/ai` |
| --- | --- |
| 0.27.0 | `^0.52.1` |
| 0.28.0 | `^0.52.2` |
| 0.29.0 | `^0.52.3` |
| **0.30.0** | **`^0.55.0`** — next release after ours |
| 0.32.0 | `^0.58.0` |
| 0.34.1 (latest) | `^0.63.0` |

The adapters release on a different cadence than core, so 0.53.0 falls into a gap.
Installing would have forced a coordinated upgrade of `@tanstack/ai` plus
`ai-openai`, `ai-openrouter`, `ai-ollama`, and `ai-react` — risky and unrelated to
the bug.

**Decision: use Google's official OpenAI-compatible endpoint** via
`openaiCompatibleText`, which this repo already uses for the `custom` provider.
No dependency change.

## Verified Gemini model matrix

Listed via `GET /v1beta/models` for this key, then each probed through
`POST /v1beta/openai/chat/completions`:

| Model | Result |
| --- | --- |
| `gemini-3.1-flash-lite` | 200 "ok", tool calls confirmed, **survives sustained use** |
| `gemini-3.6-flash` | 200 "ok" initially; 429 once free quota was spent |
| `gemini-3.5-flash` | 200 "ok" initially; 429 once free quota was spent |
| `gemini-3.8-flash` | 503 high demand (transient; native `generateContent` works) |
| `gemini-3.7-flash` | 503 high demand |
| `gemini-flash-latest` | 503 high demand |
| `gemini-2.5-pro` | 404 — no longer available to new users |
| `gemini-3.1-pro-preview` | 429 — free-tier quota is 0 for the pro tier |

Tool calling confirmed on `gemini-3.1-flash-lite`:

```json
{"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant",
 "tool_calls":[{"function":{"name":"create_block",
 "arguments":"{\"title\":\"Hello\"}"},"type":"function"}]}}]}
```

**Default is `gemini-3.1-flash-lite`,** not the newer flash tiers. Those answer
better but exhaust the (very small) free quota within a handful of board edits and
start returning 429; the lite tier kept answering throughout testing.

**Gotcha worth remembering:** `max_tokens: 32` made `gemini-3.6-flash` return 200
with an *empty* body — thinking tokens consumed the whole budget. `max_tokens:
2000` returned "ok". A low ceiling silently starves the response, which is a
distinct failure mode from a hard 402.

## Upstream bug found: server-side tool schemas are malformed

Not fixed here, but it will bite anyone calling `/api/chat` without client-sent
tools.

`openaiCompatibleText` (`@tanstack/ai-openai@0.22.5`) emits function tools with
**no `name`, no `description`, and empty `properties`**:

```json
"tools": [{"type":"function","function":{
  "parameters":{"type":"object","properties":{},"required":[],"additionalProperties":false},
  "strict":true}}]
```

Replaying that exact body against Google:

```
GenerateContentRequest.tools[0].function_declarations[0].name: Invalid function name.
```

The converters themselves (`convertFunctionToolToChatCompletionsFormat`) correctly
read `tool.name`/`tool.inputSchema`, so the `tool` objects reaching them are
missing those fields — a version skew between `@tanstack/ai@0.53.0` and the
installed `@tanstack/openai-base`.

**This does not affect the app.** The browser client sends fully-formed tool
schemas in the request body, and `mergeAgentTools` prefers those, which is why
tool calling works end-to-end in the UI. It only surfaces when tools come solely
from the server registry — e.g. the synthetic `tools: []` requests used to probe
the endpoint.

## What "AI not working" actually was, in total

Five independent faults, all needed for the feature to be unusable:

1. Selection never reached the server (bug 6) — always used the first provider.
2. OpenRouter requested a 131072-token ceiling and was rejected with 402
   (bug 1), so the only funded provider could not be used.
3. Resolved DB keys were discarded for openai/openrouter (bug 2).
4. The OpenAI model list was fictional (bug 3).
5. Gemini, the one key that actually worked, was never registered (bug 4).

Also fixed in passing: the Ask panel rendered failed runs as `[object Object]`,
because `interruptErrors` entries are plain `BatchInterruptError` objects rather
than `Error` instances. It now shows the real message plus the error code.

## Verification

Live end-to-end through `/api/chat` (SSE, real keys):

```
PASS gemini      gemini-3.1-flash-lite  finished=true  delta='ok'
PASS openrouter   openrouter/auto        finished=true  delta='ok'
PASS gemini      gemini-NOT-A-MODEL     error=400   (proves selection is honoured)
PASS openai      gpt-5.2                error=404   (no key configured, as expected)
```

Plus in-browser: Gemini ran `board_context` (36 blocks · 31 connections ·
1 type) and, after approval, created a block — `{"ok":true,"id":"3f0a55aa…",
"kind":"text","title":"Gemini Probe"}`.

`npx tsc --noEmit` clean · 177 tests pass (22 new) · `npm run build` succeeds.

`npm run lint` remains blocked by a pre-existing repo-wide config issue, not by
these changes:

```
Parsing error: No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present
```

### 8. The remembered "working" pair overrode explicit user choice

Found by runtime testing, not by reading the code.

`resolveInitialSelection()` originally ranked the last-known-working pair *above*
the stored selection. Consequence: once any provider had answered, every reload
silently reverted to it, and a user could never switch providers and have the
change stick — the picker would show the new choice until refresh, then snap back.

The working pair is a hint about what used to succeed, not a lock. Corrected
order is: stored selection → working pair → legacy pair → first available. An
explicit choice always wins; the working pair only decides when nothing has been
chosen.

Verified live: with `working` still pointing at Gemini, selecting OpenRouter in
the settings dialog and reloading keeps OpenRouter selected, and a successful
send then moves `working` to OpenRouter.

### 9. Stale approvals from a failed run (now fixed)

A pending approval is persisted with the thread. A run that died between "tool
needs approval" and the resume — a provider 429, a dropped connection — left the
card behind on every later visit, and answering it just re-failed. The server
holds no state for that run, so the card was a dead end that still looked live.

`AskThread` now cancels pending approvals as soon as the run errors, leaving the
real error plus "Try again" as the single honest way forward. A ref guard keeps
the effect to once per failed run instead of firing on every render.

Verified live: approval pending → switched provider to Ollama (not running) →
approved → `fetch failed`, card gone, "Try again" offered → switched back to
OpenRouter → retry succeeded and the tool ran exactly once (block count 1, not 2).
So the failed attempt did not half-apply and the retry did not duplicate it.

An approval rehydrated from storage on a *later* visit is deliberately left
alone: there is no error in that session yet, and if the provider has recovered
the answer will succeed.

## Still open

- **Gemini free-tier quota is small.** After sustained board editing the 3.5/3.6
  flash tiers return 429. OpenRouter has credits and is the reliable choice for
  heavy use; the model picker makes switching one click.
- **Upstream tool-schema bug** (`openaiCompatibleText` emits unnamed tools) only
  bites requests that carry no client-sent tools, so it does not affect the app.
- **Approval expiry is session-scoped, not time-based.** A card can still sit
  across visits; it is only dropped once a run actually errors. A time-based
  expiry (say, clear approvals older than N hours on hydrate) would be stricter
  but risks discarding a legitimate pause.

## Verified this session

| Area | Result |
| --- | --- |
| Gemini text (3 models) | 200, correct reply through `/api/chat` |
| OpenRouter | 200 after the ceiling fix |
| Provider selection honoured | bogus Gemini model → 400 from Google |
| Tool calling | `board_context` ran; `board_create_blocks` created a block after approval |
| Connect tool | click source → target created a `depends-on` link (31 → 32 → 31 after cleanup); type picker switches all four types |
| Model picker | real `Select`, drawer has no overflow (`scrollWidth === clientWidth === 223`) |
| Selection persistence | explicit choice survives reload against a competing working pair |
| Error surfacing | shows `429 status code (no body)` with a working "Try again" |
| Stale approval | cleared on run failure; retry ran the tool exactly once, no duplicate |
| Chat list rows | transparent buttons; `x` sits inside the card; overflow 0 |
| Empty-chat state | chips wrap and clamp to 2 lines; thread overflow 305px -> 0 |

`npx tsc --noEmit` clean · 178 tests pass (23 for the selection module) ·
`npm run build` succeeds.

## Note on line endings

This repo is mixed with no `.gitattributes`: `LeftDock.tsx` and `AskPanel.tsx`
are CRLF in HEAD, while `index.tsx`, `styles.css`, `providers.server.ts`,
`api.chat.ts`, `ToolRail.tsx` and `AskSettings.tsx` are LF. Match each file to its
own committed convention or the diff shows a whole-file rewrite.

Caveat when checking this from PowerShell: `git show HEAD:file > tmp` re-encodes
with CRLF, so it reports the *opposite* of what the blob actually contains. Read
the blob with `git cat-file blob <sha>` instead.

## Ask panel layout bugs (the cascade-layer trap)

Both remaining UI bugs had one cause: **Tailwind v4 cascade layers**. shadcn
primitives ship their styling as *utilities* in JSX, and utilities beat any rule
in `@layer components` regardless of specificity. Brand rules written there were
silently dead. Both fixes live in `@layer brand-overrides`.

**Chat list rows rendered as solid teal blocks.** `.ask-history-main` declared
`bg-transparent`, but the button has no `variant` prop, so shadcn defaults to
`variant="default"` and ships `bg-primary`. Measured `rgb(79, 184, 178)`. The
fill also stopped short of the `x`, making the delete button look like it was
floating outside the card, and both rows looked active because both were solid.
Fixed by flattening the fill (and hover fill) for `.ask-history-main` and
`.ask-search-hit` in `brand-overrides`.

**Empty-chat state overflowed by 305px.** shadcn's Button ships
`whitespace-nowrap` and a fixed `h-9`, so each suggestion chip stayed on one line
at 493px. The flex column sized to max-content, dragging `.ask-empty` to 509px
inside a 223px drawer and giving `.ask-thread` a 305px horizontal scroll. Fixed by
letting the labels wrap, dropping the fixed height, clamping to 2 lines (a third
made the empty state taller than header + composer combined), and pinning
`.ask-empty` / `.ask-suggestions` with `min-width: 0; max-width: 100%`.

This trap is almost certainly latent elsewhere in the Ask panel (`.ask-msg`,
`.ask-tool-output`, the search-hit rows) and will surface the same way with long
content. Only the reported cases were fixed.

## Repo housekeeping

`.agents/` (agent skills) and `.claude/` (symlinks into it) plus
`skills-lock.json` are tooling artifacts, not app source — nothing in `src/`,
`vite.config.ts` or `package.json` references them. Removed and added to
`.gitignore` so they do not reappear as untracked. Regenerate with the skills
tooling if the shadcn/radix skills are wanted again.
