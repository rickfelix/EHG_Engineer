#!/usr/bin/env node
// PLAN: Insert PRD for SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001.
// Canonical add-prd-to-database.js fell back to inline-LLM mode and emitted the
// generation prompt without persisting a row; this one-off completes the insert
// step using the schema-validated shape (mirrors recent PRD-SD-LEO-INFRA-* rows).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001';
const SD_UUID = '3be00f10-e38d-488c-95d2-f3c2cea88dec';
const PRD_ID = `PRD-${SD_KEY}`;

const FRS = [
  {
    id: 'FR-1',
    title: 'Refuse claim acquisition on cancelled SDs in claim-guard pre-acquire path',
    priority: 'high',
    description: 'In lib/claim-guard.mjs::claimGuard, before any claim_sd RPC or claiming_session_id UPDATE, fetch strategic_directives_v2.status for the target sdKey. If status === "cancelled" return { success: false, error: "sd_cancelled", owner: undefined } with formatClaimFailure rendering a banner that includes the cancellation_reason. The check must run AFTER the same-session-already-owns short-circuit (so a stale claim on a cancelled SD does not loop) but BEFORE the ambiguous/stale auto-release branch. Mirror the existing fail-closed shape used by the active-session HARD STOP at lines 234-244.',
    acceptance_criteria: [
      'AC-1.1: claimGuard("SD-CANCELLED-FIXTURE", sessionId) returns { success: false, error: /sd_cancelled/i } without writing any row to strategic_directives_v2 or claude_sessions.',
      'AC-1.2: When the SD already has claiming_session_id===mySessionId AND status==="cancelled", claimGuard refuses with sd_cancelled (does NOT short-circuit through the same-session branch — cancelled state takes precedence).',
      'AC-1.3: formatClaimFailure on a sd_cancelled result renders a banner containing the literal string "CANCELLED" and the cancellation_reason value.',
      'AC-1.4: Existing tests in tests/unit/claim-guard*.test.js continue to pass; new vitest case asserts the cancelled-refusal path returns BEFORE supabase.from("strategic_directives_v2").update is called.'
    ]
  },
  {
    id: 'FR-2',
    title: 'Assert cancelled-status check in claim-validity-gate.js::assertValidClaim',
    priority: 'high',
    description: 'In lib/claim-validity-gate.js::assertValidClaim, extend the strategic_directives_v2 SELECT at lines 222-227 to include `status` in the column list. After the existing sd_not_found check, when sd.status === "cancelled" throw new ClaimIdentityError({ reason: "sd_cancelled", operation, sdKey, remediation: "SD has been cancelled. The claim cannot be validated." }). Add "sd_cancelled" to the discriminant union in the JSDoc and to the toBanner() switch so banners render an actionable message.',
    acceptance_criteria: [
      'AC-2.1: assertValidClaim against a fixture with status="cancelled" throws ClaimIdentityError with reason="sd_cancelled" — no further checks run (worktree validation is skipped).',
      'AC-2.2: ClaimIdentityError instance for sd_cancelled has both .reason and .toBanner() containing the SD key, the operation label, and a remediation pointer.',
      'AC-2.3: assertValidClaim against an active SD (status="active" or "draft") behaves identically to pre-change (regression check).'
    ]
  },
  {
    id: 'FR-3',
    title: 'Global is_working_on=false sweep + post-condition assertion in cancel-sd.js',
    priority: 'high',
    description: 'In scripts/cancel-sd.js::cancelSD, after the existing per-SD UPDATE at lines 107-113, perform a defensive global sweep: UPDATE strategic_directives_v2 SET is_working_on=false WHERE id=<cancelled-uuid> AND is_working_on=true (idempotent, no rows changed when the per-SD UPDATE already cleared the flag). Then read back the row and assert is_working_on === false; if not, log an error and process.exit(2). Also UPDATE claude_sessions SET sd_key=NULL, status="released", released_at=NOW() WHERE sd_key=<cancelled-sd-key> (release ALL sessions, not just the holder — orphan claim cleanup). Surface the count of released sessions in the success log.',
    acceptance_criteria: [
      'AC-3.1: After cancelSD runs, post-condition SELECT confirms is_working_on=false on the cancelled SD; if the assertion fails the script exits with code 2 and the failure message contains the literal "POST_CONDITION_FAILED".',
      'AC-3.2: Multiple claude_sessions rows pointing at the same sd_key (orphan/duplicate claim case) are ALL released in a single UPDATE; the success log prints "Released N claude_sessions row(s)" with N matching the actual count.',
      'AC-3.3: Idempotency: running cancel-sd twice on the same SD prints "already cancelled (status=cancelled). No-op." on the second invocation and the global sweep still runs without error (covers the case where the prior run succeeded but a stale is_working_on=true row was written between cancellations).',
      'AC-3.4: Existing tests/unit/harness/cancel-sd-script.test.js continues to pass; new test asserts the post-condition guard exits non-zero when supabase mock returns is_working_on=true post-update.'
    ]
  },
  {
    id: 'FR-4',
    title: 'Post-render cancellation re-check in sd-start.js between SD lookup and claimGuard',
    priority: 'medium',
    description: 'In scripts/sd-start.js, between the resolveSDByKey call and the await claimGuard(...) at line 880, add a defensive re-fetch of strategic_directives_v2.status. If status==="cancelled" since the initial lookup (TOCTOU window: another session cancelled between sd:next render and sd-start invocation), print a banner naming the cancellation_reason and process.exit(2) BEFORE any claim is attempted. The check is bounded by ~250ms (single SELECT) and fail-open on query error (a transient DB hiccup must not block legitimate claims).',
    acceptance_criteria: [
      'AC-4.1: sd-start invoked against an SD whose status flipped to "cancelled" between lookup and claim attempt exits with code 2 and stderr contains "SD_CANCELLED_DURING_STARTUP".',
      'AC-4.2: The re-check fails open: a 500-ms timeout simulated via mock yields a warning log line "[sd-start] cancellation re-check soft-failed" and falls through to claimGuard (defense-in-depth: claim-guard FR-1 will still refuse).',
      'AC-4.3: For non-cancelled SDs the re-check adds <500ms p95 latency to sd-start (single SELECT by primary key on indexed sd_key column).'
    ]
  },
  {
    id: 'FR-5',
    title: 'PG trigger refusing claiming_session_id writes when status=cancelled (defense-in-depth)',
    priority: 'medium',
    description: 'New SQL migration adds a BEFORE UPDATE trigger function `enforce_no_claim_on_cancelled_sd` on strategic_directives_v2. When OLD.status="cancelled" AND NEW.claiming_session_id IS NOT NULL AND OLD.claiming_session_id IS NULL, RAISE EXCEPTION "claiming_session_id cannot be set on cancelled SD %", OLD.sd_key. Allow NEW.claiming_session_id=NULL transitions (release path). Allow NEW.status transitions (e.g., un-cancelling — though no current path does that). This defends against ANY writer (including future scripts not yet written) bypassing the application-layer FR-1/FR-2 checks.',
    acceptance_criteria: [
      'AC-5.1: Migration applies cleanly via supabase migration up; no errors on existing rows.',
      'AC-5.2: Direct UPDATE strategic_directives_v2 SET claiming_session_id=<uuid> WHERE sd_key=<cancelled-sd-key> raises SQLSTATE P0001 with message containing "cancelled SD".',
      'AC-5.3: UPDATE strategic_directives_v2 SET claiming_session_id=NULL WHERE sd_key=<cancelled-sd-key> succeeds (release path is permitted).',
      'AC-5.4: UPDATE on active SDs is unaffected — pre-existing test suites green.',
      'AC-5.5: Migration is idempotent (DROP TRIGGER IF EXISTS … then CREATE) so re-applying does not error.'
    ]
  },
  {
    id: 'FR-6',
    title: 'Static guard test pinning all 5+ is_working_on=true writers',
    priority: 'medium',
    description: 'New vitest test file tests/unit/harness/is-working-on-writers-static-guard.test.js scans the source tree for files matching `is_working_on:\\s*true` patterns and asserts every match site is one of the 5+ canonical writers enumerated in the SD description. New writer sites added without updating the allowlist FAIL the test (forces conscious gating). Locations pinned: lib/claim-guard.mjs, lib/drain-orchestrator.mjs, scripts/modules/handoff/executors/plan-to-exec/state-transitions.js, scripts/stale-session-sweep.cjs (×2 sites), scripts/leo-continuous.js. The test is the writer/consumer-asymmetry pattern witness from the SD description.',
    acceptance_criteria: [
      'AC-6.1: Test enumerates exactly 6 source-code occurrences of `is_working_on:\\s*true` across the 5 files (not counting test-fixture files which are excluded by glob).',
      'AC-6.2: Adding a 7th occurrence in a new src/ file causes the test to fail with a message naming the unexpected file:line.',
      'AC-6.3: Removing one of the canonical sites also fails the test (prevents accidental deletion of a write-side that another consumer depends on).',
      'AC-6.4: Test excludes docs/, .claude/, database/manual-updates/, and database/migrations/ (those are SQL and non-source contexts).'
    ]
  }
];

