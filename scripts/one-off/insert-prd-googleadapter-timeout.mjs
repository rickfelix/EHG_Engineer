#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '3f6f2693-5f74-43d1-b805-16a2e3de0a54';
const SD_KEY = 'SD-LEO-FIX-GOOGLEADAPTER-TIMEOUT-DOESN-001';
const PRD_ID = 'PRD-' + SD_KEY;

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Adapter-side timeout auto-select via resolveTimeout(model, options)',
    description: 'Introduce a pure helper resolveTimeout(model, options) in lib/sub-agents/vetting/provider-adapters.js. Replace `options.timeout || PROVIDER_TIMEOUT_MS` at lines 199 (Anthropic non-stream), 265 (Anthropic stream wallclock), 311 (OpenAI), 420 (Google) with a call to this helper. Selection rules in priority order: (a) options.timeout explicit value wins; (b) options.purpose === "content-generation" → LONG; (c) options.thinkingBudget > 0 → LONG; (d) options.effortLevel === "high" → LONG; (e) options.stream === true → LONG; (f) model id matches /pro|opus|o1|o3|thinking/i → LONG; (g) default → SHORT (30s).',
    acceptance_criteria: [
      'resolveTimeout exported from provider-adapters.js with JSDoc + 100% inline branch coverage in vitest.',
      'All four call sites use resolveTimeout(model, options) — zero remaining `options.timeout || PROVIDER_TIMEOUT_MS` references in the four production paths.',
      'Behaviour preserved when caller passes explicit options.timeout (must win over auto-select).',
      'PROVIDER_TIMEOUT_LONG_MS appears as runtime resolution for ≥1 caller in unit tests (closes the dead-code gap).'
    ]
  },
  {
    id: 'FR-2',
    title: 'Per-call resolved-timeout debug log (FR-3 from plan)',
    description: 'Each adapter logs the resolved timeout exactly once per call attempt at debug level via console.debug or existing structured logger. Format: `[<Provider>Adapter] resolvedTimeoutMs=<n> model=<model> reason=<explicit|purpose|thinking|effort|stream|model-tier|default>`. Logged ONCE on entry per attempt, NOT per retry-internal step. Suppressed when LLM_TIMEOUT_DEBUG_LOG=off.',
    acceptance_criteria: [
      'Debug log line emitted on every complete() call across all 4 adapters.',
      'Reason tag matches the priority branch that fired in resolveTimeout.',
      'Vitest captures the log line and asserts both resolvedTimeoutMs and reason for each branch.',
      'No log output when LLM_TIMEOUT_DEBUG_LOG=off env set.'
    ]
  },
  {
    id: 'FR-3',
    title: 'Caller audit table shipped in PR description (no code changes required)',
    description: 'Audit ALL callers of getProviderAdapter / getAllAdapters / new {Anthropic|OpenAI|Google}Adapter. For each caller, document: file:line, current options passed, model in use, resolved timeout BEFORE fix, resolved timeout AFTER fix. Identify any caller that previously needed the band-aid (explicit 180000) — note that they remain explicit (forward-compatible, no behaviour change). Identify NEW callers that benefit from auto-select (`purpose: content-generation` callers without explicit timeout — these previously had latent 30s bug).',
    acceptance_criteria: [
      'Audit table appears in PR description.',
      'Every confirmed caller has a row.',
      'NEW-COVERAGE column shows ≥3 callers gaining 180s timeout via auto-select (zero behavior change for explicit-timeout callers).'
    ]
  },
  {
    id: 'FR-4',
    title: 'Retry behaviour preserved unchanged',
    description: 'The 3-attempt retry loop, RETRY_DELAY_MS backoff, OpenAI TIMEOUT-specific 5s/10s extended backoff (line 369-371), GoogleAdapter 503 fallback to FALLBACK_MODELS — all preserved verbatim. Only the per-attempt timeout *value* changes; retry strategy is unchanged.',
    acceptance_criteria: [
      'No edits to MAX_RETRIES, RETRY_DELAY_MS, the retry loop structure, or the GoogleAdapter fallback block.',
      'Vitest: retry test asserts 3 attempts under simulated stuck call before final TIMEOUT.'
    ]
  },
  {
    id: 'FR-5',
    title: 'Vitest matrix covering auto-select, override, and retry',
    description: 'New unit-test file tests/unit/provider-adapters-resolve-timeout.test.js. Pure-function tests for resolveTimeout (no network mocks). Plus integration-style tests that verify the four adapters consume the helper output (stub fetch / stub messages.create to capture options). Cover: explicit-override-wins, content-generation purpose, thinkingBudget>0, effortLevel=high, stream=true, model-tier match, default-short fallback, retry-on-timeout count.',
    acceptance_criteria: [
      'New test file exists; ≥10 vitest cases.',
      'All cases green locally.',
      '`PROVIDER_TIMEOUT_LONG_MS` referenced (not hard-coded magic number) in test assertions.'
    ]
  }
];

