<!-- Archived from: C:/Users/rickf/.claude/plans/trend-scanner-scoring-versioning-hardening-plan.md -->
<!-- SD Key: SD-LEO-ENH-TREND-SCANNER-SCORING-001 -->
<!-- Archived at: 2026-04-28T13:01:36.349Z -->

# Trend Scanner scoring fidelity, prompt versioning, and silent-failure hardening

## Summary

Trend Scanner is the most-trafficked Stage 0 entry path under "Find me opportunities" on the Ventures route (`DiscoveryModeDialog.tsx`). It generates ranked venture candidates via an LLM call seeded with real `app_rankings` data, then ranks them locally before feeding the top candidate into chairman review. Three mutually-coupled defects compromise its output quality and observability:

1. **Scorer ignores 7 of 9 LLM-emitted fields.** `rankCandidates` at `lib/eva/stage-zero/paths/discovery-mode.js:511-520` uses only `automation_feasibility` and `competition_level`. The prompt asks the LLM for nine fields (name, problem_statement, solution, target_market, revenue_model, automation_approach, monthly_revenue_potential, competition_level, automation_feasibility) — but the JS scorer only weights the last two. The LLM optimizes for two integers; the chairman reads decoration; the closed-loop dialog star ratings can't explain rank.

2. **No prompt_version stamping anywhere.** Any prompt edit silently invalidates the historical aggregation done by `get_discovery_strategy_scores` (`database/migrations/20260313_discovery_strategy_scores.sql`), which is the substrate of the `DiscoveryModeDialog` star ratings and the dialog's strategy ordering.

3. **Silent zero-candidate completion.** `callLLMForCandidates` at `lib/eva/stage-zero/paths/discovery-mode.js:479` swallows JSON parse failures, returns `[]`, the runner returns `null`, and the queue processor (`scripts/stage-zero-queue-processor.js`) marks the row `status='completed'` with null `result` instead of `failed`. Retries don't fire and the chairman sees a successful run with no candidates.

The three defects are coupled: fixing the scorer changes the outputs the closed loop tracks; without versioning we can't distinguish v1 from v2 outputs in `composite_score` history; without the failure fix we can't trust either signal because parse-failed runs masquerade as completed.

## Type

enhancement

## Priority

medium

## Target Application

EHG_Engineer (Stage 0 venture engine; backend-only — no `ehg/` UI changes in this SD)

## Depends On

None — landing this SD unblocks four sibling SDs (same shape applied to other strategy runners; per-prompt-variant A/B; UI surfacing; multi-source trend signals).

## Success Criteria

- **AC1**: Top-ranked Trend Scanner candidate across 5 fresh runs cites ≥3 of the 9 LLM-emitted fields in its score-attribution log (verified via new `metadata.score_attribution` field on the persisted `PathOutput`).
- **AC2**: A planted JSON parse failure (test fixture: LLM response with malformed JSON) lands as `stage_zero_requests.status='failed'` with informative `error_message` (e.g., `"trend_scanner_parse_failed: no JSON array found"`) and `error_details.error_type='parse_failure'`.
- **AC3**: A planted under-count case (LLM returns 1 candidate when `candidateCount=5`) lands as `status='failed'` with `error_message` referencing the post-condition (`"trend_scanner_undercount: got 1 of 5 expected"`) and `error_details.error_type='undercount'`.
- **AC4**: After 5 v2 runs, `get_discovery_strategy_scores()` returns distinct rows for `(strategy='trend_scanner', prompt_version='2026-04-28-v2')` and the legacy null-version aggregate (surfaced as `prompt_version='v1-pre-versioning'`).
- **AC5**: A historical Trend Scanner venture (with `metadata.stage_zero.origin_metadata.prompt_version IS NULL`) is ranked under the v1 formula via an explicit legacy branch in the scorer; no silent score regression.
- **AC6**: New `parseRevenuePotential(str)` correctly parses ≥8 documented input forms in unit tests (`"$5K/month"`, `"$5,000-$50,000/mo"`, `"$1K+/month"`, `"$500-$2000 monthly"`, `"~$10K MRR"`, `"$2K+"`, `"unknown"`, `""`) and returns `{ low, high, currency } | null`.
- **AC7**: Vitest coverage ≥85% on new code (rankCandidates, parseRevenuePotential, callLLMForCandidates error paths, post-condition gate).
- **AC8**: Migration is reversible; deploy order documented in the migration header (column-add migration first, code change second).
- **AC9**: No `DiscoveryModeDialog` UI changes — only the insert payload at `useStageZeroQueue.ts` gains a `prompt_version` field.

