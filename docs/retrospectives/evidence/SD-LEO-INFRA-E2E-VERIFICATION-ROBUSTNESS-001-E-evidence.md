# SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001-E — Evidence

## Scope delivered

Route ONE real e2e evidence-agent (testing-agent) invocation onto a cheaper model tier
(sonnet, via the Agent/Task tool's per-invocation `model` parameter) and measure the cost
delta against the Opus default, without modifying the global `MODEL_TIER_MAP` flattening
in `scripts/generate-agent-md-from-db.js` (confirmed deliberate design, not a defect —
see Findings below).

## The measured run

- **Invocation**: `testing-agent`, `model: sonnet` override (default/compiled is `opus`).
- **Task**: genuine e2e verification of the three "walk specimens" named in parent SD
  SD-LEO-INFRA-E2E-VERIFICATION-ROBUSTNESS-001's scope (worktree `testIgnore`,
  contamination-scan syntax, zero-infra hard-block) — real repo investigation, not a stub.
- **e2e evidence produced**: PASS (zero-infra hard-block), CONCERN (contamination-scan —
  symptom doesn't reproduce but no root-cause commit found), FAIL (worktree `testIgnore` —
  unscoped glob confirmed still present at `ehg/playwright.config.ts:41`).
- **Sub-agent evidence row**: `sub_agent_execution_results.id = 96514419-f645-40fd-ba8b-f8fd3d5a2745`
  (source='manual', sub_agent_code='TESTING', phase='EXEC').
- **Harness-reported usage**: `subagent_tokens: 116920`, `tool_uses: 62`, `duration_ms: 972990`.
- **model_usage_log row**: `1f8e464c-377d-4ad7-9f41-4cbfbc1e75c9` (`reported_model_name='Sonnet 5'`,
  `metadata.tokens_source='caller'`, `metadata.total_tokens=116920`).

## Cost delta (matched token count, `lib/cost/llm-pricing.js` rates)

The harness's Task-tool usage summary reports only a combined `subagent_tokens` figure — no
input/output split was exposed for this call — so cost is bounded rather than a single point
figure:

| | all-input bound | all-output bound |
|---|---|---|
| Sonnet (measured, 116,920 tokens) | $0.3508 | $1.7538 |
| Opus (same token count, hypothetical) | $1.7538 | $8.7690 |
| **Delta (opus − sonnet)** | **$1.4030** | **$7.0152** |

Ratio holds at **5x** (opus:sonnet) at either bound, since `claude-opus`/`claude-sonnet`
input and output rates in `lib/cost/llm-pricing.js` both scale by exactly 5x.

**Caveat**: no prior Opus testing-agent run in `model_usage_log` carries populated token
metadata (all recent rows have `metadata={}`), so this is a matched-token-count comparison
(same token volume, different tier), not a real-run-vs-real-run comparison. The token count
itself is also not tier-invariant in practice — a weaker model doing the same task may need
more tool calls/tokens to reach an equivalent conclusion, which this single run cannot isolate.

**Quality caveat**: the sonnet run did produce a genuine, citable, file:line-grounded e2e
report with a correct FAIL verdict on the worktree specimen (matching the parent SD's stated
open problem) — evidence quality at sonnet tier was not visibly degraded for this task, but
one run is not a generalizable quality benchmark.

## Findings NOT fixed in this SD (correctly out of scope)

Initial investigation (Explore + VALIDATION sub-agent evidence at LEAD-TO-PLAN) suspected the
model-routing mechanism was broken (`.partial` frontmatter ignored, DB column guessed wrong).
Both premises were **falsified on re-measurement**:

- `.claude/agents/testing-agent.md`'s `model: opus` frontmatter is generated on purpose —
  `scripts/generate-agent-md-from-db.js:54`'s `MODEL_TIER_MAP` deliberately flattens
  haiku/sonnet/opus all to `'opus'`, per its own comment: "Thinking effort strategy: all
  agents use opus, effort is controlled via thinking budget." `leo_sub_agents.model_tier`
  for `TESTING` is `'opus'`, consistent with the flattened output.
- There are **two unrelated systems** in this codebase both describable as "model routing":
  (a) `lib/sub-agent-executor/model-routing.js`'s effort→thinking-budget routing, real and
  wired into `lib/llm/client-factory.js`, but consumed only by EVA venture-pipeline stage
  code (`getLLMClient()` callers) — **not** by Task-tool LEO sub-agents at all; and (b) the
  compiled-agent-frontmatter `model:` field used by Task-tool invocations, which is the one
  this SD actually exercises, and which is opus-only by design.

This SD does not change either system — the sonnet-tier run above used the harness's own
per-invocation `model` override, which sits outside both mechanisms and required no repo
changes. Un-flattening `MODEL_TIER_MAP` (globally or per-agent) would change behavior for
every other invocation of every agent whose `model_tier != 'opus'`, which is a LEAD-level
architectural call outside this child SD's narrow scope — flagged as a completion-flag
finding, not filed as a new SD.
