# Venture Data-Capture Table Map & Consolidation Plan

**SD:** SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-A (SD-0a — READ-ONLY audit)
**Date:** 2026-07-22
**Method:** Direct PostgREST probe (service-role) + static writer call-site scan. **Zero writes; no migration applied.**
**Reproduce:** `node scripts/audit/venture-capture-table-audit.mjs`

---

## 0. Method & the ambiguity it resolves

The reconnaissance saw `null` PostgREST counts for eight tables and could not tell **ghost (table absent)** from **empty (table exists, 0 rows)**. Root cause: a bare `head:true` exact-count request returns **`count=null` with NO error** for a non-existent table — identical to what an empty table's count *field* would look like on a failed count. Confirmed against a deliberately-fake table name (`definitely_not_a_real_table_xyz` → `count=null, err=none`).

**The disambiguating probe:** a real data select `.from(t).select('*').limit(1)`:
- absent table → error `PGRST205` *"Could not find the table 'public.<t>' in the schema cache"* ⇒ **GHOST (absent)**
- existing table → no error (and `data=[]` if empty) ⇒ **EXISTS**; the head/exact count then gives the true row count.

**DB-introspection method used:** *direct-probe fallback.* No arbitrary-SQL RPC is exposed — `exec_sql`, `execute_sql`, `sql`, `run_sql` all return *"Could not find the function"*. So `pg_policies` / `information_schema` could not be queried. RLS policy state is therefore **not directly queryable via PostgREST**; the service-role head-count is authoritative for row-presence, and existence is proven by the PGRST205-vs-no-error probe. This is sufficient for the WIRED/GHOST/EMPTY-WIRED call, which keys on **existence + row count + production writers**, not on RLS.

**Classification rules** (pure `classifyTable()` in the audit script):
| Condition | Class |
|---|---|
| table absent (PGRST205) | **GHOST** |
| exists + rows > 0 + ≥1 production writer | **WIRED** |
| exists + 0 rows + ≥1 production writer | **EMPTY-WIRED** |
| exists + only test/archive/fixture writers (or none) | **GHOST** (dead table) |

"Production writer" = a write call-site (`.insert/.upsert/.update` or `INSERT INTO`) in `lib/`, `server/`, or non-archive `scripts/`. Test, `__tests__`, `archive/`, docs, and inline-string fixtures do **not** count.

---

## 1. Table map (real numbers, real classifications, real writers)

