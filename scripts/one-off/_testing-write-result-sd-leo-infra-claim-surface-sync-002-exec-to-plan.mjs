#!/usr/bin/env node
/**
 * TESTING sub-agent evidence writer — SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002, EXEC-TO-PLAN gate.
 *
 * Adapted from scripts/record-explore-evidence.js (the sanctioned transcription pattern) and from
 * this SD's own PLAN-TO-EXEC writer: same storeSubAgentResults() call, same metadata.repo_path /
 * executed_from_cwd contract required by v_sub_agent_repo_compliance, same read-back-after-write
 * (a success return is not persistence).
 *
 * Phase spelling is MEASURED at run time against live TESTING rows rather than assumed.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002';

const FINDINGS = [
  'DIFFS VERIFIED ACCURATE against the working tree — all four FR descriptions match the actual code, not the handoff prose. lib/fleet/best-effort-release.mjs:89-93 adds the res.data.success===false branch (message||error||\'release_sd_reported_failure\'); :59-65 propagates the underlying DB message into `error` while `skipped` stays the stable discriminator. helpers.js:440-464 replaces the inline guard + raw rpc with bestEffortReleaseSd({expectedSdKey:claimId}) and hoists the heartbeat-stop OUT of the guard (now unconditional). claim-swapper.js:100-122 replaces the duplicate pre-check + raw rpc with the helper, mapping released/sd_mismatch/scope_unverifiable back onto {success, reason}.',

  'FULL SUITE PASSES, RUN INDEPENDENTLY: 6 files / 55 tests passed (claim-swapper.test.js, claim-swapper-release-claim.test.js, best-effort-release.test.js, best-effort-release-sd-scoping.test.js, stale-claim-release-on-completion.test.js, require-release-sd-wrapper-lint.test.js). Duration 67.7s.',

  'BOTH LINTS PASS CLEAN against the real repo. npm run lint:release-sd-wrapper -> exit 0, "0 ungoverned violations across 4851 file(s) scanned (scripts/**, lib/**); 13 call site(s) in 9 file(s) governed by allowlist." node scripts/lint/require-main-guard-in-one-off-lint.mjs -> exit 0, "0 ungoverned violations across 798 file(s); 144 grandfathered."',

  'TEST QUALITY — the sd_mismatch test IS a genuine revert-detector, not an unreachable path. stale-claim-release-on-completion.test.js:69-77 sets resolveOwnSession to return sd_key=\'SD-X-001\' (AGREEING with claimId) while the live claude_sessions re-read returns \'SD-OTHER-001\'. Under the REVERTED code the inline `session.sd_key === claimId` guard is TRUE, so the RPC fires and `expect(sb.rpc).not.toHaveBeenCalled()` FAILS. This is exactly the stale-local-object incident shape (RCA a7d374f4b77ae2a1b). Confirmed discriminating.',

  'MOCK SHAPE MATCHES THE REAL SUPABASE CHAIN. Both new doubles implement from().select().eq().maybeSingle() -> {data, error}, which is byte-identical to the real call at best-effort-release.mjs:53-57. No shape mismatch. Minor: the doubles ignore their arguments, so no test asserts .from was called with \'claude_sessions\' or .eq with the right session_id.',

  'CROSS-FR REVERT DETECTOR PRESENT. claim-swapper-release-claim.test.js:57-63 (fromError \'connection reset\') fails if the FR-3 error-propagation change is reverted: the old code returned the literal \'scope_unverifiable\' as `error`, so the reason would read "DB error: scope_unverifiable" and would not match /connection reset/. FR-3 and FR-2 are mutually pinned.',

  'GAP 1 (minor, real): the FR-3 `message` vs `error` PREFERENCE is UNTESTED. best-effort-release.mjs:90 is `res.data.message || res.data.error || \'release_sd_reported_failure\'` and the code comment explicitly justifies preferring `message` (mirroring swapClaim). Both FR-3 tests exercise only the THIRD arm (bare {success:false} -> fallback string). Flipping the order to `error || message` leaves both tests green. A deliberately-reasoned decision is unpinned.',

  'GAP 2 (minor): releaseSessionClaim\'s scope_unverifiable branch is not exercised at the helpers.js level. The test file header (lines 16-20) explicitly calls out that branch as newly reachable, but no case drives helpers.js through it. It IS covered at the bestEffortReleaseSd unit level and at the claim-swapper level, so the risk is containment-only.',

  'GAP 3 (minor): no INVERSE-STALE case — resolveOwnSession disagrees with claimId but the live read agrees. That is the true isolated discriminator for "heartbeat-stop is unconditional" (old code: guard false -> no release AND no heartbeat stop; new code: releases and stops). The existing AC-3 test at :111-117 (heartbeat on RPC error) would PASS under a full revert, since the old code also stopped the heartbeat inside the guard on the error path; it is a valid contract pin but not a revert-detector on its own. The sibling AC-3 test at :102-109 is saved by its co-asserted `rpc not called`.',

  'GAP 4 (test hygiene / concurrency — the most substantive finding). tests/unit/lint/require-release-sd-wrapper-lint.test.js:113-127 mutates the REAL, version-controlled scripts/lint/require-release-sd-wrapper-allowlist.json in place, and :134+ writes a real fixture module into the REAL scripts/ directory. ROOT CAUSE: the driver\'s main() calls loadAllowlist() with NO argument, so it always reads the hardcoded ALLOWLIST_PATH regardless of --root — the count-anchor tests therefore CANNOT use the throwaway fixture root the first describe block already proves works. Consequences: (a) any concurrent `npm run lint:release-sd-wrapper` observes either the stray fixture (false FAIL "ungoverned violation") or the mutated allowlist (false FAIL "must have a non-empty reason"); (b) a hard kill (SIGINT/timeout) bypasses the finally/afterAll and leaves the repo allowlist corrupted with a test entry and scripts/__test-fixture-*.mjs on disk. The pid suffix protects the fixture FILENAME but the allowlist path has no pid suffix, so it is a single shared mutable resource. NOT a CI risk today (the lint workflow is a separate runner/checkout), but a live local hazard. FIX IS SMALL: loadAllowlist(allowlistPath) is ALREADY parameterized and exported — add an --allowlist <path> CLI flag and point the count-anchor tests at a fixture allowlist under the fixture root.',

  'NO RESIDUE after my run: git status shows no scripts/__test-fixture-* file and an unmodified allowlist. Cleanup works on the happy path.',

  'REPO-WIDE CALLER SWEEP (not tests/-only) FOUND ONE UNCAUGHT CANDIDATE, which I ran: tests/integration/auto-chain-executor.test.js:14 imports releaseClaim from claim-swapper.js and was NOT in EXEC\'s list. I ran it plus 8 other candidate suites (qf-clear-and-reopen, defer-quick-fix-deliberate-release-fr2, check-and-complete-parent-sd, lead-final-approval-resolve-learning-items, prune-resolved-memory, spawn-control-stop-workitem, graceful-kill, sd-start-non-interactive-own-conflict) -> 9 files, 98 passed / 16 skipped, 762ms. The 16 skips are the pre-existing runtime db-tier gate (no designated non-production ref), unrelated to this SD. NO uncaught breakage.',

  'SCOPE OBSERVATION (not a defect): claim-swapper.js\'s releaseClaim() currently has ZERO production callers. The only importer of claim-swapper.js in non-test code is auto-chain-executor.js:12, which imports swapClaim and refreshHeartbeat only. FR-2\'s value is therefore preventative/consistency hardening, not the repair of a live defect path — worth stating plainly so the LEAD-phase value claim is not overstated.',

  'CONTRACT CHANGE VERIFIED SAFE. releaseClaim\'s "Session <id> not found" reason collapsed into "holds nothing" (session-not-found and holds-nothing both map to heldSdKey===null). I grepped for consumers branching on that reason text: the only assertion was scripts/modules/handoff/claim-swapper.test.js:140, which EXEC updated. No production code matches on the reason string.',

  'DESIGN SMELL (non-blocking, outside FR scope): require-release-sd-wrapper-lint.mjs calls main() unconditionally at module scope (:210) while also exporting loadAllowlist. Importing the module to reuse that export would execute main() and process.exit(). Not a lint violation (the main-guard lint only governs scripts/one-off/**), and no current importer exists, but the export is effectively unusable as written.'
];

const SUMMARY = [
  'EXEC-TO-PLAN verification: PASS. I read the actual diffs rather than trusting the handoff prose — all four FR descriptions are accurate against the working tree. I independently ran the full 6-file suite (55/55 passed) and both lints (release-sd-wrapper: exit 0, 0 ungoverned violations across 4851 files, 13 governed call sites in 9 files; main-guard-one-off: exit 0). I then ran 9 ADDITIONAL candidate suites found by a repo-wide importer sweep — 98 passed / 16 skipped (skips are the pre-existing db-tier runtime gate) — including tests/integration/auto-chain-executor.test.js, which imports releaseClaim from claim-swapper.js and was NOT in EXEC\'s list. No uncaught breakage anywhere.',
  'Test QUALITY is genuinely good, not just green. The sd_mismatch case is a real revert-detector: resolveOwnSession is made to AGREE with claimId while the live claude_sessions re-read disagrees, so the reverted inline guard would fire the RPC and the test would fail. The mock chains match the real PostgREST shape byte-for-byte. FR-2 and FR-3 are mutually pinned via the \'connection reset\' propagation case.',
  'FOUR non-blocking gaps. The substantive one is test hygiene: the FR-4 count-anchor tests mutate the REAL version-controlled allowlist JSON and write a fixture module into the REAL scripts/ dir, because the driver\'s main() calls loadAllowlist() with no argument and so ignores --root for the allowlist. A concurrent lint run reads a false FAIL, and a hard kill leaves the repo dirty. The fix is small and already half-built (loadAllowlist is exported and parameterized — add --allowlist <path>). The other three are minor coverage gaps: the FR-3 message-vs-error preference is unpinned (both tests hit only the fallback arm); helpers.js\'s scope_unverifiable branch is untested at that level; and there is no inverse-stale case isolating the unconditional-heartbeat property.',
  'One scope observation stated plainly: claim-swapper.js releaseClaim() has ZERO production callers today (auto-chain-executor.js imports only swapClaim/refreshHeartbeat), so FR-2 is preventative hardening rather than a live-defect repair.',
  'Nothing blocks the handoff. Recommend a follow-on QF for the --allowlist flag + the FR-3 preference test.'
].join(' ');

const RECOMMENDATIONS = [
  'FOLLOW-ON QF (test hygiene, ~30 LOC): add an --allowlist <path> flag to scripts/lint/require-release-sd-wrapper-lint.mjs main() (loadAllowlist already accepts the param) and repoint tests/unit/lint/require-release-sd-wrapper-lint.test.js\'s count-anchor describe block at a fixture allowlist under the existing throwaway fixture root. Removes both the concurrent-lint false-FAIL window and the hard-kill dirty-repo risk.',
  'Add one FR-3 test pinning the message-over-error preference: rpc resolves {data:{success:false, message:\'M\', error:\'E\'}} -> expect(r.error).toBe(\'M\'). Currently a flipped precedence leaves the suite green.',
  'Add one releaseSessionClaim case driving the scope_unverifiable branch (supabase double whose maybeSingle resolves {data:null, error:{message:\'...\'}}), asserting the RPC is not called and the heartbeat still stops.',
  'Add the inverse-stale case (resolveOwnSession sd_key DISAGREES with claimId, live read AGREES) to isolate the unconditional-heartbeat property — today AC-3\'s RPC-error variant would pass under a full revert.',
  'Consider guarding main() in require-release-sd-wrapper-lint.mjs so the exported loadAllowlist is importable without triggering process.exit.'
];

export async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const client = await getSupabaseClient();

  // Measure the dominant phase spelling for TESTING rows rather than assuming it.
  const { data: spellings } = await client
    .from('sub_agent_execution_results')
    .select('phase')
    .eq('sub_agent_code', 'TESTING')
    .in('phase', ['EXEC-TO-PLAN', 'EXEC_TO_PLAN']);
  const counts = (spellings || []).reduce((m, r) => { m[r.phase] = (m[r.phase] || 0) + 1; return m; }, {});
  const phase = (counts['EXEC_TO_PLAN'] || 0) > (counts['EXEC-TO-PLAN'] || 0) ? 'EXEC_TO_PLAN' : 'EXEC-TO-PLAN';
  console.log(`Phase spelling measured: EXEC-TO-PLAN=${counts['EXEC-TO-PLAN'] || 0}, EXEC_TO_PLAN=${counts['EXEC_TO_PLAN'] || 0} -> using '${phase}'`);

  const results = {
    verdict: 'PASS',
    confidence: 87,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: RECOMMENDATIONS,
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/_testing-write-result-sd-leo-infra-claim-surface-sync-002-exec-to-plan.mjs',
      assessment_type: 'post_implementation_verification',
      diffs_verified: true,
      fr_accuracy: { 'FR-1': 'confirmed', 'FR-2': 'confirmed', 'FR-3': 'confirmed', 'FR-4': 'confirmed' },
      suites_run_from_handoff: {
        files: 6,
        tests_passed: 55,
        tests_failed: 0,
        duration_s: 67.7
      },
      suites_run_additional_sweep: {
        files: 9,
        tests_passed: 98,
        tests_skipped: 16,
        tests_failed: 0,
        skip_cause: 'pre-existing runtime db-tier gate (no designated non-production ref) — unrelated to this SD',
        uncaught_candidate_found: 'tests/integration/auto-chain-executor.test.js (imports releaseClaim from claim-swapper.js; passes)'
      },
      lints: {
        'npm run lint:release-sd-wrapper': { exit: 0, scanned: 4851, ungoverned_violations: 0, governed_call_sites: 13, governed_files: 9 },
        'scripts/lint/require-main-guard-in-one-off-lint.mjs': { exit: 0, scanned: 798, ungoverned_violations: 0, grandfathered: 144 }
      },
      revert_detectors_confirmed: [
        'stale-claim-release-on-completion.test.js:69-77 (sd_mismatch — live read disagrees with an AGREEING stale session object)',
        'claim-swapper-release-claim.test.js:57-63 (FR-3 error propagation cross-pins FR-2)',
        'best-effort-release.test.js FR-3 success:false case'
      ],
      gaps: [
        'FR-3 message-vs-error preference untested (only the fallback arm is exercised)',
        'helpers.js scope_unverifiable branch untested at that level',
        'no inverse-stale case isolating the unconditional-heartbeat property',
        'FR-4 count-anchor tests mutate the real version-controlled allowlist + write into real scripts/ (driver main() ignores --root for the allowlist path)'
      ],
      test_hygiene_risk: {
        severity: 'moderate_non_blocking',
        mechanism: 'main() calls loadAllowlist() with no arg, so --root does not redirect the allowlist path',
        blast_radius: 'concurrent local lint run reads a false FAIL; hard kill leaves repo dirty',
        ci_affected: false,
        fix_loc_estimate: 30
      },
      scope_observation: 'claim-swapper.js releaseClaim() has zero production callers (auto-chain-executor.js imports only swapClaim/refreshHeartbeat); FR-2 is preventative hardening',
      contract_change_verified: 'releaseClaim "Session not found" -> "holds nothing"; only consumer was claim-swapper.test.js:140, updated by EXEC; no production code branches on the reason string',
      residue_check: 'clean — no stray scripts/__test-fixture-*, allowlist unmodified after run',
      files_read: [
        'lib/fleet/best-effort-release.mjs',
        'scripts/modules/handoff/claim-swapper.js',
        'scripts/modules/handoff/executors/lead-final-approval/helpers.js',
        'scripts/lint/require-release-sd-wrapper-lint.mjs',
        'scripts/lint/require-release-sd-wrapper-allowlist.json',
        '.github/workflows/require-release-sd-wrapper-lint.yml',
        'tests/unit/stale-claim-release-on-completion.test.js',
        'tests/unit/handoff/claim-swapper-release-claim.test.js',
        'tests/unit/lint/require-release-sd-wrapper-lint.test.js'
      ]
    }
  };

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase });

  // A success return is not persistence — read the row back.
  const { data, error } = await client
    .from('sub_agent_execution_results')
    .select('id,sub_agent_code,phase,verdict,confidence,created_at')
    .eq('id', stored.id)
    .maybeSingle();

  if (error || !data) {
    console.error(`WROTE but could not read back id=${stored?.id}: ${error?.message || 'no row'}`);
    process.exit(1);
  }

  console.log('\nTESTING evidence recorded and read back:');
  console.log(`  id         ${data.id}`);
  console.log(`  code       ${data.sub_agent_code}`);
  console.log(`  phase      ${data.phase}`);
  console.log(`  verdict    ${data.verdict}`);
  console.log(`  confidence ${data.confidence}`);
  console.log(`  created_at ${data.created_at}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
