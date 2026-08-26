#!/usr/bin/env node
/**
 * TESTING sub-agent RETROSPECTIVE evidence writer — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001,
 * EXEC-TO-PLAN gate, run AFTER commit 76636382153 landed the CPA gauge code
 * (validation_mode='retrospective').
 *
 * Independent verification performed for this row (not trusting the prospective pass's
 * predictions, nor EXEC's own commit message claims):
 *   - Read lib/telemetry/cpa-gauge.mjs, lib/marketing/venture-activation-gate.js,
 *     scripts/cpa-gauge-cli.mjs directly against the committed diff (git show --stat HEAD,
 *     git diff HEAD~1 HEAD).
 *   - Actually ran `npx vitest run tests/unit/telemetry/cpa-gauge.test.js
 *     tests/unit/marketing/venture-activation-gate.test.js tests/unit/query-cpa-gauge.test.js`
 *     — 3 files, 37 tests, all passed.
 *   - Spot-checked test bodies against the real implementation for blindness (TS-7 sum-vs-
 *     last-row check; TR-3's source-substring guard) rather than trusting assertion presence
 *     alone.
 *   - Hand-traced computeActivationVerdict()'s two return paths (venture_telemetry read-error
 *     early return, and the normal 4-rung path) to confirm verdict/citation/path_to_pass are
 *     computed and captured into local variables BEFORE rungs.cpa is ever attached to the
 *     rungs object, and that decideActivationVerdict/buildPathToPass are never passed cpa.
 *   - Grepped the actual code diff (not the one-off scripts) for outreach-capable patterns.
 *   - Checked .gitignore and database/migrations/20260214_marketing_engine_foundation.sql
 *     directly rather than trusting the commit message's claims about them.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const PRD_ID = 'PRD-SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001';
const COMMIT_SHA = '766363821538e041e36cc3c29f1be246ac44f897';

const FINDINGS = [
  'POSITIVE — all 4 prospective gaps were genuinely fixed, verified by reading the real diff, not the commit message. (a) tests/unit/marketing/venture-activation-gate.test.js:49-54 fakeSupabase() now has a dedicated dailyRollupsBuilder() branch for table===\'daily_rollups\', chainable (.select/.eq/.gte) and thenable, matching resolveCpaRung\'s real .select().eq().gte() call shape (no .limit()/.maybeSingle() needed, confirmed against venture-activation-gate.js:207-211). (b) the FR-6 describe block\'s generic rung loop (test file lines 197-201) was narrowed to `for (const rungName of ACTIVATION_RUNGS)` (import from the real module, not a hardcoded list) with an explicit code comment (lines 194-196) explaining cpa is asserted separately at lines 264-268 using its own no_writer_yet/live vocabulary — the old blind generic loop no longer exists. (c) TR-2\'s platform-scoping gap is resolved: resolveCpaRung (venture-activation-gate.js:205-218) sums daily_rollups across ALL platforms per its own docstring, while scripts/cpa-gauge-cli.mjs:33-48 queryCpaGaugeForChannel() takes an explicit platform argument and filters .eq(\'platform\', platform) for the per-channel breakdown — two call sites, two documented scopes, not left ambiguous. (d) FR-3/TS-6: tests/unit/query-cpa-gauge.test.js uses only a synthetic fakeSupabase() double (lines 10-20) with hand-supplied rows — no live-data dependency, consistent with the prospective finding that daily_rollups is empty fleet-wide.',

  'POSITIVE — TR-3\'s no-cpa-reference claim verified by direct read of the two function bodies (venture-activation-gate.js:228-265 decideActivationVerdict, :272-299 buildPathToPass), not by trusting the test\'s own source-substring assertion (test file lines 296-307). Neither function\'s parameter list, body, nor any string literal it constructs mentions "cpa" — confirmed by manual line-by-line read, independent of the automated grep the test itself performs.',

  'POSITIVE — the byte-identical verdict/citation/path_to_pass claim holds under hand trace, checked independently of any test. In computeActivationVerdict() (venture-activation-gate.js:305-357): the normal path computes `{ verdict, why } = decideActivationVerdict(rungs, floors)` and `pathToPass = buildPathToPass(rungs, floors)` at lines 339-340 — into local variables — strictly BEFORE `rungsObject.cpa = await resolveCpaRung(...)` at line 349; the return statement at 351-357 reads those already-captured locals, so cpa\'s attachment to the object cannot retroactively affect them. Same holds for the venture_telemetry-read-error early-return branch (lines 315-331): `buildPathToPass(blind, floors)` at line 330 is called with the `blind` ARRAY, not `blindRungsObject`, even though it is textually written after `blindRungsObject.cpa = ...` on line 324 — the cpa attachment mutates a different variable than the one path_to_pass is computed from, so no leakage is possible. Traced by hand for the concrete NO_DATA/empty-telemetry input the existing "FR-6: Image Alt Text Generator" test fixture uses (lines 186-203 pre-existing, now paired with the new TS-4 fixture at lines 254-269) and the outputs are identical strings before and after CPA attachment.',

  'POSITIVE — FR-5\'s "zero new outreach-capable code" claim holds against the actual code diff. `git diff HEAD~1 HEAD -- lib/telemetry/cpa-gauge.mjs lib/marketing/venture-activation-gate.js scripts/cpa-gauge-cli.mjs | grep -iE "send|contact|webhook|fetch\\(|http://|https://|smtp|twilio|sendgrid|axios|mailto"` returns zero matches. A second pass over the FULL diff (including the seven scripts/one-off/*.mjs artifacts also in this commit) surfaces only PROSE discussing the absence of outreach code (PRD text, LEAD rationale) — no actual function definitions matching those patterns exist anywhere in the commit.',

  'MINOR, NOT BLOCKING — resolveCpaRung() (venture-activation-gate.js:205-218) and queryCpaGaugeForChannel() (cpa-gauge-cli.mjs:33-48) both filter daily_rollups with only `.gte(\'rollup_date\', since)`, no upper bound (`.lte\'d to `now`). A future-dated daily_rollups row (clock skew, backfill error, or test data) would be included in the CPA sum even though it postdates the nominal "now" the lookback window is measured from. Not a regression this SD introduced — resolvePaidRung and resolveTelemetryRungs have no equivalent windowing at all — and not covered by any TR/AC in the PRD, so not scored as a gap against this SD\'s stated scope; flagged for awareness only.',

  'CONFIRMED — the scripts/query-cpa-gauge.mjs -> scripts/cpa-gauge-cli.mjs rename rationale is accurate, not just claimed. .gitignore:175 contains the literal pattern `scripts/query-*.mjs`; the PRD-specified filename would have been silently excluded from git tracking. `ls scripts/` confirms no orphaned scripts/query-cpa-gauge.mjs file exists in the working tree.',

  'CONFIRMED — daily_rollups schema matches every column resolveCpaRung/queryCpaGaugeForChannel query. database/migrations/20260214_marketing_engine_foundation.sql:128-139 defines rollup_date (DATE), venture_id (UUID), platform (TEXT), conversions (INTEGER), spend_cents (INTEGER) exactly as used — no schema-drift gap.',

  'TEST EXECUTION, run directly (not trusted from any prior claim): `npx vitest run tests/unit/telemetry/cpa-gauge.test.js tests/unit/marketing/venture-activation-gate.test.js tests/unit/query-cpa-gauge.test.js` => 3 test files, 37 tests, all passed (8 + 26 + 3, matching the commit message\'s stated counts exactly). Spot-checked two test bodies for blindness: cpa-gauge.test.js TS-7 (lines 52-62) supplies TWO daily_rollups rows and asserts the SUMMED result (500), with an inline comment computing what a last-row-only bug would wrongly return (467) — this would genuinely catch a regression to single-row reads, not merely assert presence of a value. venture-activation-gate.test.js\'s TR-3 test (lines 296-307) slices the real file source between the two function names and regexes for "cpa" — a textual guard, weaker than a runtime assertion, but it does read the actual on-disk file content (not a fixture), so it would catch a future edit that threads cpa into either function.',
];

const SUMMARY = [
  'EXEC-TO-PLAN retrospective testing verdict: PASS. All 4 gaps identified by the prior prospective pass (4b88bb44-51de-47ad-9321-b78e92a3bfa0, CONDITIONAL_PASS 85) were independently confirmed fixed by reading the committed diff directly: the fakeSupabase() mock gained a daily_rollups branch, the generic rungs-iteration assertion was scoped to ACTIVATION_RUNGS with cpa asserted separately in its own vocabulary, the platform-scoping question was resolved by giving the CLI script an explicit platform parameter while the verdict-layer stays venture-wide, and FR-3/TS-6 tests use synthetic fixtures rather than depending on live (empty) daily_rollups data.',
  'All 37 tests across the 3 target files were actually run (not assumed) and passed. Two test bodies were read against the real implementation and found non-blind: TS-7 forces genuine multi-row summation, and the TR-3 guard reads live file source rather than a fixture.',
  'TR-3\'s never-references-cpa claim and the byte-identical verdict/citation/path_to_pass claim were both independently verified by direct hand-trace of decideActivationVerdict/buildPathToPass and computeActivationVerdict\'s two return paths, not by trusting the test suite\'s own self-checks.',
  'FR-5\'s zero-new-outreach-capable-code claim was independently confirmed by grepping the actual code diff for send/contact/webhook/fetch/http/smtp/twilio/sendgrid/axios/mailto patterns — zero matches.',
  'One minor, non-blocking observation recorded for awareness: the CPA lookback query has no upper date bound, matching existing sibling gauges\' lack of windowing and outside this SD\'s stated PRD scope.',
].join(' ');

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const supabase = await getSupabaseClient();

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
      'Optional, non-blocking: consider adding an upper bound (.lte(\'rollup_date\', now)) to resolveCpaRung/queryCpaGaugeForChannel\'s daily_rollups query if a future SD ratifies a windowing contract for this gauge family — no current TR requires it.',
    ],
    validation_mode: 'retrospective',
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/_testing-retrospective-need-able-continually-001-exec-to-plan.mjs',
      assessment_type: 'independent_post_implementation_verification',
      prd_id: prd?.id ?? PRD_ID,
      commit_verified: COMMIT_SHA,
      prior_prospective_evidence_id: '4b88bb44-51de-47ad-9321-b78e92a3bfa0',
      test_run: {
        command: 'npx vitest run tests/unit/telemetry/cpa-gauge.test.js tests/unit/marketing/venture-activation-gate.test.js tests/unit/query-cpa-gauge.test.js',
        files: 3,
        tests: 37,
        passed: 37,
        failed: 0,
      },
      prospective_gaps_verified_fixed: {
        'gap_a_fakeSupabase_daily_rollups_mock': 'fixed — dailyRollupsBuilder() added',
        'gap_b_generic_rungs_loop_vocabulary_collision': 'fixed — loop scoped to ACTIVATION_RUNGS, cpa asserted separately',
        'gap_c_platform_scoping_ambiguity': 'resolved — resolveCpaRung sums all platforms, cpa-gauge-cli.mjs takes explicit platform param',
        'gap_d_fr3_ts6_live_data_dependency': 'resolved — synthetic fakeSupabase fixtures used, no live dependency',
      },
      files_read: [
        'lib/telemetry/cpa-gauge.mjs',
        'lib/marketing/venture-activation-gate.js',
        'scripts/cpa-gauge-cli.mjs',
        'tests/unit/telemetry/cpa-gauge.test.js',
        'tests/unit/marketing/venture-activation-gate.test.js',
        'tests/unit/query-cpa-gauge.test.js',
        '.gitignore',
        'database/migrations/20260214_marketing_engine_foundation.sql',
      ],
      hand_traced_functions: [
        'decideActivationVerdict (venture-activation-gate.js:228-265)',
        'buildPathToPass (venture-activation-gate.js:272-299)',
        'computeActivationVerdict (venture-activation-gate.js:305-357)',
      ],
      outreach_grep_result: 'zero matches for send|contact|webhook|fetch\\(|http(s)?://|smtp|twilio|sendgrid|axios|mailto in the code diff',
    },
  };

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, {
    phase: 'EXEC_TO_PLAN',
  });

  // A success return is not persistence — read the row back.
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,validation_mode,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nTESTING retrospective evidence recorded and read back:');
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
