---
category: Reference
status: Approved
version: 1.0.0
author: Claude Code
last_updated: 2026-08-01
tags: [llm, client-factory, adapters, calling-conventions, compat-layer]
---

# LLM Client Calling Conventions

What `getLLMClient()` hands you, and which call shapes are safe on it.

## The one thing to know

`getLLMClient()` returns a **provider adapter**, not a vendor SDK client. Adapters are defined in
`lib/sub-agents/vetting/provider-adapters.js` (`AnthropicAdapter`, `OpenAIAdapter`, `GoogleAdapter`,
`OllamaAdapter`). All four expose the same surface regardless of which provider is routed to.

| Call shape | Status | Notes |
|---|---|---|
| `await client.complete(system, user, opts)` | **Native** | The adapter's own method. `opts`: `maxTokens`, `temperature`, `model`, `response_format`. Returns `{ content, usage: { inputTokens, outputTokens }, model }`. |
| `await client.chat.completions.create({...})` | Compat shim | OpenAI shape. Returns `{ choices: [{ message: { content } }], usage, model }`. |
| `await client.messages.create({...})` | Compat shim | Anthropic shape. Returns `{ content: [{ type:'text', text }], usage: { input_tokens, output_tokens }, model }`. |
| `client.messages.stream({...})` | **Not available** | No adapter supports streaming. See below. |
| `client._model` | **Does not exist** | Read `client.defaultModel` or `client.model`. |

`getLLMClient()` takes an **options object**, not a bare tier string:

```js
const client = await getLLMClient({ purpose: 'story-generation', subAgent: 'STORIES', phase });
```

A bare string (`getLLMClient('haiku')`) silently lands on defaults — a string has no `.purpose` or
`.subAgent`, so the routing config never sees an intent to honour. It does not throw.

## Why both compat shims exist

Only the OpenAI shim existed originally. That asymmetry cost 172 days.

`llm-story-generator.js` called `client.messages.create()` — the Anthropic-native shape every
Anthropic doc shows. Adapters had no `.messages`, so the call raised
`TypeError: Cannot read properties of undefined (reading 'create')` **before any network request**,
on every invocation. The caller swallowed it and returned `success: true` anyway. Result: **0 of
15,258 user stories were ever LLM-generated**, from 2026-02-10 until 2026-08-01.

The same mismatch had been copy-pasted to three more call sites. Meanwhile 40+ call sites using
`.chat.completions.create()` worked fine on any client. **One convention self-healed and the other
detonated**, so the failure kept reproducing.

Both shims now exist (`addOpenAICompatLayer` installs both). Prefer `.complete()` in new code — the
shims exist so a wrong-but-reasonable call survives, not so code should stay wrong.
(SD-LEO-INFRA-USER-STORY-QUALITY-001)

## Streaming is deliberately absent

No adapter implements streaming, and **`.messages.stream()` is deliberately NOT shimmed**.

A `.stream()` that resolved `.complete()` and emitted the whole response as one `'text'` event would
satisfy the signature while making the word "stream" false — and a caller asking for incremental
delivery would get a single blob with no way to detect the substitution. That is a worse failure
than the missing method, because it is silent.

Real streaming support is tracked as `SD-LEO-INFRA-LLM-ADAPTER-STREAMING-ABSENT-001`. Until it
lands, `lib/integrations/eva-chat-service.js` `streamMessage` fails loudly on purpose.

## Two behaviours worth knowing

**Cross-provider model names are filtered.** Both shims drop a `claude-*`/`gpt-*`/`o1-*`/`o3-*`
model override when the adapter is Google, because sending one to the Gemini API 404s
(PAT-AUTO-c9b12816). Same-family overrides pass through.

**Multi-turn history is serialised, not dropped.** `.messages.create()` accepts a `messages[]` array
with `assistant` turns; since `.complete()` takes two strings, multiple turns are joined with
explicit role labels. A single user message passes through verbatim. An earlier cut filtered to
`role === 'user'` and silently discarded assistant turns — a loud failure replaced by a quiet wrong
answer, caught by a live probe rather than by review.

## Related

- [Fleet Coordination](./fleet-coordination.md)
- [LLM Stream Watchdog](../architecture/llm-stream-watchdog.md)
