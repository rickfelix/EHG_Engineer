#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G — VALIDATION sub-agent, PLAN-phase VERIFY.
 *
 * Records the findings from the Task-tool validation-agent run into
 * sub_agent_execution_results via the canonical writer (resolveSubAgentRepo +
 * applySubAgentRepoVerdict + storeSubAgentResults) -- the agent itself does not write the row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  phase: 'PLAN',
  execution_time_ms: 0,
  summary: "PLAN-phase VERIFY of SD-G's implementation, re-derived from the current code on feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G rather than from prior claims. FR-1 PASS (both the dedup-UPDATE and the unique-violation-fallback SELECTs widened 'id' -> 'id, metadata', both UPDATE payloads spread-merge under existing metadata, fresh-INSERT metadata assignment made unconditional; 13 tests). FR-2 PASS and independently re-verified LIVE: all 3 bypass writers now call writeArtifact() with skipDedup:true (preserving each file's own mark-stale-then-insert versioning) and producer set to the module name; I queried venture_stages.required_artifacts UNION gate_boundary_config.required_artifacts myself (union=46 today) and confirmed all 6 converted types ARE in that union while EVERY remaining unconverted raw venture_artifacts writer in lib/ (deviation-ledger build_deviation_record, stitch-vision-qa/stitch-wireframe-qa stitch_qa_report, exec-boundary-readiness launch_deployment_runbook, stage-21 visual_final_assets + visual_assets_skipped, stage-22 distribution_block_marker) emits ZERO types in that union -- so the FR-2 scope boundary is measured, not asserted. FR-3 PASS with a premise correction. FR-4 PASS. FR-5 CONDITIONAL: 4 of the 5 non-verifier read sites genuinely widen their SELECT and call the shared grader, but exit-gate-verifiers.js's 10 sites are deliberately NOT widened -- provenance is graded by a separate additive re-query (checkGateProvenance) dispatched from the enforcer. I checked VERIFIER_ARTIFACT_TYPES against every venture_artifacts read in that file and the coverage is complete (10 read sites, 12 map entries, readCodeQualityReport shared by 3 verifiers), so the outcome is equivalent even though the mechanism differs from the AC's literal wording. FR-6 CONDITIONAL: the venture_artifacts predicate is genuinely upgraded to the cutover-aware hash-verified model, but the uat_test_runs predicate is deliberately NOT upgraded (documented rationale: its evidence_hash presence check was already real), against an AC that says 'both predicates are upgraded'. The launch_uat_report -> uat_test_runs hash-link IS wired end-to-end -- I traced every hop (uat-robustness-gate returns run_id structurally on all 10 return branches -> stage-23-dedicated-venture-uat sets metadata.uat_test_run_id + runId -> eva-orchestrator's typed_artifacts branch no longer drops them -> persistArtifacts passes the array through intact -> writeArtifactBatch forwards metadata/runId -> writeArtifact stamps machine_provenance.run_id = the real uat_test_runs.id). TR-7 PASS (one branch, 4 commits, writer + all consumers + tests together). Tests: 745 files / 9449 tests passed, 0 failed, across the full tests/unit/eva + tests/unit/proving-companion suites (622 files, 7911 tests) and the scripts/modules/handoff + co-located lib/eva + lib/proving-companion + artifact integration sweep (123 files, 1538 tests). No regressions. Four real gaps found, none of which can cause a silent wrong-block (the rollout is advisory by default at every wired reader, and the one non-env-gated reader, acceptance-artifact-gate.js, is itself observe-only unless ACCEPTANCE_ARTIFACT_GATE_BINDING=true).",
  critical_issues: [],
  warnings: [
    "GAP-1 (FR-5 AC-3 / TR-4 / PRD AC#6) NOT IMPLEMENTED: no test or CI predicate asserts the artifact-type bound over the live query (venture_stages.required_artifacts UNION gate_boundary_config.required_artifacts). TS-10 is uncovered. Mitigating: I grepped and confirmed no hardcoded '46'/'45' exists anywhere in the new test or CI code either, and I verified the live union is 46 myself -- so today's state is correct but unguarded; the next required_artifacts edit has nothing to catch it.",
    "GAP-2 (FR-6 AC-1 / TS-8) NOT COVERED: no test exercises BOTH acceptance-artifact-gate.js predicates together on one fixture chain (a launch_uat_report row hash-linked to its uat_test_runs row). The suite has separate venture_artifacts and uat_test_runs fixtures; the chain that FR-6's rationale rests on is never asserted end-to-end.",
    "GAP-3 DEAD READER: verifyLaunchUatReportLink() (lib/eva/venture-artifact-provenance.js:86) is exported and has 4 unit tests but ZERO production call sites (git-grepped repo-wide). The launch_uat_report -> uat_test_runs link is produced and is provable, but nothing in any gate path actually proves it at runtime. This is the consumer-only-discriminator shape: a reader that reads as a working feature while no writer's output is ever checked by it.",
    "GAP-4 ADVISORY OUTPUTS COMPUTED THEN DROPPED: all five advisory fields -- provenance_warnings (reality-gates.js, exit-gate-enforcer.js, artifact-integrity-checker.js) and provenanceWarnings (stage-artifact-precondition.js, stage-23-launch-readiness.js preflightUpstream) -- have ZERO consumers repo-wide. advanceStage() reads only gateResult.allowed/blocked_by/gates_checked and discards provenance_warnings; nothing logs them to system_events, persists them, or surfaces them. TR-6's stated exit criterion is 'flipped to block only after a clean readback against live venture data', but no code path makes the read-side findings observable. Side effect: checkGateProvenance() issues an extra venture_artifacts query per artifact-backed gate per stage advance for a result that is thrown away.",
    "LIVE-STATE FINDING (PRD AC#1 unmet): the required live AltifyAI write + readback has NOT been performed. Measured by me at 2026-09-13T22:26Z against the live project: venture_artifacts has 7972 rows, 0 carry metadata.machine_provenance, and 0 rows exist at/after VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT (2026-09-13T21:00:00.000Z). The stamp has only ever run against mocks.",
    "CUTOVER RACE: the cutover constant (2026-09-13T21:00:00.000Z) was already ~85 minutes in the PAST when I measured, while the branch is unmerged. Any venture artifact written by main's unstamped code between 21:00Z and merge becomes a permanently-ABSENT post-cutover row that no lenient grading will rescue. Currently zero such rows exist, so there is no damage yet -- but the exposure grows with time-to-merge.",
    "FR-3 PREMISE CORRECTION (honestly documented by EXEC, not hidden): through writeArtifact(), deriveContent() always backfills content from artifactData, so hash_source is effectively ALWAYS 'content' for new writes; the 'artifact_data' branch is reachable only when content AND artifactData are both null, in which case computeContentHash(null) is a constant that verifies vacuously. PRD AC#4/TS-5 ('content NULL, artifact_data populated, hash verifies against artifact_data') is therefore satisfied at the buildMachineProvenance() primitive level -- which is tested directly -- but is NOT reachable through any real writeArtifact() path, because the dual-write hardening makes that state impossible for new rows. The PRD's premise was about the LEGACY corpus shape, which the reader-side grader does handle.",
    "FR-5 MECHANISM DEVIATION (documented, outcome-equivalent): exit-gate-verifiers.js's 10 read sites are not widened to select metadata as the AC literally requires; grading happens in a separate additive re-query instead. I verified coverage is complete, but PLAN should ratify the deviation explicitly rather than inherit it silently.",
    "FR-6 SCOPE DEVIATION (documented): the uat_test_runs hasProvenance predicate was deliberately left unchanged against an AC reading 'Both predicates are upgraded in the same change'. Defensible engineering judgment; still a deviation PLAN should accept on the record.",
    "TS-9 PARTIAL: checkGateProvenance() has an explicit degrade-to-[] test for query error / missing client (fail-open by construction), and the pre-existing fail-open postures at stage-artifact-precondition.js and preflightUpstream are tested. But no NEW test proves a fail-CLOSED site stays closed under a DB-error condition with provenance wired.",
    "reality-gates.js block-mode is UNTESTED: the VENTURE_ARTIFACT_PROVENANCE_MODE==='block' branch (line 457) has no test. I hand-verified the mechanism is correct (pushing into result.reasons does flip passed=false via the 'any reason blocks' rule at line 526), but the flag is read at module load into a const, so flipping it in a test needs vi.resetModules + stubEnv -- currently the block path is untested code.",
    "MINOR PERF: stage-artifact-precondition.js now selects metadata + artifact_data + content on a path that runs on every stage advance; artifact_data/content can be large. Advisory-only benefit, real payload cost.",
  ],
  recommendations: [
    "Before merge: either move VENTURE_ARTIFACT_PROVENANCE_CUTOVER_AT forward to a timestamp safely after the expected merge, or merge promptly -- every hour the constant sits in the past on an unmerged branch is an hour in which a venture write creates a permanently-ABSENT row. Zero such rows exist right now, so this is cheap to close today and impossible to fix retroactively.",
    "Perform the PRD AC#1 live write + readback against AltifyAI (one writeArtifact() call per writer path + a SELECT of metadata->machine_provenance) and attach the readback output as evidence. The stamp has never executed against the real DB.",
    "Close GAP-1 with the TS-10 test the PRD specifies: assert the bound over the live UNION query, with no literal count. It is the only guard against a future required_artifacts edit silently moving the scope boundary.",
    "Close GAP-3 by either wiring verifyLaunchUatReportLink() into a real reader (the natural site is acceptance-artifact-gate.js's venture_artifacts branch for launch_uat_report rows) or removing it -- an exported, tested, uncalled verifier reads as a working feature to every future maintainer.",
    "Close GAP-4 by giving the advisory findings ONE observation surface (e.g. exit-gate-enforcer already writes system_events for observe-only gates -- adding provenance_warnings to that existing payload is a small change) so TR-6's 'clean readback' criterion is something the code can actually produce.",
    "Add the GAP-2 chain fixture test: one launch_uat_report row whose machine_provenance.run_id resolves to a real uat_test_runs row, asserted through both predicates in the same test.",
    "PLAN: explicitly ratify the two documented deviations (FR-5's separate-re-query mechanism at exit-gate-verifiers.js, FR-6's unchanged uat_test_runs predicate) in the PLAN-TO-LEAD handoff rather than letting them pass unremarked.",
  ],
  detailed_analysis: {
    verified_files: [
      'lib/eva/artifact-content-hash.js', 'lib/eva/artifact-versioning.js', 'lib/eva/artifact-persistence-service.js',
      'lib/eva/venture-artifact-provenance.js', 'lib/eva/reality-gates.js', 'lib/eva/stage-artifact-precondition.js',
      'lib/eva/uat-robustness-gate.js', 'lib/eva/eva-orchestrator.js', 'lib/eva/eva-orchestrator-helpers.js',
      'lib/eva/lifecycle/exit-gate-verifiers.js', 'lib/eva/lifecycle/exit-gate-enforcer.js',
      'lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js',
      'lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js',
      'lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-dedicated-venture-uat.js',
      'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
      'lib/proving-companion/artifact-integrity-checker.js',
      'scripts/modules/handoff/executors/lead-final-approval/gates/acceptance-artifact-gate.js',
    ],
    fr_verdicts: {
      'FR-1': 'PASS — both SELECTs widened to id,metadata; both UPDATEs spread-merge; fresh-INSERT stamp unconditional; 3/3 ACs test-covered.',
      'FR-2': 'PASS — 3 writers converted, skipDedup:true preserves prior versioning, producer = module name (TR-3); scope boundary re-verified LIVE against the 46-type union.',
      'FR-3': 'PASS with premise correction — all 4 write paths stamp; hash_source is always content in practice (see warnings).',
      'FR-4': 'PASS — cutover constant mirrors both cited precedents; every wired reader short-circuits pre-cutover rows; tested at 5/5 readers.',
      'FR-5': 'CONDITIONAL — 4 non-verifier sites widened+graded; exit-gate-verifiers 10 sites graded by separate re-query (complete coverage, different mechanism); AC-3 live-query bound assertion NOT implemented.',
      'FR-6': 'CONDITIONAL — venture_artifacts predicate genuinely upgraded and hash-link wired end-to-end; uat_test_runs predicate deliberately unchanged; chain-fixture test and a production caller for verifyLaunchUatReportLink both absent.',
      'TR-7': 'PASS — single atomic branch: writer, all consumers, and tests together.',
    },
    live_measurements: {
      measured_at: '2026-09-13T22:26Z',
      gate_read_union_size: 46,
      union_source: 'venture_stages.required_artifacts UNION gate_boundary_config.required_artifacts (queried live, anyOf groups flattened)',
      fr2_types_all_in_union: true,
      unconverted_raw_writers_in_union: 0,
      venture_artifacts_total_rows: 7972,
      rows_with_machine_provenance: 0,
      rows_at_or_after_cutover: 0,
      cutover_at: '2026-09-13T21:00:00.000Z',
    },
    regression_sweep: {
      suites: ['tests/unit/eva/**', 'tests/unit/proving-companion/**', 'scripts/modules/handoff/**', 'lib/eva/** (co-located)', 'lib/proving-companion/** (co-located)', 'tests/integration/venture-artifact-pipeline.test.js', 'tests/integration/artifact-gate.test.js'],
      regressions_found: 0,
      note: 'One genuine regression (stage-22-spend-approval.test.js supabase stub broken by FR-2 routing) was found by the TESTING sub-agent at EXEC-TO-PLAN and fixed in commit 6e123061b94; it is green in this run.',
    },
  },
  metadata: {
    validation_mode: 'plan_verify',
    branch: 'feat/SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    prd_id: 'PRD-SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-G',
    measured: true,
    test_execution: {
      tests_executed: 9449,
      tests_passed: 9449,
      tests_failed: 0,
      tests_skipped: 28,
      test_files_passed: 745,
      mode: 'vitest run --project unit',
      note: 'Two sweeps: (1) tests/unit/eva + tests/unit/proving-companion = 622 files / 7911 passed / 24 skipped; (2) scripts/modules/handoff + co-located lib/eva + lib/proving-companion + 2 artifact integration suites = 123 files / 1538 passed. All 14 test files changed by this SD pass. The 24+4 skips are pre-existing (e.g. reality-gates URL-verification describe.skip), none introduced by this SD.',
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  probeExistsRelative: 'scripts/one-off/capa-001-g-validation-plan-verify.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'validation-agent' }, results, {
  sdKey: SD_KEY,
  phase: 'PLAN',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