const technical_requirements = [
  {
    id: 'TR-1',
    title: 'Pure helper, no I/O',
    description: 'resolveTimeout MUST be a pure function: takes (model: string, options: object), returns number, no logging or side effects. Logging happens in the caller (the four adapter call sites) so it can be suppressed/redirected centrally.'
  },
  {
    id: 'TR-2',
    title: 'Constants stay file-local',
    description: 'PROVIDER_TIMEOUT_MS and PROVIDER_TIMEOUT_LONG_MS remain at the top of provider-adapters.js. Existing PROVIDER_TIMEOUT_LONG_MS export at line 793/803 is preserved for backwards compatibility.'
  },
  {
    id: 'TR-3',
    title: 'Model-tier regex is conservative',
    description: 'The model-id regex matches: pro, opus, o1, o3, thinking. It must NOT match flash, mini, haiku, sonnet (default-tier validation models). Existing tier-mapping in GEMINI_THINKING_LEVELS (line 393) and the gemini-2.5-pro/3.x routing logic remain authoritative for the per-call thinking config — resolveTimeout is a separate concern (call wall-clock budget).'
  }
];

const test_scenarios = [
  { id: 'TS-1', title: 'Happy: explicit options.timeout wins', given: 'Caller passes options.timeout=45000', when: 'resolveTimeout("gemini-2.5-pro", options) is called', then: 'Returns 45000 (explicit value), reason=explicit' },
  { id: 'TS-2', title: 'Happy: purpose=content-generation triggers LONG', given: 'Caller passes options.purpose="content-generation", no timeout', when: 'resolveTimeout("gemini-2.5-flash", options) is called', then: 'Returns PROVIDER_TIMEOUT_LONG_MS (180000), reason=purpose' },
  { id: 'TS-3', title: 'Happy: thinkingBudget>0 triggers LONG', given: 'Caller passes options.thinkingBudget=2048', when: 'resolveTimeout("any-model", options) is called', then: 'Returns 180000, reason=thinking' },
  { id: 'TS-4', title: 'Happy: stream=true triggers LONG', given: 'Caller passes options.stream=true (no other long signals)', when: 'resolveTimeout("any-model", options) is called', then: 'Returns 180000, reason=stream' },
  { id: 'TS-5', title: 'Happy: model id matches /pro/ → LONG', given: 'Caller passes model="gemini-2.5-pro" with no other options', when: 'resolveTimeout(model, {}) is called', then: 'Returns 180000, reason=model-tier' },
  { id: 'TS-6', title: 'Happy: default short timeout for fast models', given: 'model="gemini-2.5-flash", no special options', when: 'resolveTimeout(model, {}) is called', then: 'Returns PROVIDER_TIMEOUT_MS (30000), reason=default' },
  { id: 'TS-7', title: 'Edge: PRECEDENCE — explicit overrides all others', given: 'options.timeout=10000, options.purpose="content-generation"', when: 'resolveTimeout("gemini-2.5-pro", options) is called', then: 'Returns 10000 (explicit wins despite all other LONG signals)' },
  { id: 'TS-8', title: 'Integration: GoogleAdapter wires resolved timeout into AbortController', given: 'New GoogleAdapter, complete() called with purpose=content-generation', when: 'fetch is invoked', then: 'AbortController setTimeout fires at 180000ms (asserted via vi.useFakeTimers + vi.advanceTimersByTime)' },
  { id: 'TS-9', title: 'Integration: AnthropicAdapter Promise.race uses resolved timeout', given: 'New AnthropicAdapter, complete() called with thinkingBudget=4096', when: 'messages.create stalls', then: 'Promise.race rejects with TIMEOUT at 180000ms (not 30000ms)' },
  { id: 'TS-10', title: 'Retry preservation: 3 attempts on TIMEOUT', given: 'Stub messages.create to always exceed timeout', when: 'AnthropicAdapter.complete called', then: 'Throws "Anthropic call failed after 3 attempts: TIMEOUT" — confirms FR-4 retry behaviour preserved' },
  { id: 'TS-11', title: 'Edge: log suppressed when LLM_TIMEOUT_DEBUG_LOG=off', given: 'process.env.LLM_TIMEOUT_DEBUG_LOG="off"', when: 'GoogleAdapter.complete is called', then: 'No "[GoogleAdapter] resolvedTimeoutMs" line emitted' }
];

