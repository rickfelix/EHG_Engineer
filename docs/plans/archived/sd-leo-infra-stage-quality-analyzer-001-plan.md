<!-- Archived from: C:/Users/rickf/.claude/plans/sd-leo-orch-quality-analyzer-wiring-001-plan.md -->
<!-- SD Key: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 -->
<!-- Archived at: 2026-05-01T20:46:06.991Z -->

# SD: Stage 20/21 Quality Analyzer Wiring — Corrective Orchestrator for Foundation-Only Drift in SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001

## Type
orchestrator

## Priority
high

## Problem

Parent SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001 shipped 6 children (A–F) on 2026-04-29 via PRs #3422–3429. All merged. All claimed completion via LEAD-FINAL. Extent-of-condition scan on 2026-05-01 confirmed every child landed at the **template / type / migration / spec layer** but **none rewired the actual analyzer execution path** at `lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js`. The closed-loop quality system the parent SD was filed to deliver does not exist in production.

**Concrete evidence captured 2026-05-01 during LexiGuard Stage 19 → Stage 20 advance:**

| Child | Foundation shipped | Analyzer wiring | Production effect |
|---|---|---|---|
| A — Reconcile S20 models | `finding-shape.js` + `legacy-adapter.js` + canonical `stage-20.js` template + `stage_config` migration | NOT referenced from `analysis-steps/stage-20-code-quality.js` | 1 impossible-state row in `venture_stage_work` (LexiGuard S20: `stage_status='in_progress'` + `completed_at` set + `health_score='red'`); state-machine drift not addressed; no fresh work row on advance |
| B — `venture_quality_findings` table | Table exists | Analyzer never modified to write to it | **0 rows** in table since merge |
| C — Per-finding SD generator | Code shipped | Never invoked (no S20 FAIL trigger wired) | **0** SDs with `auto_generated=true + governance_metadata.source_finding_ids`; the 2 `auto_generated=true` hits are pre-Child-C (Feb 2026) with no source_finding_ids |
| D — Sandboxed runner | Doc/intent shipped | `analysis-steps/stage-20-code-quality.js:13` still uses raw `exec()` + `git clone "${repoUrl}"` with no env stripping, no `--ignore-scripts`, no regex validation on `repoUrl` | `SUPABASE_SERVICE_ROLE_KEY` and `GH_TOKEN` still inheritable by cloned-repo postinstall hooks |
| E — Rule 9 capability checks | — | `CHECK_TYPES = ['npm_audit','secret_detection','lint','test_suite']` (line 21) — `feedback_widget_present` + `error_capture_wired` not present in the codebase anywhere | 0 capability findings; vision mandate unenforced at the gate |
| F — Cross-venture aggregator | Code shipped | No data to aggregate (Child B empty); scheduled job evidence absent | **0** SDs matching `SD-EHG-VENTURE-PIPELINE-STAGE-%` pattern |

**Aggravator:** S20 has not actually executed for any venture since Child A merged 2026-04-29 — `build_security_audit` artifact count = 0 in that window. Even the original 4 checks have not run. The advance handler updates `ventures.current_lifecycle_stage` but does not reset/insert a fresh `venture_stage_work` row, leaving stale `in_progress + completed_at` rows to confuse the worker.

**Why the parent SD passed all gates while the system is non-functional:** Each child's success criteria validated unit-test passing on the foundation layer (template imports work, table schema deploys, hash determinism holds). No child had a success criterion that asserted "an actual S20 run on a real venture writes to `venture_quality_findings`" — i.e., end-to-end functional evidence was not part of any LEAD-FINAL gate. This is the **same drift class** the playbook §3 Tracked-Remediation table exists to prevent (Rules 7, 8, 9), reproduced inside the SD that was filed to instrument those rules. The amendment that brought S21 into scope correctly identified the cross-stage opportunity but did not catch the foundation-vs-wiring gap.

## Strategic Intent

