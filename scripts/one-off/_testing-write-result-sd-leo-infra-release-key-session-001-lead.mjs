#!/usr/bin/env node
/**
 * TESTING sub-agent evidence writer — SD-LEO-INFRA-RELEASE-KEY-SESSION-001, LEAD (prospective).
 *
 * PROSPECTIVE validation: run BEFORE any PRD or code exists, to check the SD's stated premise
 * against current source. Adapted from the sanctioned transcription pattern in
 * scripts/one-off/_testing-write-result-sd-leo-infra-claim-surface-sync-002-plan-to-exec.mjs:
 * same storeSubAgentResults() call, same metadata.repo_path / executed_from_cwd contract required
 * by v_sub_agent_repo_compliance, same read-back-after-write (a success return is not persistence).
 *
 * Written as a FILE rather than an inline node -e / heredoc INSERT: per CLAUDE_LEAD.md, inline
 * heredocs corrupt Windows backslash path literals.
 */

import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { toCanonicalRepoPath } from '../../lib/sub-agents/resolve-repo.js';
import { buildTestExecution } from '../../lib/sub-agents/testing/test-execution-record.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SD_KEY = 'SD-LEO-INFRA-RELEASE-KEY-SESSION-001';

const FINDINGS = [
  'PREMISE CONFIRMED, BUT THE SD BRIEF MISSTATES THE SIGNATURE. The live signature is release_sd(p_session_id TEXT, p_reason TEXT DEFAULT \'manual\') RETURNS jsonb — p_session_id is TEXT, NOT uuid. The planned scope item 1 specifies "release_sd_by_key(p_session_id uuid, p_sd_key text, p_reason text)". A uuid parameter would create an OVERLOAD that cannot be called by any existing JS caller (all pass session_id as a string) and would diverge from the whole claim-RPC family (claim_sd, switch_sd_claim, release_session all take text). The new RPC MUST be (text, text, text) for signature parity.',

  'THERE IS NO "claims TABLE". Scope item 1 says the RPC touches the "claims table + claude_sessions pointer". No such table exists — 20260218_consolidate_sd_claims_into_claude_sessions.sql consolidated sd_claims INTO claude_sessions. Claim state today lives on THREE surfaces: (a) claude_sessions.sd_key — the SCALAR pointer, only one per session; (b) strategic_directives_v2.claiming_session_id + active_session_id + is_working_on; (c) quick_fixes.claiming_session_id + status. The PRD must be rewritten against these three surfaces or EXEC will code against a table that does not exist.',

  'THE MULTI-HOLD DEFECT IS REAL AND MECHANICALLY CONFIRMED. Because claude_sessions.sd_key is scalar, a seat holding 3 claims holds them as 3 rows with strategic_directives_v2.claiming_session_id = <session>, while sd_key points at only ONE. release_sd SELECTs sd_key INTO v_sd_key and releases exactly that one; the other two are unreachable by the RPC. Confirmed verbatim in database/migrations/20260727_release_sd_qf_reopen.sql (the CURRENT definition).',

  'THE SD BRIEF NAMES ONLY 3 MIGRATIONS; THERE ARE AT LEAST 9 REDEFINITIONS. Beyond the three cited (20251204, 20260130, 20260727), release_sd is also redefined in 20260213_claim_guard_enforcement, 20260218_consolidate_sd_claims_into_claude_sessions, 20260306_add_qf_claim_support, 20260408_claim_check_hardening, 20260502_claim_sd_worktree_columns, and 20260502_release_clear_worktree_state. THE AUTHORITATIVE CURRENT BODY IS 20260727_release_sd_qf_reopen.sql — the 20260130 body the brief cites as current is SIX redefinitions stale. Any PRD that derives the "existing pattern" from 20260130 will encode a body that no longer runs.',

  'release_sd DOES NO ROW-LEVEL LOCKING AT ALL. Its body is a bare SELECT sd_key (no FOR UPDATE) then UPDATEs. The pessimistic locking the brief assumes lives in switch_sd_claim, not release_sd. So "match the existing locking pattern" must mean match switch_sd_claim, not release_sd.',

  'switch_sd_claim LOCK ORDER, MEASURED (20260609_switch_sd_claim_existence_terminal_guards.sql, current): (1) SELECT * FROM claude_sessions WHERE session_id AND status=\'active\' FOR UPDATE; (2) conflict probe on claude_sessions (no lock); (3) SELECT status FROM strategic_directives_v2 WHERE sd_key = p_NEW_sd_id FOR UPDATE (or quick_fixes for QF-); then UPDATEs old SD (CAS in WHERE, NO lock taken), claude_sessions, new SD. Canonical order: SESSION ROW FIRST, THEN THE TARGET WORK-ITEM ROW. The OLD item row is never locked — it is protected only by the CAS predicate (active_session_id = p_session_id OR claiming_session_id = p_session_id).',

  'CONCURRENCY HAZARD #1 — ABBA DEADLOCK IF LOCK ORDER IS INVERTED. The natural implementation of release_sd_by_key is "lock the named SD row, verify the session holds it, release it" — i.e. SD row FIRST, claude_sessions second. That is the EXACT INVERSE of switch_sd_claim, which takes claude_sessions FOR UPDATE first. A release_sd_by_key(S, X) running concurrently with switch_sd_claim(S\', old, X) deadlocks: one holds claude_sessions and wants the X row, the other holds the X row and wants claude_sessions. MITIGATION: release_sd_by_key MUST take claude_sessions FOR UPDATE first, then the named work-item row — identical order to switch_sd_claim.',

  'CONCURRENCY HAZARD #2 — THE ATOMIC RETARGET NEEDS DETERMINISTIC MULTI-ROW ORDERING. Scope item 2 (release named key + claim next key in one transaction) locks TWO work-item rows. switch_sd_claim only ever locks ONE (the new target), so it provides NO precedent for ordering two. Two seats retargeting in opposite directions (seat1 A->B, seat2 B->A) will deadlock on the SD rows even with claude_sessions locked first, because each session locks its OWN claude_sessions row (no contention there) and then contends on A/B in opposite orders. MITIGATION: lock the two work-item rows in a deterministic collation order (ORDER BY sd_key in a single SELECT ... FOR UPDATE), not in logical release-then-claim order.',

  'CONCURRENCY HAZARD #3 — THE EXISTING JS GUARD IS A TOCTOU, AND THAT IS THE REAL BUG TO KILL. lib/fleet/best-effort-release.mjs bestEffortReleaseSd() implements expectedSdKey as CHECK-THEN-ACT: it SELECTs claude_sessions.sd_key (NO lock, separate round trip), compares in JS, and only then calls rpc(\'release_sd\'). Between the read and the RPC a concurrent claim_sd/switch_sd_claim can move the pointer, and release_sd then releases whatever the pointer NOW points at. The guard NARROWS the QF-20260726-593 window; it does not close it. Moving the predicate INTO the RPC (single statement, under the session-row lock) is the actual fix and should be stated as an explicit PRD acceptance criterion, not left implicit.',

  'CALL SITE 1 CONFIRMED — /checkin release_request handler: lib/checkin/steps/release-request.cjs. It ALREADY CONTAINS THE WORKAROUND THIS SD REPLACES. It walks up to 5 SDs claimed by the session, and for each calls bestEffortReleaseSd(sb, sessionId, `release_request:${reason}`, console.error, { expectedSdKey: row.sd_key }). Its own inline comment states the defect verbatim: "release_sd takes NO SD argument — it releases whatever claude_sessions.sd_key currently points at. This loop walks up to 5 SDs claimed by this session, so an unscoped call could clear the release_request flag on THIS row while releasing a DIFFERENT, live SD." This is the single strongest piece of evidence for the SD and should be quoted in the PRD.',

  'CALL SITE 1 SIDE EFFECT THE PRD MUST PRESERVE: this handler does more than release. It clears row.metadata.release_request under a CAS (.eq(claiming_session_id, sessionId), requires exactly 1 row), inserts a system_events audit row (event_type=\'work_release_request_honored\', actor_type=\'agent\', actor_role=\'fleet-worker\', sd_id, payload{sd_key,session_id,request,released,release_error}), and conditionally nulls ctx.mySd ONLY on a CONFIRMED release (if (rel.released && ctx.mySd === row.sd_key)). Any rewiring MUST keep branching on a released-boolean, NOT on error — see the return-shape trap below.',

  'CALL SITE 2 CONFIRMED — stale-session sweep: scripts/stale-session-sweep.cjs. It imports bestEffortReleaseSd from ../lib/fleet/best-effort-release.mjs and calls it with reason \'CLAIM_BOUNDARY_PROBE\'. It ALSO already hand-rolls a second TOCTOU mitigation: before releasing it re-reads the live row (.select(\'sd_key, last_tool_at\')) and ABORTS if liveRow.sd_key !== s.sd_key ("claim changed since snapshot ... session is live"). A key-scoped RPC makes this JS re-read redundant — the PRD should say whether to delete it or keep it as defense-in-depth (recommend: keep, but demote its comment from "guard" to "fast-path").',

  'THE REFUSAL ERROR CODE IS ALREADY ESTABLISHED, AND IT IS NOT AN SQL CODE. bestEffortReleaseSd returns { released:false, error:null, skipped:\'sd_mismatch\', heldSdKey } on refusal. The brief\'s "error codes used for refusal like sd_mismatch" is a JS-LAYER discriminator, not a Postgres error. The RPC family\'s own SQL-layer convention is a jsonb payload {success:false, error:\'<code>\'} with codes sd_not_found and sd_terminal_status (switch_sd_claim/claim_sd). RECOMMENDATION: release_sd_by_key returns jsonb {success:false, error:\'sd_mismatch\'} to bridge both conventions, so the existing JS skipped-discriminator maps 1:1.',

  'RETURN-SHAPE TRAP (regression risk, previously bit SD-LEO-INFRA-CLAIM-SURFACE-SYNC-002). On refusal bestEffortReleaseSd sets error to NULL. Any new wrapper mapping success as `!res.error` reports success:true for a release that NEVER HAPPENED. Every rewired call site must key on res.released / data.success, never on error-absence.',

  'BLIND-SPOT IN AN EXISTING CONTROL — THE WRAPPER LINT WILL NOT SEE THE NEW RPC. scripts/lint/require-release-sd-wrapper-lint.mjs (+ eslint-rules/require-release-sd-wrapper.js) matches the LITERAL string \'release_sd\' in a .rpc() member call. A new release_sd_by_key call site is outside its detection, so the class guard that exists precisely to stop raw unscoped release calls will silently NOT cover the new primitive. Worse, \'release_sd_by_key\' may substring-match \'release_sd\' depending on the rule\'s comparison (equality vs includes) — EXEC must check which, since a substring match would produce false positives on every correct new call site. This is a REQUIRED PRD deliverable, not a nice-to-have.',

  'ALLOWLIST COUPLING: scripts/lint/require-release-sd-wrapper-allowlist.json is COUNT-ANCHORED (each entry carries an expected N). Rewiring call sites CHANGES those counts, so the allowlist must be updated in the same PR or the lint fails. The lint deliberately passes silently when observed < expected (a site was fixed) but FAILS when a file has no entry at all.',

  'STRUCTURAL EXEMPTION TO PRESERVE: lib/fleet/best-effort-release.mjs is excluded from the lint scan OUTRIGHT (not allowlisted) as the one sanctioned wrapper implementation. If release_sd_by_key gets a sibling wrapper, it needs the same structural exemption or it will report itself as a violation.'
];