## Scope

### FR1 — New rankCandidates formula

In `lib/eva/stage-zero/paths/discovery-mode.js:511-520`:
- Replace the current 2-field formula (`automation_feasibility * 10 + competition_bonus`) with a weighted multi-field formula using ≥4 LLM-emitted fields.
- Default weights (documented as constants):
  - `automation_feasibility` (1-10): weight 0.30
  - `parsed monthly_revenue_potential.high` (log-scaled, normalized to 0-100): weight 0.25
  - `target_market_specificity` (heuristic: length + presence of demographic markers + presence of size estimates → 0-100): weight 0.20
  - `strategic_fit_score` (text similarity to `loadStrategicContext.formattedPromptBlock` themes via simple keyword overlap → 0-100): weight 0.15
  - `competition_level` (low/medium/high → 100/50/0): weight 0.10
- Accept an optional `weights` parameter; defaults baked in. Total weights must sum to 1.0 (asserted).
- Deterministic tie-break order: composite_score DESC → parsed_revenue_high DESC → automation_feasibility DESC → name (stable string compare).
- Return objects include a `score_attribution` field listing which inputs contributed to the final score (used by AC1 verification).

### FR2 — parseRevenuePotential helper

New file: `lib/eva/stage-zero/utils/parse-revenue.js`:
- `parseRevenuePotential(str)` returns `{ low: number, high: number, currency: 'USD' }` or `null` for unparseable input.
- Handles ranges (`"$5,000-$50,000/mo"`), open-ended (`"$1K+/month"`), shorthand (`"$5K"`, `"$10M"`), monthly/yearly suffix normalization (always normalizes to monthly).
- Yearly inputs converted to monthly (divide by 12).
- Documented in JSDoc with ≥8 example inputs.

### FR3 — Strategic-fit scoring helper

New file: `lib/eva/stage-zero/utils/strategic-fit.js`:
- `computeStrategicFit(candidate, strategicContext)` returns 0-100.
- Extract themes from `strategicContext.formattedPromptBlock` (or `strategicContext.themes` if structured); compute keyword overlap against candidate's `target_market` + `solution` + `revenue_model`.
- Falls back to 50 (neutral) if `strategicContext` is null or malformed (graceful degradation; logged at WARN).

### FR4 — Prompt version constant + stamping

New file: `lib/eva/stage-zero/paths/discovery-mode-versions.js`:
- Export `TREND_SCANNER_PROMPT_VERSION = '2026-04-28-v2'` (single-source-of-truth constant).
- Future prompt edits bump this version.

Stamping touchpoints:
- `lib/eva/stage-zero/paths/discovery-mode.js` — `runTrendScanner` returns `metadata.prompt_version` in its candidate output.
- `lib/eva/stage-zero/stage-zero-orchestrator.js` — pass-through into `executeStageZero`'s return value.
- `lib/eva/stage-zero/chairman-review.js` (`persistVentureBrief`) — write `metadata.stage_zero.origin_metadata.prompt_version` on the venture row.
- `ehg/src/hooks/useStageZeroQueue.ts:166-212` — when `payload.path === 'discovery_mode'` and `payload.strategy === 'trend_scanner'`, include `prompt_version_hint` in the insert metadata (worker honors this for forward-compat; not authoritative).
- `scripts/stage-zero-queue-processor.js` — surfaces `prompt_version` in the `result` payload written back to `stage_zero_requests`.

### FR5 — Database migration

New migration: `database/migrations/20260428_stage_zero_prompt_version.sql`:
- `ALTER TABLE stage_zero_requests ADD COLUMN prompt_version TEXT NULL;` (nullable for backfill compat)
- `ALTER TABLE discovery_strategies ADD COLUMN prompt_version_active TEXT NULL;` (declares which version the worker should use; null → use code default)
- `CREATE INDEX idx_stage_zero_requests_prompt_version ON stage_zero_requests(prompt_version) WHERE prompt_version IS NOT NULL;`
- Reversal block in `-- DOWN --` comment with `DROP INDEX` + `DROP COLUMN` order.
- Migration header documents two-stage deploy: (1) merge migration; (2) wait 1 polling cycle (~30s) for queue processor to load schema; (3) merge code change.

### FR6 — get_discovery_strategy_scores RPC update

