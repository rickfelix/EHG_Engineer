#!/usr/bin/env node
/**
 * One-off: GITHUB (DevOps Platform Architect) sub-agent evidence for
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B, PLAN_TO_LEAD phase.
 *
 * A validation-agent flagged this SD as missing required GITHUB evidence for the
 * PLAN-TO-LEAD handoff. This records the CI/PR-hygiene verification actually run
 * against PR #8253 at head 9b949fda7db.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B';
const PHASE = 'PLAN_TO_LEAD';

const findings = [
  {
    id: 'ci-status-healthy-zero-failures',
    severity: 'INFO',
    summary: 'PR #8253 at head 9b949fda7db: 48 checks total -- 45 SUCCESS, 1 SKIPPED (Agentic Review), 2 IN_PROGRESS (coverage, "Run Unit Tier (quarantine-aware)"), 0 FAILURE/ERROR/CANCELLED/TIMED_OUT. Measured via gh pr view 8253 --json statusCheckRollup. The two outstanding checks were confirmed NOT stuck: gh run view 33974236239/33974236319 --json status,headSha returns status=in_progress on the correct headSha 9b949fda7db, createdAt 2026-09-05T15:15:22Z. Every LEO-specific guard relevant to this change is already green, including "LEO Protocol Bypass Detection", "Validate SD Phase", "Validate Gate Weight Integrity", "Run Tests & Verify Stories", "require-main-guard-in-one-off-lint", "Security Review" and "Compliance Summary".',
  },
  {
    id: 'branch-and-base-hygiene-correct',
    severity: 'INFO',
    summary: 'Base branch is main (correct); head is feat/SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B; isDraft=false; state=OPEN. mergeable=MERGEABLE -- GitHub reports NO merge conflicts against main. mergeStateStatus=BLOCKED is attributable solely to the two still-running required checks, not to a conflict, a failing check, or a missing review. Branch is 5 commits behind / 2 ahead of origin/main (routine drift on a high-traffic repo; conflict-free per MERGEABLE).',
  },
  {
    id: 'exactly-one-pr-no-duplicates-or-stale',
    severity: 'INFO',
    summary: 'Confirmed exactly ONE PR exists for this SD. gh pr list --state all --head feat/SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B returns only #8253 (OPEN) -- no closed/merged predecessors, no superseded duplicates. gh pr list --state open --search SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B likewise returns only #8253. No stale-PR cleanup is required.',
  },
  {
    id: 'comment-only-config-claim-independently-verified',
    severity: 'INFO',
    summary: 'The PR body central claim -- "the config.js diff is comments only, no threshold value changes" -- was verified MECHANICALLY rather than accepted: stripping the +/- markers from git diff origin/main...HEAD -- scripts/modules/ai-quality-evaluator/config.js and filtering out lines matching ^(//|$) yields ZERO lines. Every one of the 27 added lines in config.js is a comment. The three live threshold literals (feature: {default:60, prd:65, retrospective:65}, security: {default:70, retrospective:75}, bugfix: {default:60, prd:65, retrospective:65}) appear only as unchanged context. This is a genuine zero-runtime-change docs commit.',
  },
  {
    id: 'commit-attribution-complete',
    severity: 'INFO',
    summary: 'Both commits on the branch (edb9db2e8c3 chore: LEAD/PLAN scope + PRD corrections; 9b949fda7db docs: record the three zero-flip pairs) are authored by Rick Felix <codestreetlabs@gmail.com> and each carries BOTH required trailers: "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>" and "Claude-Session: https://claude.ai/code/session_01Ff46Jhr1ouAttPQp4HRfXL". Commit messages are substantive and accurately describe the change, including the shadow-re-score vacuity reasoning.',
  },
  {
    id: 'refactoring-safety-protocol-not-triggered',
    severity: 'INFO',
    summary: 'Refactoring safety checks (>200 LOC delta in a single file, component extraction, file rename) do NOT apply here. The full diff is 4 files, 268 insertions, ZERO deletions -- purely additive. Largest single-file delta is 125 lines (a NEW one-off script). No file was renamed, split, or had code removed, so there is no feature-loss surface: the Browse Button / Disconnected Dialog incident class is structurally impossible for an additive comment-and-test diff.',
  },
  {
    id: 'pr-description-omits-232-loc-of-one-off-scripts',
    severity: 'MEDIUM',
    summary: 'PR DESCRIPTION ACCURACY GAP (non-blocking). The PR body characterizes the change as config.js comments + one new test assertion, and its "Also" section mentions only the added test pin. It never mentions the two one-off scripts the PR actually carries: scripts/one-off/lead-correct-scope-tuning-003-b.mjs (+107) and scripts/one-off/plan-correct-prd-tuning-003-b.mjs (+125). Those 232 lines are 87% of the 268-line diff. They are legitimate LEAD/PLAN DB-correction scripts consistent with repo convention (and pass require-main-guard-in-one-off-lint), so this is a completeness gap in the narrative, not a scope violation or a hidden runtime change. A reviewer reading only the body would under-estimate the diff by roughly 6x.',
  },
  {
    id: 'pr-size-exceeds-100-loc-target',
    severity: 'LOW',
    summary: 'Total diff is 268 insertions vs the 100 LOC PR-size target (max 400). Justification is adequate on the merits: 232 of the 268 lines are non-runtime one-off DB-correction scripts and 27 are comments, leaving 9 lines of actual test code. Well within the 400 ceiling and no runtime code changed, so the size guideline is satisfied in substance. Noted for completeness only.',
  },
];

const warnings = [
  {
    severity: 'MEDIUM',
    issue: 'Two required checks (coverage, "Run Unit Tier (quarantine-aware)") were still in_progress at evidence time, so the PR is not yet merge-eligible (mergeStateStatus=BLOCKED). This verdict certifies that NOTHING IS FAILING as of 2026-09-05T15:27Z -- it does not and cannot certify a final all-green CI result.',
    recommendation: 'Re-confirm both checks reached SUCCESS via gh pr checks 8253 immediately before merging. Do not treat this PASS as a substitute for terminal CI.',
  },
  {
    severity: 'MEDIUM',
    issue: 'The PR description does not disclose the two one-off .mjs scripts that make up 87% of the diff (232 of 268 lines).',
    recommendation: 'Add a one-line note to the PR body that it also includes the LEAD/PLAN DB-correction one-off scripts, so the description matches the diff a reviewer will actually see. Cosmetic; not a merge blocker.',
  },
];

const recommendations = [
  'MERGE-READY on hygiene grounds once the two in-flight checks land green: base=main, no conflicts, exactly one PR, both commits properly attributed, comment-only runtime surface independently verified.',
  'Do NOT merge from this sub-agent invocation -- CI is still running and merging is a later step in this SD own workflow, per the invoking lead explicit instruction.',
  'Optionally amend the PR body to mention the two one-off scripts (finding pr-description-omits-232-loc-of-one-off-scripts) before requesting review.',
];

const summary = 'GITHUB/CI verification for SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B at PLAN_TO_LEAD. PR #8253 (head 9b949fda7db) is healthy: 45 SUCCESS / 1 SKIPPED / 2 in_progress / 0 FAILURE, base=main, mergeable=MERGEABLE (no conflicts), isDraft=false, and exactly one PR exists for the branch with no stale or duplicate predecessors. Both commits carry the required Co-Authored-By and Claude-Session trailers. The PR body "comments only" claim about scripts/modules/ai-quality-evaluator/config.js was re-verified mechanically (zero non-comment added/removed lines) rather than accepted from the description. Refactoring-safety protocol is not triggered: the diff is 268 insertions and zero deletions across 4 files, so there is no feature-removal surface. Two non-blocking findings: the PR description omits the two one-off .mjs scripts that constitute 87% of the diff, and total size (268 LOC) exceeds the 100 LOC target though it is substantively 9 lines of test code plus comments and non-runtime scripts. VERDICT PASS, with the explicit limit that two required checks had not yet reported -- this certifies no failures at 2026-09-05T15:27Z, not terminal CI.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'GITHUB',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: PHASE,
      pr_number: 8253,
      pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/8253',
      head_sha: '9b949fda7db',
      base_ref: 'main',
      head_ref: 'feat/SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B',
      mergeable: 'MERGEABLE',
      merge_state_status: 'BLOCKED (pending required checks only)',
      check_rollup: { total: 48, success: 45, skipped: 1, in_progress: 2, failure: 0 },
      pending_checks: ['coverage', 'Run Unit Tier (quarantine-aware)'],
      open_prs_for_branch: 1,
      diffstat: { files: 4, insertions: 268, deletions: 0 },
      measured_at_utc: '2026-09-05T15:27:00Z',
      commands_run: [
        'gh pr view 8253 --json number,state,mergeable,mergeStateStatus,baseRefName,headRefName,title,isDraft,url',
        'gh pr view 8253 --json statusCheckRollup',
        'gh pr checks 8253',
        'gh run view 33974236239 --json status,conclusion,createdAt,headSha',
        'gh run view 33974236319 --json status,conclusion,createdAt,headSha',
        'gh pr list --state all --head feat/SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B',
        'gh pr list --state open --search SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B',
        'git diff origin/main...HEAD -- scripts/modules/ai-quality-evaluator/config.js',
        'git rev-list --left-right --count origin/main...HEAD',
        'git log origin/main..HEAD --format=%b (trailer verification)',
      ],
      merge_performed: false,
      merge_withheld_reason: 'CI still in_progress; merging is a later step in this SD own workflow, explicitly out of scope for this invocation.',
    },
    phase: PHASE,
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'GITHUB',
    SD_KEY,
    { name: 'GITHUB' },
    results,
    { sdKey: SD_KEY, phase: PHASE, source: 'manual' },
  );

  console.log('GITHUB EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved, '| registry_source:', stored.metadata?.registry_source);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