const acceptance_criteria = [
  'AC-1: resolveTimeout helper exported, JSDoc-documented, used at all 4 adapter call sites.',
  'AC-2: PROVIDER_TIMEOUT_LONG_MS verifiably consumed at runtime in ≥1 callable path (closes the original dead-code defect).',
  'AC-3: Stage18 marketing copy generation succeeds end-to-end on PrivacyPatrol AI venture without TIMEOUT (smoke test from SD).',
  'AC-4: ≥10 vitest cases green; new test file passes locally and in CI.',
  'AC-5: Caller audit table in PR description identifies ≥3 NEW-COVERAGE callers (purpose=content-generation without explicit timeout).',
  'AC-6: Zero behavioural change for callers passing explicit options.timeout (regression-safe for the QF-20260503-028 caller-side fix).',
  'AC-7: Per-call debug log present and toggleable via LLM_TIMEOUT_DEBUG_LOG env.'
];

const risks = [
  { risk: 'Auto-select fires for a caller that wanted the short 30s timeout (e.g., utility classification call accidentally tagged purpose=content-generation)', impact: 'medium', likelihood: 'low', mitigation: 'Explicit options.timeout wins (TS-7 enforces). Caller audit (FR-3) reviews every existing call site to confirm no false-positive long-routing. Per-call debug log (FR-2) makes mismatch trivially diagnosable.' },
  { risk: 'Model-tier regex over-matches (e.g., a future "promo-tier" model accidentally hits /pro/)', impact: 'low', likelihood: 'low', mitigation: 'Conservative regex, anchored on common substrings. New model addition triggers test review. Effect of false-positive is "longer wait before TIMEOUT" — fail-soft, not fail-hard.' },
  { risk: 'Coordination conflict with QF-20260503-028 (caller-side band-aid in stage-18-marketing-copy.js)', impact: 'low', likelihood: 'medium', mitigation: 'Explicit-timeout precedence (TS-7) means QF behavior is preserved verbatim — band-aid becomes redundant defence-in-depth, not conflict. SD lands first; QF can either close as superseded or stay.' }
];