Update `database/migrations/20260313_discovery_strategy_scores.sql` (via new migration `20260428_stage_zero_prompt_version_rpc.sql`; do not edit prior migration in place):
- New RPC version groups by `(strategy, COALESCE(metadata.stage_zero.origin_metadata.prompt_version, 'v1-pre-versioning'))`.
- Returns `prompt_version` column in addition to existing `(strategy, venture_count, total_outcomes, pass_count, pass_rate, avg_score, composite_score)`.
- `useDiscoveryStrategyScores` hook (`ehg/src/hooks/useDiscoveryStrategyScores.ts`) — extend `StrategyScore` interface with `prompt_version: string`; consumers in `DiscoveryModeDialog` continue to use `strategy` only for sorting (latest version wins) until UI surfacing SD lands.

### FR7 — Silent-failure hardening

In `lib/eva/stage-zero/paths/discovery-mode.js`:
- `callLLMForCandidates` (line 479) — replace silent `[]` returns with thrown typed errors:
  - `LLMEmptyResponseError` for empty/truncated content
  - `LLMParseError` for unparseable JSON
  - Errors include `strategyName`, `promptVersion`, raw response length in their messages.
- `runTrendScanner` (line 124) — add post-condition: if candidates.length < ceil(candidateCount / 2), throw `LLMUndercountError` with expected vs actual count.
- `runNurseryReeval` (line 383) — same post-condition, scaled appropriately (parked-ventures count is variable; the post-condition only fires if at least 1 nursery item existed AND candidates returned 0).

In `scripts/stage-zero-queue-processor.js` (line 252):
- The existing `catch` already writes `status='failed'` — extend to include `error_details.error_type` (`'parse_failure'`, `'empty_response'`, `'undercount'`, `'timeout'`, `'other'`) derived from the thrown error class.
- This reuses the existing failure path; no new branches in the worker.

### FR8 — Tests

- `lib/eva/stage-zero/paths/discovery-mode.test.js` — new file. ≥10 unit cases for `rankCandidates` covering: weight defaults, custom weights, missing-field graceful handling, tie-break order, score_attribution emission, legacy `prompt_version=null` v1 fallback path.
- `lib/eva/stage-zero/utils/parse-revenue.test.js` — new file. ≥8 cases per AC6.
- `lib/eva/stage-zero/utils/strategic-fit.test.js` — new file. ≥6 cases including null context, empty themes, full overlap, no overlap.
- `lib/eva/stage-zero/paths/discovery-mode-failure.test.js` — new file. Cases: empty LLM response → LLMEmptyResponseError; malformed JSON → LLMParseError; 1-of-5 undercount → LLMUndercountError; nursery edge case (0 input → graceful zero output, not error).
- `scripts/stage-zero-queue-processor.test.js` — extend if exists, else new. Test that thrown errors map to `error_details.error_type` correctly.
- RPC integration test in `database/tests/get_discovery_strategy_scores.test.sql` (or vitest with test supabase client) — verifies grouping by (strategy, prompt_version), legacy null-version aggregation as `'v1-pre-versioning'`, no regression on flat shape consumers.

## Non-Goals

- NOT applying the same shape to the other 4 strategy runners (Democratization Finder, Capability Overhang, Nursery Re-eval, Simple Venture Finder). Each has different prompt fields; sibling SDs will follow Trend Scanner's blueprint.
- NOT adding new trend signal sources (GitHub topic-stars, Reddit, Google Trends, Crunchbase). Tier-3 strategic work; separate SD.
- NOT surfacing `prompt_version` or score components in `DiscoveryModeDialog` UI. Backend changes only; UI surfacing is a separate SD that depends on this one.
- NOT decomposing Trend Scanner into multi-step research (signal → demand → venture). Strategic enhancement; separate SD.
- NOT shipping per-prompt-variant A/B within Trend Scanner. The experiment hook (`getActiveExperiment`/`assignVariant`/`evaluateDual`) exists but is path-level only; wiring it for prompt-level A/B is a sibling SD that requires `prompt_version` versioning to land first.
- NOT changing the LLM client (`getValidationClient`), the prompt template itself (only the version constant), or the `app_rankings` injection logic.
- NOT adding retry logic on `failed` status. Today's queue processor doesn't retry — that's a separate concern. This SD makes failures *visible*; retry is a follow-up SD.

## Key Technical Decisions

**Why widen the scorer instead of asking the LLM for a single composite score.** A LLM-emitted composite collapses signal — a high score with weak rationale is indistinguishable from a deserved high score, and the chairman can't audit the trade-off. Deterministic JS-side scoring with explicit weights makes the formula tunable, auditable, and version-stable. The LLM remains the *source* of structured fields; weighting them is a deterministic, version-stamped concern.

