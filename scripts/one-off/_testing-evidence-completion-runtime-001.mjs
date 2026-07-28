#!/usr/bin/env node
/**
 * TESTING sub-agent evidence, PLAN phase, for SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001
 * (PLAN-TO-EXEC handoff). Written through the canonical writer per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '4c45e3e7-e642-4972-a9ef-f9ed35190104';
const SD_KEY = 'SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 82,
    findings: [
      {
        id: 'T1-FR1-CEILING-IS-STRUCTURAL-NOT-SEMANTIC',
        severity: 'HIGH',
        summary: "FR-1's honest test ceiling: a test can verify STRUCTURE (a timestamped, machine-readable field exists, is distinct from commit_sha/pr_url, is not stored in verification_notes per TR-2) and can verify VISIBILITY (absence is recorded explicitly rather than silently missing, per TS-2). No test — automated or otherwise — can verify that a recorded observation reflects an actual probe of a running system rather than a fabricated string typed into the same field. This is the same class of limitation as FR-2's witness field: recording a name is not verifying that a human looked. The PRD already names this honestly in its own risk register ('skipped exactly when it matters') — the test strategy should inherit that honesty rather than imply detection is achievable. Any EXEC-phase claim that a test 'verifies the observation is real' would be false; the correct claim is 'verifies the observation is well-formed and its absence is visible.'",
      },
      {
        id: 'T2-FR2-TARGET-FUNCTION-IS-PURE-CONFIRMED-EMPIRICALLY',
        severity: 'INFO',
        summary: "buildMergedReconcileUpdate (scripts/modules/complete-quick-fix/orchestrator.js:57-104) is confirmed pure: no DB or clock access (nowIso is caller-supplied), exported, DB-decoupled. Ran a throwaway probe test against current code (tests/unit/_fr2-probe-temp.test.js, removed after the run): `buildMergedReconcileUpdate({ qf:{id:'QF-X'}, prUrl, mergeSha:'abc', nowIso, scopeAcceptedBy: who }).verified_by` is `undefined` today — a clean RED reproducing the exact defect FR-2 describes. TEST DESIGN: extend tests/unit/complete-quick-fix/merged-reconcile-verification.test.js with `expect(u.verified_by).toBe(scopeAcceptedBy)` on the terminal (status='completed') branch. Zero DB round-trip required; runs in the existing hermetic suite. None of the 12 existing assertions in that file reference verified_by, so this addition cannot collide with current coverage.",
      },
      {
        id: 'T3-FR2-SECOND-WRITER-IS-NOT-CHEAP-AND-IS-UNCOVERED',
        severity: 'HIGH',
        summary: "FR-2's acceptance criteria explicitly names a SECOND path: 'the generic sentinels currently written on the other path (FORCE_COMPLETE, UAT_AGENT) are replaced.' That write site is orchestrator.js:693, inside the ~600-line completeQuickFix() async function, directly against a live `.update()` call — not extracted into a small pure function the way buildMergedReconcileUpdate is. Grepped every test file under tests/unit/complete-quick-fix/ and tests/unit/scripts/ for 'verified_by': the ONLY hits are the two orphan-qf-reaper test files. NOTHING tests the FORCE_COMPLETE/UAT_AGENT sentinel line today, and the PRD's own TS-1..TS-5 scenarios do not name it either — TS-3 covers only the merged-reconcile path. So the PRD's 'nearly free' framing (TR-1, FR-2 description) is true of ONE of the two writers FR-2's acceptance criteria requires touching, not both. A change could satisfy every declared test scenario while leaving the FORCE_COMPLETE/UAT_AGENT sentinels completely untouched. RECOMMENDATION: either EXEC extracts this update-payload construction into a pure builder (mirroring buildMergedReconcileUpdate) so it is cheaply unit-testable, or PLAN adds an explicit TS-6 naming this path and accepts the heavier DB-mock cost of testing it in place.",
      },
      {
        id: 'T4-BASELINE-MEASURED',
        severity: 'INFO',
        summary: "Measured baseline BEFORE any FR-2/FR-4 change, this session: `npx vitest run tests/unit/complete-quick-fix/` = 294 tests across 23 files, 292 passing, 2 failing (external-timeout-and-coverage-gate.test.js, 'FR-1 EXTERNAL_STEP_TIMEOUT_MS' — a Windows console ANSI-color leak into a spawned-process stdout comparison, e.g. expected '12345' received '\\u001b[33m12345\\u001b[39m'; pre-existing, environmental, unrelated to verified_by/completion evidence). `npx vitest run tests/unit/scripts/orphan-qf-reaper-force-completed.test.js tests/unit/scripts/orphan-qf-reaper-integration.test.js` = 23/23 passing. This is the pre-change baseline PLAN/EXEC should diff against.",
      },
      {
        id: 'T5-REAPER-IS-GENUINELY-TESTABLE-VIA-HERMETIC-MOCK-NOT-JUST-STRING-GREP',
        severity: 'MEDIUM',
        summary: "scripts/orphan-qf-reaper.mjs is more testable than the LEAD-phase Explore evidence characterized (that survey focused on the runtime-probe-coverage-gate dead-code path, not the reaper itself, and did not claim the reaper was untested). Confirmed: tests/unit/scripts/orphan-qf-reaper-integration.test.js mocks '@supabase/supabase-js' and 'node:child_process' at the module level, drives the real main() function, and asserts on CAPTURED UPDATE PAYLOAD CONTENTS (not just call counts) — e.g. line 162: `expect(payload.verified_by).toBe('ORPHAN_REAPER')`. This is a genuine hermetic behavioral test, not a source-grep. If FR-4 decides to enforce a change at the reaper (e.g. replace the ORPHAN_REAPER sentinel, or add a runtime-observation field), the test design is: extend the existing TS-1/TS-3 scenarios in this file to assert the new payload shape on the same mocked `updateCalls` capture — no new test infrastructure needed.",
      },
      {
        id: 'T6-TWO-EXISTING-TESTS-HARD-PIN-THE-REAPER-SENTINEL-CONDITIONAL-RISK',
        severity: 'MEDIUM',
        summary: "Two existing, currently-passing tests hard-pin the literal string 'ORPHAN_REAPER' as REQUIRED: tests/unit/scripts/orphan-qf-reaper-force-completed.test.js:61 (static source-grep: `/verified_by:\\s*'ORPHAN_REAPER'/`) and tests/unit/scripts/orphan-qf-reaper-integration.test.js:162 (behavioral: `expect(payload.verified_by).toBe('ORPHAN_REAPER')`). This is not automatically a gap — it is CONDITIONAL on FR-4's decision. If FR-4 excludes the reaper from FR-2-style naming (reason: the reaper's own identity IS a legitimate witness — it already writes a non-null, non-generic-in-the-FR-2-sense identifier, just not a human), these two tests correctly stay green and no update is needed. If FR-4 instead decides the reaper's sentinel is exactly the kind of generic marker FR-2 targets and enforces a change there, BOTH tests must be updated in the same PR or CI fails — which is the correct/desired outcome (a red test catching an unrecorded decision), not a defect. PLAN should record which branch FR-4 takes so EXEC does not discover this mid-build.",
      },
      {
        id: 'T7-RUNTIME-PROBE-COVERAGE-GATE-IS-WORSE-THAN-LEAD-EVIDENCE-STATED',
        severity: 'HIGH',
        summary: "Independently verified and STRENGTHENED the LEAD-phase Explore finding (F3). Explore said 'its only test' greps its own source. There are actually THREE test files: tests/integration/runtime-probe-coverage-gate.test.js, runtime-probe-coverage-gate-audit-emission.test.js, and runtime-probe-coverage-gate-warning-mode.test.js — ALL THREE are readFileSync + toContain/toMatch source-text assertions against the gate file; none imports and executes createRuntimeProbeCoverageGate against real or mocked data. Also independently confirmed createRuntimeProbeCoverageGate is not imported anywhere outside its own definition file and its three self-referential tests (grepped scripts/ and lib/) — dead code, exactly as claimed. Also confirmed scope_completion_chain has 0 rows via direct query. This reinforces FR-5's PLAN-time decision requirement: whichever way FR-5 goes, do NOT let these three tests be mistaken for behavioral coverage of the gate.",
      },
      {
        id: 'T8-NUMBERS-INDEPENDENTLY-VERIFIED-MOSTLY-EXACT-SMALL-DRIFT-EXPLAINED',
        severity: 'INFO',
        summary: "Re-ran the PRD's measurement queries against the live quick_fixes table this session (~20h after the PRD was authored at 03:27Z). force_completed=true: measured 630 vs PRD's 629 (off by 1). Thin stamps (force_completed=true AND uat_verified=false AND verified_by IS NULL): measured 393 vs PRD's 392 (off by 1) — consistent with exactly one additional QF being force-completed thinly in the intervening ~20 hours on a live, continuously-written table; not a measurement error. status='escalated': measured 55, EXACT MATCH. Orphans (escalated_to_sd_id IS NULL): measured 16, EXACT MATCH, severity breakdown {critical:3, high:4, medium:7, low:2} EXACT MATCH, critical IDs {QF-20260725-614, QF-20260713-422, QF-20260713-202} recovered, oldest orphan QF-20260705-182 dated 2026-07-05 EXACT MATCH. Per prior guidance to measure the payload and not trust a stale snapshot as ground truth, EXEC's own before/after verification (per PRD's own observability_rollout note: 'success is measured on ROWS WRITTEN AFTER the change') should re-run these same queries rather than citing the PRD's numbers as current.",
      },
    ],
    metadata: {
      fr1_test_ceiling: 'Structural well-formedness and explicit-absence visibility only. No test can verify the observation reflects a real probe rather than a fabricated string — same class of limitation as FR-2s witness field.',
      fr2_test_design: {
        target_function: 'buildMergedReconcileUpdate',
        file: 'scripts/modules/complete-quick-fix/orchestrator.js:57-104',
        purity: 'confirmed pure — no DB/clock access, nowIso caller-supplied',
        test_file: 'tests/unit/complete-quick-fix/merged-reconcile-verification.test.js',
        assertion: "expect(u.verified_by).toBe(scopeAcceptedBy) on the terminal completed branch",
        empirically_confirmed_red_today: true,
        second_writer_uncovered: 'orchestrator.js:693 FORCE_COMPLETE/UAT_AGENT sentinels — inside completeQuickFix(), DB-coupled, NOT tested by any current suite, NOT named in PRD TS-1..TS-5',
      },
      baseline: {
        'tests/unit/complete-quick-fix/': { files: 23, tests: 294, passing: 292, failing: 2, failure_cause: 'pre-existing ANSI-color/Windows env leak, unrelated to this SD' },
        'orphan-qf-reaper tests': { files: 2, tests: 23, passing: 23, failing: 0 },
      },
      reaper_testability: 'Genuinely testable via hermetic mock (supabase-js + child_process mocked, main() driven, payload contents asserted) — not just source-grep. Two existing tests hard-pin verified_by="ORPHAN_REAPER" as a literal; whether that is correct-to-stay or needs-updating is conditional on FR-4s explicit reaper decision.',
      runtime_probe_coverage_gate: 'THREE self-referential source-grep tests (stronger finding than LEAD survey, which cited one), zero behavioral coverage, confirmed dead code (no caller outside its own file/tests), scope_completion_chain confirmed 0 rows live.',
      measured_counts_this_session: {
        force_completed_true: 630, thin_stamps: 393, escalated: 55, orphaned: 16,
        orphan_severity: { critical: 3, high: 4, medium: 7, low: 2 },
        critical_orphan_ids: ['QF-20260725-614', 'QF-20260713-422', 'QF-20260713-202'],
        oldest_orphan: { id: 'QF-20260705-182', created_at: '2026-07-05T12:20:02.571Z' },
        drift_vs_prd: 'force_completed +1, thin +1 (live-table drift over ~20h); escalated/orphan/severity/oldest all exact matches',
      },
      test_strategy_gaps: [
        'GAP: FR-2 acceptance criteria names the FORCE_COMPLETE/UAT_AGENT sentinel path (orchestrator.js:693) explicitly, but no PRD test scenario (TS-1..TS-5) covers it, and it is not the cheap pure-function path TR-1 implies — EXEC must either extract a pure builder there or accept heavier DB-mock testing, and PLAN should decide which before EXEC starts.',
        'CONDITIONAL: FR-4s reaper decision determines whether two existing tests (orphan-qf-reaper-force-completed.test.js:61, orphan-qf-reaper-integration.test.js:162) must be updated in the same PR as any reaper change — not itself a gap, but undocumented in the PRD and will surprise EXEC if the decision is not recorded before implementation.',
      ],
    },
    phase: 'PLAN',
    summary: "PASS for PLAN-TO-EXEC. FR-1's honest test ceiling is structural well-formedness plus explicit-absence visibility — no test can verify a recorded observation reflects a real probe rather than a fabricated string, and the PRD should not be read as promising more than that. FR-2's primary target, buildMergedReconcileUpdate, is confirmed pure and cheaply unit-testable; a throwaway probe test against current code empirically reproduced the exact defect (verified_by undefined on the terminal completed path) — that RED-today assertion is the concrete FR-2 test. But FR-2's OWN acceptance criteria names a second writer (the FORCE_COMPLETE/UAT_AGENT sentinel line at orchestrator.js:693) that is DB-coupled, untested today, and absent from the PRD's TS-1..TS-5 — a genuine test-strategy gap where a change could satisfy every declared scenario while leaving half of FR-2 unaddressed. Measured baseline before any change: complete-quick-fix suite 292/294 passing (2 pre-existing, unrelated failures); orphan-qf-reaper suite 23/23 passing, and that suite is genuinely hermetically testable (mocked supabase+child_process, payload-content assertions), not merely source-grep — though two of its tests hard-pin the 'ORPHAN_REAPER' sentinel, so FR-4s reaper decision should be recorded explicitly before EXEC touches it. Independently re-ran the PRD's population counts: escalated/orphan/severity/oldest-orphan all matched exactly; force_completed and thin-stamp counts were off by exactly 1, consistent with normal live-table drift over the ~20 hours since the PRD was authored, not a measurement error. Separately and independently confirmed the LEAD-phase finding on runtime-probe-coverage-gate.js — it is actually covered by THREE self-referential source-grep tests (not one), still zero behavioral coverage, still dead code.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('TESTING result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