const TS = [
  { id: 'TS-1', test_type: 'unit', scenario: 'FR-1 happy path: cancelled SD refused at claim-guard', given: 'fixture SD with status="cancelled" in mocked supabase', when: 'claimGuard(sdKey, sessionId) is called', then: 'returns { success:false, error:"sd_cancelled" }; supabase.from(strategic_directives_v2).update is NOT called' },
  { id: 'TS-2', test_type: 'unit', scenario: 'FR-1 takes precedence over same-session-owns short-circuit', given: 'fixture SD with status="cancelled" AND claiming_session_id===mySessionId', when: 'claimGuard runs', then: 'still refuses with sd_cancelled (no fall-through to PROCEED)' },
  { id: 'TS-3', test_type: 'unit', scenario: 'FR-2 assertValidClaim throws on cancelled', given: 'fixture SD with status="cancelled"', when: 'assertValidClaim is invoked', then: 'throws ClaimIdentityError with reason="sd_cancelled" and worktree validation is never reached' },
  { id: 'TS-4', test_type: 'integration', scenario: 'FR-3 cancel-sd post-condition guard fails closed', given: 'cancelSD() runs against a fixture that mocks the per-SD UPDATE to leave is_working_on=true', when: 'the post-condition SELECT returns is_working_on=true', then: 'process exits with code 2 and stderr contains "POST_CONDITION_FAILED"' },
  { id: 'TS-5', test_type: 'integration', scenario: 'FR-3 multiple claude_sessions rows released atomically', given: 'fixture with 3 claude_sessions rows pointing at the same sd_key', when: 'cancelSD runs', then: 'all 3 rows have status="released" and sd_key=NULL after the update; success log says "Released 3 claude_sessions row(s)"' },
  { id: 'TS-6', test_type: 'integration', scenario: 'FR-4 sd-start re-check exits non-zero on TOCTOU cancellation', given: 'sd-start invoked with a real sdKey; mock UPDATE flips status to "cancelled" between lookup and re-check', when: 'sd-start runs the re-check', then: 'exits code 2; stderr contains "SD_CANCELLED_DURING_STARTUP"; claimGuard is never called' },
  { id: 'TS-7', test_type: 'integration', scenario: 'FR-5 PG trigger blocks direct UPDATE on cancelled SD', given: 'a real cancelled SD in the test schema', when: 'UPDATE strategic_directives_v2 SET claiming_session_id=<uuid> WHERE sd_key=<cancelled-key>', then: 'query fails with SQLSTATE P0001 and the trigger message contains "cancelled SD"' },
  { id: 'TS-8', test_type: 'unit', scenario: 'FR-6 static guard catches an unauthorized new writer', given: 'a temporary fixture file added to lib/ containing is_working_on:true', when: 'the static-guard test runs', then: 'the test fails with a message naming the unauthorized site' }
];

