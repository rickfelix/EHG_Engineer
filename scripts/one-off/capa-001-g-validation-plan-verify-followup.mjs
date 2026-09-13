#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G — VALIDATION sub-agent, PLAN-phase VERIFY follow-up.
 *
 * Second row, recorded AFTER commit 433398b210f addressed 2 of the findings from the original
 * PLAN-verify row (cbc9caf6-113d-4b72-816c-67118472e560, which is deliberately left untouched as
 * the point-in-time record). Records the 2 resolved arms with independent re-verification, and
 * carries the still-open items forward unchanged. Verdict stays CONDITIONAL_PASS: the open set
 * did not change.
 *
 * Written via the canonical writer (resolveSubAgentRepo + applySubAgentRepoVerdict +
 * storeSubAgentResults) -- the agent itself does not write the row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G';
const PRIOR_ROW_ID = 'cbc9caf6-113d-4b72-816c-67118472e560';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  phase: 'PLAN',
  execution_time_ms: 0,
  summary: `PLAN-phase VERIFY follow-up for SD-G, recorded after commit 433398b210f. This row supersedes NOTHING -- the original PLAN-verify row ${PRIOR_ROW_ID} stays as the point-in-time record and is still accurate for everything that remains open. Verdict is unchanged at CONDITIONAL_PASS because the OPEN set is unchanged; what changed is that 2 of the findings are now closed and have a record of being closed, so a future reader does not encounter a 'cheap to close today, impossible to fix retroactively' race finding with no disposition. RESOLVED ARM 1 -- the cutover race: VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT moved from 2026-09-13T21:00:00.000Z (already ~85 minutes in the PAST when I measured it at 22:26Z, on an unmerged branch) to 2026-09-21T00:00:00.000Z, comfortably past the expected merge window. I re-checked the constant myself at lib/eva/artifact-persistence-service.js:88 rather than accepting the report. The window in which a write by main's unstamped code could create a permanently-ABSENT post-cutover row is now closed; zero such rows were ever created (measured 0 rows at/after the old cutover before the change). RESOLVED ARM 2 -- the exit-gate-enforcer arm of GAP-4: all 3 real checkExitGates() callers now surface gateResult.provenance_warnings -- advanceStage (lib/eva/artifact-persistence-service.js:1032), processLifecycleTerminal (lib/eva/stage-execution-engine.js:71), and the PATH-INTEGRITY choke point (lib/eva/stage-execution-worker.js:3288). I verified placement, not just presence: each sits AFTER the blocking branch and only reads the array, so allowed/blocked_by/gates_checked and all control flow are genuinely unchanged, and the advisory contract holds. The binding exit-gate path is no longer computed-then-dropped. COLLATERAL, CORRECTLY HANDLED: bumping the constant broke 7 test files that had hardcoded '2026-09-14T00:00:00Z' as a literal post-cutover fixture instead of deriving it; all 7 now import VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT and compute POST_CUTOVER from it (the pattern venture-artifact-provenance.test.js already used), so the constant can move again without a second round of literal-chasing. I grepped and confirmed no hardcoded post-cutover literal remains in any provenance test. NEW OBSERVATION (not a regression, a consequence that must be explicit): moving the cutover 7 days into the FUTURE makes the provenance grading DORMANT until 2026-09-21 -- gradeVentureArtifactProvenance short-circuits on preCutover BEFORE it ever checks the stamp, so until that date every row, stamped or not, grades leniently. This is the right tradeoff (a recoverable blind window beats an unfixable permanently-ABSENT row), but it means PRD AC#1's live write+readback and TR-6's 'clean readback before flipping to block' CANNOT be performed now and must be scheduled after 2026-09-21, or they quietly become steps nobody can execute and nobody notices are pending. Independently re-ran the suites after the fixes: 635 files / 8113 tests passed / 0 failed / 24 pre-existing skips.`,
  critical_issues: [],
  warnings: [
    "STILL OPEN -- GAP-1 (FR-5 AC-3 / TR-4 / PRD AC#6): no test or CI predicate asserts the artifact-type bound over the live query (venture_stages.required_artifacts UNION gate_boundary_config.required_artifacts). TS-10 uncovered. No hardcoded '46'/'45' exists either, so today's state is correct but unguarded -- the next required_artifacts edit has nothing to catch it. Carried forward unchanged from the original row; documented as a PRD risk with a fast-follow QF/SD recommendation.",
    "STILL OPEN -- GAP-2 (FR-6 AC-1 / TS-8): no test exercises BOTH acceptance-artifact-gate.js predicates together on one fixture chain (a launch_uat_report row hash-linked to its uat_test_runs row). Documented as a PRD risk, with the noted structural reason: the gate's per-table single-row dispatch model does not naturally support a cross-table check without restructuring.",
    "STILL OPEN -- GAP-3 (dead reader): verifyLaunchUatReportLink() (lib/eva/venture-artifact-provenance.js:86) is exported and has 4 unit tests but ZERO production call sites. The launch_uat_report -> uat_test_runs link is produced and provable, but nothing in any gate path proves it at runtime. Documented as a PRD risk.",
    "PARTIALLY OPEN -- GAP-4: the exit-gate-enforcer arm is RESOLVED (3 callers now log). The other 4 sites still compute provenance findings that no caller reads: reality-gates.js (result.provenance_warnings), stage-artifact-precondition.js (provenanceWarnings), artifact-integrity-checker.js (provenance_warnings), stage-23-launch-readiness.js preflightUpstream (provenanceWarnings). Documented as a PRD risk with a fast-follow recommendation.",
    "NEW -- 7-DAY INERT WINDOW: because the cutover is now 2026-09-21 and gradeVentureArtifactProvenance short-circuits on preCutover before checking the stamp, provenance grading is dormant until that date. Correct tradeoff, but PRD AC#1's live write+readback and TR-6's flip-criterion readback must be SCHEDULED after 2026-09-21 rather than attempted now. Being added to PRD risks and passed to the RETRO sub-agent as a named follow-up.",
    "UNCHANGED -- FR-3 premise correction: through writeArtifact(), deriveContent() always backfills content from artifactData, so hash_source is effectively always 'content' for new writes; the 'artifact_data' branch is reachable only when both are null (a constant hash that verifies vacuously). TS-5 is satisfied at the buildMachineProvenance() primitive, which is tested directly, but is unreachable through a real writeArtifact() path.",
    "UNCHANGED -- FR-5 mechanism deviation: exit-gate-verifiers.js's 10 read sites are graded by a separate additive re-query rather than by widening each SELECT as the AC literally requires. Coverage verified complete (10 read sites, 12 VERIFIER_ARTIFACT_TYPES entries, readCodeQualityReport shared by 3 verifiers). Outcome-equivalent; PLAN should ratify the deviation explicitly.",
    "UNCHANGED -- FR-6 scope deviation: the uat_test_runs hasProvenance predicate was deliberately left unchanged against an AC reading 'Both predicates are upgraded in the same change'. Defensible judgment; still a deviation to accept on the record.",
    "UNCHANGED -- TS-9 partial: checkGateProvenance() has a degrade-to-[] test for query error / missing client, and the pre-existing fail-open postures are tested, but no NEW test proves a fail-CLOSED site stays closed under a DB-error condition with provenance wired.",
    "UNCHANGED -- reality-gates.js block-mode untested: the VENTURE_ARTIFACT_PROVENANCE_MODE==='block' branch has no test. Mechanism hand-verified correct (pushing into result.reasons flips passed=false via the 'any reason blocks' rule), but the flag is read at module load into a const, so testing it needs vi.resetModules + stubEnv.",
  ],
  recommendations: [
    "Schedule PRD AC#1's live AltifyAI write + readback for AFTER 2026-09-21 (the new cutover). It cannot be performed before that date because preCutover short-circuits the grader, and a readback run now would return a vacuous all-lenient pass that reads as success.",
    "Same for TR-6's flip-to-block criterion: the 'clean readback against live venture data' is only meaningful after 2026-09-21. Until then, advisory mode is dormant rather than clean.",
    "Carry GAP-1, GAP-2, GAP-3 and the 4 remaining provenance_warnings sites into the fast-follow QF/SD as already agreed. GAP-1 is the highest-value of the four: it is the only guard against a future required_artifacts edit silently moving the scope boundary.",
    "PLAN: ratify the two documented deviations (FR-5's separate-re-query mechanism, FR-6's unchanged uat_test_runs predicate) explicitly in the PLAN-TO-LEAD handoff rather than letting them pass unremarked.",
  ],
  detailed_analysis: {
    supersedes: null,
    prior_row_id: PRIOR_ROW_ID,
    prior_row_disposition: 'left intact and unmodified; still accurate for every item that remains open. This row adds disposition for the 2 closed arms only.',
    fix_commit: '433398b210f',
    resolved_arms: [
      {
        finding: 'cutover race (constant in the past on an unmerged branch)',
        fix: "VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT moved 2026-09-13T21:00:00.000Z -> 2026-09-21T00:00:00.000Z",
        independent_verification: 'constant re-read directly at lib/eva/artifact-persistence-service.js:88 by the validation agent, not accepted from the report',
        residual_risk: 'grading is dormant until 2026-09-21 (see the 7-day inert window warning)',
      },
      {
        finding: 'GAP-4 exit-gate-enforcer arm (provenance_warnings computed then dropped)',
        fix: 'all 3 real checkExitGates() callers now log provenance_warnings when non-empty',
        call_sites: [
          'lib/eva/artifact-persistence-service.js:1032 (advanceStage)',
          'lib/eva/stage-execution-engine.js:71 (processLifecycleTerminal)',
          'lib/eva/stage-execution-worker.js:3288 (PATH-INTEGRITY choke point)',
        ],
        independent_verification: 'placement verified, not just presence: each log sits AFTER the blocking branch and only reads the array, so allowed/blocked_by/gates_checked and all control flow are unchanged and the advisory contract holds',
      },
    ],
    collateral_fix_verified: {
      what: '7 test files had hardcoded 2026-09-14T00:00:00Z as a literal post-cutover fixture; all now derive POST_CUTOVER from the imported constant',
      files: [
        'tests/unit/eva/reality-gates.test.js',
        'tests/unit/eva/stage-artifact-precondition.test.js',
        'tests/unit/eva/lifecycle/exit-gate-enforcer.test.js',
        'tests/unit/eva/lifecycle/exit-gate-verifiers-provenance.test.js',
        'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js',
        'tests/unit/proving-companion/artifact-integrity-checker-provenance.test.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-artifact-gate.test.js',
      ],
      independent_verification: 'git-grepped for remaining hardcoded post-cutover literals in provenance tests: none found (the 2 date-literal hits are unrelated files -- michael calendar-read and eva-master-scheduler)',
    },
    open_items_carried_forward: ['GAP-1 (TS-10 live-query bound)', 'GAP-2 (chain fixture test)', 'GAP-3 (verifyLaunchUatReportLink dead reader)', 'GAP-4 remaining 4 sites', 'FR-5 mechanism deviation', 'FR-6 scope deviation', 'TS-9 partial', 'reality-gates block-mode untested'],
  },
  metadata: {
    validation_mode: 'plan_verify_followup',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    prd_id: 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    prior_row_id: PRIOR_ROW_ID,
    fix_commit: '433398b210f',
    measured: true,
    test_execution: {
      tests_executed: 8113,
      tests_passed: 8113,
      tests_failed: 0,
      tests_skipped: 24,
      test_files_passed: 635,
      mode: 'vitest run --project unit',
      note: 'Post-fix re-run executed independently by the validation agent (not accepted from the team-lead report): tests/unit/eva + tests/unit/proving-companion + scripts/modules/handoff/executors/lead-final-approval = 635 files passed, 4 skipped, 8113 tests passed, 24 skipped, 0 failed. The 24 skips are pre-existing (e.g. reality-gates URL-verification describe.skip); none introduced by this SD or by the fix commit.',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  probeExistsRelative: 'scripts/one-off/capa-001-g-validation-plan-verify-followup.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'validation-agent' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