const system_architecture = [
  '# System Architecture',
  '',
  '## Component map',
  '`lib/sub-agents/vetting/provider-adapters.js` — single file edit. Adds `resolveTimeout(model, options)` pure helper near the top (after the constants). Modifies four call sites to call this helper.',
  '',
  '## Affected call sites (verified by Read 2026-05-03)',
  '| Line | Adapter | Current code | After fix |',
  '|------|---------|--------------|-----------|',
  '| 199 | AnthropicAdapter.complete (Promise.race) | `setTimeout(() => reject(new Error("TIMEOUT")), options.timeout || PROVIDER_TIMEOUT_MS)` | `setTimeout(..., resolveTimeout(model, options))` |',
  '| 265 | AnthropicAdapter._completeWithStreaming (wallClockMs) | `const wallClockMs = options.timeout || PROVIDER_TIMEOUT_MS;` | `const wallClockMs = resolveTimeout(model, options);` |',
  '| 311 | OpenAIAdapter.complete (AbortController) | `setTimeout(() => controller.abort(), options.timeout || PROVIDER_TIMEOUT_MS)` | `setTimeout(..., resolveTimeout(model, options))` |',
  '| 420 | GoogleAdapter.complete (AbortController) | `setTimeout(() => controller.abort(), options.timeout || PROVIDER_TIMEOUT_MS)` | `setTimeout(..., resolveTimeout(model, options))` |',
  '',
  '## Data flow',
  '```',
  'Caller (e.g. stage-19-sprint-planning.js)',
  '    ↓ getLLMClient({ purpose: "content-generation" })',
  'client-factory → returns adapter instance',
  '    ↓ adapter.complete(systemPrompt, userPrompt, options /* purpose:content-generation */)',
  'adapter.complete (4 sites)',
  '    ↓ resolveTimeout(model, options)  ← NEW: replaces `options.timeout || PROVIDER_TIMEOUT_MS`',
  'returns 180000 (was returning 30000 → TIMEOUT)',
  '    ↓',
  'AbortController/Promise.race fires at 180s instead of 30s',
  '    ↓',
  'Long-form Gemini-pro call completes successfully',
  '```',
  '',
  '## Caller audit — preliminary findings (full table goes in PR description)',
  '',
  'NEW COVERAGE (auto-select unlocks 180s timeout — these were latent bugs):',
  '- `lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js:130` — `getLLMClient({ purpose: "content-generation" })` then complete() with no explicit timeout',
  '- `lib/eva/stage-templates/analysis-steps/stage-19-visual-convergence.js:133` — same pattern',
  '- `lib/eva/stage-templates/analysis-steps/stage-19-acquirability.js:63` — same pattern',
  '- `lib/eva/stage-templates/analysis-steps/stage-20-acquirability.js:63` — same pattern',
  '- `lib/eva/economic-lens-analysis.js:221` — same pattern',
  '- `lib/eva/crews/tournament-orchestrator.js:113` — same pattern',
  '',
  'EXPLICIT (already pass timeout 180000 — no behavior change, but no longer needed):',
  '- `lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js:251` (the QF-20260503-028 band-aid)',
  '- `lib/research/research-engine.js:16-18` (per-provider explicit 180000)',
  '- `lib/research/deep-research-adapters.js:21,27,31,47` (deep-research mode)',
  '- `lib/eva/stage-17/archetype-generator.js:851` (300000 — even longer than LONG, preserved verbatim)',
  '- `lib/eva/stage-17/archetype-generator.js:1044` (120000)',
  '',
  '## Branch & PR',
  '- Worktree: `.worktrees/SD-LEO-FIX-GOOGLEADAPTER-TIMEOUT-DOESN-001`',
  '- Branch: `feat/SD-LEO-FIX-GOOGLEADAPTER-TIMEOUT-DOESN-001`',
  '- Target: `main` (EHG_Engineer)',
  '- LOC estimate: ~50 src + ~120 test = ~170 LOC (Tier 3 SD per CLAUDE.md routing — already the chosen path).'
].join('\n');

const implementation_approach = [
  '# Implementation Approach',
  '',
  '## Step 1 — Add resolveTimeout helper (provider-adapters.js, after line 18)',
  '```js',
  'const LONG_TIMEOUT_MODEL_PATTERN = /(?:^|[-/])(?:pro|opus|o1|o3|thinking)\\b/i;',
  'export function resolveTimeout(model, options = {}) {',
  '  if (options.timeout != null) return { value: options.timeout, reason: "explicit" };',
  '  if (options.purpose === "content-generation") return { value: PROVIDER_TIMEOUT_LONG_MS, reason: "purpose" };',
  '  if (options.thinkingBudget && options.thinkingBudget > 0) return { value: PROVIDER_TIMEOUT_LONG_MS, reason: "thinking" };',
  '  if (options.effortLevel === "high") return { value: PROVIDER_TIMEOUT_LONG_MS, reason: "effort" };',
  '  if (options.stream === true) return { value: PROVIDER_TIMEOUT_LONG_MS, reason: "stream" };',
  '  if (model && LONG_TIMEOUT_MODEL_PATTERN.test(model)) return { value: PROVIDER_TIMEOUT_LONG_MS, reason: "model-tier" };',
  '  return { value: PROVIDER_TIMEOUT_MS, reason: "default" };',
  '}',
  '```',
  'Returns `{value, reason}` object so callers can log both. Pure function, no side effects.',
  '',
  '## Step 2 — Wire into 4 call sites',
  'Each call site:',
  '```js',
  'const { value: timeoutMs, reason: timeoutReason } = resolveTimeout(model, options);',
  'if (process.env.LLM_TIMEOUT_DEBUG_LOG !== "off") {',
  '  console.debug(`[${this.constructor.name}] resolvedTimeoutMs=${timeoutMs} model=${model} reason=${timeoutReason}`);',
  '}',
  '// then use timeoutMs in setTimeout / wallClockMs / AbortController',
  '```',
  '',
  '## Step 3 — vitest file tests/unit/provider-adapters-resolve-timeout.test.js',
  'Pure-function tests + integration tests with vi.useFakeTimers + stub fetch / stub messages.create.',
  '',
  '## Step 4 — Caller audit, no code changes',
  'Walk every getLLMClient + new {Anthropic|OpenAI|Google}Adapter call. Document in PR description per FR-3.',
  '',
  '## Step 5 — Smoke test (manual)',
  'Re-run PrivacyPatrol AI Generate Copy in Stage 18 per smoke_test_steps. Observe real Gemini output, not fallback banner.',
  '',
  '## Out of scope (defer or separate)',
  '- Changes to retry strategy (FR-4 explicitly preserves).',
  '- Provider failover changes (Gemini → Claude cascade).',
  '- Removing the QF-20260503-028 band-aid in stage-18-marketing-copy.js (separate cleanup once SD verified live).'
].join('\n');