Rewire the **actual analyzer execution path** to consume the foundation shipped by SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001 children A–F, plus close the `venture_stage_work` advance-handler defect that prevents S20 from running at all. Six independent children, each with a **functional end-to-end success criterion** (real venture run produces observable effect in production tables, not just unit-test green). Mirror parent's structural pattern but invert the layer — every child's deliverable lands in the analyzer, advance handler, or scheduled job, not in templates or types.

## Success Criteria (Orchestrator-level)

1. **Stage 20 actually executes on advance.** Clicking "Advance to Stage 20" on a venture (or programmatic equivalent) results in a fresh `venture_stage_work` row OR resets the existing row to a runnable state, and the Stage Execution Worker picks it up within its normal poll window.
2. **`build_security_audit` artifact count > 0** for at least one real venture in the 7 days following merge, demonstrating the analyzer ran end-to-end.
3. **`venture_quality_findings` table populated** by every analyzer run; row count grows with each S20 (and eventually S21) execution.
4. **At least one auto-generated SD with `governance_metadata.source_finding_ids` populated** filed for a real S20 FAIL, demonstrating Child C's path is wired.
5. **Cloned-repo execution observably stripped of credentials.** A test run inside a venture-pipeline staging environment with a sentinel `postinstall` script verifies that `SUPABASE_SERVICE_ROLE_KEY`, `GH_TOKEN`, and similar are absent from the spawned process env.
6. **`CHECK_TYPES` extended** to include `feedback_widget_present` and `error_capture_wired`; both check types produce findings on at least one venture run; verdict aggregation honors them as `critical`.
7. **Cross-venture aggregator scheduled job confirmed running** via `cron_jobs` / scheduler table inspection AND at least one SD-search confirms the aggregator's naming pattern produced output OR the threshold-not-met state is captured in a journal row (proving the job ran and decided not to file).
8. **Each of the 6 children has an end-to-end functional success criterion** that requires a real venture run as evidence — not unit tests alone. Child LEAD-FINAL gates fail if the corresponding production-table observation is absent.

## Scope

### In scope (decomposed across 6 children — A':–F':)

**Child A' — Advance handler + analyzer canonical shape adoption** (foundational; blocks B'–F')
- Rewire the `advanceVentureToStage` handler (or equivalent — name to be confirmed at PLAN) so that bumping `ventures.current_lifecycle_stage` either INSERTs a new `venture_stage_work` row for the destination stage OR resets an existing stale row (`stage_status='in_progress' AND completed_at IS NOT NULL` is the impossible-state pattern to reset).
- Modify `analysis-steps/stage-20-code-quality.js` to import and use `lib/eva/quality-findings/finding-shape.js` for normalizing every finding before persistence.
- Add a regression test that takes the LexiGuard impossible-state row as a fixture, runs the advance handler, and asserts the row is reset (not duplicated, not orphaned).
- Type: refactor / infrastructure.

**Child B' — Analyzer writes to `venture_quality_findings`**
- Modify `analyzeStage20CodeQuality` (and the S21 equivalent when it ships) to INSERT one row per finding into `venture_quality_findings` after computing the canonical shape from Child A'. The JSONB artifact stays as the human-readable summary; structured rows become the queryable source.
- Reuse Child B's existing schema (do not redesign the table).
- End-to-end success: a real venture run produces N findings AND `SELECT count(*) FROM venture_quality_findings WHERE venture_id = $1 AND found_at > $run_start_ts` returns N.
- Type: enhancement / database wiring.

**Child C' — Per-finding SD generator wired to FAIL/WARN**
- After every analyzer run that returns FAIL or WARN, invoke the existing per-finding SD generator module from Child C with the rows just written by Child B'.
- Verify dedup-by-`check_type`-per-venture honored.
- End-to-end success: induced S20 FAIL on a test venture results in an SD with `governance_metadata.auto_generated=true AND governance_metadata.source_finding_ids` non-empty.
- Type: enhancement.

