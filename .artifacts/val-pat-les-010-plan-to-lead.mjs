#!/usr/bin/env node
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PAT-LES-010';

const summary = [
  'PLAN_TO_LEAD verification pass: all 3 PRD FRs independently confirmed delivered on branch',
  'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-010 (single commit 5ac5947c82f, +262 LOC, 0 production-code lines changed).',
  'FR-1 (verification) re-verified FIRST-HAND, not accepted from the prior LEAD-TO-PLAN rows: repo-wide grep for',
  '"stage22Data.promotion_gate" across lib/scripts/tests/src returns ZERO live-code hits (only this SD own',
  'one-off documentation scripts and the new test own title); all 12 live "evaluateKillGate(" sites',
  '(stage-03/05/13.js + their analysis steps + venture-state-machine/stage-gates.js) take either a destructured',
  'object or (supabase, ventureId, fromStage, toStage, options) -- none carries a stage22Data positional param.',
  'FR-2 (regression guard) verified BY EXECUTION AND BY MUTATION, independently of the earlier TESTING pass:',
  'npx vitest run => 17/17 passing; then I appended the exact fragile shape to lib/eva/stage-templates/stage-24.js',
  'and re-ran => exactly 1 failed / 16 passed, the failure being the guard itself with AssertionError "expected ...',
  'not to match /stage22Data\\.promotion_gate/"; worktree reverted clean afterwards (git status empty). The guard is',
  'therefore NOT zero-yield-by-construction. REPO_ROOT is derived from the test file own __dirname',
  '(resolve(__dirname, "../../../../")), so it guards THIS worktree files, and a deleted/renamed target file makes',
  'readFileSync throw (fail-loud, not silent-pass).',
  'FR-3 (SD record corrected) confirmed in the DB: title, description, scope, key_changes(1), smoke_test_steps(2)',
  'and metadata.mechanism_verifications(4 file:line citations) all reflect the narrow verified outcome.',
  'HONESTY CHECK PASSED: the record does not overclaim. Title says "verify stale kill-gate defect + add regression',
  'guard (defect already superseded)"; description carries an explicit "LEAD Verification Against Current Main"',
  'section stating the described code no longer exists and "no fix is needed for it directly"; scope explicitly',
  'lists re-implementing the original check as OUT OF SCOPE. Nothing in the record claims the originally-described',
  'defect was fixed.',
  'DUPLICATE CHECK CLEAN: issue_patterns PAT-LES-a7862f7339c4 has assigned_sd_id = this SD and occurrence_count 1;',
  'a scan of strategic_directives_v2 (title/description/scope ilike the pattern id, plus sd_key ilike %PAT-LES-010%)',
  'returns exactly one SD -- this one. No overlapping or duplicate SD exists.',
].join(' ');

