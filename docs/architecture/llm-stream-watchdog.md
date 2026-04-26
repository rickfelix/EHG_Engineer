# LLM Stream-Progress Watchdog

**SD:** SD-LEO-INFRA-STAGE-ARCHETYPE-GENERATION-001 — ARM A
**Module:** [`lib/llm/stream-watchdog.js`](../../lib/llm/stream-watchdog.js)
**Error type:** [`LLMStreamStalled`](../../lib/llm/llm-stream-stalled.js)

## Why this exists

Anthropic streaming responses can hit a "connection alive, server idle"
failure mode where the TCP connection stays open but the server stops
emitting tokens. A wall-clock timeout cannot catch this until the full
timeout elapses (Stage 17 uses 300s), during which the worker appears
busy and downstream archetype generation appears frozen.

The watchdog rejects with a typed `LLMStreamStalled` error after `N` ms
of silence between tokens (default 90s), independent of any wall-clock
guard. This converts a silent hang into a fast, recoverable failure
that ARM B (bounded retry) and ARM E (heartbeat) can act on.

## Default threshold

| Setting | Value | Source |
|---|---|---|
| Default | 90,000 ms (90s) | `DEFAULT_STALL_TIMEOUT_MS` in `stream-watchdog.js` |
| Per-process override | env `LLM_STREAM_STALL_TIMEOUT_MS` (positive integer) | `getDefaultStallTimeout()` |
| Per-call override | `options.stallTimeout` on `_completeWithStreaming` / `withStreamWatchdog` | `_completeWithStreaming` in `provider-adapters.js` |

Invalid env values (`0`, negative, non-numeric) fall back to the default.

## Caller enumeration

These are the callers known to invoke Anthropic streaming as of the
PR1 landing date. Append future streaming callers to this list as they
appear.

### Steady-stream workloads (90s default safe)

| Caller | Path | Workload shape | Notes |
|---|---|---|---|
| Stage 17 archetype generation | `lib/eva/stage-17/archetype-generator.js:862` | HTML generation; tokens stream continuously | The motivating S17 caller — routes through `getLLMClient → AnthropicAdapter.complete → _completeWithStreaming`, auto-protected by the watchdog. |
| Stage 17 design refinement | `lib/eva/stage-17/archetype-generator.js:1055` | Same as above, refinement pass | Same routing, same protection. |

### Direct SDK callers (currently unprotected)

| Caller | Path | Reason | Follow-up |
|---|---|---|---|
| EVA chat service | `lib/integrations/eva-chat-service.js:318` | Bypasses the provider adapter — calls `client.messages.stream()` directly to wire `stream.on('text', ...)` for token-streaming UX | Wrap with `withStreamWatchdog(stream, { callerLabel: 'eva-chat' })` in a follow-up QF. Token-streaming UX is bursty, but never legitimately silent for >90s on a sonnet-tier 1024-token reply. |

### Non-streaming callers (out of scope)

The watchdog only affects calls made with `options.stream: true` to
`AnthropicAdapter.complete()` or direct invocations of
`AnthropicAdapter._completeWithStreaming()`. The 60+ callers in
`lib/eva/stage-templates/`, `scripts/eva/`, and elsewhere that use the
default non-streaming path through `client.messages.create()` are
unaffected.

## When to override the default

Override `LLM_STREAM_STALL_TIMEOUT_MS` (process-wide) or
`options.stallTimeout` (per-call) when the workload is **legitimately
bursty** — i.e. >90s of silence is normal, not a stall.

Concretely:

- **Long reasoning with extended thinking** (`thinkingBudget` > 32k tokens):
  Anthropic may emit a long thinking block before any text tokens. If
  that block exceeds 90s, raise `stallTimeout` to ~150s.
- **Streaming over slow networks** (e.g. a saturated tunnel): a 90s gap
  may indicate transport not server-side stall. Raise the threshold
  for that environment, but consider that you are masking real network
  pathology.
- **Multi-step tool-use loops** where the SDK pauses mid-stream waiting
  for tool results: for these, prefer to issue separate streaming calls
  per step rather than tuning the threshold up — the 90s default
  protects against per-step stalls.

Do **not** override the default just because a single call timed out.
Investigate first: an `LLMStreamStalled` event on a non-S17 caller is
itself a signal worth a backlog entry.

## Error contract

```js
import { LLMStreamStalled } from '../llm/index.js';

try {
  const msg = await client.complete(systemPrompt, userPrompt, { stream: true });
} catch (err) {
  // Cross-bundle reliable check — prefer this over instanceof
  if (err.name === 'LLMStreamStalled') {
    console.error('Stream stalled', {
      caller: err.callerLabel,
      threshold: err.threshold,
      msSinceLastToken: err.msSinceLastToken,
      lastTokenAt: err.lastTokenAt,
    });
    // ARM B (bounded retry) decides whether to retry or write s17_variant_failed
  } else {
    throw err;
  }
}
```

## Test coverage

[`lib/llm/stream-watchdog.test.js`](../../lib/llm/stream-watchdog.test.js)
covers, with vitest fake timers:

- LLMStreamStalled fires within threshold when no tokens stream
- `err.name === 'LLMStreamStalled'` (cross-bundle reliable)
- `LLM_STREAM_STALL_TIMEOUT_MS` env override
- Clean completion does not throw
- Mid-stream tokens reset the inactivity clock
- Non-stall SDK errors propagate unchanged
- Default + env-parsing edge cases for `getDefaultStallTimeout`

## Related

- ARM B (bounded retry) — consumes `LLMStreamStalled` to decide retry vs `s17_variant_failed`. Lands in PR2.
- ARM E (heartbeat writer) — independent signal; useful when the watchdog has not yet fired but you suspect the worker is hung.
- ARM F (resume endpoint) — frontend-triggered recovery path that fires when the user-visible 3-min freeze threshold trips, regardless of watchdog state.
- Sibling `SD-LEO-INFRA-STAGE17-CROSS-REPO-001` (PR #3355) — prevents schema/contract drift across the EHG / EHG_Engineer boundary; this watchdog prevents silent runtime stalls.