const TR = [
  { id: 'TR-1', title: 'Reuse existing claim-guard / claim-validity-gate / cancel-sd modules', rationale: 'Adding a new SD-cancellation gate module would duplicate logic. The 4 application-layer wire-ins (FR-1/2/3/4) extend existing functions in-place; the 5th wire-in (FR-5) is a SQL-level defense-in-depth.', description: 'No new lib/*.mjs file. All edits are surgical — narrow conditional branches added before existing happy-path code. Total ~55 source LOC across 4 files plus a ~30 LOC SQL migration.' },
  { id: 'TR-2', title: 'Migration filename prefix follows existing convention', rationale: 'database/migrations/ uses NNN_description.sql. Next available number after the most recent existing migration. Trigger function name uses the existing `enforce_*` prefix from migration 027.', description: 'New file: database/migrations/<NNN>_block_claims_on_cancelled_sd.sql. Idempotent shape: DROP TRIGGER IF EXISTS … then CREATE OR REPLACE FUNCTION … then CREATE TRIGGER. No data backfill required (the trigger is BEFORE UPDATE; existing rows are not retroactively affected).' },
  { id: 'TR-3', title: 'Static-guard glob selectively excludes non-source paths', rationale: 'is_working_on appears in docs (~10 references), in .claude/ skill markdown (~3), in database/migrations/ SQL (~6), and in tests/. Without exclusions the static guard would never converge.', description: 'Test uses fast-glob with negative globs: `["lib/**/*.{js,mjs,cjs}", "scripts/**/*.{js,mjs,cjs}", "src/**/*.{js,mjs,cjs}"]` minus `["**/*.test.js", "**/test/**", "**/__tests__/**"]`. The pinned-writer allowlist is a hard-coded array of {file, lineRange} tuples that the test cross-references against grep matches.' }
];

