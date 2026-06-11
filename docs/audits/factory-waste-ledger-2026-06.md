# Factory Waste Ledger — June 2026 (v1)

**SD**: SD-LEO-INFRA-FACTORY-COST-UNIT-001 (FR-4)
**Generated**: 2026-06-10 · rerun anytime with `node scripts/cost-waste-ledger.mjs [--json]`
**Caveat**: ESTIMATE — programmatic LLM calls only; Claude Code main-session tokens (the dominant factory cost) are NOT captured; pricing is a static snapshot.

## Quantified classes

### venture_artifacts storm — **≈ $9.02** (2,684 rows, ~6.4M tokens)

| artifact_type | rows | est USD |
|---|---:|---:|
| blueprint_sprint_plan | 1,044 | $8.23 |
| launch_test_plan | 1,229 | $0.41 |
| build_security_audit | 411 | $0.38 |

**Method**: each row in `venture_artifacts_storm_quarantine_20260610` (the 2026-06-10 purge, SD-LEO-FIX-REMEDIATE-ARRESTED-VENTURE-001) was one duplicate LLM regeneration of an already-existing artifact. Tokens estimated as `content chars / 4` output, 1:1 input assumption, priced at the gemini-2.5-flash tier (EVA artifact writers run the flash family). **Lower bound** — thinking tokens and orchestration overhead unmodeled.

**Root cause**: eva-orchestrator generic fallback re-persisting every ~30s with a stale exit-gate type — fixed `d624465baf` 2026-06-07 (SD-LEO-FIX-FIX-STAGE-SKIP-001); all three storms stopped the same day.

**Reading**: the famous "1,230× test plan" storm burned ≈ $0.41 — the real cost of storms is table bloat, scan noise, and remediation labor, not direct token spend. The blueprint storm dominated dollar-wise (longer artifacts).

## Unquantifiable classes (stated, not guessed)

| class | why |
|---|---|
| retry_threshold_hits | retry-state-manager counters live in ephemeral per-session `.claude/retry-state-*.json`; no durable record, and retried tool calls are not token events in model_usage_log |
| exit_hang_duplicate_runs | UV-abort reruns are indistinguishable from legitimate runs (no rerun marker / dedup fingerprint in the logger) |
| main_session_tokens | not captured in model_usage_log at all — out of scope v1 (LEAD decision); revisit if a harness-level usage export lands |

## ops-cost-governance decision (FR-6)

**RETIRED.** `lib/eva/services/ops-cost-governance.js` had zero live importers ever, and its tables (`ops_cost_budgets`/`ops_cost_events`/`ops_cost_overrides`/`ops_revenue_metrics`) were never provisioned (table-estate matrix 2026-06-10 RETIRE_MODULE; re-verified by this SD's VALIDATION agent). Factory cost visibility now lives in `lib/cost/*` + `npm run cost:report` — direct consumers of data that actually exists.

## Attribution baseline (the gauge for FR-3)

Last 7d at ship time: 6,609 calls, **6.7% with sd_id**, 93% with tokens. The usage-logger fallback (FR-3) now stamps `sd_id` from the session's active claim — verified live in-session. Watch `cost:report --by-sd` coverage % climb; that is the FR-3 success gauge.

Machine-readable snapshot: [factory-waste-ledger-2026-06.json](factory-waste-ledger-2026-06.json)
