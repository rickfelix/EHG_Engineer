#!/usr/bin/env node
/**
 * Persist VALIDATION evidence for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's PLAN-TO-LEAD handoff.
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the counts on this row are NOT
 * hand-typed. They are read at write time out of a vitest-written JSON report produced by THIS
 * sub-agent's own run, and that file's sha256 is stored on the row. Regenerate with:
 *
 *   npx vitest run \
 *     tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js \
 *     tests/unit/handoff/validators/sd-objectives-validator.test.js \
 *     --reporter=json --outputFile=.artifacts/validation/pattern-learn-151-plan-to-lead.json
 *
 * This row is DISTINCT from the LEAD_TO_PLAN VALIDATION row (3a71d8ce-4471-4e0d-a078-cd94867edf45):
 * it is a retrospective GATE 4 audit of delivered work, not a pre-approval duplicate check.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const ARTIFACT_PATH = '.artifacts/validation/pattern-learn-151-plan-to-lead.json';

const DELIVERABLE = 'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js';
const SIBLING = 'tests/unit/handoff/validators/sd-objectives-validator.test.js';
const GUARDED_FILE = 'scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js';

// Measured by this sub-agent, independently of EXEC's recorded values.
const GUARDED_SHA256 = '21e43166564e13ee5aaeaeba23426fb74290eaab1f35258f474e2c52d9185b66';
const GUARDED_BLOB = '9c6e901a020d68c5c0364d9057e1e29052043f7c';
const DELIVERABLE_SHA256 = '0f34ec67a7fe2703e1474e622fcc6235b451d9567960e802bec7068eb25e8258';
const DELIVERABLE_BLOB = '03125605b0b2fb7aa77c0aa5a7409909acaaff70';

function readRunnerArtifact() {
  const raw = readFileSync(ARTIFACT_PATH);
  const sha = createHash('sha256').update(raw).digest('hex');
  const report = JSON.parse(raw.toString('utf8'));
  return {
    sha,
    executed: report.numTotalTests,
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    skipped: report.numPendingTests ?? 0,
    suites: report.numTotalTestSuites,
    success: report.success,
  };
}

const summary =
  'CONDITIONAL_PASS -- all four PRD functional requirements are substantively satisfied and were ' +
  're-verified INDEPENDENTLY by this sub-agent (not read off EXEC\'s claims), but one material ' +
  'process finding blocks a clean PASS. ' +
  'FR-1 (staleness of 3 patterns) PASS: each cited fix commit is confirmed an ancestor of ' +
  'origin/main AND its content matches its pattern\'s issue_summary -- ancestry alone would have ' +
  'been a vacuous test since ANY February commit is an ancestor. d228da9dac7 ("use score threshold ' +
  'instead of zero-issues check in sdObjectivesDefined") answers PAT-LES-1a22954978cc (occ=45); ' +
  '0dd7e2735dd (50 EVA stage files instrumented) answers PAT-LES-7fd10bfaf89a ("no structured ' +
  'logging in any of the 5 stages"); d5f3ab7d22b (Phase 4 templates, stages 14-16) answers ' +
  'PAT-LES-e72314a404ae ("stage 14 missing security object") -- and lib/eva/stage-templates/stage-14.js ' +
  'in origin/main carries 9 authStrategy/dataClassification/complianceRequirements matches TODAY, ' +
  'so the fix is live in current main, not merely historically present. ' +
  'FR-2 (regression guard) PASS: re-ran both suites, 17/17 green from a runner artifact. Read the ' +
  'live validator source and confirmed the test asserts its REAL branch scores (0/30/35/65/70/100) ' +
  'with no reimplementation and no vi.mock. ' +
  'FR-3 (mutation proof) PASS, INDEPENDENTLY REPRODUCED as the AC explicitly requires of a ' +
  'VALIDATION sub-agent: applied the pre-fix mutant (`passed: score >= 30` -> ' +
  '`passed: issues.length === 0`), observed EXACTLY 1 failure (1 failed | 6 passed) and it was ' +
  'precisely the score-exactly-30 boundary case -- the only input shape that can discriminate the ' +
  'two formulas -- then restored the file and confirmed sha256 ' + GUARDED_SHA256 + ' and git blob ' +
  GUARDED_BLOB + ' are byte-identical to pre-mutation with an empty git diff. Zero mutation residue. ' +
  'FR-4 (duplicate consolidation) PASS: SD-...-152 is status=cancelled/phase=CANCELLED, and all ' +
  'three issue_patterns rows carry assigned_sd_id=...-151 with zero rows still pointing at 152. ' +
  'FINDING V1 (the reason this is not a PASS): the handoff premise states the work is ' +
  '"committed-but-unpushed", awaiting a batched final PR. IT IS NOT COMMITTED. The branch ' +
  'feat/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151 has ZERO commits (`git rev-list --count HEAD ' +
  '^origin/main` = 0; HEAD == merge-base 4ce339843b0; origin/main is 1 commit AHEAD). The SD\'s ' +
  'sole deliverable exists only as an UNTRACKED working-tree file. Batching a PR is a legitimate ' +
  'strategy; batching UNCOMMITTED work is a different and avoidable risk -- one `git clean -fd` or ' +
  'a worktree reap destroys the entire SD with no reflog to recover from. A local commit costs ' +
  'nothing and fully closes this. LEAD should not read "unpushed" as "safely stored".';

async function main() {
  const artifact = readRunnerArtifact();

  if (!artifact.success || artifact.failed > 0 || artifact.executed !== 17) {
    console.error(
      `REFUSING to write: runner artifact ${ARTIFACT_PATH} reports success=${artifact.success}, ` +
      `executed=${artifact.executed} (expected 17), failed=${artifact.failed}.`
    );
    process.exit(1);
  }

  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 94,
    findings: [
      {
        id: 'V1-deliverable-is-uncommitted-not-merely-unpushed',
        severity: 'HIGH',
        summary:
          'The stated premise "committed-but-unpushed" is FALSE as measured. The branch has ZERO ' +
          'commits (git rev-list --count HEAD ^origin/main = 0; HEAD == merge-base 4ce339843b0; ' +
          'origin/main is 1 ahead). `git log --all --grep=PATTERN-LEARN-151` returns nothing. The ' +
          'sole deliverable (' + DELIVERABLE + ', 99 lines) and all 7 evidence-writer one-offs are ' +
          'UNTRACKED. Untracked work is one `git clean -fd` / worktree reap from total loss with no ' +
          'reflog recovery. Remedy: commit locally now; keep the batched-PR plan unchanged.',
      },
      {
        id: 'V2-fr1-staleness-verified-by-content-not-just-ancestry',
        severity: 'INFO',
        summary:
          'All 3 cited fix commits are ancestors of origin/main AND their content matches their ' +
          'pattern\'s issue_summary. Ancestry alone is near-vacuous (any Feb commit qualifies), so ' +
          'each was additionally content-matched; for PAT-LES-e72314a404ae the fix was verified ' +
          'PRESENT IN CURRENT MAIN (lib/eva/stage-templates/stage-14.js, 9 matches for the security ' +
          'fields today), which is the stronger premise-against-main test.',
      },
      {
        id: 'V3-fr3-mutation-independently-reproduced',
        severity: 'INFO',
        summary:
          'Mutation test re-run by THIS sub-agent (FR-3 AC requires independent reproduction): the ' +
          'pre-fix mutant killed exactly 1 test (1 failed | 6 passed) and it was precisely the ' +
          'score-exactly-30 boundary case. Restore verified byte-identical (sha256 ' + GUARDED_SHA256 +
          ', blob ' + GUARDED_BLOB + '), git diff on the path empty. The guard is non-vacuous.',
      },
      {
        id: 'V4-fr4-consolidation-verified-both-directions',
        severity: 'INFO',
        summary:
          'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152: status=cancelled, current_phase=CANCELLED. All 3 ' +
          'issue_patterns rows (PAT-LES-1a22954978cc occ=45, PAT-LES-7fd10bfaf89a occ=1, ' +
          'PAT-LES-e72314a404ae occ=1) carry assigned_sd_id=' + SD_KEY + '. Queried in both ' +
          'directions -- zero rows remain assigned to 152.',
      },
      {
        id: 'V5-no-scope-creep-test-only',
        severity: 'INFO',
        summary:
          'Delivered scope == approved scope. Exactly one deliverable path (tests/unit/handoff/' +
          'validation/), zero tracked production files modified anywhere in the tree. No feature, ' +
          'route, migration or dependency was added. Blast radius zero; LEAD needs no rollback plan.',
      },
      {
        id: 'V6-github-subagent-not-yet-executed',
        severity: 'MEDIUM',
        summary:
          'GATE 4 sub-agent coverage: LEAD_TO_PLAN VALIDATION+EXPLORE, PLAN_PRD DESIGN/SECURITY/RISK/' +
          'DATABASE/STORIES, PLAN_TO_EXEC TESTING, EXEC_TO_PLAN TESTING+SECURITY are all present ' +
          '(13 rows). GITHUB (CI/CD verification) has NOT executed -- unavoidable while there is no ' +
          'commit and no PR, which makes it a downstream consequence of finding V1. RETRO is ' +
          'expected in the post-completion tail. Neither blocks PLAN-TO-LEAD; both must land before ' +
          'the SD is called done.',
      },
      {
        id: 'V7-patterns-resolved-before-completion-with-no-notes',
        severity: 'LOW',
        summary:
          'All 3 issue_patterns rows are already status=resolved while the SD sits at ' +
          'PLAN_VERIFICATION, and each has resolution_date=NULL and resolution_notes=NULL. FR-4\'s ' +
          'AC only requires assigned_sd_id, so this is not a gate failure, but a resolved pattern ' +
          'with no notes and no date loses the "why" for the next /learn reader -- two of these ' +
          'were stale-by-prior-commit, which is exactly the context worth recording.',
      },
    ],
    warnings: [
      'Finding V1 is the one item LEAD must not gloss: "unpushed" in the handoff narrative reads as ' +
      '"committed locally, just not on the remote". Measured, there is no commit at all.',
      'Residual (pre-existing, out of scope): the score>=30 threshold still lives in TWO unconnected ' +
      'files (gate-l-sd-creation.js and validators/sd-objectives-validator.js), "kept in sync" by ' +
      'comment convention only. Both are now individually guarded, so divergence would be caught, ' +
      'but the duplication remains latent drift risk.',
    ],
    recommendations: [
      'Commit the worktree locally BEFORE proceeding to LEAD-FINAL-APPROVAL. This preserves the ' +
      'batched-single-PR plan verbatim while removing the discard-to-zero risk. This is the only ' +
      'action needed to turn this CONDITIONAL_PASS into a PASS.',
      'Run the GITHUB sub-agent once the commit/PR exists, so GATE 4 coverage is complete before ' +
      'the SD is marked done.',
      'When the closure loop finalises the 3 patterns, write resolution_notes recording that ' +
      'PAT-LES-7fd10bfaf89a and PAT-LES-e72314a404ae were stale-on-arrival (fixed by 0dd7e2735dd / ' +
      'd5f3ab7d22b) and only PAT-LES-1a22954978cc produced new code, so a future /learn run does not ' +
      're-mint them.',
      'Optional follow-up SD: collapse the duplicated score>=30 threshold into one shared helper ' +
      'consumed by both validator files, replacing the sync-by-comment convention with shared code.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_LEAD_VALIDATION_GATE4_AUDIT',
      review_method:
        'independent re-verification: re-ran both suites to a NEW runner artifact; re-applied and ' +
        'reverted the FR-3 mutant first-hand; read the live validator source to confirm the test ' +
        'asserts real branch behaviour; content-matched each FR-1 commit against its pattern ' +
        'issue_summary and against current origin/main; queried the consolidation state in both ' +
        'directions; measured branch commit count rather than trusting the handoff narrative',
      measured: true,
      distinct_from_lead_to_plan_row: '3a71d8ce-4471-4e0d-a078-cd94867edf45',
      test_execution: {
        executed: artifact.executed,
        passed: artifact.passed,
        failed: artifact.failed,
        skipped: artifact.skipped,
        suites: artifact.suites,
        success: artifact.success,
        runner: 'vitest 4.1.4',
        artifact_path: ARTIFACT_PATH,
        artifact_sha256: artifact.sha,
        source: 'fresh',
      },
      test_files_executed: [DELIVERABLE, SIBLING],
      fr_verdicts: {
        'FR-1_patterns_stale': 'PASS (ancestry + content match + present-in-current-main)',
        'FR-2_regression_guard': 'PASS (17/17 from runner artifact; real registry, no mocks)',
        'FR-3_mutation_proof': 'PASS (independently reproduced: 1 failed | 6 passed, boundary case; clean restore)',
        'FR-4_duplicate_consolidation': 'PASS (152 cancelled; 3/3 patterns reassigned; 0 left on 152)',
      },
      mutation_test_independent_reproduction: {
        mutant: 'passed: score >= 30  ->  passed: issues.length === 0',
        target_file: GUARDED_FILE,
        result: '1 failed | 6 passed (7)',
        killed_by: 'PAT-AUTO-b6e88bcc boundary: 0 objectives + success_metrics present (score exactly 30)',
        restored_sha256: GUARDED_SHA256,
        restored_git_blob: GUARDED_BLOB,
        restore_byte_identical: true,
        git_diff_on_path_empty: true,
      },
      deliverable_integrity: {
        path: DELIVERABLE,
        sha256: DELIVERABLE_SHA256,
        git_blob: DELIVERABLE_BLOB,
        tracked_by_git: false,
        committed: false,
      },
      git_state: {
        branch: 'feat/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
        head_sha: '4ce339843b0c9eef8d2c2c6a95cf963ac9db59cb',
        merge_base_with_origin_main: '4ce339843b0c9eef8d2c2c6a95cf963ac9db59cb',
        commits_ahead_of_origin_main: 0,
        origin_main_ahead_by: 1,
        commits_mentioning_sd_anywhere: 0,
        deliverable_state: 'UNTRACKED (not committed, not staged)',
        premise_in_handoff: 'committed-but-unpushed',
        measured_reality: 'UNCOMMITTED - premise is false',
        production_files_modified: 0,
      },
      subagent_coverage_gate4: {
        present: ['VALIDATION', 'EXPLORE', 'DESIGN', 'SECURITY', 'RISK', 'DATABASE', 'STORIES', 'TESTING'],
        rows_total: 13,
        missing: ['GITHUB (blocked by absence of commit/PR)', 'RETRO (expected post-completion)'],
      },
      consolidation_state: {
        'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-152': { status: 'cancelled', current_phase: 'CANCELLED' },
        patterns: {
          'PAT-LES-1a22954978cc': { assigned_sd_id: SD_KEY, status: 'resolved', occurrence_count: 45 },
          'PAT-LES-7fd10bfaf89a': { assigned_sd_id: SD_KEY, status: 'resolved', occurrence_count: 1 },
          'PAT-LES-e72314a404ae': { assigned_sd_id: SD_KEY, status: 'resolved', occurrence_count: 1 },
        },
        rows_still_assigned_to_152: 0,
      },
      duplicate_check: 'No duplicate implementation risk: deliverable is test-only and guards a code path that had no direct test. The sibling suite covers a DIFFERENT file; this is complementary coverage, not duplication.',
      e2e_applicable: false,
      e2e_exemption_reason:
        'Test-only deliverable guarding a pure scoring function in a Node-side handoff validator ' +
        'registry. No UI surface, route or user journey exists for this change.',
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
      prd_id: 'PRD-SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
      runner_artifact: { path: ARTIFACT_PATH, sha256: artifact.sha, success: artifact.success },
      gate_verdict: 'GATE 4 (PLAN Verification) -- PASS ON SCOPE, CONDITIONAL ON DURABILITY',
      blocking: false,
      condition_to_clear: 'Commit the worktree locally before LEAD-FINAL-APPROVAL.',
    },
    phase: 'PLAN_TO_LEAD',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'Principal Systems Analyst (VALIDATION)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_LEAD' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  test_execution:', JSON.stringify(stored.metadata?.test_execution));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