const RECOMMENDED_CASES = [
  'TEST 1 (three-hold release) — tests/database/release-sd-by-key-guards.test.js. NEW FILE, modeled byte-for-byte on tests/database/switch-sd-claim-guards.test.js: live-DB integration, createClient with SUPABASE_SERVICE_ROLE_KEY, describe.skipIf gating so CI skips cleanly without service-role creds, NET-ZERO (probe session inserted in beforeAll, hard-deleted in afterAll; real-SD writes restored to captured pre-state). Seed one session holding 3 SDs (claiming_session_id on 3 rows, sd_key pointing at #1); call release_sd_by_key(session, SD#2); assert SD#2 cleared, SD#1 AND SD#3 UNTOUCHED, and claude_sessions.sd_key STILL points at SD#1 (the pointer must NOT move when releasing a non-pointer claim — this is the single most important assertion in the SD).',
  'TEST 1b (pointer case) — same file: release_sd_by_key(session, SD#1) where sd_key DOES point at SD#1 -> pointer nulled, released_at/released_reason/status=idle set, worktree_path and worktree_branch NULLED. The worktree nulling is required by the ck_claude_sessions_worktree_state_consistency CHECK constraint (20260502_claude_sessions_worktree_invariant.sql): (sd_key IS NOT NULL) OR (worktree_path IS NULL AND worktree_branch IS NULL). OMITTING IT WILL RAISE A CONSTRAINT VIOLATION AT RUNTIME — assert it explicitly.',
  'TEST 2 (refused release of unheld key) — same file: call release_sd_by_key(session, SD_the_seat_does_not_hold) -> returns {success:false, error:\'sd_mismatch\'}, and assert NET-ZERO: the target SD row and all three held rows are byte-identical before/after. Mirror switch-sd-claim-guards.test.js\'s explicit "inherently net-zero (asserted explicitly)" style rather than only checking the return value.',
  'TEST 2b: release_sd_by_key(session, \'SD-PHANTOM-DOES-NOT-EXIST\') -> sd_not_found, no write. switch_sd_claim needed this guard added retroactively (PAT-OPTIMISTIC-RPC); do not repeat the omission.',
  'TEST 2c: QF- prefixed key path — release_sd_by_key(session, \'QF-...\') must inherit the 20260727 QF branch semantics: holder CAS AND the guarded status revert (in_progress AND pr_url IS NULL AND commit_sha IS NULL -> open). A key-scoped RPC that clears claiming_session_id WITHOUT the reopen re-creates the exact 7-row stranding defect that SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 FR-2 fixed. THIS IS THE HIGHEST-RISK REGRESSION IN THE SD.',
  'TEST 3 (atomic retarget) — same file: retarget(session, from=SD#2, to=SD#4) succeeds -> SD#2 released, SD#4 claimed, sd_key updated, in ONE transaction. Then the FAILURE case: retarget onto a TERMINAL or PHANTOM new target -> assert NO PARTIAL STATE (SD#2 still held, SD#4 untouched, sd_key unmoved). The partial-state assertion is the whole point of "atomic" and must be a separate it() block.',
  'TEST 3b (deadlock regression, the hazard-2 pin) — two concurrent retargets in opposite directions (A->B and B->A) must not deadlock. Practical form: assert the SQL TEXT takes its FOR UPDATE locks in a deterministic collation order (single SELECT ... WHERE sd_key IN (a,b) ORDER BY sd_key FOR UPDATE) rather than sequential release-then-claim locks. A true concurrent-execution test is flaky; the source-pin is the reliable control.',
  'TEST 4 (SQL-text invariant, CI-safe) — tests/unit/db/release-sd-by-key-sql.test.js. NEW FILE, modeled on tests/unit/db/release-sd-qf-branch-sql.test.js. CRITICAL INHERITED LESSON from that file: STRIP ALL -- COMMENT LINES BEFORE MATCHING. Its first version matched the header comment (which quotes the OLD defective statement verbatim to explain the bug) and asserted against the documentation of the defect instead of the fix. Pin: signature is (text,text,text) not uuid; claude_sessions is locked FOR UPDATE BEFORE any work-item row; the QF branch retains both the holder CAS and the guarded reopen.',
  'TEST 4 SCOPE CAVEAT TO RESTATE IN THE FILE HEADER (verbatim from the precedent): an SQL-text test proves the migration FILE says the right thing, NOT that it was APPLIED. A staged-but-never-deployed migration passes every assertion. Pair it with a named manual pooler verification script (scripts/one-off/verify-release-sd-by-key.mjs) as the precedent does with verify-release-sd-qf-branch.mjs.',
  'TEST 5 (JS wrapper unit tests) — tests/unit/fleet/best-effort-release-by-key.test.js, reusing the makeSupabase(heldSdKey, {fromError}) mock harness in tests/unit/fleet/best-effort-release-sd-scoping.test.js. Assert the new key-scoped path no longer performs the pre-read SELECT (the TOCTOU is gone), and that sd_mismatch still surfaces as a released:false discriminator for existing callers.',
  'TEST 6 (lint coverage) — extend the require-release-sd-wrapper lint fixture tests to cover release_sd_by_key, and pin whether the rule compares by equality or substring (a substring match false-positives every correct new call site).',
  'REGRESSION SWEEP: re-run tests/unit/claim/release-claim-both-surfaces.test.js, tests/integration/claim-boundary-probe.integration.test.js, tests/database/claim-dual-column-consistency.test.js, tests/e2e/claim-dual-truth-regression.test.js and tests/unit/db/release-sd-qf-branch-sql.test.js — all five touch the surfaces this SD changes.',
  'NOTE ON THE db VITEST PROJECT: per the release-sd-qf-branch-sql.test.js header, the db vitest project is gated to ZERO files (QF-20260726-459 Part 1b) and no CI path touches a database. A live-DB test placed there would report green having executed NOTHING. EXEC must confirm which project actually runs tests/database/*.test.js before claiming Test 1-3 are covered in CI.'
];