**Why a string `prompt_version` constant, not a hash of the prompt.** Hashes change with every whitespace edit and are unreadable in score history. A human-curated version string (`'2026-04-28-v2'`) bumps deliberately when the prompt changes meaningfully. The hash approach can be added later as a sibling concern (auto-detect drift between bumps); not in scope here.

**Why fail loudly on undercount instead of returning fewer candidates.** A run that returns 2 of 5 is more dangerous than a run that returns 0: it produces ranked output that looks legitimate but is built on impoverished signal. The chairman has no UI cue that the run was degraded. Hard-failing surfaces the issue; a future retry-on-failed-with-undercount sibling SD can recover gracefully.

**Why nullable `prompt_version` column instead of NOT NULL with a backfill.** Backfilling `'v1-pre-versioning'` across existing rows is a destructive operation on a shared production table. Nullable + COALESCE in the RPC achieves the same observability without rewriting history. If any consumer needs NOT NULL semantics later, a follow-up SD can backfill once the v2 prompt is stable.

**Why separate migration for the column and the RPC update.** Two-stage deploy (column-first, code-second) requires the column to be live before code reads it. Bundling them risks a deploy ordering race in CI. Separate migrations also let the RPC update roll back independently if it has a bug, without losing the schema change.

**Why no UI changes in this SD.** SCOPE LOCK at LEAD requires a clean, defensible boundary. Adding any UI surfacing — even a tooltip showing prompt version — pulls in `DiscoveryModeDialog` testing, design-agent review, and an ehg/ deploy. Backend-only keeps this SD a Tier-3 single-PR landing; UI surfacing is a sibling SD with clear dependencies.

## Supporting Evidence

- **Code site 1**: `lib/eva/stage-zero/paths/discovery-mode.js:511-520` — current `rankCandidates` body. The formula is verifiably 2-field-only.
- **Code site 2**: `lib/eva/stage-zero/paths/discovery-mode.js:200` (Trend Scanner prompt) — emits 9 fields per candidate. 7 of those fields are in the LLM output but never read by `rankCandidates`.
- **Code site 3**: `lib/eva/stage-zero/paths/discovery-mode.js:479-502` (`callLLMForCandidates`) — silent `[]` return on parse failure (line 496) and on JSON-not-found (line 497).
- **Code site 4**: `scripts/stage-zero-queue-processor.js:213-264` (`processRequest`) — the `catch` block at line 252 already handles thrown errors as `status='failed'`. Hardening reuses this path; the only change is `error_details.error_type`.
- **Closed-loop site**: `database/migrations/20260313_discovery_strategy_scores.sql` — the RPC backing `useDiscoveryStrategyScores`. Currently aggregates by `discovery_strategy` only; prompt-version dimension is missing.
- **UI site**: `ehg/src/components/chairman-v3/opportunities/DiscoveryModeDialog.tsx:71-79` — uses `useDiscoveryStrategyScores` to re-order strategies by `composite_score`. No UI changes here in this SD; the hook's return type extends backward-compatibly.
- **Real-world impact (inferred)**: Any chairman using the dialog has been ranking strategies on signal that mixes prompt-versions silently. Trend Scanner's star rating today is an unweighted average across whatever the prompt has looked like over the last 3 months — including any silent prompt edits in the codebase history.

## Vision Alignment

Aligned with **VISION-S18-MARKETING-COPY-STUDIO-PROMOTION-GATE-L2-001** (33% overlap per vision-readiness-rubric output) — that vision is concerned with end-to-end venture discovery quality and chairman observability into Stage 0 outputs. This SD is the foundation for that vision: scoring fidelity + version provenance + visible failure modes are prerequisites for any quality-gated promotion of discovery outputs. Without this SD, the closed loop produces unfalsifiable scores; with it, the loop becomes auditable and version-aware.

Also indirectly supports **VISION-LEO-INFRA-PROTOCOL-HARDENING-L2-001** (governance/observability hardening) — the silent-failure pattern in `callLLMForCandidates` is the same anti-pattern the protocol-hardening vision targets in other parts of the codebase.

## Risks

