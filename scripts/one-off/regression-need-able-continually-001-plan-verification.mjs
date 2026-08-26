#!/usr/bin/env node
/**
 * REGRESSION sub-agent evidence writer — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, PLAN_VERIFICATION
 * phase.
 *
 * Scope (regression-agent's own remit — backward-compatibility, not full PRD/SD conformance,
 * which the separate VALIDATION row at this phase already covers): this SD modifies
 * lib/marketing/venture-activation-gate.js, a shared module with two real consumers
 * (lib/marketing/autonomy-gate.js and lib/marketing/venture-honesty-audit.js, both reading
 * venture_demand_verdicts). It adds an additive rungs.cpa JSONB key to every row
 * computeActivationVerdict() writes, without touching decideActivationVerdict()/
 * buildPathToPass()/ACTIVATION_RUNGS/RATIFIED_FLOORS.
 *
 * Evidence gathered independently in this pass:
 *   1. Baseline test comparison — a temporary detached worktree at origin/main (9a06fb3325d,
 *      the exact merge-base of this branch) ran `npx vitest run tests/unit/marketing/
 *      tests/unit/telemetry/`: 25 files / 308 tests, all passing. The same command on this
 *      branch (HEAD 1898031200e): 26 files / 324 tests, all passing. Zero baseline tests broke;
 *      the delta is additive (+1 new file, +16 new tests). `tests/unit/query-cpa-gauge.test.js`
 *      run in isolation: 3/3 pass.
 *   2. API signature diff — `git diff origin/main..HEAD -- lib/marketing/venture-activation-
 *      gate.js` read directly (not paraphrased). Every pre-existing exported symbol
 *      (resolveTelemetryRungs, resolvePaidRung, decideActivationVerdict, buildPathToPass,
 *      computeActivationVerdict, ACTIVATION_VERDICT, RUNG_STATE, ACTIVATION_RUNGS,
 *      DECLARED_UNFILTERED_RUNGS, RATIFIED_FLOORS) is byte-identical in signature.
 *      computeActivationVerdict's own signature `{ supabase, ventureId, floors, now }` is
 *      unchanged. Only two new exports were added: resolveCpaRung, DEFAULT_CPA_LOOKBACK_DAYS.
 *   3. Import/circular-import check — lib/telemetry/cpa-gauge.mjs has zero imports (pure,
 *      confirmed by direct read). `node -e "import('./lib/marketing/venture-activation-gate.js')"`
 *      loads cleanly and lists all 13 expected exports (10 pre-existing + resolveCpaRung +
 *      DEFAULT_CPA_LOOKBACK_DAYS + default). grep for every importer of venture-activation-
 *      gate.js and funnel-gauge.mjs across the repo found no consumer that could be affected by
 *      the new import path.
 *   4. New-failure-mode analysis — grepped for every call site of computeActivationVerdict
 *      outside tests/one-off scripts: NONE exist. There is no production caller wired in today
 *      (matches this SD's own evidence describing the honesty audit as "ARMED rather than a
 *      live cron, deliberately"), so the new unconditional daily_rollups round-trip on every
 *      invocation — including the earliest venture_telemetry-read-error return path — has zero
 *      current blast radius. daily_rollups carries a service_role bypass RLS policy plus an
 *      authenticated owner-scoped read policy (20260214_marketing_engine_foundation.sql:196-
 *      220,266-269), the same shape already relied on by the two pre-existing queries in this
 *      function (venture_telemetry, ops_payment_events) via the same caller-supplied supabase
 *      client — not a new access pattern. resolveCpaRung's `{error}` branch is fail-closed and
 *      unit-tested (never throws on a query error). One latent fragility: resolveCpaRung has no
 *      try/catch around `supabase.from('daily_rollups')` itself, so a bespoke test double that
 *      synchronously throws for unrecognized tables (the pre-existing fakeSupabase() convention
 *      in this repo) would crash the whole verdict computation, not just cpa. This was already
 *      discovered and fixed for the one real caller (the unit test suite) during this SD's own
 *      PLAN phase — scripts/one-off/plan-fix-prd-testing-findings-need-able-001.mjs documents
 *      exactly this finding and its fix (extending fakeSupabase() with a daily_rollups branch).
 *      Recorded below as a non-blocking advisory for whichever future SD wires a production
 *      caller in, mirroring the SECURITY sub-agent's own advisory pattern at this same phase
 *      (sub_agent_execution_results, EXEC_TO_PLAN, PASS 90).
 *   5. Git history cleanliness — `git rev-list --left-right --count origin/main...HEAD` = "0 3"
 *      (zero commits behind, three ahead); `git log origin/main..HEAD` lists exactly the three
 *      commits named in this SD; `git status --porcelain` is empty; no merge-conflict markers
 *      exist in any touched file; `git merge-tree <merge-base> origin/main HEAD` reports a clean
 *      "merged" result with no CONFLICT lines.
 *
 * VERDICT: PASS. No backward-compatibility regression was found on any of the four axes this
 * sub-agent is responsible for (test baseline, API signatures, import resolution, new caller
 * failure modes). One advisory (non-blocking) recommendation is recorded for future work.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = 'PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const IMPL_COMMIT_SHA = '766363821538e041e36cc3c29f1be246ac44f897';
const EVIDENCE_COMMIT_SHA = '348877f72cc616c8b26a78149928415bd852fce4';
const DOC_RECONCILE_COMMIT_SHA = '1898031200e6842df0d8e68d679919c460c5c9d6';
const MERGE_BASE_SHA = '9a06fb3325d0544435ac50676fdbdf066b6e9b98';

const FINDINGS = [
  'CONFIRMED (baseline test comparison) — a temporary detached worktree checked out at '
    + 'origin/main (merge-base 9a06fb3325d, identical to this branch\'s divergence point per '
    + '`git rev-list --left-right --count origin/main...HEAD` = "0\\t3") ran '
    + '`npx vitest run tests/unit/marketing/ tests/unit/telemetry/`: 25 test files / 308 tests, '
    + 'all passing. The identical command on this branch (HEAD 1898031200e): 26 test files / '
    + '324 tests, all passing. The delta (+1 file, +16 tests) is entirely additive -- '
    + 'tests/unit/telemetry/cpa-gauge.test.js is new, and the 8 new cases added to '
    + 'tests/unit/marketing/venture-activation-gate.test.js are new `it()` blocks under a new '
    + '`describe(\'FR-2/TR-3/TR-4...\')`. Zero pre-existing test broke. '
    + '`npx vitest run tests/unit/query-cpa-gauge.test.js` in isolation: 3/3 pass.',

  'CONFIRMED (API signature compatibility) — direct read of `git diff origin/main..HEAD -- '
    + 'lib/marketing/venture-activation-gate.js` (not paraphrased from prior evidence). Every '
    + 'pre-existing exported symbol -- ACTIVATION_VERDICT, RUNG_STATE, ACTIVATION_RUNGS, '
    + 'DECLARED_UNFILTERED_RUNGS, RATIFIED_FLOORS, resolveTelemetryRungs, resolvePaidRung, '
    + 'decideActivationVerdict, buildPathToPass -- is byte-unchanged. computeActivationVerdict\'s '
    + 'own destructured signature `{ supabase, ventureId, floors = RATIFIED_FLOORS, now = new '
    + 'Date() }` (line 305) is identical before and after. Only two exports were added: '
    + 'resolveCpaRung and DEFAULT_CPA_LOOKBACK_DAYS, plus both were appended to the default '
    + 'export object (never replacing an existing key).',

  'CONFIRMED (import path / circular import) — lib/telemetry/cpa-gauge.mjs has zero import '
    + 'statements (confirmed by direct read: it is a pure function module, matching its own '
    + 'header comment). `node -e "import(\'./lib/marketing/venture-activation-gate.js\')"` '
    + 'loads cleanly at HEAD and lists all 13 expected exports (10 pre-existing + resolveCpaRung '
    + '+ DEFAULT_CPA_LOOKBACK_DAYS + default) -- no load-time error, no circular-import warning. '
    + 'grep across the repo for every importer of venture-activation-gate.js and '
    + 'lib/telemetry/funnel-gauge.mjs found the two named consumers '
    + '(lib/marketing/autonomy-gate.js, lib/marketing/venture-honesty-audit.js) plus this SD\'s '
    + 'own new files/one-off scripts/tests -- no other consumer exists that could be affected by '
    + 'the new import of cpa-gauge.mjs.',

  'CONFIRMED (no adverse interaction with either real consumer) — lib/marketing/autonomy-gate.js '
    + '(read in full around lines 495-562) SELECTs only `verdict, citation, computed_at` from '
    + 'venture_demand_verdicts (line 511); it never reads the `rungs` column at all, so the new '
    + 'rungs.cpa key is completely invisible to it regardless of shape. '
    + 'lib/marketing/venture-honesty-audit.js (read in full) does read `rungs` (line 57) and '
    + 'builds `unmeasurable_rungs` via `Object.values(v.rungs).filter(r => r.state === '
    + '"UNMEASURABLE")` (lines 90-92) -- confirmed live that computeCpaGaugeState() '
    + '(lib/telemetry/cpa-gauge.mjs:31-59) only ever returns state `no_writer_yet` or `live`, '
    + 'never the RUNG_STATE.UNMEASURABLE (uppercase) vocabulary the funnel rungs use, so this '
    + 'filter neither crashes nor false-positives on the new key -- it silently and harmlessly '
    + 'excludes it, exactly as the prior VALIDATION evidence at this phase (sub_agent_execution_'
    + 'results, PLAN_VERIFICATION) already recorded as GAP #5 (non-blocking).',

  'ADVISORY, non-blocking (new failure-mode analysis) — grepped for every call site of '
    + 'computeActivationVerdict outside tests/ and scripts/one-off/: NONE exist in production '
    + 'code today. So the new unconditional daily_rollups query on every invocation (including '
    + 'the venture_telemetry-read-error early-return path, lines 316-331) has zero current blast '
    + 'radius. daily_rollups carries `ALTER TABLE daily_rollups ENABLE ROW LEVEL SECURITY` plus a '
    + '`service_role_all_daily_rollups` bypass policy and a `venture_read_daily_rollups` '
    + 'authenticated owner-scoped policy (database/migrations/20260214_marketing_engine_'
    + 'foundation.sql:196,218-220,266-269) -- the identical RLS shape already relied on for the '
    + 'two pre-existing queries in this same function (venture_telemetry, ops_payment_events) via '
    + 'the same caller-supplied supabase client, so this is not a new access pattern. '
    + 'resolveCpaRung\'s `{error}` branch fails closed and is unit-tested (never throws on a '
    + 'query error). One genuine latent fragility for FUTURE callers: resolveCpaRung has no try/'
    + 'catch around `supabase.from(\'daily_rollups\')` itself, so a bespoke supabase test double '
    + 'that synchronously throws for an unrecognized table name (the pre-existing fakeSupabase() '
    + 'convention used elsewhere in this repo) would crash the ENTIRE verdict computation, not '
    + 'just cpa. This exact scenario was already discovered and fixed for the one real caller '
    + '(the unit test suite) during this SD\'s own PLAN phase -- scripts/one-off/plan-fix-prd-'
    + 'testing-findings-need-able-001.mjs documents verbatim: "Without this fix, the FR-2 '
    + 'wiring\'s supabase.from(\'daily_rollups\') call breaks all 3 existing computeActivation'
    + 'Verdict() tests the moment it lands" -- and the fix (extending fakeSupabase() with a '
    + 'daily_rollups branch) is confirmed present in the delivered test file. Recommendation: any '
    + 'future SD that wires a production caller into computeActivationVerdict should verify its '
    + 'own supabase client/test-double handles an unrecognized-table case gracefully (a real '
    + '@supabase/supabase-js client returns an async `{error}`, not a synchronous throw, so this '
    + 'is a test-double risk, not a live-client risk).',

  'CONFIRMED (git history clean, no PR blockers) — `git rev-list --left-right --count '
    + 'origin/main...HEAD` returns "0\\t3" (zero commits behind origin/main, three ahead: '
    + '766363821538e0, 348877f72cc6, 1898031200e6). `git status --porcelain` is empty. grep for '
    + 'merge-conflict markers (<<<<<<<, =======, >>>>>>>) across every file this SD touches '
    + 'returns zero matches. `git merge-tree <merge-base> origin/main HEAD` reports a clean '
    + '"merged" result with no CONFLICT lines -- this branch will apply to origin/main without '
    + 'conflict.',
];

const SUMMARY = 'REGRESSION PLAN_VERIFICATION verdict: PASS. Independently re-ran the full '
  + 'lib/marketing/ + lib/telemetry/ unit test suites in a temporary detached worktree at the '
  + 'exact origin/main merge-base (9a06fb3325d) and compared against the same suites on this '
  + 'branch: 308/308 baseline tests pass, 324/324 branch tests pass, zero baseline test broke '
  + '(delta is +1 new file / +16 new tests, purely additive). Direct diff-read of venture-'
  + 'activation-gate.js confirms every pre-existing exported function/constant signature is '
  + 'byte-unchanged; only two new exports (resolveCpaRung, DEFAULT_CPA_LOOKBACK_DAYS) were '
  + 'added. cpa-gauge.mjs has zero imports (no circular-import risk), the module loads cleanly '
  + 'at HEAD with all expected exports present, and grep confirms no consumer outside the two '
  + 'named ones (autonomy-gate.js, venture-honesty-audit.js) exists. Neither real consumer is '
  + 'adversely affected: autonomy-gate.js never reads the `rungs` column at all, and venture-'
  + 'honesty-audit.js\'s UNMEASURABLE-state filter silently and harmlessly excludes the new cpa '
  + 'key (different vocabulary, no crash, no false report). computeActivationVerdict has zero '
  + 'production callers today, so the new unconditional daily_rollups round-trip carries no '
  + 'current blast radius; daily_rollups\' RLS shape (service_role bypass + authenticated owner-'
  + 'read policy) matches the two pre-existing queries in the same function. One non-blocking '
  + 'advisory is recorded: resolveCpaRung has no try/catch around the daily_rollups query call '
  + 'itself, so a future bespoke test double that synchronously throws on an unrecognized table '
  + '(this repo\'s existing fakeSupabase() convention) would crash the whole verdict computation '
  + '-- already discovered and fixed for the one real caller (the unit test suite) during this '
  + "SD's own PLAN phase. Git history is clean: 0 commits behind / 3 ahead of origin/main, "
  + 'empty working tree, no conflict markers, and a clean `git merge-tree` dry-run against '
  + 'origin/main.';

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const supabase = await getSupabaseClient();

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('sd_key', SD_KEY)
    .maybeSingle();
  if (sdErr || !sd) {
    console.error('SD_READ_FAILED', sdErr?.message || 'not found');
    process.exit(1);
  }

  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('id', PRD_ID)
    .maybeSingle();
  if (prdErr) {
    console.error('PRD_READ_FAILED', prdErr.message);
    process.exit(1);
  }

  const results = {
    verdict: 'PASS',
    confidence: 92,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: [
      'ADVISORY, non-blocking: any future SD that wires a production caller into '
        + 'computeActivationVerdict should confirm its own supabase client/test-double handles '
        + 'an unrecognized daily_rollups table gracefully -- resolveCpaRung has no try/catch '
        + 'around the query call itself, only around the returned {error}. A real '
        + '@supabase/supabase-js client is not at risk (it never throws synchronously for an '
        + 'existing, RLS-protected table); a hand-rolled test double that throws for '
        + 'unrecognized table names is the only exposure, and this repo\'s one real instance of '
        + 'that pattern was already found and fixed during this SD\'s own PLAN phase.',
    ],
    validation_mode: 'retrospective',
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/regression-need-able-continually-001-plan-verification.mjs',
      assessment_type: 'independent_plan_verification_regression',
      sd_id: sd.id,
      prd_id: prd?.id ?? PRD_ID,
      commits_verified: [IMPL_COMMIT_SHA, EVIDENCE_COMMIT_SHA, DOC_RECONCILE_COMMIT_SHA],
      merge_base_sha: MERGE_BASE_SHA,
      baseline_test_run: {
        location: 'temporary detached git worktree checked out at origin/main (== merge-base)',
        command: 'npx vitest run tests/unit/marketing/ tests/unit/telemetry/',
        result: '25 test files, 308 tests, all passing',
      },
      branch_test_run: {
        location: 'this worktree (feat/SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, HEAD)',
        command: 'npx vitest run tests/unit/marketing/ tests/unit/telemetry/',
        result: '26 test files, 324 tests, all passing',
      },
      isolated_test_run: {
        command: 'npx vitest run tests/unit/query-cpa-gauge.test.js',
        result: '1 test file, 3 tests, all passing',
      },
      api_signature_check: 'git diff origin/main..HEAD -- lib/marketing/venture-activation-gate.js read directly -- zero pre-existing export signature changed; 2 new exports added (resolveCpaRung, DEFAULT_CPA_LOOKBACK_DAYS)',
      circular_import_check: 'lib/telemetry/cpa-gauge.mjs has zero imports; node -e dynamic import of venture-activation-gate.js at HEAD succeeds and lists all 13 expected exports',
      production_caller_check: 'grep for computeActivationVerdict outside tests/ and scripts/one-off/: zero production call sites exist today',
      git_history_check: {
        rev_list_left_right: '0\t3 (0 behind, 3 ahead of origin/main)',
        status_porcelain: 'empty (clean working tree)',
        conflict_markers: 'none found in any touched file',
        merge_tree_dry_run: 'clean "merged" result, no CONFLICT lines',
      },
      files_read: [
        'lib/marketing/venture-activation-gate.js (full diff + full file)',
        'lib/telemetry/cpa-gauge.mjs',
        'lib/marketing/autonomy-gate.js (lines ~495-562)',
        'lib/marketing/venture-honesty-audit.js (lines ~40-150)',
        'scripts/cpa-gauge-cli.mjs',
        'tests/unit/marketing/venture-activation-gate.test.js (full diff)',
        'tests/unit/telemetry/cpa-gauge.test.js',
        'tests/unit/query-cpa-gauge.test.js',
        'database/migrations/20260214_marketing_engine_foundation.sql (daily_rollups table + RLS policies)',
        'scripts/one-off/plan-fix-prd-testing-findings-need-able-001.mjs',
      ],
      cross_referenced_prior_evidence: [
        'VALIDATION, PLAN_VERIFICATION, CONDITIONAL_PASS 88 (SD/PRD documentation-accuracy conditions; distinct scope from this REGRESSION pass)',
        'SECURITY, EXEC_TO_PLAN, PASS 90 (advisory on future HTTP exposure/authorization; distinct scope from this REGRESSION pass)',
        'TESTING, EXEC_TO_PLAN, PASS 92 retrospective (37/37 pass, hand-traced computeActivationVerdict return paths)',
      ],
    },
  };

  const stored = await storeSubAgentResults('REGRESSION', SD_KEY, null, results, {
    phase: 'PLAN_VERIFICATION',
  });

  // A success return is not persistence -- read the row back.
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nREGRESSION evidence recorded and read back:');
  console.log(`  id              ${data.id}`);
  console.log(`  code            ${data.sub_agent_code}`);
  console.log(`  phase           ${data.phase}`);
  console.log(`  verdict         ${data.verdict}`);
  console.log(`  confidence      ${data.confidence}`);
  console.log(`  validation_mode ${data.validation_mode}`);
  console.log(`  created_at      ${data.created_at}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