const SUMMARY = [
  'PROSPECTIVE (pre-PRD, pre-code) testability assessment: CONDITIONAL_PASS. The CORE DEFECT IS REAL AND CONFIRMED — release_sd releases only the scalar claude_sessions.sd_key pointer, so a multi-hold seat cannot release a specific non-pointer claim. lib/checkin/steps/release-request.cjs already carries an inline comment stating the defect verbatim, and both named call sites already hand-roll TOCTOU workarounds around it.',
  'THREE PREMISE CORRECTIONS THE PRD MUST ABSORB BEFORE EXEC: (1) the signature is (text, text) — p_session_id is TEXT, not uuid; a uuid parameter creates an uncallable overload and breaks parity with the entire claim-RPC family. (2) There is NO "claims table" — sd_claims was consolidated into claude_sessions in 20260218; claim state lives on claude_sessions.sd_key + strategic_directives_v2.claiming_session_id/active_session_id + quick_fixes.claiming_session_id. (3) The brief cites 20260130 as the current body, but release_sd has been redefined at least SIX times since; the authoritative body is 20260727_release_sd_qf_reopen.sql.',
  'THREE CONCURRENCY HAZARDS FOUND. (H1) The natural "lock the SD row then check the session" implementation INVERTS switch_sd_claim\'s lock order (claude_sessions FOR UPDATE first, then the target work-item row) and will ABBA-deadlock against a concurrent switch_sd_claim. (H2) The atomic retarget locks TWO work-item rows where switch_sd_claim locks only one, so it has no precedent to copy; opposite-direction retargets deadlock unless the two rows are locked in a deterministic collation order. (H3) The existing expectedSdKey guard in bestEffortReleaseSd is a check-then-act TOCTOU (unlocked SELECT, then a separate RPC round trip) — it narrows the QF-20260726-593 window without closing it, and closing it by moving the predicate into the RPC should be an explicit acceptance criterion.',
  'TWO REGRESSION RISKS RATED HIGHEST: (a) the QF- branch must inherit BOTH the holder CAS and the guarded status revert from 20260727, or the key-scoped RPC re-creates the 7-row stranding defect that migration fixed; (b) the release path must NULL worktree_path/worktree_branch or it violates the ck_claude_sessions_worktree_state_consistency CHECK constraint at runtime.',
  'CONTROL GAP: scripts/lint/require-release-sd-wrapper-lint.mjs matches the literal string release_sd, so the new primitive escapes the very class guard built to stop unscoped release calls; its count-anchored allowlist also breaks when call sites are rewired. Lint coverage is a required PRD deliverable, not optional.',
  'SCOPE IS TESTABLE. Strong precedents exist for all three required tests: tests/database/switch-sd-claim-guards.test.js (live-DB, gated, net-zero) for tests 1-3, and tests/unit/db/release-sd-qf-branch-sql.test.js (comment-stripped SQL-text invariant) for the CI-safe text pin. Caveat: the db vitest project is gated to zero files, so EXEC must confirm which project actually executes tests/database/*.test.js before claiming CI coverage.'
].join(' ');