| Table | Exists | Rows | Class | Production writer call-sites (evidence) | Fact class |
|---|:---:|---:|---|---|---|
| **stage_executions** | yes | **3241** | **WIRED** | `lib/eva/stage-execution-worker.js:2080` insert, `:2112` update (heartbeat), `:2130` update (finalize) | stage exec-path record |
| **venture_artifacts** | yes | **1138** | **WIRED** | `server/routes/stage18.js:84,158` insert; `lib/eva/artifact-versioning.js:147` update; `lib/eva/artifact-persistence-service.js:184` update; `lib/eva/qa/stitch-vision-qa.js:377` update | analysis artifacts |
| **workflow_executions** | yes | **7978** | **WIRED** | `lib/eva/stage-execution-worker.js:4085` insert; `lib/eva/workers/health-monitor-worker.js:118` insert; `lib/eva/workers/stage-advance-worker.js:72` update | workflow orchestration (adjacent) |
| **chairman_decisions** | yes | **549** | **WIRED** | `lib/eva/chairman-decision-watcher.js:503` insert; `lib/chairman/record-pending-decision.mjs:295` insert; `lib/governance/chairman-escalation.js:80` insert; `lib/venture-acquisition/decision-packet.js:120` insert; `lib/chairman/sms-bridge.js:332` update (+30 more across lib/eva, lib/chairman, lib/governance, lib/services) | venture decisions (chairman) |
| **venture_telemetry** | yes | **10** | **WIRED** | `scripts/venture-telemetry-pull.mjs:166` upsert, `:170` update, `:173` insert | venture metrics (product-KPI rollup, per `application_id`) |
| **venture_decisions** | yes | **0** | **GHOST** (dead) | only `archive/scripts/user-story-generators/add-user-stories-sd-hardening-v1-001.js:906` insert (archived) | venture decisions |
| **recursion_events** | yes | **0** | **GHOST** (dead) | none | recursion/orchestration events |
| **venture_signals** | **no** | — | **GHOST** (absent) | only a fixture string in `lib/gates/operator-contract/__tests__/venture-and-self-cadence.test.js:11` | venture signals |
| **venture_metrics** | **no** | — | **GHOST** (absent) | none | venture metrics |
| **venture_events** | **no** | — | **GHOST** (absent) | none | venture events |
| **venture_analysis_artifacts** | **no** | — | **GHOST** (absent) | only `tests/integration/s17-parity.test.js:240` insert (test) | analysis artifacts |
| **venture_stage_executions** | **no** | — | **GHOST** (absent) | none | stage exec-path record |
| **exec_path_records** | **no** | — | **GHOST** (absent) | none | stage exec-path record |
| **venture_exec_paths** | **no** | — | **GHOST** (absent) | none | stage exec-path record |
| **venture_kpis** | **no** | — | **GHOST** (absent) | none | venture metrics |
| **venture_stage_history** | **no** | — | **GHOST** (absent) | only `archive/scripts/user-story-generators/add-user-stories-sd-venture-stage0-ui-001.js:1063` insert (archived) | stage exec-path record (history) |
| **stage_execution_results** | **no** | — | **GHOST** (absent) | none | stage exec-path record |
| **agent_results** | **no** | — | **GHOST** (absent) | none | agent results |
| **validation_scores** | **no** | — | **GHOST** (absent) | none | validation scores |

**Totals:** 5 WIRED, 14 GHOST (12 absent, 2 dead-but-present). **Zero EMPTY-WIRED** — the "wired-but-unpopulated" hypothesis is falsified: every table that a real writer targets already holds rows.

**Key finding — the ghost cluster is imaginary, not empty.** All eight originally-ambiguous tables (`venture_signals`, `venture_metrics`, `venture_events`, `venture_analysis_artifacts`, `venture_stage_executions`, `exec_path_records`, `venture_exec_paths`, plus `venture_kpis`, `venture_stage_history`, `stage_execution_results`) **do not exist in the database**. They are naming folklore that appears only in tests, archived one-time scripts, and prose — never in a live product write path. There is nothing to migrate, drop, or reconcile for them.

---

## 2. Canonical table per fact class

| Fact class | Canonical table | Basis |
|---|---|---|
| **Stage exec-path record** | **`stage_executions`** (WIRED, 3241 rows) | The EVA stage-execution worker is the sole live writer: `_createStageExecution` inserts `{venture_id, lifecycle_stage, worker_id, status, started_at, heartbeat_at, metadata}`, `_updateExecutionHeartbeat` and `_finalizeStageExecution` update it. All ghost aliases (`venture_stage_executions`, `exec_path_records`, `venture_exec_paths`, `stage_execution_results`, `venture_stage_history`) are absent. |
| **Analysis artifacts** | **`venture_artifacts`** (WIRED, 1138 rows) | Written across S18 routes + EVA artifact services; a static write-lint (`scripts/lint/venture-artifacts-write-lint.mjs`) already guards its insert shape. `venture_analysis_artifacts` is absent (test-only reference). |
| **Venture decisions** | **`chairman_decisions`** (WIRED, 549 rows) | 30+ production writers across lib/eva, lib/chairman, lib/governance. `venture_decisions` exists but is dead (0 rows, archive-only writer). |
| **Venture metrics / KPIs** | **`venture_telemetry`** (WIRED, 10 rows) — *closest live table; keyed by `application_id`, not per-venture-per-stage* | Product-KPI rollup pulled by `scripts/venture-telemetry-pull.mjs`. `venture_metrics` and `venture_kpis` are absent. Caveat: telemetry is an application-level aggregate, so a per-stage/per-venture *metrics* fact has **no canonical table yet** — SD-0b must decide whether that need is real before creating one. |
| **Venture signals** | **none canonical — absent** | `venture_signals` does not exist. SD-0b must establish a table only if a real signals fact is required (do not resurrect from folklore). |
| **Venture events** | **none canonical — absent** | `venture_events` does not exist. Same guidance as signals. |

