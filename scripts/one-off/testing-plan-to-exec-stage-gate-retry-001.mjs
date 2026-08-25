#!/usr/bin/env node
/**
 * One-off: TESTING sub-agent PROSPECTIVE review of the PRD for
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001, gating the PLAN-TO-EXEC handoff.
 *
 * PLAN-phase review: evaluates whether FR-1..FR-5 / TR-1..TR-4 are testable AS DESIGNED
 * and whether TS-1..TS-6 prove each FR without gaps -- BEFORE EXEC writes any code.
 *
 * Every claim below was measured this session against the live DB and the real files
 * (lib/eva/stage-execution-worker.js, lib/eva/eva-orchestrator.js,
 * lib/eva/artifact-persistence-service.js, database/migrations/20260214_eva_gate_constraints.sql,
 * database/schema-reference-snapshot.json) plus `git log -L` on the two park guards.
 * No claim is taken from the PRD's own paraphrase.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '8077da1b-7888-4a91-aba8-bfe459e61334';
const SD_KEY = 'SD-LEO-INFRA-STAGE-GATE-RETRY-001';

const findings = [
  {
    id: 'fr3-tr2-premise-falsified-write-path-is-working',
    severity: 'HIGH',
    summary: "The PRD states as CONFIRMED that \"recordGateResult's write to eva_stage_gate_results is silently not persisting on repeat evaluation\". Direct measurement falsifies this. Both ApexNiche S21 rows (entry + exit) carry gate_criteria.override with decision_id=7c706688-fa6e-4850-9ce7-982aaeae8a27 and at=2026-07-31T17:56:06.631817+00:00 -- written AFTER created_at=2026-07-26T01:12:04. The UPDATE landed. updated_at reads 2026-07-26 not because the write failed but because NOTHING EVER SETS IT: database/migrations/20260214_eva_gate_constraints.sql:24 declares `updated_at TIMESTAMPTZ DEFAULT NOW()`, a column DEFAULT that fires only on INSERT, and the table's sole trigger is trigger_enforce_kill_gate_threshold (same migration :74-77), which never touches updated_at. Neither recordGateResult's row payload (artifact-persistence-service.js:400-411) nor recordGateOverride's `.update({ gate_criteria: merged })` (:614-617) includes updated_at. Corroborated table-wide: 0 of 1000 sampled rows have updated_at != created_at, and 0 of 1796 rows have a non-null resolved_outcome. The two symptoms the PRD reads as a silent write failure are both fully explained by 'no writer writes these columns'.",
  },
  {
    id: 'ts3-fr3-ac1-unsatisfiable-as-written',
    severity: 'HIGH',
    summary: "TS-3 and FR-3 acceptance criterion 1 assert that after an override, the eva_stage_gate_results row 'has updated_at and resolved_outcome reflecting the override (proving the write path is no longer silently failing)'. Per the finding above, this assertion FAILS EVEN AFTER A PERFECT IMPLEMENTATION unless EXEC separately adds an updated_at auto-bump trigger or explicitly sets the column in the payload. Worse, eva_stage_gate_results.resolved_outcome is an UNCONSTRAINED TEXT column -- database/schema-reference-snapshot.json lists exactly three CHECKs on the table (gate_type, overall_score, stage_number) and no resolved_outcome CHECK -- so writing 'override' there would succeed SILENTLY while colliding with a different SD's vocabulary: that column belongs to SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001 (survived|killed|pivoted|exited|false_kill|false_pass), and 'override' is a term from the ATTEMPTS table's separate 7-term enum, which database/chairman-gated/20260823_eva_stage_gate_attempts.sql:299-301 explicitly COMMENTs as 'Distinct from eva_stage_gate_results.resolved_outcome'. A test written to this AC is not merely failing-by-construction; passing it requires an unflagged cross-SD column repurpose.",
  },
  {
    id: 'tr2-no-checkable-definition-of-correct',
    severity: 'HIGH',
    summary: "TR-2 requires the eva_stage_gate_results write to be 'a correct UPSERT keyed on (venture_id, stage_number, gate_type)' and that 'any catch block around the write must not silently swallow a failure'. Both halves are already satisfied at the site TR-2 names. recordGateResult (artifact-persistence-service.js:410-418) already calls `.upsert(row, { onConflict: 'venture_id,stage_number,gate_type' })` -- exactly the demanded key -- and already THROWS on error (:416-418), never swallowing. The swallow TR-2 objects to lives at the CALL SITE (eva-orchestrator.js:952: `logger.warn('[Eva] Gate result persist failed for ...')`), not in the helper. As written, TR-2 hands EXEC no falsifiable target: EXEC can either make no change and declare it met, or modify a working UPSERT with no test that can distinguish better from worse.",
  },
  {
    id: 'runaway-is-two-writers-two-tables-results-never-on-hot-path',
    severity: 'HIGH',
    summary: "Measured breakdown of 1000 ApexNiche S21 attempt rows: 100% carry evaluator='chairman (verbal, scribed by Adam)' and resolved_outcome='override' (entry 498 / exit 502). The writer is stage-execution-worker.js:867-874 -> recordGateOverride -> recordGateAttempt. Grep confirms stage-execution-worker.js NEVER imports or calls recordGateResult at all -- its only gate-persistence calls are recordGateAttempt (:3333, :3337) and recordGateOverride (:867). recordGateResult is reachable only from eva-orchestrator.js processStage, which the worker's 'skip processStage, advancing' shortcut bypasses entirely. So 'results frozen while attempts explode' is the EXPECTED output of the current code: two different writers targeting two different tables. No write-failure hypothesis is needed to explain the specimen, and FR-3 built on that hypothesis would be fixing a non-defect.",
  },
  {
    id: 'tr3-ts6-justification-falsified-guard-was-not-yet-deployed',
    severity: 'HIGH',
    summary: "TR-3 and TS-6 are justified DIRECTLY by the measured ~2h/454-attempt gap between the park flag write and the runaway stopping, attributed to 'deploy propagation lag vs. an in-process cache'. Git dating resolves it as neither. The ORCHESTRATOR park guard merged 2026-08-24 16:00:52 -0400 = 20:00:52Z (b1b3c72, PR #7505, SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001). The WORKER park guard -- the guard on the ACTUAL runaway writer -- merged 2026-08-24 16:44:13 -0400 = 20:44:13Z (cc000504, QF-20260824-655, PR #7511). The runaway's last attempt is 20:48:18Z, roughly 4 minutes after that second deploy. The flag was written 18:50:31Z. The 454 extra attempts therefore fired during the window in which THE CODE THAT READS THE FLAG ON THAT PATH DID NOT YET EXIST: the first fix guarded the wrong path. The worker already re-fetches the venture fresh on every _processVenture call, so there is no cache to invalidate. TR-3 is harmless but addresses a cause that did not occur, and TS-6 as scoped ('directly guards against reproducing the measured ~2h/454-attempt gap') CANNOT do so -- no fresh-per-tick unit test detects a guard that is absent from the hot path. The real generalizable guard is writer-path coverage plus a post-deploy row-count delta, which is what FR-4's census is actually good for.",
  },
  {
    id: 'fr1-backoff-has-zero-test-coverage',
    severity: 'MEDIUM',
    summary: "FR-1 acceptance criterion 2 requires that 'backoff interval increases between attempts as the count approaches the ceiling (measurable via opened_at deltas in eva_stage_gate_attempts)'. No scenario in TS-1..TS-6 exercises backoff. TS-2 asserts only the ceiling stop ('zero further rows'), which a naive hard-stop with no backoff satisfies identically. FR-1's backoff half could ship entirely unimplemented and every listed test scenario would still pass. This is a direct FR-to-TS coverage hole, not a stylistic gap.",
  },
  {
    id: 'fr4-census-zero-reading-is-unfalsifiable-no-positive-control',
    severity: 'MEDIUM',
    summary: "TS-1 asserts the FR-4 census 'reports 0 ventures in unbounded-retry posture post-ship'. A census whose query is wrong -- misspelled column, over-restrictive filter, wrong table, an empty-result error swallowed into 0 -- returns 0 identically to a correct one. As specified, a green TS-1 is evidence of nothing. The census needs a POSITIVE CONTROL in the same test: run it against a seeded or synthetic venture known to be in unbounded-retry posture and assert it reports >= 1, then assert the live count is 0. Without the positive arm this is a zero-yield instrument that reads as wired.",
  },
  {
    id: 'ts5-mutates-live-production-state-and-is-non-repeatable',
    severity: 'MEDIUM',
    summary: "TS-5 is specified as an e2e that unparks the real, chairman-parked ApexNiche (809ec7e7-f688-4a0c-b9f8-c8a8291cf94d) and lets one poll cycle run. Two problems as a TEST: (1) if the new ceiling/terminalization logic is wrong, this restarts a genuine production runaway against the same venture that just accumulated 1900+ rows; (2) it is single-shot -- once unparked, the precondition no longer exists, so it can never be re-run or used as CI regression coverage. Recommend running it against a fixture/clone venture, or demoting it to an explicitly read-only post-deploy census delta (attempt-count before vs. after a fixed window), which yields the same signal without mutating chairman-owned state.",
  },
  {
    id: 'tr2-naive-upsert-fix-would-trip-a-documented-clobber-landmine',
    severity: 'MEDIUM',
    summary: "eva-orchestrator.js:1322-1334 carries a deliberate, mutation-verified defect-preservation note: the taste-gate call passes `details:` where recordGateResult destructures `criteria:`, so the key is silently dropped -- and this is intentionally NOT fixed, because taste_gate_sN maps to gate_type='exit', the SAME upsert key (venture_id, stage_number, 'exit') already used by the stage_gate write earlier in the same processStage() call for stages 10/13/16. Supplying a real `criteria:` there would REPLACE the stage_gate's gate_criteria and flip gate-bars' chairman-verdict evidence-existence check at S10/S13 from fail-correctly to pass-incorrectly. TR-2 as phrased ('fix the UPSERT') points EXEC straight at this code with no warning. Any EXEC change to recordGateResult or its call sites must leave this omission intact, and that invariant deserves its own pinned regression test.",
  },
  {
    id: 'ts6-is-testable-today-seam-already-exists-no-design-note-needed',
    severity: 'INFO',
    summary: "POSITIVE: TS-6 (fresh-per-tick evaluation) does NOT require a live 30s poll loop and does NOT require exposing a new seam. stage-execution-worker.js:372-379 already provides `async processOneStage(ventureId)`, a public wrapper that sets _running and awaits the real _processVenture(ventureId) directly. Two existing tests already drive the REAL _processVenture loop through it with processStage mocked and a hand-rolled supabase fake: tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js (whose docstring names the pattern explicitly: 'mock processStage() directly and drive the REAL _processVenture loop via processOneStage(), rather than re-testing eva-orchestrator.js in isolation') and stage-execution-worker-high-consequence-mint.test.js. One caveat EXEC must honor: TS-6 has to invoke processOneStage TWICE with the supabase fake returning a CHANGED value between the two calls. A single invocation cannot distinguish a fresh read from a cached one and would be a green test asserting nothing.",
  },
  {
    id: 'regression-baseline-captured-for-exec',
    severity: 'INFO',
    summary: "Pre-implementation baseline measured this session so EXEC has a concrete floor and pre-existing failures are not misattributed. `npx vitest run tests/unit/eva/`: 577 test files -- 570 passed, 1 failed, 6 skipped; 7415 tests passed, 34 skipped; 36.3s. The single failure is PRE-EXISTING and environmental, not a code defect: tests/unit/eva/path-integrity-flags-live-defaults.db.test.js fails with DB_TIER_BLOCKED because the db tier is runtime-gated and requires VITEST_DB_ALLOW_REF to name a non-production ref. EXEC must not 'fix' it by weakening that tier guard. The five files most directly implicated by this SD -- orchestrator-gate-result-persist, stage-execution-worker-venture-parked-override-guard, kill-gate-evidence, artifact-persistence-service-gate-attempt, advance-stage-chairman-attempt-recording -- pass 47/47 in 2.12s and are the tightest regression signal for FR-3/TR-2 work.",
  },
  {
    id: 'fr2-fr5-and-tr1-tr4-are-testable-as-designed',
    severity: 'INFO',
    summary: "POSITIVE: FR-2 (terminal MANUAL_REQUIRED state) is testable as designed -- it reuses ventures.metadata.gating_decision, which already has a live, proven reader in both guards (stage-execution-worker.js:609-615 and eva-orchestrator.js:217-222, both keyed on the explicit `parked === true` discriminator rather than key presence) and an existing test asserting the guard's behavior. FR-5's four fixture scenarios map cleanly onto the processOneStage pattern above. TR-1 (single-sourced constants) is assertable by a cheap import/grep test. TR-4 (compatibility with the ALTIFYAI instrumentation retrofit) is covered by the existing green suite -- stage-execution-worker-chairman-gate-source.test.js and advance-stage-chairman-attempt-recording.test.js pin _handleChairmanGate's source tagging and are in the 47/47 set above.",
  },
];

const warnings = [
  "FR-3, TR-2, TR-3, TS-3 and TS-6 all inherit from a single root misdiagnosis (eva_stage_gate_results is 'silently not persisting'). Measurement shows the write path works and the frozen columns are simply never written by anyone. EXEC should not begin FR-3 by 'fixing' recordGateResult; the first EXEC action should be to re-scope FR-3 around the ACTUAL question -- what marks a gate terminal so the worker's recordGateOverride path stops re-firing -- and to decide deliberately whether that terminal marker belongs on eva_stage_gate_results.resolved_outcome (a cross-SD column with a different vocabulary and no CHECK to protect it), on ventures.metadata.gating_decision (already proven, already read by both guards), or on a new column of its own.",
  "Three test scenarios cannot ship as written: TS-3 (asserts columns nothing writes), TS-1 (zero reading unfalsifiable without a positive control), TS-5 (mutates chairman-owned production state, single-shot). TS-6 is implementable but its stated justification does not hold and it needs the two-invocation design to mean anything.",
  "The ceiling constant in FR-1 must be chosen against a real distribution, not assumed. ApexNiche reached attempt_number 951 across ~1900 rows at a ~30s cadence; a ceiling set low enough to be useful could terminalize ventures that are legitimately slow. FR-2's reason-carrying non-silent terminal state is the correct mitigation and should be treated as load-bearing rather than cosmetic.",
];

const recommendations = [
  "AMEND FR-3 AC-1 and TS-3 before EXEC starts. Replace 'updated_at and resolved_outcome reflect the override' with an assertion against something a writer actually sets. Concretely: assert gate_criteria.override.decision_id equals the decision under test (this ALREADY works today and is measurable on the live ApexNiche rows), plus whatever new terminal marker FR-3 chooses. If EXEC does want updated_at to be meaningful, that is a separate, explicit deliverable: either add an updated_at auto-bump trigger to eva_stage_gate_results or set the column in both recordGateResult and recordGateOverride payloads -- and note it affects all 1796 existing rows' semantics going forward.",
  "REWRITE TR-2. The UPSERT key and the throw-on-error are already correct at artifact-persistence-service.js:410-418. If the intended target is the swallowed failure, name the real site: eva-orchestrator.js:952's logger.warn. Give it a checkable definition, e.g. 'a recordGateResult failure surfaces in a way a test can assert (thrown, counted, or recorded), not only logged' -- and add the corresponding TS.",
  "ADD a backoff test scenario for FR-1 AC-2. Drive processOneStage repeatedly with a fake clock and assert the opened_at deltas (or the computed next-attempt delay) increase monotonically as the count approaches the ceiling. Without it, FR-1's backoff half is unverified by construction.",
  "ADD a positive control to TS-1. In the same test, seed or synthesize a venture in unbounded-retry posture, assert the census reports >= 1, then assert the live count is 0. A census that can only ever return 0 proves nothing about its own correctness.",
  "RESCOPE TS-5 off the live venture. Run it against a fixture/clone, or convert it to a read-only post-deploy census delta. Unparking the real ApexNiche as a test step risks restarting the exact runaway this SD exists to stop, and can only be done once.",
  "SPECIFY TS-6 as a two-invocation test using the existing seam: construct the worker, call processOneStage(v) once, mutate the supabase fake's returned gating_decision/attempt count, call processOneStage(v) again, and assert the second call observes the new value. Follow the established pattern in tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js. Do NOT introduce a new seam -- processOneStage already is one.",
  "ADD a pinned regression test for the deliberate `details:`-vs-`criteria:` omission at eva-orchestrator.js:1322-1334, so that any EXEC change under TR-2 that would restore the key -- and thereby clobber the stage_gate's gate_criteria on the shared (venture_id, stage_number, 'exit') upsert key at S10/S13 -- fails loudly instead of silently flipping gate-bars from fail-correctly to pass-incorrectly.",
  "HOLD the captured baseline: tests/unit/eva/ at 7415 passing / 34 skipped, with path-integrity-flags-live-defaults.db.test.js failing for DB_TIER_BLOCKED both before and after. EXEC must not resolve that failure by relaxing the db-tier gate.",
];

const summary = "PROSPECTIVE (PLAN-phase) TESTING review of the PRD for SD-LEO-INFRA-STAGE-GATE-RETRY-001, gating PLAN-TO-EXEC. Read lib/eva/stage-execution-worker.js, lib/eva/eva-orchestrator.js and lib/eva/artifact-persistence-service.js directly rather than trusting the PRD's paraphrase, and re-measured the specimen against the live DB. VERDICT DRIVER: the PRD's central premise -- stated as CONFIRMED, that recordGateResult's write to eva_stage_gate_results is 'silently not persisting' -- is falsified by direct measurement. Both ApexNiche S21 rows carry gate_criteria.override with the exact decision_id the PRD cites (7c706688), stamped 2026-07-31, five days AFTER created_at: the UPDATE landed. updated_at is frozen because NOTHING WRITES IT (the DDL declares an INSERT-only DEFAULT NOW(); the table's only trigger enforces kill-gate thresholds; neither writer includes the column) and resolved_outcome is null because no code writes that column on the results table at all -- corroborated table-wide at 0/1000 rows updated and 0/1796 rows resolved. The specimen is fully explained by a two-writer/two-table split: the runaway writer is stage-execution-worker.js:867 -> recordGateOverride -> recordGateAttempt (measured: 1000/1000 attempts are evaluator='chairman (verbal, scribed by Adam)', resolved_outcome='override'), and the worker never calls recordGateResult at all. Separately, git dating dissolves the '~2h propagation gap' that justifies TR-3/TS-6: the orchestrator guard shipped 20:00:52Z but the guard on the actual runaway writer shipped 20:44:13Z (QF-20260824-655) and the runaway stopped 20:48:18Z -- roughly 4 minutes later. The 454 extra attempts fired while the code that reads the park flag on that path did not yet exist; it was neither a cache nor deploy lag, so TR-3's fresh-per-tick mandate targets a cause that did not occur. CONSEQUENCE FOR TESTABILITY: TS-3 and FR-3 AC-1 are unsatisfiable as written and would fail after a perfect implementation; TR-2 has no falsifiable definition of 'correct' because the UPSERT it names is already correct on both counts it raises; and a naive TR-2 'fix' would walk into the documented gate_criteria clobber landmine at eva-orchestrator.js:1322-1334. Three further coverage gaps would let regressions ship undetected: FR-1's backoff has zero scenarios (a no-backoff hard stop passes TS-2 identically), FR-4's census has no positive control (a broken query returns 0 exactly like a correct one), and TS-5 mutates chairman-owned production state single-shot. POSITIVE FINDINGS: TS-6 needs no new seam -- processOneStage(ventureId) at :372 already wraps the real _processVenture and two existing tests drive it that way -- and FR-2, FR-5, TR-1 and TR-4 are testable as designed. Baseline captured for EXEC: tests/unit/eva/ = 570/577 files, 7415 tests passing, 1 pre-existing environmental DB_TIER_BLOCKED failure. Not blocking: every gap is correctable by PRD amendment plus added scenarios, and nothing here is untestable in principle -- but EXEC should apply the eight listed corrections before implementing FR-3/TR-2/TR-3, or it will build against a falsified root cause.";

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'TESTING',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    findings,
    warnings,
    recommendations,
    summary,
    justification: "CONDITIONAL_PASS rather than PASS because five PRD elements (FR-3, TR-2, TR-3, TS-3, TS-6) inherit from a root misdiagnosis that direct measurement falsifies, and one of them (TS-3 / FR-3 AC-1) is literally unsatisfiable as written -- it asserts on updated_at and resolved_outcome, two columns that no writer on any code path sets, so the test would fail after a perfect implementation and EXEC would burn retry budget chasing a phantom. TR-2 compounds it by naming an UPSERT that already has exactly the demanded onConflict key and already throws instead of swallowing, leaving EXEC no falsifiable target. Rather than PASS, because shipping these to EXEC unamended predictably produces either a no-op 'fix' declared complete or a real change to a working, high-blast-radius write path guarded by a documented clobber landmine. Rather than FAIL/BLOCK, because nothing in the design is untestable in principle: the test seam EXEC needs already exists and is already used by two sibling tests (processOneStage -> real _processVenture), FR-2/FR-5/TR-1/TR-4 are testable as designed, the regression baseline is green and large (7415 tests), and all eight corrections are PRD amendments plus added scenarios that EXEC can apply at the start of implementation without re-entering PLAN. Per LEO guidance, infrastructure hardening is not blocked for correctable design gaps. Confidence 88: every finding is measured (live DB queries, file reads at cited line numbers, `git log -L` on both park guards, a full baseline suite run), not inferred; the residual 12 reflects that the correct terminal-marker location for FR-3 is a design decision I am recommending be made deliberately rather than one I can settle from evidence alone.",
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'PLAN',
      review_type: 'prospective_prd_testability_review_pre_implementation',
      prd_id: 'PRD-SD-LEO-INFRA-STAGE-GATE-RETRY-001',
      files_read_directly: [
        'lib/eva/stage-execution-worker.js (4907 lines)',
        'lib/eva/eva-orchestrator.js (1555 lines)',
        'lib/eva/artifact-persistence-service.js (recordGateResult :363-435, recordGateAttempt :486, recordGateOverride :595-652)',
        'database/migrations/20260214_eva_gate_constraints.sql',
        'database/chairman-gated/20260823_eva_stage_gate_attempts.sql',
        'database/schema-reference-snapshot.json',
        'tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js',
      ],
      live_db_measurements: {
        results_rows_for_specimen: '2 (entry+exit), both created_at=2026-07-26T01:12:04, updated_at identical, resolved_outcome=null',
        gate_criteria_override_present: 'YES on both rows, decision_id=7c706688-fa6e-4850-9ce7-982aaeae8a27, at=2026-07-31T17:56:06.631817+00:00 -- proves the UPDATE landed 5 days after row creation',
        results_table_wide: '1796 total rows; 0 with non-null resolved_outcome; 0 of 1000 sampled with updated_at != created_at',
        attempts_writer_breakdown: "1000 sampled: 100% evaluator='chairman (verbal, scribed by Adam)', resolved_outcome='override' (exit 502 / entry 498); top attempt_number 951 at 2026-08-24T20:48:18Z",
        results_table_checks: 'exactly 3 (gate_type, overall_score, stage_number) -- resolved_outcome is UNCONSTRAINED TEXT',
        updated_at_trigger: 'NONE; only trigger_enforce_kill_gate_threshold exists, which never touches updated_at',
      },
      two_hour_gap_resolution: {
        park_flag_written: '2026-08-24T18:50:31Z',
        orchestrator_guard_merged: '2026-08-24 16:00:52 -0400 = 20:00:52Z (b1b3c72, PR #7505) -- guarded the WRONG path',
        worker_guard_merged: '2026-08-24 16:44:13 -0400 = 20:44:13Z (cc000504, QF-20260824-655, PR #7511) -- guarded the ACTUAL runaway writer',
        last_attempt: '2026-08-24T20:48:18Z (~4 minutes after the worker guard shipped)',
        conclusion: 'Not a cache, not deploy lag. The 454 extra attempts fired while the code reading the flag on that path did not yet exist. TR-3 targets a cause that did not occur.',
      },
      regression_baseline: {
        command: 'npx vitest run tests/unit/eva/',
        result: '577 files: 570 passed / 1 failed / 6 skipped; 7415 tests passed, 34 skipped; 36.32s',
        pre_existing_failure: 'tests/unit/eva/path-integrity-flags-live-defaults.db.test.js -- DB_TIER_BLOCKED, requires VITEST_DB_ALLOW_REF; environmental, not a code defect; EXEC must not weaken the tier guard to green it',
        tightest_gate_suite: '47/47 passing in 2.12s across orchestrator-gate-result-persist, stage-execution-worker-venture-parked-override-guard, kill-gate-evidence, artifact-persistence-service-gate-attempt, advance-stage-chairman-attempt-recording',
      },
      fr_ts_coverage_matrix: {
        'FR-1 ceiling': 'covered by TS-2',
        'FR-1 backoff': 'GAP -- no scenario; a no-backoff hard stop passes TS-2 identically',
        'FR-1 fresh-read': 'covered by TS-6 (implementable; justification falsified, needs 2-invocation design)',
        'FR-2 terminal state': 'covered by TS-2; testable as designed via ventures.metadata.gating_decision',
        'FR-3 override terminalization': 'TS-3 UNSATISFIABLE as written (asserts unwritten columns)',
        'FR-4 census': 'TS-1 present but UNFALSIFIABLE -- no positive control',
        'FR-5 fixtures': 'testable; seam exists via processOneStage',
        'TR-1 constants': 'no scenario, but cheaply assertable by import/grep test',
        'TR-2 upsert': 'no checkable definition of correct -- site already satisfies both stated requirements',
        'TR-3 fresh-per-tick': 'implementable; justification falsified by git dating',
        'TR-4 retrofit compat': 'covered by existing green suite (chairman-gate-source, advance-stage-chairman-attempt-recording)',
      },
      test_seam_assessment: {
        question: 'Is TS-6 testable without a live 30s poll loop?',
        answer: 'YES -- no new seam or design note required',
        seam: 'stage-execution-worker.js:372-379 processOneStage(ventureId) publicly wraps the real _processVenture and manages _running',
        precedent: 'tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js and stage-execution-worker-high-consequence-mint.test.js both drive the real _processVenture loop this way with processStage mocked',
        caveat: 'TS-6 must invoke processOneStage TWICE with a changed fake value between calls; one invocation cannot distinguish fresh from cached',
      },
    },
    phase: 'PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'TESTING',
    SD_ID,
    { name: 'Enhanced QA Engineering Director v2.4.0' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