const RISKS = [
  { id: 'R-1', risk: 'PG trigger blocks a legitimate edge case (e.g., un-cancellation flow)', impact: 'MEDIUM', mitigation: 'No current code path un-cancels an SD (cancel-sd has no inverse script). The trigger only fires on transitions FROM old.claiming_session_id IS NULL TO new.claiming_session_id IS NOT NULL while old.status="cancelled" — release transitions and pure status flips are still allowed. If un-cancellation is later required, a follow-up SD adds the trigger predicate.', probability: 'LOW', rollback_plan: 'Single migration to DROP the trigger (function can remain). No data unwind needed.' },
  { id: 'R-2', risk: 'Static-guard test becomes a maintenance tax — every legitimate new writer requires an allowlist edit', impact: 'LOW', mitigation: 'The friction is intentional: writer asymmetry is the 13th-witness pattern (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001). Forcing conscious allowlist edits surfaces every new write-site to review. The allowlist is a tuple table with file/lineRange; updating it is a 3-line change.', probability: 'MEDIUM', rollback_plan: 'Skip the static guard (delete the test file). Existing FR-1/2/3/4/5 still close the immediate cancelled-SD claim-defense gaps without the writer pinning.' },
  { id: 'R-3', risk: 'TOCTOU window in sd-start FR-4 still has a residual race between re-check and claimGuard', impact: 'LOW', mitigation: 'FR-1 (claim-guard refusal) is the inner defense — even if FR-4 misses the cancellation, FR-1 fires before any DB write. FR-5 (PG trigger) is the third layer. Three independent gates make the residual race window non-exploitable in practice.', probability: 'LOW', rollback_plan: 'Remove the FR-4 re-check; rely on FR-1 + FR-5. No data unwind needed.' }
];

const AC_FLAT = FRS.flatMap(f => f.acceptance_criteria.map(criterion => ({ criterion, requirement_id: f.id })));

