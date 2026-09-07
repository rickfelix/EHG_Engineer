import dotenv from 'dotenv'; dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD_UUID = '89c9c119-611f-4801-bf19-9a9d98751bfe';
const SD_KEY = 'SD-LEO-INFRA-DRIVE-SCORE-LEG4-001';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('target_application')
  .eq('id', SD_UUID)
  .single();

const results = {
  verdict: 'PASS',
  confidence: 92,
  execution_time_ms: 0,
  timestamp: new Date().toISOString(),
  summary: [
    'All 5 requested checks PASS with runtime + byte-level evidence.',
    'EARNING_POINTS matches ratification be6e9d73 exactly (TIGHT=2, DEFICIT=1, SURPLUS=1, DEFICIT-URGENT=0, frozen);',
    'be6e9d73 is cited in the JSDoc immediately preceding the export and in both the runtime predicate and limitation strings.',
    'LADDER_DISTANCE and its ladder_distance emission are byte-identical to pre-SD (md5 a2ec0a37 / 3ecedebd on both sides) and still marked NOT RATIFIED.',
    'The `earning` parameter is injectable, verified at runtime (override TIGHT->99 yields 99; the default is not polluted).',
    'HEALTHY_VERDICTS is fully removed, not aliased (module exports are exactly EARNING_POINTS, LADDER_DISTANCE, LEG_ID, LEG_POINTS, VERDICTS, scoreLeg4; the `in` check is false); zero executable references remain repo-wide.',
    'leg1/leg2 and every other file in lib/drive-loop/score/ are UNCHANGED.',
    'Tests: 148/148 pass across the 5 touched test files; 329/329 pass across 23 files in tests/unit/drive-loop.',
  ].join(' '),
  critical_issues: [],
  warnings: [
    {
      issue: 'PRD FR-4 and SD success_criteria[3].measure both state the diff is restricted to lib/drive-loop/score/leg4-capacity.js and tests/unit/drive-loop/score/leg4-capacity.test.js ONLY, but the merged diff (PR #8370 plus follow-up 43b5d9277c7) touches 6 files: 4 additional test files (belt-verdict.test.js, capacity-verdict-store.test.js, drive-loop/drive-score-gradient-historical.test.js, cron/drive-report-sweep.test.js).',
      severity: 'LOW',
      recommendation: 'Reconcile the PRD/SD narrative file list with the merged diff at LEAD approval. VERIFIED NOT SCOPE CREEP: belt-verdict.test.js and capacity-verdict-store.test.js imported HEALTHY_VERDICTS directly (they would fail at import time), and the other two asserted the old binary point values. All four were consequentially required by the rename. The BINDING acceptance criterion for FR-4 and success_criteria[3] (zero leg1/leg2 files) PASSES.',
    },
    {
      issue: 'The old `healthy:` parameter name is now silently inert rather than throwing. A stale caller passing healthy: [TIGHT] receives the ratified default (verified: SURPLUS scores 1, the correct ratified value) instead of a TypeError.',
      severity: 'LOW',
      recommendation: 'Benign in practice: the outcome is the CORRECT ratified default, and a repo-wide git grep confirms zero remaining callers pass `healthy:`. Note the PRD risk-register mitigation asked for a rename "so a stale caller fails loudly (TypeError)" -- a rename does not actually produce a TypeError, it produces a silent fallback. TR-2 requirement text is satisfied by the rename branch it explicitly offers, but the stated failure mode was not achieved. No action required unless an external consumer is later added.',
    },
    {
      issue: 'The LADDER_DISTANCE JSDoc is now stale prose: it describes ffebbd68 as authorizing a gradient "in place of leg4 binary TIGHT-only earning rule", but that binary rule no longer exists.',
      severity: 'LOW',
      recommendation: 'Correct-by-spec, not a defect: FR-1 AC3 required byte-identity, which forced the stale wording to remain. Flagged so a future reader is not confused. Fix in a later SD if desired.',
    },
    {
      issue: 'The ffebbd68 acceptance predicate (at least 3 distinct drive_score values across 10 consecutive drive_reports rows) is proven ONLY at unit level (3 distinct values: 2, 1, 0), never live.',
      severity: 'MEDIUM',
      recommendation: 'CORRECTLY DISCLOSED, not fabricated -- SD success_criteria[1] and [2] both name this as DEFERRED and name the blocker: database/chairman-gated/20260807_belt_capacity_verdicts.sql is still chairman-gated-unapplied and outside this SD authority to self-apply. PRD AC5 satisfied. The coordinator must record the live 10-row read after an operator applies that migration; do not mark the live criterion met before then.',
    },
    {
      issue: 'PRD PRD-SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 is status=in_progress / phase=exec with a 5/5 unchecked validation_checklist, while the SD row is current_phase=PLAN_VERIFICATION with progress=0, despite PR #8370 being MERGED at 2026-09-06T19:08:47Z.',
      severity: 'LOW',
      recommendation: 'DB/code state mismatch on the process rows (not the implementation). Reconcile PRD status/phase and SD progress during the PLAN-to-LEAD handoff.',
    },
  ],
  recommendations: [
    'Approve the implementation. All five validation checks pass on runtime evidence, not inspection alone.',
    'Reconcile the PRD FR-4 / SD success_criteria[3] narrative file list with the 6-file merged diff before LEAD approval.',
    'Keep the live 10-row ffebbd68 read open and DEFERRED until an operator applies the chairman-gated belt_capacity_verdicts migration.',
  ],
  detailed_analysis: {
    scope: 'PLAN_VERIFY validation of SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 against PRD-SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 (product_requirements_v2): FR-1..FR-4, TR-1..TR-3, AC1..AC5, TS-1..TS-10.',
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 at bf0bc17dfb625940f30ac382280126912e7c7296 (equal to origin/main; PR #8370 MERGED 2026-09-06T19:08:47Z)',
    sd_commits: [
      '933510a6db7bd508e97b25c908cc7bf3a6045955 (implementation)',
      '43b5d9277c7aadb526373059f41e122a642b1c03 (sweep test follow-up)',
    ],
    check_1_earning_points: {
      verdict: 'PASS',
      evidence: 'Runtime probe: EARNING_POINTS = {"DEFICIT-URGENT":0,"DEFICIT":1,"TIGHT":2,"SURPLUS":1}, Object.isFrozen=true, LEG_POINTS=2 -- exact match to the ratified be6e9d73 mapping. scoreLeg4 returns points 0/1/2/1 for DEFICIT-URGENT/DEFICIT/TIGHT/SURPLUS. Citation: "RATIFIED - chairman ratification be6e9d73 (under ffebbd68)" at leg4-capacity.js:41, the JSDoc block immediately preceding the export at :51, satisfying FR-1 AC2 literal-substring adjacency. be6e9d73 also appears in the runtime points.predicate (:137) and points.limitation (:145). Tests pin the LITERAL values 2/1/0/1 in TS-1..TS-4 (leg4-capacity.test.js:67-88), not only the self-referential EARNING_POINTS[v] lookup, so a future silent re-edit of the table WOULD fail the suite.',
    },
    check_2_ladder_distance: {
      verdict: 'PASS',
      evidence: 'md5 of the LADDER_DISTANCE declaration block is a2ec0a370d1e77d60dec53873801e8e1 at pre-SD commit 385f6ba925a AND at merged HEAD -- byte-identical. md5 of the ladder_distance cite({...}) return block is 3ecedebd3647fd970aae26acece4168f on both sides -- byte-identical. git diff confirms no hunk touches either region. Still carries the "NOT RATIFIED (SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001, FR-3)" warning at :59. The runtime limitation string still reads "NOT RATIFIED ... does NOT ratify this mapping or any numeric scale". Guarded by leg4-capacity.test.js:164 asserting /NOT RATIFIED/, /ffebbd68/ and /does NOT ratify this mapping/. Values unchanged: {"DEFICIT-URGENT":-2,"DEFICIT":-1,"TIGHT":0,"SURPLUS":-1}, frozen.',
    },
    check_3_injectable: {
      verdict: 'PASS',
      evidence: 'Signature: scoreLeg4({ computeVerdict, persist, earning = EARNING_POINTS, runId = null }) at :84. Runtime probe: passing earning:{TIGHT:99,...} with verdict TIGHT yields points.value 99; an immediately subsequent default call yields 2, proving the default is not polluted by the override. Covered by leg4-capacity.test.js:128 ("the ratified table is still injectable"). Parameter renamed from `healthy` (array) to `earning` (points map) per TR-2.',
    },
    check_4_healthy_verdicts_removed: {
      verdict: 'PASS',
      evidence: 'Runtime: module exports are exactly [EARNING_POINTS, LADDER_DISTANCE, LEG_ID, LEG_POINTS, VERDICTS, scoreLeg4]; the HEALTHY_VERDICTS `in` check on the module namespace returns false -- removed, NOT aliased. git grep -nE "(import|require|from).*HEALTHY_VERDICTS" across all *.js/*.mjs/*.cjs/*.ts at HEAD returns ZERO import statements. The 6 residual textual hits are all non-executable prose: leg4-capacity.js:42 (the intentional supersession comment), 3 markdown role contracts (CLAUDE_ADAM / CLAUDE_COORDINATOR / CLAUDE_SOLOMON historical ratification narrative), 1 SQL comment (20260816_belt_capacity_verdicts_unavailable_sentinel.sql:26), and string literals inside 3 historical scripts/one-off/*.mjs DB-writer scripts. None are identifier references. All prior importers were updated within the SD diff.',
    },
    check_5_scope_isolation: {
      verdict: 'PASS',
      evidence: 'Per-file git diff --quiet over lib/drive-loop/score/ from pre-SD 385f6ba925a to 43b5d9277c7: aggregate.js UNCHANGED, drive-score-legs.js UNCHANGED, leg1-landed-alocal.js UNCHANGED, leg1-landed.js UNCHANGED, leg2-cohort-reader.js UNCHANGED, leg2-uptake.js UNCHANGED, verify-leg-citations.js UNCHANGED, leg4-capacity.js CHANGED (the only one). git show --name-only across both SD commits grepped for leg1|leg2 returns empty (TS-9 PASS). Grepped for ^scripts/ returns empty, so scripts/coordinator-capacity-forecast.mjs and scripts/cron/drive-report-sweep.mjs are NOT modified, satisfying FR-3 AC2 (only their TEST was updated).',
    },
    test_evidence: {
      touched_suites: '148/148 passed across 5 files: leg4-capacity.test.js, drive-score-gradient-historical.test.js, capacity-verdict-store.test.js, belt-verdict.test.js, cron/drive-report-sweep.test.js',
      regression_sweep: '329/329 passed across 23 files in tests/unit/drive-loop',
      runner: 'npx vitest run --reporter=dot, vitest v4.1.4, executed inside the worktree',
      failures: 0,
    },
    prd_traceability: {
      'FR-1': 'PASS (points table + be6e9d73 adjacent + LADDER_DISTANCE byte-identical)',
      'FR-2': 'PASS (TS-5 asserts Set size >= 3; runtime confirms exactly 3 distinct values; live 10-row read correctly disclosed DEFERRED)',
      'FR-3': 'PASS (persist contract and row shape unchanged; no production script modified; persistence tests pass unmodified)',
      'FR-4': 'PASS on its binding acceptance criterion (zero leg1/leg2 files); the narrative file-list text is stale versus the 6-file diff -- see warnings',
      'TR-1': 'PASS (Object.freeze, exported)',
      'TR-2': 'PASS via the rename branch; the "fails loudly (TypeError)" outcome named in the risk register is not achieved -- see warnings',
      'TR-3': 'PASS (all importers updated before removal; zero dangling imports)',
      'TS-1..TS-10': 'TS-1..TS-8 PASS as executed unit tests; TS-9 PASS by diff inspection; TS-10 PASS (deferral honestly recorded in SD success_criteria, not fabricated)',
    },
    method: 'Evidence is runner- and runtime-produced, not inspection-only: vitest execution output, a standalone node runtime probe of the live module (.artifacts/val-leg4-probe.mjs), md5 byte-identity comparison of the LADDER_DISTANCE regions across the pre/post commits, git grep over tracked files at HEAD, and per-file git diff --quiet over lib/drive-loop/score/.',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: sd?.target_application,
  subAgentCode: 'VALIDATION',
  fallback: 'EHG_Engineer',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);
console.log('repo resolution:', JSON.stringify(resolution));

const rec = await storeSubAgentResults(
  'VALIDATION',
  SD_UUID,
  { code: 'VALIDATION', name: 'Principal Systems Analyst' },
  results,
  { phase: 'PLAN_VERIFY', sdKey: SD_KEY }
);
console.log('STORED id=', rec?.id, '| verdict=', rec?.verdict, '| phase=', rec?.phase, '| conf=', rec?.confidence);
console.log('metadata.repo_path=', rec?.metadata?.repo_path);
console.log('executed_from_cwd=', rec?.executed_from_cwd || rec?.metadata?.executed_from_cwd);
