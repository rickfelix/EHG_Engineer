---
title: Legacy test/ Root Triage Manifest
date: 2026-06-11
sd: SD-LEO-INFRA-TEST-ESTATE-HYGIENE-001
author: EXEC worker (FR-2)
status: complete
---

# Legacy `test/` Root Triage — 2026-06-11

Disposition of all 34 files under the legacy `test/` root (now removed). Targets live under
the canonical `tests/` tree and run under the vitest `unit` project.

**Counts: 31 MOVED (7 with fixes), 0 MERGED, 3 DELETED.**

Fix legend:
- *(import-depth)* — relative import updated for the new directory depth.
- *(mock-iface)* — LLM mock updated from the old Anthropic-SDK `messages.create` shape to the current `client.complete(system, prompt, opts)` interface and/or current response-schema requirements.
- *(strict-mode)* — expectations updated to FR-7 strict-mode semantics in `lib/eva/stage-zero/paths/discovery-mode.js` (empty/non-JSON/transport failures now throw; composite weighted ranking replaced the legacy v1 score formula).

| Original path | Disposition | Last commit | Reason |
|---|---|---|---|
| test/eva/experiments/chairman-report.test.js | MOVED → tests/unit/eva/experiments/chairman-report.test.js *(import-depth)* | 2026-04-23 | Live module coverage; only dir-depth import fix needed. |
| test/eva/experiments/dual-evaluator.test.js | MOVED → tests/unit/eva/experiments/dual-evaluator.test.js *(import-depth)* | 2026-04-23 | Live module coverage; only dir-depth import fix needed. |
| test/eva/experiments/first-experiment-runner.test.js | MOVED → tests/unit/eva/experiments/first-experiment-runner.test.js *(import-depth)* | 2026-04-23 | Live module coverage; only dir-depth import fix needed. |
| test/eva/experiments/prompt-promotion.test.js | MOVED → tests/unit/eva/experiments/prompt-promotion.test.js *(import-depth)* | 2026-04-23 | Live module coverage; only dir-depth import fix needed. |
| test/eva/experiments/proxy-metric-engine.test.js | MOVED → tests/unit/eva/experiments/proxy-metric-engine.test.js *(import-depth)* | 2026-04-23 | Live module coverage; only dir-depth import fix needed. |
| test/pocock/weekly-deepening-report.test.mjs | MOVED → tests/unit/pocock/weekly-deepening-report.test.mjs *(import-depth)* | 2026-05-14 | Live script coverage; joins existing tests/unit/pocock/ sibling. |
| test/unit/bias-detection.test.js | MOVED → tests/unit/bias-detection.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/blueprint-browse.test.js | MOVED → tests/unit/blueprint-browse.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/build-loop-real-data.test.js | DELETED | 2026-05-01 | Dead import: targets lib/eva/build-loop/stage-19-build-execution.js, removed in the stage renumbering (now stage-20). Structurally obsolete. |
| test/unit/capability-lattice.test.js | MOVED → tests/unit/capability-lattice.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/claim-fallback.test.js | MOVED → tests/unit/claim-fallback.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/competitor-teardown.test.js | MOVED → tests/unit/competitor-teardown.test.js | 2026-05-01 | Passes unchanged at new location. |
| test/unit/database-first-enforcer.test.js | MOVED → tests/unit/database-first-enforcer.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/dependency-chain-validator.test.js | MOVED → tests/unit/dependency-chain-validator.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/discovery-mode.test.js | MOVED → tests/unit/discovery-mode.test.js *(strict-mode)* | 2026-05-01 | 22/26 unique cases (strategies, nursery_reeval, constraints) kept; 4 tests updated to FR-7 throw semantics + composite ranking. Complements the 9-case twin in tests/unit/eva/stage-zero/paths/. |
| test/unit/eva-build-loop-templates.test.js | MOVED → tests/unit/eva-build-loop-templates.test.js | 2026-05-01 | Passes unchanged at new location. |
| test/unit/event-bus-a05-persistence.test.js | MOVED → tests/unit/event-bus-a05-persistence.test.js *(import-depth)* | 2026-04-23 | Imports were written for a 3-deep dir; fixed to ../../lib. Passes after fix. |
| test/unit/integration-discovery.test.js | MOVED → tests/unit/integration-discovery.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/leo-continuous-post-completion.test.js | MOVED → tests/unit/leo-continuous-post-completion.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/modeling.test.js | MOVED → tests/unit/modeling.test.js *(mock-iface)* | 2026-04-23 | Unique calculateVentureScore + generateForecast coverage; mocks updated to client.complete and S0_FORECAST_SCHEMA required keys (cost_breakdown, timeline). 11/11 pass. |
| test/unit/orchestrator-child-completion.test.js | MOVED → tests/unit/orchestrator-child-completion.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/phase-state-machine.test.js | MOVED → tests/unit/phase-state-machine.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/pipeline-flow-verifier.test.js | MOVED → tests/unit/pipeline-flow-verifier.test.js *(fix: tmp paths)* | 2026-04-23 | Wrote scratch fixtures into the deleted test/ dir; repointed to tests/unit/. 23/23 pass. |
| test/unit/port-only-terminal-id.test.js | MOVED → tests/unit/port-only-terminal-id.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/post-completion-requirements.test.js | MOVED → tests/unit/post-completion-requirements.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/prd-metadata-consistency.test.js | MOVED → tests/unit/prd-metadata-consistency.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/sql-execution-intent-classifier.test.js | MOVED → tests/unit/sql-execution-intent-classifier.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/stage-registry.test.js | MOVED → tests/unit/stage-registry.test.js | 2026-04-23 | Passes unchanged at new location. |
| test/unit/stage-zero.test.js | MOVED → tests/unit/stage-zero.test.js *(strict-mode)* | 2026-05-01 | Discovery mock now returns 3 candidates to satisfy the FR-7 undercount guard (min ceil(5/2)). 30/30 pass. |
| test/unit/synthesis-components-4-8.test.js | DELETED | 2026-04-23 | Asserts an 8-component synthesis engine; engine now runs 14 components on the client.complete interface (16/26 failed). Superseded by tests/unit/eva/stage-zero/synthesis/components.test.js. |
| test/unit/synthesis-engine.test.js | DELETED | 2026-04-23 | Pre-migration twin of tests/unit/eva/stage-zero/synthesis/synthesis-engine.test.js (10/17 failed under current interface/semantics). Current twin + components.test.js cover reframeProblem / crossReference / portfolioFit. |
| test/unit/terminal-identity-ancestry-split.test.js | MOVED → tests/unit/terminal-identity-ancestry-split.test.js | 2026-06-06 | Passes unchanged at new location. |
| test/unit/type-aware-completion.test.js | MOVED → tests/unit/type-aware-completion.test.js | 2026-05-01 | Passes unchanged at new location. |
| test/unit/venture-nursery.test.js | MOVED → tests/unit/venture-nursery.test.js | 2026-04-23 | Passes unchanged at new location (module-level twin tests/unit/eva/stage-zero/venture-nursery.test.js covers different cases; no basename collision at target). |

## Verification (2026-06-11)

- `npx vitest run --project unit tests/unit/eva/experiments/ tests/unit/pocock/` → **9/10 files pass (151/161 tests)**. The single failure is `tests/unit/eva/experiments/calibration-report.test.js` — a **pre-existing** tests/-tree file, NOT part of this triage; it fails identically standalone before these moves (mock drift: `no_telemetry_table` vs expected `sample_too_small`/`query_error`). All 5 moved experiment files and the moved pocock file pass.
- Sample of 10 rehomed `tests/unit/*.test.js` (incl. every file that received a fix) → **218/218 tests pass**.
- `git status` shows 31 staged renames (R/RM) + 3 staged deletes; the `test/` directory no longer exists.

## Out of scope, noted

- `tests/unit/handoff-orchestrator.spec.ts` / `tests/unit/handoff-orchestrator.test.js` staged deletes and the modified `tests/unit/handoff/handoff-orchestrator.test.js` are FR-1 work, not part of this 34-file triage.