const exploration_summary = [
  '## Exploration Summary',
  '',
  'Files read end-to-end (≥5 per NC-PLAN-002):',
  '1. `lib/sub-agents/vetting/provider-adapters.js` (full, 805 lines) — root-cause confirmation.',
  '2. `docs/plans/archived/sd-leo-fix-googleadapter-timeout-doesn-001-plan.md` — original plan / RCA.',
  '3. `lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js` (lines 240-270) — QF-20260503-028 band-aid pattern.',
  '4. `lib/eva/stage-17/archetype-generator.js` (lines 845-860, 1040-1050) — established explicit-timeout caller pattern.',
  '5. `lib/research/research-engine.js` and `lib/research/deep-research-adapters.js` — DEEP_MODE_CONFIG explicit-timeout pattern.',
  '6. `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md` (lines 65-80, 130-145, 220-225) — documented "180s timeout for long-form" guidance that callers may or may not follow.',
  '7. `lib/eva/crews/tournament-orchestrator.js`, `lib/eva/economic-lens-analysis.js`, multiple `stage-templates/analysis-steps/*.js` — confirmed 6+ callers using purpose=content-generation WITHOUT explicit timeout (latent bug callers).',
  '',
  '## Key findings',
  '- Dead-code defect confirmed: `PROVIDER_TIMEOUT_LONG_MS` exported but consumed by zero call paths.',
  '- 4 adapter call sites share the same defect (not just Google).',
  '- 6+ stage-template callers benefit from auto-select (latent 30s bug surfaces only when Gemini latency exceeds 30s — race condition, not always-fails).',
  '- Existing `purpose: "content-generation"` flag is the canonical signal — already used at line 424 (maxOutputTokens routing) and line 438 (thinking-config bypass). Reusing it for timeout selection is consistent.',
  '- QF-20260503-028 (caller-side band-aid) coordinates: explicit timeout takes precedence (TS-7), so SD landing first does NOT break the QF.',
  '',
  '## No SD-RESEARCH directory found for this SD (small bugfix scope, no research lookup applicable per CLAUDE_PLAN.md "Research Lookup Before PRD Creation" — checked docs/research/outputs/index.json: not present).'
].join('\n');

const plan_checklist = [
  { item: 'PRD created and stored in product_requirements_v2', completed: true },
  { item: 'Sub-agents executed: DESIGN (PASS — N/A backend, false-positive UI scan), DATABASE (PASS — no schema), RISK (PASS — 1.67/10 LOW)', completed: true },
  { item: 'Caller audit preliminary findings documented in PRD; full table in PR description (FR-3)', completed: true },
  { item: 'User stories generated with implementation_context ≥80% (auto-trigger after PRD insert)', completed: false },
  { item: 'PLAN-TO-EXEC handoff executed', completed: false }
];

const exec_checklist = [
  { item: 'FR-1: resolveTimeout helper added, all 4 call sites wired', completed: false },
  { item: 'FR-2: per-call debug log emitted, env-toggleable', completed: false },
  { item: 'FR-3: caller audit table in PR description', completed: false },
  { item: 'FR-4: retry behaviour preserved (no edits to retry loop)', completed: false },
  { item: 'FR-5: vitest file with ≥10 cases — green locally', completed: false },
  { item: 'Smoke test: PrivacyPatrol AI Stage 18 Generate Copy succeeds end-to-end', completed: false }
];