---

## 3. Consolidation plan (additive & reversible; no destructive DDL in this SD)

**Principle:** one canonical location per fact, no parallel tables. The audit shows the estate is already close to that ideal — the WIRED tables are singular per fact, and the "parallel" tables are ghosts (absent) rather than competing live stores. So consolidation here is mostly **ratifying the existing canonical + marking ghosts as non-targets**, not data migration.

1. **Stage exec-path record → ratify `stage_executions` as canonical.** No new table. It already carries a `metadata` jsonb column (today: `{operating_mode}`), which is the additive insertion point for the real-vs-simulated discriminator (§4).
2. **Analysis artifacts → ratify `venture_artifacts`.** No action; write-lint already exists.
3. **Venture decisions → ratify `chairman_decisions`.** `venture_decisions` (dead, 0 rows) is a candidate for eventual additive deprecation — see §5 chairman-gated note. **Do not drop in this SD.**
4. **Ghost/absent tables → mark as NON-CANONICAL, do not create.** The 12 absent names are folklore. The consolidation stance is *"these are not tables; do not add them."* Any future need must be justified from a real fact, then created deliberately (with RLS at create time), not resurrected because a test or archived script names them.
5. **`recursion_events` (dead, 0 rows) → leave as-is / deprecate additively later.** Not in the five capture fact-classes; out of SD-0b scope.

**Reversibility:** SD-0b's emission work is additive (writes into an existing table's existing jsonb column). No column is renamed or dropped; nothing needs a `DOWN` migration beyond ceasing to write the new metadata key.

---

## 4. Concrete target handed to SD-0b

> **SD-0b populates `stage_executions` (the existing, WIRED, 3241-row canonical table) with real-vs-simulated-tagged stage exec-path emissions.**

- **Table:** `public.stage_executions` — already canonical, already written by `lib/eva/stage-execution-worker.js`.
- **Where the tag goes:** the existing `metadata` jsonb column on the same insert (`_createStageExecution`, `lib/eva/stage-execution-worker.js:2081`) and/or the finalize update (`:2130`). Add a discriminator key, e.g. `metadata.build_kind: 'real' | 'simulated'`, sourced from **`lib/governance/real-build-discriminator.mjs`**. Because `metadata` is already jsonb, **no schema change (no DDL) is required** — the emission is a pure additive write into an existing column.
- **Why not a new table:** every alternative (`venture_stage_executions`, `exec_path_records`, `venture_exec_paths`, `stage_execution_results`) is absent. Creating one would re-introduce the parallel-table problem this SD exists to prevent. The one canonical exec-path store already has 3241 real rows and a live writer to extend.
- **SD-0b acceptance hook:** after wiring, the discriminator must appear on newly-written rows (`metadata->>'build_kind'` populated), verified live — not just unit-tested — per the "recurred/family fix requires e2e acceptance" and "trace to ground truth before 'live'" lessons.

---

## 5. Chairman-gated DDL flags

**None required for the canonical decision.** The canonical tables (`stage_executions`, `venture_artifacts`, `chairman_decisions`, `venture_telemetry`) all hold real data and are **kept**; SD-0b's work is additive into an existing jsonb column, so **no migration and no DDL** is needed to hand off the exec-path target.

For completeness, the *only* DDL that a future cleanup could involve — explicitly **deferred, not applied here**:
- **Dropping the dead-but-present tables** `venture_decisions` (0 rows) and `recursion_events` (0 rows). Both currently hold zero rows, so a drop is low-risk, but **any `DROP TABLE` is chairman-gated DDL** and out of scope for this read-only SD. Flagged for a separate, chairman-approved cleanup SD if desired.
- No table holding **real** data requires migration or a destructive drop for consolidation — the estate's live capture tables are already the single canonical store for their fact.
