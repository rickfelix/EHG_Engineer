# LLM Cost Governance (Gemini / LLM factory)

**Origin:** June 2026 cost incident — `gemini-2.5-pro` gate traffic via `lib/llm/client-factory.js`
grew ~90% undetected (~$79.61 over 5 days; 91% from "Gemini 2.5 Pro short output" output
tokens, ~60% of which were *thinking* tokens billed as output). Root cause: the LEO gate
pipeline (validation / quality-evaluation / content-generation) defaulted to Pro with
dynamic thinking, multiplied by a venture-build + campaign volume surge.

This doc is the operating manual for keeping LLM spend controlled.

---

## 1. What changed in code (2026-06-05)

| Change | File | Effect |
|---|---|---|
| Gate/validation/generation/vision default → Flash; new `reasoning` purpose → Pro | `lib/config/model-config.js` | Output $10/M → $2.50/M for ~all gate calls |
| Flash thinking disabled by default | `lib/sub-agents/vetting/provider-adapters.js` | Kills ~60% of output (thinking) tokens |
| Bare `new GoogleAdapter()` honors config instead of hardcoded Pro | `lib/sub-agents/vetting/provider-adapters.js` | Closes the env-override bypass |
| Verdict `maxOutputTokens` 8192 → 4096 (generation keeps 16384) | `lib/sub-agents/vetting/provider-adapters.js` | Bounds runaway outputs |
| Security/critical (opus tier) → `reasoning` (Pro); everything else Flash | `lib/llm/client-factory.js` | Reserves Pro where it matters |
| Direct Pro callers routed to Flash | `lib/ai/multimodal-client.js`, `lib/integrations/youtube/video-metadata.js` | Closes remaining Pro bypasses |
| Response cache capacity 200 → 500, TTL env-tunable | `lib/llm/response-cache.js` | Fewer evictions in long processes |

## 2. Environment knobs

Set in `EHG_Engineer/.env` (read by the factory at process start):

| Var | Default | Purpose |
|---|---|---|
| `GEMINI_MODEL` | `gemini-2.5-flash` | Global default model for the factory (cheap tier). Remove to fall back to code defaults. |
| `GEMINI_MODEL_REASONING` | `gemini-2.5-pro` | Reserved deep-reasoning model (security/critical only). |
| `GEMINI_MODEL_VALIDATION` / `_GENERATION` / `_VISION` / `_CLASSIFICATION` / `_FAST` | (unset) | Per-purpose overrides if you need finer control. |
| `GEMINI_FLASH_THINKING_BUDGET` | `0` | Re-enable Flash thinking (tokens) for a deployment if quality needs it. |
| `LLM_CACHE_MAX_ENTRIES` | `500` | In-process response-cache capacity. |
| `LLM_CACHE_TTL_MS` | `1800000` (30m) | In-process response-cache TTL. |
| `LLM_PROVIDER` | `google` | `anthropic` forces Claude-first; `openai` etc. |

**To revert everything to pre-incident behavior:** remove `GEMINI_MODEL` and set
`GEMINI_MODEL_VALIDATION`/`_GENERATION`/`_VISION=gemini-2.5-pro` (not recommended).

## 3. Spend dashboard + alert

`scripts/llm-cost-report.mjs` reads `model_usage_log` (every factory call is logged there).

```bash
node scripts/llm-cost-report.mjs --days 7        # breakdown by model / purpose / day
node scripts/llm-cost-report.mjs --since 2026-06-01
node scripts/llm-cost-report.mjs --json          # machine-readable
node scripts/llm-cost-report.mjs --check         # alert mode: exit 1 on breach (cron-friendly)
    [--max-daily-usd 12] [--max-daily-calls 3000] [--spike 2.0]
```

> Cost note: logged output excludes Gemini *thinking* tokens, so historical Pro rows
> understate true cost (~2.6× gap in June). Post-2026-06-05, Flash runs thinking=0, so
> logged ≈ billed going forward.

### Wire the daily alert (pick one)

- **Cron / Task Scheduler (daily):**
  `node scripts/llm-cost-report.mjs --check --max-daily-usd 12 || <notify>`
  (the repo's `scripts/cron/` pattern, or Windows Task Scheduler, or a GitHub Action).
- A non-zero exit = breach; pipe to email/Slack/`scripts/log-harness-bug.js`.

## 4. GCP-side guardrails (requires console access — action items)

These are **not** in code; do them once in the GCP console for project
`ehg-api` (`gen-lang-client-0269820571`):

1. **Budget alert** — Billing → Budgets & alerts → *Create budget*:
   - Scope: project `ehg-api`.
   - Amount: e.g. $50/month (current optimized run-rate ~$25–40).
   - Thresholds: 50% / 90% / 100% → email (and optionally a Pub/Sub topic for automation).
2. **Per-key attribution** — APIs & Services → Credentials. Today `CanvasAI`,
   `Gemini API Key`, `EHG Web client`, `OracleGeminiAPIKey` all bill to one project,
   so you cannot tell gate traffic from edge-function traffic in billing. Recommended:
   - Give the **LEO factory** its own key (e.g. `LEO-Gate`) and point `GEMINI_API_KEY`
     in `EHG_Engineer/.env` at it.
   - Keep edge-function keys (`EHG Web client` / `CanvasAI`) separate (Supabase secrets).
   - Add **API key restrictions** (restrict to the Generative Language API) on each.
3. **Quota cap (optional hard stop)** — APIs & Services → Generative Language API →
   Quotas: set a requests/day ceiling so a runaway loop cannot bill unbounded.

## 5. Phase 4 follow-ups (measured, not yet implemented)

Track these against the dashboard; implement once baseline is confirmed:

- **Persistent cross-process response cache.** The current cache is in-process only —
  each `handoff.js`/`add-prd` invocation starts cold, which is why the cross-system hit
  rate is low. A DB/disk-backed cache keyed on prompt-hash (with TTL) would avoid
  re-paying for identical validation/quality-evaluation calls. *Correctness-sensitive —
  validate that identical (artifact+rubric) → identical verdict is acceptable.*
- **Deterministic gate audit.** Some `validation` / `quality-evaluation` gates may be
  pattern/schema checks that don't need an LLM at all. Audit callsites in
  `scripts/modules/handoff/**` and `scripts/modules/ai-quality-*`; convert rule-checkable
  ones to deterministic code ($0).
- **Venture-build throttle.** The 25-stage EVA pipeline (`lib/eva/stage-templates/**`)
  runs a model call per stage. Skip the full pipeline on throwaway `parity-test-*` /
  `test-*` ventures, and batch real builds. (June 1 spike = venture provisioning.)
- **Batch API.** Non-interactive work (venture-build, bulk validation) can use the
  Google/OpenAI batch tier at ~50% off.
- **Context trimming.** `quality-evaluation` sends ~2.6K input tokens/call; send only the
  relevant artifact section, not the whole PRD.

## 6. Cost model (per 1M tokens, 2026-06)

| Model | Input | Output | Role |
|---|---|---|---|
| gemini-2.5-pro | $1.25 | $10.00 | reserved: security/critical |
| gemini-2.5-flash | $0.30 | $2.50 | default gate tier |
| gpt-5.4-nano | $0.20 | $1.25 | cheapest alt (if switching provider) |
| gpt-5.4-mini | $0.75 | $4.50 | mid alt |
| gpt-5.5 / gpt-5.4 | $5 / $2.50 | $30 / $15 | flagship — pricier than Pro, do not use for gates |

**Switching provider does not fix cost** — reasoning-as-output and caching behave the same
on OpenAI; the lever is *tier + thinking*, which is what the changes above implement.