export async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

  const results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 87,
    summary: SUMMARY,
    findings: FINDINGS,
    recommendations: RECOMMENDED_CASES,
    metadata: {
      repo_path: toCanonicalRepoPath(repoRoot),
      executed_from_cwd: process.cwd(),
      recorded_by: 'scripts/one-off/_testing-write-result-sd-leo-infra-release-key-session-001-lead.mjs',
      validation_mode: 'prospective',
      // HONEST UNMEASURED VERDICT (the SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 measured:false
      // exemption). This is a PRE-PRD, PRE-CODE assessment: release_sd_by_key does not exist,
      // no test file exists, so there was genuinely nothing to execute. Zero counts are real,
      // not a placeholder for a run that was skipped.
      measured: false,
      test_execution: buildTestExecution({
        executed: 0, passed: 0, failed: 0, skipped: 0,
        runner: null,
        source: 'prospective_static_source_review'
      }),
      assessment_type: 'read_only_pre_prd_prospective_testability',
      files_read: [
        'database/migrations/20260727_release_sd_qf_reopen.sql',
        'database/migrations/20260609_switch_sd_claim_existence_terminal_guards.sql',
        'database/migrations/20260502_claude_sessions_worktree_invariant.sql',
        'lib/fleet/best-effort-release.mjs',
        'lib/checkin/steps/release-request.cjs',
        'lib/claim/release-claim-both-surfaces.mjs',
        'scripts/stale-session-sweep.cjs',
        'scripts/lint/require-release-sd-wrapper-lint.mjs',
        'tests/database/switch-sd-claim-guards.test.js',
        'tests/unit/db/release-sd-qf-branch-sql.test.js'
      ],
      premise_corrections: {
        signature: 'release_sd(p_session_id TEXT, p_reason TEXT DEFAULT manual) — TEXT not uuid; scope item 1 specifies uuid and is WRONG',
        no_claims_table: 'sd_claims consolidated into claude_sessions by 20260218; scope item 1 references a nonexistent "claims table"',
        stale_migration_citation: 'brief cites 20260130 as current; authoritative body is 20260727_release_sd_qf_reopen.sql (6+ redefinitions later)'
      },
      canonical_lock_order: 'claude_sessions FOR UPDATE (session_id, status=active) -> then target work-item row FOR UPDATE (strategic_directives_v2.sd_key or quick_fixes.id)',
      concurrency_hazards: [
        'H1 ABBA deadlock: locking the SD row before claude_sessions inverts switch_sd_claim order',
        'H2 retarget locks two work-item rows with no switch_sd_claim precedent; needs deterministic collation-order locking',
        'H3 existing expectedSdKey guard is an unlocked check-then-act TOCTOU; narrows but does not close QF-20260726-593'
      ],
      confirmed_call_sites: [
        'lib/checkin/steps/release-request.cjs — bestEffortReleaseSd(..., {expectedSdKey: row.sd_key}) inside a 5-SD loop; inline comment states the defect verbatim',
        'scripts/stale-session-sweep.cjs — bestEffortReleaseSd(..., CLAIM_BOUNDARY_PROBE) plus a hand-rolled live-row re-read abort'
      ],
      highest_regression_risks: [
        'QF- branch must inherit holder CAS + guarded status revert from 20260727 or re-creates the stranding defect',
        'release must NULL worktree_path/worktree_branch or violates ck_claude_sessions_worktree_state_consistency'
      ],
      control_gap: 'scripts/lint/require-release-sd-wrapper-lint.mjs matches literal release_sd; new RPC escapes the class guard and the count-anchored allowlist breaks on rewiring',
      proposed_test_files: [
        'tests/database/release-sd-by-key-guards.test.js (new, models switch-sd-claim-guards.test.js)',
        'tests/unit/db/release-sd-by-key-sql.test.js (new, models release-sd-qf-branch-sql.test.js)',
        'tests/unit/fleet/best-effort-release-by-key.test.js (new, reuses makeSupabase harness)'
      ],
      ci_coverage_caveat: 'db vitest project gated to zero files (QF-20260726-459 Part 1b); EXEC must confirm which project runs tests/database/*.test.js'
    }
  };

  const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'LEAD' });

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
