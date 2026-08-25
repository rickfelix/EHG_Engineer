#!/usr/bin/env node
/**
 * TESTING sub-agent evidence writer — SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002, PLAN-TO-EXEC gate.
 *
 * Adapted from scripts/record-explore-evidence.js (the sanctioned transcription pattern) rather
 * than inventing a new schema shape: same storeSubAgentResults() call, same metadata.repo_path /
 * executed_from_cwd contract required by v_sub_agent_repo_compliance, same read-back-after-write
 * (a success return is not persistence).
 *
 * Phase spelling 'PLAN-TO-EXEC' is the dominant live convention for TESTING rows (13 rows vs 1
 * for PLAN_TO_EXEC), measured before writing.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002';

const FINDINGS = [
  'FR-1 CONFIRMED ACCURATE against current source. scripts/modules/handoff/executors/lead-final-approval/helpers.js: inline `if (session.sd_key === claimId)` guard at :440, raw supabase.rpc(\'release_sd\', {p_session_id, p_reason:\'completed\'}) at :441-447, branches on `error` only (the RPC data payload is never read), and the FR-5 heartbeat-stop at :455-460 IS nested inside that guard exactly as the PRD describes. Function returns void and no caller consumes a return value, so bestEffortReleaseSd\'s {released,error,skipped,heldSdKey} shape needs no mapping at this site.',

  'FR-2 CONFIRMED ACCURATE. scripts/modules/handoff/claim-swapper.js releaseClaim() at :94-138: duplicate pre-check SELECT sd_key FROM claude_sessions .eq(session_id).maybeSingle() at :100-104, three distinct failure returns at :106-114, raw rpc at :122-125. The pre-check is byte-equivalent to bestEffortReleaseSd\'s internal expectedSdKey guard (same table, select, .eq, .maybeSingle, same strict-inequality predicate), so substitution is pure de-duplication with zero added round-trips.',

  'FR-3 CONFIRMED — and it is a HARD PREREQUISITE OF FR-2, which the PRD does not state. lib/fleet/best-effort-release.mjs:72-77 checks only `res.error` and never reads res.data.success. But claim-swapper.js:130-132 ALREADY HAS the exact check FR-3 adds (`if (data && data.success === false) return {success:false, reason: data.error || data.message || ...}`). Therefore routing FR-2 through the helper BEFORE FR-3 lands would silently DELETE an existing, working check — converting a hardening SD into a regression. FR-3 must merge before or with FR-2. Recommend EXEC sequence FR-3 -> FR-1 -> FR-2 -> FR-4.',

  'FR-2 RETURN-SHAPE TRAP (concrete regression risk). On sd_mismatch bestEffortReleaseSd returns {released:false, error:null, skipped:\'sd_mismatch\'} — error is NULL on a refusal. Mapping the external contract as `success: !res.error` would report success:true for a release that never happened. The mapping MUST key on res.released. Additionally the three distinct reason strings today (\'DB error: X\' / \'Session <id> not found\' / \'Session does not hold claim on <sdKey>\') collapse into the helper\'s two skip classes (scope_unverifiable / sd_mismatch); session-not-found becomes heldSdKey=null -> sd_mismatch. EXEC must preserve or deliberately re-document these reason strings.',

  'BREAKING EXISTING TESTS — 3 of 5 cases in tests/unit/stale-claim-release-on-completion.test.js WILL FAIL after FR-1, and the PRD does not enumerate this work. Every case there builds its double as `const sb = { rpc: okRpc() }` with NO .from method. Once releaseSessionClaim routes through bestEffortReleaseSd with expectedSdKey, the helper\'s fail-CLOSED branch (best-effort-release.mjs:49-52, `typeof supabase.from !== \'function\'`) fires and the RPC is NEVER called. Cases 1, 3 and 4 assert sb.rpc WAS called with {p_session_id, p_reason:\'completed\'} and will break. Case 2 keeps passing but for a CHANGED reason (scope_unverifiable, not the sd_key guard it claims to pin) — a test that silently stops measuring its subject. All doubles need a .from stub.',

  'FR-2 HAS NO DEDICATED UNIT TEST TODAY — a genuine coverage gap, not just an update. claim-swapper.js releaseClaim is imported only by tests/integration/auto-chain-executor.test.js; tests/unit/claim/release-claim-both-surfaces.test.js tests a DIFFERENT module (lib/claim/release-claim-both-surfaces.mjs). EXEC must author a new unit test file for releaseClaim rather than extend an existing one.',

  'FR-4 MODEL IS STRUCTURALLY VALID BUT NOT CLONABLE VERBATIM — two specific parts must be re-authored. (a) scripts/lint/require-main-guard-in-one-off-lint.mjs does NOT contain its own AST detection: it delegates to eslint-rules/require-main-guard-in-one-off.js through the ESLint Linter API (:70, :100, :156). An AST-based FR-4 therefore needs either a NEW eslint-rules/*.js rule file or direct AST parsing — an unstated sub-deliverable. (b) Its loadAllowlist() at :114-126 validates every entry as a NON-EMPTY STRING and would THROW on FR-4\'s required {reason, expected:N} object shape, and violation matching at :180 is boolean `h.filePath in allow`. Both the loader and the matcher must be rewritten for count-anchored semantics; only the walk/exit-code/--json/--root scaffolding transfers.',

  'FR-4 GOOD NEWS — the model already exposes the exact seam a fixture test needs: `--root <dir>` (:168-169) redirects the whole-corpus walk, so AC-1 (synthetic fixture with one raw unallowlisted call fails with file:line) is testable without touching the real corpus. Exit-code contract is clean: process.exit(violations.length > 0 ? 1 : 0) at :196.',

  'CORPUS MEASURED INDEPENDENTLY. grep for rpc(\'release_sd\' / rpc("release_sd" across scripts/ and lib/ returns 32 raw hits, of which several are comments, tests, or this SD\'s own PRD/validation artifacts. Real production raw call sites confirmed in: lib/claim-guard.mjs (:613,:731), lib/commands/claim-command.js:184, lib/session-manager.mjs:864, scripts/hooks/reclaim-sd-after-compaction.cjs (:153,:166), scripts/hooks/session-state-sync.cjs:248, scripts/modules/claim-health/self-heal.js:92, scripts/modules/complete-quick-fix/orchestrator.js:1040, scripts/modules/sd-next/claim-analysis.js:283, scripts/sd-start.js (:1207,:1244,:1467), plus the 2 this SD fixes. This corroborates the LEAD-phase re-derivation (13 raw sites across 9 files remaining after this SD, NOT ~14) and confirms the count-anchored allowlist is the RIGHT design: scripts/sd-start.js and lib/claim-guard.mjs both MIX wrapped and raw calls, so a boolean per-file allowlist would blind the lint to a new raw call in an already-listed file.',

  'TESTABILITY VERDICT: ALL FOUR FRs are verifiable with FAST, MOCKED-SUPABASE UNIT TESTS. No integration test and no live DB is required for any FR. A proven mock harness already exists and should be reused rather than re-derived: tests/unit/fleet/best-effort-release-sd-scoping.test.js makeSupabase(heldSdKey, {fromError}) builds exactly the rpc-spy + chained from().select().eq().maybeSingle() double every FR-1/FR-2/FR-3 case needs. FR-4 is testable via a fixture directory plus --root.',

  'BEHAVIOR-CHANGE WORTH AN EXPLICIT TEST (not a defect, but must be pinned). FR-1 makes the SD-completion chokepoint FAIL-CLOSED: if claude_sessions is unreadable at runtime the release now SKIPS where it previously RELEASED. That is the correct and intended trade (an unverifiable scope check must not degrade into unscoped behavior), but it is a real change on the highest-traffic release path and deserves its own named test rather than arriving as a side effect.',

  'LOW-RISK ADJACENCY CHECKED AND CLEARED: tests/unit/session-writer/no-bypass.test.js:53 allowlists scripts/modules/handoff/claim-swapper.js as a file writing claude_sessions without current_branch. FR-2 touches only a SELECT and the RPC (the writes live in swapClaim), so the allowlist entry stays valid and this static-pinning test is unaffected.'
];

const RECOMMENDED_CASES = [
  'FR-1: release fires when session genuinely holds the completing SD (rpc called once, p_reason=completed).',
  'FR-1: sd_mismatch — claude_sessions.sd_key mirrors SD-B while SD-A completes -> rpc NEVER called, SD-B claim untouched (the PRD AC-2 case).',
  'FR-1: scope_unverifiable — .from missing or select errors -> rpc NEVER called, function still resolves undefined (never throws).',
  'FR-1: heartbeat is stopped UNCONDITIONALLY — assert stopHeartbeat() runs on the sd_mismatch AND scope_unverifiable paths, not just the released path. This is the FR-1 half most likely to be missed, since today it is nested inside the guard.',
  'FR-1: no raw rpc(\'release_sd\') string remains in helpers.js releaseSessionClaim (source-pin, end-anchored on the function not a fixed char slice).',
  'FR-1: UPDATE the 3 breaking cases in tests/unit/stale-claim-release-on-completion.test.js by giving each double a .from stub; re-point case 2 so it pins sd_mismatch rather than accidentally pinning scope_unverifiable.',
  'FR-2: NEW unit test file. success:true + reason "Released <sdKey>" on the happy path.',
  'FR-2: sd_mismatch maps to {success:false} — the explicit guard against mapping `success: !res.error`, since error is null on that path.',
  'FR-2: select error maps to {success:false} with a DB-error-flavoured reason (scope_unverifiable).',
  'FR-2: session not found (maybeSingle -> data null) maps to {success:false}, not a silent release.',
  'FR-2: rpc returns {data:{success:false, error:"..."}} -> {success:false} carrying the payload message. THIS CASE IS THE FR-3 REGRESSION TRIPWIRE — it passes today and must still pass after the refactor.',
  'FR-2: releaseClaim never throws on an rpc rejection (contract preserved via the helper try/catch).',
  'FR-3: res.data.success===false -> {released:false, error set from data.error||data.message} in bestEffortReleaseSd.',
  'FR-3: res.data.success===true and res.data absent/null both still -> {released:true} (no false negative introduced on the two known SQL bodies that always return success:true).',
  'FR-4: synthetic fixture dir + --root containing one raw unallowlisted call -> exit 1 with file:line in the message (AC-1).',
  'FR-4: count-anchored allowlist — file with expected:2 and observed 2 passes; SAME file bumped to observed 3 FAILS. This is the whole reason the allowlist is not boolean and must be tested directly.',
  'FR-4: allowlist entry missing a non-empty reason throws loud (inherited contract from the model lint).',
  'FR-4: lib/fleet/best-effort-release.mjs:71 does NOT trigger the lint (structural exemption, AC-4).',
  'FR-4: comment-only mentions of release_sd do not false-positive — pin against scripts/sd-start.js:18 and lib/fleet/best-effort-release.mjs:5, both confirmed comment-only today.',
  'FR-4: lint exits 0 on the real corpus AFTER FR-1/FR-2 land, with the two hardened sites dropped from the allowlist counts.'
];

const SUMMARY = [
  'PLAN-TO-EXEC testability assessment: CONDITIONAL_PASS. All three named source files were read and all four FR descriptions are ACCURATE against current code (line numbers exact, not drifted): helpers.js inline guard :440 / raw rpc :441 / heartbeat nested :455-460; claim-swapper.js pre-check :100-114 / raw rpc :122; best-effort-release.mjs :72-77 checks res.error only.',
  'The scope is soundly testable — all four FRs are verifiable with fast mocked-supabase unit tests, no live DB and no integration test required, reusing the existing makeSupabase harness in tests/unit/fleet/best-effort-release-sd-scoping.test.js.',
  'CONCERNS (three, none fatal, all fixable inside EXEC): (1) FR-3 is an unstated HARD PREREQUISITE of FR-2 — claim-swapper.js:130-132 already contains the data.success===false check FR-3 adds to the helper, so doing FR-2 first would delete a working check and regress; (2) 3 of 5 existing cases in tests/unit/stale-claim-release-on-completion.test.js WILL BREAK on FR-1 because their supabase doubles lack .from and hit the helper\'s fail-closed branch — this test-update work is not enumerated in the PRD; (3) FR-4\'s model lint is a valid structural template but its detection is delegated to an eslint-rules/ rule file and its loadAllowlist()/violation matcher assume string-valued boolean entries, so both must be re-authored for {reason, expected:N} count-anchored semantics.',
  'Recommended EXEC ordering: FR-3 -> FR-1 -> FR-2 -> FR-4.'
].join(' ');

export async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: RECOMMENDED_CASES,
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/_testing-write-result-sd-leo-infra-claim-surface-sync-002-plan-to-exec.mjs',
      assessment_type: 'read_only_pre_implementation_testability',
      files_read: [
        'scripts/modules/handoff/executors/lead-final-approval/helpers.js',
        'scripts/modules/handoff/claim-swapper.js',
        'lib/fleet/best-effort-release.mjs',
        'scripts/lint/require-main-guard-in-one-off-lint.mjs',
        'tests/unit/stale-claim-release-on-completion.test.js',
        'tests/unit/fleet/best-effort-release-sd-scoping.test.js'
      ],
      fr_accuracy: { 'FR-1': 'confirmed', 'FR-2': 'confirmed', 'FR-3': 'confirmed', 'FR-4': 'confirmed_with_caveats' },
      blocking_ordering_dependency: 'FR-3 must land before or with FR-2 (claim-swapper.js:130-132 already implements the FR-3 check)',
      tests_predicted_to_break: [
        'tests/unit/stale-claim-release-on-completion.test.js :: releases via release_sd with p_reason...',
        'tests/unit/stale-claim-release-on-completion.test.js :: resolves the session selecting sd_key...',
        'tests/unit/stale-claim-release-on-completion.test.js :: falls back to sd.id as the claim id...'
      ],
      coverage_gap: 'claim-swapper.js releaseClaim has NO dedicated unit test; new file required for FR-2',
      integration_test_required: false,
      recommended_exec_order: ['FR-3', 'FR-1', 'FR-2', 'FR-4']
    }
  };

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN-TO-EXEC' });

  // A success return is not persistence — read the row back.
  const client = await getSupabaseClient();
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