const validation_checklist = [
  { item: 'TESTING sub-agent: full vitest run + new test file green', completed: false },
  { item: 'No stubbed/mocked code in production files (NC-PLAN-002 compliance check)', completed: false },
  { item: 'Branch ≤7 days stale at PLAN-TO-EXEC', completed: false },
  { item: 'PROVIDER_TIMEOUT_LONG_MS consumed at runtime in ≥1 path (AC-2 verification)', completed: false },
  { item: 'Per-call debug log assertion in vitest captures all 7 reason branches', completed: false }
];

const integration_operationalization = {
  consumers: 'Backend infrastructure consumers: every long-form LLM caller in EHG_Engineer (lib/eva/stage-templates/analysis-steps/*, lib/eva/crews/*, lib/research/*, lib/sub-agents/vetting/debate-orchestrator.js). User-visible journey: Chairman opens any venture in EHG app → triggers a long-form analysis (Stage 18 marketing copy, Stage 19 sprint plan, Stage 20 acquirability, etc.) → expects real LLM output, not the silent-fallback banner.',
  dependencies: [
    { name: 'Gemini API (generativelanguage.googleapis.com)', direction: 'downstream', failure_mode: 'High latency on gemini-2.5-pro thinking calls — was triggering 30s TIMEOUT before retries; auto-select extends to 180s.' },
    { name: 'Anthropic API (messages.create)', direction: 'downstream', failure_mode: 'Streaming long-form completions can take >30s for thinking-enabled models; benefits from same auto-select.' },
    { name: 'OpenAI API (chat/completions)', direction: 'downstream', failure_mode: 'o1/o3 reasoning models exceed 30s; auto-select via model-tier regex.' },
    { name: 'lib/llm/client-factory.js', direction: 'upstream', failure_mode: 'Existing factory passes options through unchanged; no factory edit required.' },
    { name: 'QF-20260503-028 (caller-side stage18 band-aid)', direction: 'parallel', failure_mode: 'Coordination not a failure — explicit timeout wins, so band-aid is redundant after SD lands but does not conflict.' }
  ],
  data_contracts: 'No schema changes. No tables touched. No API contract changes — adapter public interface (`complete(systemPrompt, userPrompt, options)`) unchanged. New options key `effortLevel` is already understood by GoogleAdapter (line 441); no other adapters had it. New behaviour: when callers pass `purpose: "content-generation"` or `thinkingBudget > 0` etc., timeout silently extends from 30s to 180s.',
  runtime_config: 'New env var: `LLM_TIMEOUT_DEBUG_LOG` (default ON; set to "off" to suppress per-call debug log). No feature flag — auto-select is on by default because it closes a confirmed bug. Rollout: standard PR merge; no staged rollout needed because (a) explicit-timeout callers are unaffected, (b) no-timeout callers were silently broken and are silently fixed.',
  observability_rollout: 'Observability: per-call debug log line gives immediate visibility into resolved timeout per call. Server logs show `[<Provider>Adapter] resolvedTimeoutMs=180000 reason=purpose model=gemini-2.5-pro`. Existing TIMEOUT-counter telemetry (triggerAPIFailureRCA at line 715-728) remains and should drop to ~0 for content-generation callers post-fix. Rollout: single PR. Rollback: revert PR — restores 30s default; explicit-timeout callers (Stage 18 with QF-028, Stage 17, research-engine) keep working. Risk: rollback re-introduces the silent fallback for Stage 19/20 stages — they had been silently failing pre-fix anyway.'
};

const stakeholders = [
  { role: 'LEAD', responsibility: 'Strategic approval (done), final approval gate.' },
  { role: 'PLAN', responsibility: 'PRD authorship, sub-agent orchestration, EXEC verification gate.' },
  { role: 'EXEC', responsibility: 'Implementation, vitest, caller audit, smoke test.' }
];

