# Audit: venture_stage_transitions writer paths

**SD**: SD-LEO-FIX-VENTURE-STAGE-TRANSITIONS-001
**Date**: 2026-05-03
**Origin**: PrivacyPatrol AI venture monitoring (venture `08d20036-03c9-4a26-bbc5-f37a18dfdf23`) revealed 3 missing transition rows: S12→S13, S15→S16, S16→S17.

## FR-001 Goal

Enumerate every code path that mutates `ventures.current_lifecycle_stage` in EHG_Engineer. For each, classify whether it writes a `venture_stage_transitions` audit row.

## Findings

### Canonical writers (write transition rows)

| # | Path | File:Line | Trigger | Writes transitions |
|---|------|-----------|---------|---------------------|
| 1 | `_advanceStage` (worker fast-path) | `lib/eva/stage-execution-worker.js:2107-2216` | Worker normal advance, governance override | YES (lines 2186-2213) — has dedup guard + try/catch |
| 2 | `advanceStage` (RPC gateway) | `lib/eva/artifact-persistence-service.js:377-420` | Calls `fn_advance_venture_stage` RPC | YES (RPC writes transition row inside SECURITY DEFINER body); throws on RPC error |
| 3 | `bootstrap_venture_workflow` (DB RPC) | `ehg/supabase/migrations/20260320_001_*.sql:197-299` | Initial bootstrap (from_stage=0) | YES (lines 278-285), idempotent via uuid_v5 |

### Direct mutators (call sites)

`grep -nE "\.update\\(.*current_lifecycle_stage|\\.from\\('ventures'\\).*current_lifecycle_stage" lib/` returns only one direct site:

| Path | File:Line | Calls _advanceStage downstream? |
|------|-----------|---------------------------------|
| `_advanceStage` body | `lib/eva/stage-execution-worker.js:2111-2114` | n/a (this IS the writer) |

All other usages are reads (SELECT) or test fixtures.

### Non-canonical advance paths

**None located in EHG_Engineer/lib/eva.** Both `eva-orchestrator.js` (line 424 detects `stepResult.artifacts`) and the worker's normal cycle (`processStage` → `_advanceStage`) flow through path #1. The early-exit paths at `stage-execution-worker.js:792, 887` (referenced by RCA Explore) also call `_advanceStage` per the same trampoline.

### Why PrivacyPatrol AI's 3 transitions are missing

Most likely failure mode (database-agent evidence row `7b47a137`): the SELECT or INSERT inside the existing try/catch at `stage-execution-worker.js:2190-2213` failed silently. The catch only logs `warn`, never emits a structured event. Supabase v2 returns `{data, error}` — does NOT throw. The current code does not check `error` on the SELECT, so a quiet RLS denial or connectivity flap can produce `data: null, error: <something>`, the code interprets `data:null` as "no row exists", proceeds with INSERT, INSERT fails for the same reason, catch records a warning, and the venture continues advancing.

There may also have been a transient connectivity issue on the day of the run; this audit cannot prove the exact cause without observability that did not exist.

## FR-003 Centralization Verdict

**No-op.** Audit reveals zero non-canonical advance paths. FR-003 resolves to "no refactor needed; existing centralization at `_advanceStage` and `advanceStage` is sufficient." FR-002 (observability hardening) does the heavy lifting — once silent fails surface, the system is self-correcting for future occurrences.

## FR-002 Observability Plan

`stage-execution-worker.js:2186-2213` rewritten:

1. SELECT block separated from INSERT block, each with its own try/catch.
2. SELECT block also checks `error` field of Supabase response (current code does not).
3. On failure of either block, emit `eva_orchestration_events` row with `event_type='escalation'` (per database-agent: `transition_record_failed` is not in the `chk_event_type` allowed list) and `event_data.subtype='transition_record_failed'` plus `failure_phase` = `dedup_guard_select` | `insert`.
4. Logger level escalated from `warn` → `error`.
5. Non-fatal preserved (advance completes even if audit fails).

## FR-004 Backfill Plan

Idempotent migration inserts the 3 missing PrivacyPatrol AI rows using deterministic v5 UUID idempotency keys:

```sql
INSERT INTO venture_stage_transitions (venture_id, from_stage, to_stage, transition_type, idempotency_key)
VALUES
  ('08d20036-...', 12, 13, 'normal', uuid_generate_v5(uuid_ns_oid(), '08d20036-...:12->13:backfill')),
  ('08d20036-...', 15, 16, 'normal', uuid_generate_v5(uuid_ns_oid(), '08d20036-...:15->16:backfill')),
  ('08d20036-...', 16, 17, 'normal', uuid_generate_v5(uuid_ns_oid(), '08d20036-...:16->17:backfill'))
ON CONFLICT (venture_id, idempotency_key) DO NOTHING;
```

The partial unique index `idx_venture_stage_transitions_idempotency ON (venture_id, idempotency_key) WHERE idempotency_key IS NOT NULL` (per database-agent finding) makes ON CONFLICT safe.

`transition_type='normal'` is used because the `transition_type` CHECK constraint allows only `('normal', 'skip', 'rollback', 'pivot')` — `'backfilled'` would fail. Provenance is preserved in a comment + the deterministic idempotency key suffix.

## FR-005 Test Coverage Plan

- **Unit (this SD)**: vitest forces SELECT throw + INSERT throw, asserts `eva_orchestration_events` row emitted with correct shape, assertion advance completes (non-fatal preserved).
- **Integration (FR-005)**: deferred to follow-up if the unit-level coverage is insufficient. Existing test scaffolding at `tests/integration/pipeline-s0-s17.test.js` is the seed for a future regression.

## Conclusion

Audit confirms no architectural drift; the defect is observability gap, not design. Fix is observability hardening (FR-002) + backfill (FR-004) + tests. FR-003 is a no-op. FR-005 ships unit coverage; full integration regression deferred.

## Sub-agent Evidence

- `db24af6f-5a6e-40cf-a948-3de4d58f7800` — TESTING agent (PASS, 85)
- `7b47a137-733c-4f01-84b5-b61aea8179ad` — DATABASE agent (PASS, 92)