const findings = [
  {
    id: 'V1-guard-assertion-over-broad',
    severity: 'MEDIUM',
    summary: [
      'ADVISORY, non-blocking: the guard SECOND assertion, expect(source).not.toMatch(/evaluateKillGate\\s*\\(/),',
      'bans a function NAME that is the repo own established SAFE convention -- stage-03.js, stage-05.js and',
      'stage-13.js each export an evaluateKillGate({...}) taking a destructured object, which is precisely the',
      'non-fragile shape. The defect PAT-LES-a7862f7339c4 described was the POSITIONAL stage22Data param and the raw',
      'boolean read, not the function name. Since stage-24 is literally the "Launch Readiness Kill Gate" stage, a',
      'future author adopting the standard object-param evaluateKillGate there would trip this guard spuriously and',
      'would most likely delete the whole test block -- taking the genuinely valuable stage22Data.promotion_gate',
      'assertion with it. Recommend narrowing to the stage22Data shape (or asserting the positional-param signature)',
      'so the guard cannot fire on the safe convention. Accurate today; does not block the handoff.',
    ].join(' '),
  },
  {
    id: 'V2-pattern-row-still-assigned',
    severity: 'LOW',
    summary: [
      'FOLLOW-THROUGH for LEAD final approval: issue_patterns.PAT-LES-a7862f7339c4 is still status="assigned" with',
      'resolution_date and resolution_notes NULL. The pattern is substantively closed (verified superseded + guarded),',
      'but until the row is moved to resolved with notes recording "defect superseded by refactor; closed via',
      'regression guard", /learn can re-surface this pattern and mint a duplicate SD-LEARN-FIX-* for code that does',
      'not exist -- re-spending the effort this SD just spent. Close the row as part of LEAD-FINAL-APPROVAL.',
    ].join(' '),
  },
  {
    id: 'V3-commit-prefix-cosmetic',
    severity: 'INFO',
    summary: [
      'Cosmetic only: the commit is prefixed fix(SD-LEARN-FIX-ADDRESS-PAT-LES-010) although no production code changed',
      '(the 4 changed files are 1 test + 3 scripts/one-off DB scripts). The commit BODY is fully honest -- it opens',
      'with "The pattern described defect ... no longer exists -- superseded by an unrelated refactor" and explains',
      'why a guard was shipped instead of a reimplementation. No misrepresentation; noted for completeness only.',
    ].join(' '),
  },
];

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 94,
    findings,
    warnings: [findings[0].summary, findings[1].summary],
    recommendations: [
      'LEAD: approve. All 3 FRs delivered and independently re-verified (grep + execution + mutation + DB read).',
      'LEAD-FINAL-APPROVAL: close issue_patterns PAT-LES-a7862f7339c4 (status->resolved + resolution_notes) so /learn cannot mint a duplicate SD for this superseded defect.',
      'Optional follow-up (not this SD): narrow the guard evaluateKillGate( assertion to the stage22Data positional shape so it cannot fire on the repo safe object-param convention.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'PLAN_TO_LEAD_VALIDATION',
      prior_evidence_row: '7744eca8-2090-4905-8a59-805b296c437e',
      commit_reviewed: '5ac5947c82fdcb0c74b48843d410dcd290d6274b',
      branch: 'feat/SD-LEARN-FIX-ADDRESS-PAT-LES-010',
      fr_verdicts: { 'FR-1': 'PASS', 'FR-2': 'PASS', 'FR-3': 'PASS' },
      verification_methods: [
        'independent repo-wide grep (stage22Data.promotion_gate => 0 live hits)',
        'independent evaluateKillGate( call-site signature audit (12 sites, none positional stage22Data)',
        'test execution: npx vitest run => 17/17 passing',
        'independent MUTATION test: injected fragile shape into stage-24.js => 1 failed/16 passed, guard fired; reverted clean',
        'DB read of strategic_directives_v2 (FR-3 fields) and product_requirements_v2 FRs',
        'duplicate scan: issue_patterns.assigned_sd_id + SD title/description/scope ilike pattern id',
      ],
      files_reviewed: [
        'tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js',
        'lib/eva/stage-templates/stage-23.js',
        'lib/eva/stage-templates/stage-24.js',
        'lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js',
        'scripts/one-off/update-scope-pat-les-010.mjs',
        'scripts/one-off/add-mechanism-verifications-pat-les-010.mjs',
      ],
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: process.cwd(),
      honesty_check: 'PASS - record frames delivery as verification + guard, never as a fix to the described defect',
      duplicate_check: 'CLEAN - exactly one SD references PAT-LES-a7862f7339c4',
    },
    phase: 'PLAN_TO_LEAD',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_KEY,
    { name: 'Principal Systems Analyst' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN_TO_LEAD' }
  );

  console.log('EVIDENCE ROW ID:', stored.id);
  console.log('verdict:', stored.verdict, '| confidence:', stored.confidence, '| phase:', stored.phase);
  console.log('repo_path:', stored.metadata?.repo_path);
  console.log('executed_from_cwd:', stored.metadata?.executed_from_cwd);
  console.log('repo_resolved:', stored.metadata?.repo_resolved);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