const prd = {
  id: PRD_ID,
  directive_id: SD_KEY,
  sd_id: SD_UUID,
  title: 'GoogleAdapter timeout auto-select for long-form LLM callers',
  version: '1.0',
  status: 'planning',
  category: 'bugfix',
  priority: 'medium',
  executive_summary: 'PROVIDER_TIMEOUT_LONG_MS (180s) is dead code in lib/sub-agents/vetting/provider-adapters.js — defined and exported but consumed by ZERO of 4 adapter call paths (Anthropic non-stream L199, Anthropic stream L265, OpenAI L311, Google L420). Long-form callers (Stage 18 marketing copy, Stage 19/20 analyses, etc.) silently fall back to 30s default and TIMEOUT × 3 retries on Gemini 2.5-pro thinking calls. Witnessed 2026-05-03 PrivacyPatrol AI venture run. Fix: introduce resolveTimeout(model, options) auto-select helper in priority order (explicit timeout > purpose=content-generation > thinkingBudget>0 > effortLevel=high > stream > model-tier regex > 30s default), wire into all 4 call sites, log per-call resolved timeout for observability, audit all callers. Net effect: PROVIDER_TIMEOUT_LONG_MS consumed at runtime; ≥6 latent-bug callers gain 180s coverage; explicit-timeout callers (QF-20260503-028 et al.) unchanged.',
  business_context: 'Silent fallback in long-form LLM features (marketing copy, sprint plans, acquirability analyses) erodes Chairman trust in the EVA pipeline output. Each TIMEOUT × 3 retries also burns ~90s of API call latency before fallback content surfaces — observable user-side delay before a stale banner replaces real generation.',
  technical_context: 'Single-file edit (provider-adapters.js). Pure-function helper + 4 call-site wiring + 1 new test file. No schema changes. No factory edits. Coordinates with QF-20260503-028 (caller-side band-aid for stage-18-marketing-copy.js:252) — explicit-timeout precedence guarantees QF behavior preserved.',
  functional_requirements,
  technical_requirements,
  non_functional_requirements: [],
  system_architecture,
  data_model: {},
  api_specifications: [],
  ui_ux_requirements: [],
  implementation_approach,
  technology_stack: ['Node.js (ESM)', 'vitest 3.x'],
  dependencies: [],
  test_scenarios,
  acceptance_criteria,
  performance_requirements: { note: 'No new perf budget; per-call debug log adds ~1 console.debug per LLM call (negligible). Timeout extension from 30s → 180s for long-form calls is the entire intent.' },
  plan_checklist,
  exec_checklist,
  validation_checklist,
  progress: 20,
  phase: 'PLAN',
  phase_progress: { LEAD: 100, PLAN: 60, EXEC: 0, VERIFICATION: 0, APPROVAL: 0 },
  risks,
  constraints: ['Must not break callers that already pass explicit options.timeout (regression-free for QF-028).', 'Must not change retry strategy or fallback model logic.'],
  assumptions: ['vitest can stub fetch and Anthropic.messages.create via vi.spyOn / vi.mock — verified in existing tests/unit/llm/openai-compat-layer.test.js patterns.', 'LLM_TIMEOUT_DEBUG_LOG env var is acceptable as rollout switch (no DB feature flag needed for this small fix).'],
  stakeholders,
  metadata: {
    sd_uuid: SD_UUID,
    sd_key: SD_KEY,
    coordinated_with: 'QF-20260503-028',
    sub_agent_findings: {
      DESIGN: 'PASS (false-positive UI scan — backend SD, no UI surface)',
      DATABASE: 'PASS (no schema, no migration)',
      RISK: 'PASS 1.67/10 LOW (low complexity, explicit-timeout precedence preserves QF coordination)'
    },
    affected_files_after: [
      'lib/sub-agents/vetting/provider-adapters.js (~50 LOC modified)',
      'tests/unit/provider-adapters-resolve-timeout.test.js (~120 LOC NEW)',
      'PR description (caller audit table)'
    ]
  },
  exploration_summary,
  integration_operationalization,
  reasoning_depth: 'standard',
  document_type: 'prd',
  created_by: 'PLAN'
};

(async () => {
  // Check if a PRD already exists for this SD (defensive)
  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status')
    .eq('sd_id', SD_UUID);
  if (existing && existing.length > 0) {
    console.log('PRD already exists for SD:', existing);
    console.log('Use UPDATE not INSERT.');
    process.exit(2);
  }
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select('id, sd_id, status')
    .single();
  if (error) {
    console.error('INSERT_ERR:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
  console.log('✅ PRD inserted:', JSON.stringify(data, null, 2));
})();