const SYSTEM_ARCH = {
  overview: 'Three-layer defense-in-depth against cancelled-SD claim attempts. Layer 1: application code (claim-guard.mjs, claim-validity-gate.js, sd-start.js) refuses claims at the point of attempt. Layer 2: cancellation tooling (cancel-sd.js) performs a global is_working_on=false sweep + post-condition assertion + global claude_sessions release. Layer 3: PG trigger refuses claiming_session_id writes at the database level (catches any future writer that bypasses the application layer).',
  components: [
    { name: 'lib/claim-guard.mjs', responsibility: 'Pre-acquire cancelled-status refusal (FR-1)' },
    { name: 'lib/claim-validity-gate.js', responsibility: 'assertValidClaim cancelled-status throw (FR-2)' },
    { name: 'scripts/cancel-sd.js', responsibility: 'Global is_working_on sweep, post-condition guard, multi-session release (FR-3)' },
    { name: 'scripts/sd-start.js', responsibility: 'Post-render cancellation re-check (FR-4)' },
    { name: 'database/migrations/<NNN>_block_claims_on_cancelled_sd.sql', responsibility: 'PG trigger enforce_no_claim_on_cancelled_sd (FR-5)' },
    { name: 'tests/unit/harness/is-working-on-writers-static-guard.test.js', responsibility: 'Static guard pinning the 6 canonical writers (FR-6)' }
  ],
  data_flow: 'sd-start → resolveSDByKey → cancellation re-check (FR-4) → claimGuard (FR-1, refuses on cancelled) → claim_sd RPC. Parallel: cancel-sd → strategic_directives_v2.UPDATE (status=cancelled, is_working_on=false, claiming_session_id=null) → global is_working_on sweep (FR-3) → post-condition SELECT → claude_sessions multi-row release. PG trigger (FR-5) intercepts ANY UPDATE attempting to set claiming_session_id when status=cancelled, regardless of source.',
  testability: 'Unit tests mock supabase.from chains; integration tests use a vitest fixture supabase mock with controllable in-memory rows. Static guard test reads source files directly via fs.readFileSync. PG trigger tested via real schema in CI (existing test-DB pattern).'
};