**Child D' — Sandbox `cloneRepo` + `runNpmAudit` + `runSecretScan` + `runLintCheck` + `runTestSuite`**
- Modify the spawn sites in `analysis-steps/stage-20-code-quality.js` to pass `{ env: { PATH: process.env.PATH, HOME: process.env.HOME } }` only.
- Add `--ignore-scripts` to any materialized `npm install` invocation.
- Validate `repoUrl` against `^https://github\.com/[\w.-]+/[\w.-]+(?:\.git)?$` before passing to exec.
- End-to-end success: sentinel-postinstall test (above) shows credentials are absent from spawned env.
- Type: security.

**Child E' — Add `feedback_widget_present` and `error_capture_wired` check types**
- Extend `CHECK_TYPES` in `analysis-steps/stage-20-code-quality.js` from 4 entries to 6.
- Implement scanners: AST/import scan for feedback widget, init-call scan for error capture middleware, override-field check for `default_capabilities_override` populated on the venture's S19 artifact.
- Wire into verdict aggregation as `critical`.
- End-to-end success: a venture missing both capabilities FAILs S20 with the new check types appearing in `venture_quality_findings`.
- Type: enhancement.

**Child F' — Aggregator scheduled job operationalization**
- Verify the scheduled job exists in the deployment. If absent, add it. If present, confirm it runs against `venture_quality_findings` (the populated table from B') and emits SDs matching `SD-EHG-VENTURE-PIPELINE-STAGE-{N}-{CHECK_TYPE}-001` when threshold met.
- If threshold not met, write a journal/log row showing the aggregator ran and decided not to file.
- End-to-end success: either a live SD-search hit OR an audit-log row demonstrates the job executed.
- Type: feature / infrastructure.

### Out of scope

- **Refactoring the foundation modules from the parent SD.** `finding-shape.js`, `legacy-adapter.js`, `venture_quality_findings` schema, and Child C's generator module stay as-shipped. This SD only adds the wiring; it does not rewrite the foundations.
- **Backfilling historical S20 runs into `venture_quality_findings`.** Since the count is 0, there is nothing meaningful to backfill — forward-only wiring is sufficient.
- **Building a chairman-facing dashboard for findings/patterns.** Same exclusion as the parent SD.
- **Stage 21 (S21) analyzer wiring.** The cross-stage scope amendment in the parent SD remains valid, but the S21 analyzer module does not yet exist as a separate file; that's a future SD when S21 is operationalized. Children B'–F' are written stage-agnostic so S21 can plug in later without rework.
- **Sandbox upgrade beyond env-stripping** (Docker, firejail). Same exclusion as the parent SD.
- **Reopening the parent SD or amending its retrospective.** This is a corrective successor, not a rollback. The parent's retro stays as written; its quality_score should not be retroactively edited.

## Children — dependency ordering

```
A' (advance handler + canonical shape)         ←  must come first; unblocks all others
   ↓
B' (analyzer writes to findings table)         ←  data layer wiring
D' (sandboxed runner)                          ←  independent of B'; can ship in parallel
   ↓
C' (per-finding SD generation triggered)       ←  needs B''s rows
E' (Rule 9 capability check types)             ←  needs A''s canonical shape + B''s table
   ↓
F' (aggregator scheduled job verified)         ←  needs B''s rows; final child
```

## Dependencies

- **Hard:** SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001 (parent) — its foundation modules MUST exist on `main`. Confirmed merged 2026-04-29.

## Acceptance signal for parent-corrective

Parent SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001 retro stays at its original quality_score. After this SD's children A'–F' all reach LEAD-FINAL, the parent's intent is achieved (closed-loop quality system in production). Filing this corrective is itself the ack that the parent's gates were structurally insufficient — a separate harness SD may be filed later to add an "end-to-end functional evidence required for orchestrator children" rule to the LEAD gate, but that scope is OUT of this SD.

## Provenance

- EoC scan timestamp: 2026-05-01 (during LexiGuard Stage 19→20 advance investigation).
- Witnessing venture: LexiGuard (`94856fc6-9ba9-4f56-9a5c-85041031a0fc`).
- Diagnostic tool: `npm run venture:prove assess` (venture-proving-companion, advisory mode).
- Captured findings: 3 (artifact_exists:build_mvp_build, transition_exists, execution_history) — all flagged `minor`, all root-cause to the same dual-path defect.