- **Risk**: New scoring formula could rank dramatically differently from v1, surprising chairmen on dialog star ratings. **Mitigation**: AC4 + AC5 require historical v1 ventures to be scored under the v1 formula via an explicit legacy branch — only ventures generated under v2 use the v2 formula. The RPC surfaces both versions side-by-side so chairmen can compare. Any drift is observable, not masked.
- **Risk**: Migration on shared Supabase DB during active queue processing. **Mitigation**: NFR-3 requires reversible migration + documented two-stage deploy (column-add first, code change second, ≥30s gap for processor to refresh schema). Out-of-scope: blue/green deploy of the queue processor — current single-instance design accepts a brief window of column-present-but-unused. No data loss risk.
- **Risk**: `parseRevenuePotential` is brittle — LLM emits free-form text. **Mitigation**: AC6 requires ≥8 documented inputs covering common forms; null fallback for unparseable. Score attribution uses parsed value when available, defaults to 50 (neutral) when null. No silent score corruption.
- **Risk**: `computeStrategicFit` is a heuristic; could be gamed by LLMs that learn to repeat strategic-context keywords. **Mitigation**: weight is 0.15 (not dominant); strategic context is ground truth from `loadStrategicContext`, not LLM-controlled. Long-term: replace with embedding similarity in a sibling SD.
- **Risk**: Throwing errors in `callLLMForCandidates` could surface failures that were previously silent — chairmen may see "failed" runs they didn't see before. **Mitigation**: this is the *desired* behavior (AC2, AC3). Add a one-line note to the dialog (out of scope here; document as next-SD requirement) when v2 lands so chairmen know "failed" is now a real terminal state.
- **Risk**: Sibling SDs don't follow this SD's pattern, leading to inconsistency across strategy runners. **Mitigation**: this SD's commit messages + retrospective explicitly call out the "blueprint for sibling SDs" framing. Each sibling SD's PRD will reference this one.
- **Risk**: Running this SD without surfacing version in UI means chairmen can't tell new from old in star ratings. **Mitigation**: explicit non-goal; UI surfacing SD is a known follow-up. Star ratings in v2 prompt era will be empirically lower-variance because the formula is more discriminating, which itself is a signal.

## Estimated Scope

~320 LOC source + tests, distributed:
- `lib/eva/stage-zero/paths/discovery-mode.js` — +60 LOC source (new rankCandidates, error classes, post-condition)
- `lib/eva/stage-zero/utils/parse-revenue.js` — NEW, ~40 LOC source
- `lib/eva/stage-zero/utils/strategic-fit.js` — NEW, ~30 LOC source
- `lib/eva/stage-zero/paths/discovery-mode-versions.js` — NEW, ~10 LOC
- `lib/eva/stage-zero/stage-zero-orchestrator.js` — +5 LOC pass-through
- `lib/eva/stage-zero/chairman-review.js` — +10 LOC stamping
- `scripts/stage-zero-queue-processor.js` — +15 LOC error_type extraction
- `ehg/src/hooks/useStageZeroQueue.ts` — +5 LOC payload extension
- `ehg/src/hooks/useDiscoveryStrategyScores.ts` — +3 LOC interface extension
- `database/migrations/20260428_stage_zero_prompt_version.sql` — NEW, ~25 LOC
- `database/migrations/20260428_stage_zero_prompt_version_rpc.sql` — NEW, ~30 LOC
- Tests across 5 vitest files — ~120 LOC

Tier 3 per CLAUDE.md Work Item Routing (>75 LOC, contains "migration" + "schema" + "feature" risk keywords). Full LEAD→PLAN→EXEC SD workflow. Required sub-agents: TESTING, DATABASE (for migration + RPC review), STORIES. UAT exempt (no customer-facing UI behavior change).

## Q8 Deletion Audit

Original analysis surfaced 13 candidate improvements across three tiers (free fixes, medium investments, strategic). Filed scope = 3 items (Tier 1 #1-3 only). Cut from filed scope:

- Tier 1 #4 (greedy regex JSON parser fix → structured output mode)
- Tier 1 #5 (inject existing portfolio + nursery rejects)
- Tier 1 #6 (drop hardcoded strategy list in DiscoveryModeDialog)
- All of Tier 2 (preprocess app_rankings to velocity; self-critique pass; expose constraints in UI; per-prompt-variant A/B)
- All of Tier 3 (multi-source signals; multi-step research; stage-of-death feedback)

Scope reduction: 10 of 13 items deferred (~77% reduction). Each deferred item has a clear sibling-SD landing path documented in Non-Goals. Reduction rationale: the three retained items are mutually-coupled in a way the others aren't (versioning is a prerequisite for measuring scorer changes; failure-hardening is required to trust either signal). Bundling them is the natural unit; pulling more in dilutes the LEAD scope-lock guarantee.