const PRD = {
  id: PRD_ID,
  sd_id: SD_UUID,
  directive_id: SD_UUID,
  title: 'Block claims on cancelled SDs + global is_working_on consistency sweep',
  version: '1.0',
  status: 'in_progress',
  category: 'infrastructure',
  priority: 'medium',
  document_type: 'prd',
  phase: 'PLAN',
  executive_summary: 'Three-layer defense-in-depth against the cancelled-SD claim defect cluster (RCA session 35d3f159, 2026-05-09). Closes (A) missing invariant — 0 occurrences of status="cancelled" checks across claim-guard.mjs, claim-validity-gate.js, claim-health/triangulate.js — and (B) writer/consumer asymmetry on is_working_on (13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001) where 5+ writers exist with no shared canCarryWorkingOn helper, no PG uniqueness, and cancellation paths clear per-SD only with no global sweep. Six FRs ship ~85 source LOC + ~150 test LOC across 4 JS files, 1 SQL migration, and 1 static-guard test.',
  business_context: 'A cancelled SD with a stale claiming_session_id or is_working_on=true breaks the LEO orchestrator: sd:next renders the cancelled SD as workable, sd-start happily claims it, downstream phases run on a row that was strategically rejected, and retros are written against work that the user explicitly cancelled. The orphan EVA-SUPPORT-CLI-SKILL-ORCH-001-B carrying is_working_on=true since 2026-05-02 was the proximate trigger; the underlying class is the 13th writer/consumer-asymmetry witness and the single most expensive coordination drift to debug under multi-session load.',
  technical_context: '5+ canonical writers of is_working_on=true: lib/claim-guard.mjs:467, lib/drain-orchestrator.mjs:230, scripts/modules/handoff/executors/plan-to-exec/state-transitions.js:134, scripts/stale-session-sweep.cjs:1091/1099, scripts/leo-continuous.js:419 (LEAD-amended after validation surfaced the 5th and 6th). Existing precedent: migration 027 has a tr_enforce_completed_alignment BEFORE-UPDATE trigger for status=completed; FR-5 mirrors that pattern for status=cancelled. Existing precedent: tests/unit/harness/cancel-sd-script.test.js asserts the per-SD UPDATE shape; FR-3 extends with global sweep + post-condition guard.',
  functional_requirements: FRS,
  non_functional_requirements: [
    { id: 'NFR-1', title: 'No regression in active-SD claim path', description: 'p95 latency of claimGuard and assertValidClaim on an active SD must remain within ±5% of pre-change baseline.' },
    { id: 'NFR-2', title: 'PG trigger overhead ≤1 ms p95 on UPDATEs', description: 'BEFORE-UPDATE trigger executes a constant-time check (OLD.status comparison + NEW.claiming_session_id NULL test); benchmarked against the existing tr_enforce_completed_alignment baseline.' },
    { id: 'NFR-3', title: 'Static-guard test runs in <500 ms', description: 'fast-glob over lib/+scripts/+src/ minus exclusions completes in well under 1s; if it slows, the glob is too broad.' }
  ],
  technical_requirements: TR,
  test_scenarios: TS,
  acceptance_criteria: AC_FLAT,
  risks: RISKS,
  system_architecture: SYSTEM_ARCH,
  constraints: [
    'No new lib/*.mjs files (FR-1/2/3/4 are surgical edits to existing files)',
    'Migration must be idempotent and forward-only (no data backfill, no rollback script needed beyond DROP TRIGGER)',
    'Total source LOC ≤100 per CLAUDE.md PR-size guideline (target: ~85 src + ~150 test)',
    'Must run in [MODE: campaign] dedicated worktree per RCA recommendation — touches shared infra (claim-guard, cancel-sd, PG trigger), should NOT race with parallel CC sessions'
  ],
  assumptions: [
    'No code path currently un-cancels an SD (assumed via grep — the inverse of cancel-sd does not exist)',
    'sub_agent_execution_results contains the LEAD-phase VALIDATION row (3d226ebb) and the source RCA (3aa67442), already verified via DB query',
    'Migration numbering follows the existing NNN_ convention; next number determined at EXEC time'
  ],
  stakeholders: ['LEAD', 'PLAN', 'EXEC', 'TESTING', 'DATABASE'],
  exploration_summary: 'Read 5+ relevant files: lib/claim-guard.mjs (claimGuard line 170, write at 467), lib/claim-validity-gate.js (assertValidClaim line 168, SD SELECT at 222-227), scripts/cancel-sd.js (cancelSD line 82, per-SD UPDATE at 107-113), scripts/sd-start.js (claim-validity-gate call at 845, claimGuard call at 880), scripts/stale-session-sweep.cjs (writer sites at 1091/1099), database/migrations/027 (existing trigger pattern reused for FR-5), tests/unit/harness/cancel-sd-script.test.js (existing test pattern reused for FR-3 extension).',
  plan_checklist: [
    { task: 'Discovery: ≥5 file reads', status: 'completed' },
    { task: 'Identify all 5+ is_working_on=true writers', status: 'completed' },
    { task: 'PRD validated by sub-agents (DATABASE, VALIDATION)', status: 'pending' },
    { task: 'PLAN-TO-EXEC handoff', status: 'pending' }
  ],
  exec_checklist: [
    { task: 'FR-1: claim-guard cancelled refusal', status: 'pending' },
    { task: 'FR-2: claim-validity-gate cancelled assertion', status: 'pending' },
    { task: 'FR-3: cancel-sd global sweep + post-condition', status: 'pending' },
    { task: 'FR-4: sd-start re-check', status: 'pending' },
    { task: 'FR-5: PG trigger migration', status: 'pending' },
    { task: 'FR-6: static guard test', status: 'pending' }
  ],
  validation_checklist: [
    { task: 'All FR acceptance criteria green', status: 'pending' },
    { task: 'No regression in claim-guard / claim-validity-gate / cancel-sd existing tests', status: 'pending' },
    { task: 'Migration applied idempotently in test schema', status: 'pending' }
  ],
  smoke_test_cmd: 'npx vitest run tests/unit/claim-guard tests/unit/claim-validity-gate tests/unit/harness/cancel-sd-script tests/unit/harness/is-working-on-writers-static-guard',
  metadata: {
    sd_key: SD_KEY,
    source_rca_id: '3aa67442-2707-4665-98dc-343f51afe875',
    lead_validation_id: '3d226ebb-6d35-4332-984c-fd3ec5a62590',
    pattern_witness: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (13th witness)',
    estimated_loc: { source: 85, test: 150, total: 235, tier: 3 }
  }
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .upsert(PRD, { onConflict: 'id' })
  .select('id,sd_id,status,title');

if (error) {
  console.error('PRD insert failed:', error);
  process.exit(1);
}

console.log('✓ PRD inserted/updated:', JSON.stringify(data, null, 2));
console.log('  FRs:', FRS.length, '| ACs:', AC_FLAT.length, '| TS:', TS.length, '| Risks:', RISKS.length);
