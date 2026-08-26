#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent evidence for the EXEC-TO-PLAN handoff of
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, summarizing a REAL, empirical SECURITY review
 * (Task-tool agent, live queries against dedlbzhpgkmetvhbkyzq) plus the fixes applied
 * in response and re-verified via a rolled-back-transaction dry run.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'aa05cf0d-254f-4f43-b30b-f935fcedbf21';
const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';

const findings = [
  {
    id: 'h1-anon-execute-secdef-oracle-fixed',
    severity: 'HIGH',
    summary: 'Measured: CREATE FUNCTION/VIEW in this database\'s public schema default-grants EXECUTE/SELECT to anon and authenticated. The new translate_historical_stage_number() was SECURITY DEFINER with no REVOKE, making it an anon-reachable elevated-privilege timestamp oracle over schema_migrations_applied.applied_at (an RLS-protected, service_role-only table). Measured that DEFINER bought nothing for the real caller set: service_role/postgres already bypass RLS as invoker, and a low-privilege invoker of the security_invoker=true shim views gets zero rows from the RLS-protected base tables either way, so there was never a legitimate caller DEFINER served. FIXED: reverted to plain (non-DEFINER) function, plus explicit REVOKE ALL ... FROM PUBLIC, anon, authenticated / GRANT ... TO service_role added for the function AND all 3 shim views. Re-verified live: has_function_privilege(\'anon\', ..., \'EXECUTE\') and has_table_privilege(\'anon\', ..., \'SELECT\') both now false.',
  },
  {
    id: 'h2-toctou-lock-table-fixed',
    severity: 'HIGH',
    summary: 'apply-migration.js issues a plain BEGIN (READ COMMITTED, no LOCK TABLE); the FR-6 (zero real ventures parked)/FR-2 (quiescence) preflight guarantees therefore only held at the instant they ran, with a window before the migration\'s first exclusive lock during which a concurrently-committed advance could move a real venture into the shift range -- invisible to the snapshot-joined verify block by construction. FIXED: LOCK TABLE ventures, venture_stages, chairman_decisions, venture_stage_work IN ACCESS EXCLUSIVE MODE added as the literal first statement of both the UP and DOWN files, making the preflight guarantees hold to COMMIT at negligible cost for a one-time, already-advisory-locked ceremony.',
  },
  {
    id: 'h3-manufactured-product-review-desync-fixed',
    severity: 'HIGH',
    summary: 'Disagreed with this SD\'s own earlier (round-1) "leave the p_from_stage=23/p_to_stage=24 product-review literal stale, consistency beats correctness" disposition: the migration\'s OWN chairman_decisions shift moves approved product_review decisions to lifecycle_stage=24 while the SQL predicate in fn_advance_venture_stage() still read 23 -- the migration MANUFACTURES this desync, it does not merely inherit pre-existing staleness, and the effect (an irreversible go_live-adjacent gate satisfied by ANY approved decision type once the specific product_review requirement silently stops matching) is a security regression, not cosmetic drift. FIXED: predicate updated to p_from_stage=24 AND p_to_stage=25 in the same migration. Re-verified live: after applying the migration, approved product_review decisions land exactly at lifecycle_stage=24, matching the corrected predicate. The JS daemon backstop (lib/eva/stage-execution-worker.js:2971) is deliberately left unchanged -- since fn_advance_venture_stage is documented as the primary general-advance call path, the JS backstop simply stops firing on a pair that no longer occurs for a real transition, becoming an inert redundant check rather than an actively-wrong-permissive one; that file\'s stage-templates dynamic-import mismatch and the unaudited chairman-product-review.js remain their own tracked, deliberately out-of-scope follow-up.',
  },
  {
    id: 'n2-trigger-disable-window-confirmed-safe',
    severity: 'INFO',
    summary: 'Confirmed via PostgreSQL lock-semantics reasoning that temporarily disabling enforce_stage_advancement_artifact_gate / trg_sync_stage_work_on_advance around the ventures UPDATE does NOT create a concurrent-session exploit window: ALTER TABLE...DISABLE TRIGGER takes ShareRowExclusiveLock (conflicts with any concurrent write), the earlier DROP CONSTRAINT takes AccessExclusiveLock, both are held to transaction end, and the re-ENABLE is in the same transaction -- no other backend can ever observe the disabled state, and a rollback restores both automatically. No fix needed; the original reasoning in the migration\'s own comment was sound.',
  },
  {
    id: 'sql-injection-clean',
    severity: 'INFO',
    summary: 'Zero dynamic SQL in either migration file -- every statement is static literal DDL/DML. No EXECUTE, quote_ident/quote_literal-into-execute, or format()-into-execute pattern found. The only string concatenation builds a uuid_generate_v5 name input, not SQL text.',
  },
  {
    id: 'h4-fn_advance_venture_stage-preexisting-weaknesses-not-introduced-by-this-sd',
    severity: 'MEDIUM',
    summary: 'fn_advance_venture_stage() (re-shipped verbatim except the p_to_stage/product-review fixes above) has no authorization preamble (unlike its sibling advance_venture_stage(), which carries the SD-MAN-FIX-SECURITY-GUARD-PACK-001 guard), a fail-open catalog lookup (a missing venture_stages row leaves the kill/promotion gate check silently skipped, the exact S-H3 defect already fixed in its sibling but not here), and does not pin pg_temp last in its search_path despite being SECURITY DEFINER and authenticated-executable. All 3 are PRE-EXISTING on the live function (verified against the original, pre-this-SD pg_get_functiondef capture) -- this migration does not introduce them, and fixing them is a materially larger, independent change to a function this SD did not otherwise intend to harden beyond its 2 specific literals (FR-9 bound, product-review predicate). Flagged as a completion-flag finding recommending its own follow-up rather than expanded in this already-large EXEC pass; the pg_temp-shadowing path specifically requires CREATE TEMP TABLE privilege the normal PostgREST/Supabase caller path does not appear to expose (unmeasured for all 154 SECDEF functions repo-wide, a pre-existing systemic posture question, not specific to this SD).',
  },
];

const summary = 'A REAL, empirical SECURITY sub-agent review (Task-tool agent, live queries against dedlbzhpgkmetvhbkyzq -- measured ACLs, RLS policies, trigger definitions, lock semantics; no exploit executed) of the corrected EXEC-phase migration for SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (a chairman-gated, staged, never-applied-by-this-SD migration touching an irreversible go_live promotion gate on live production venture data). Found and this SD fixed 3 HIGH findings: an anon-reachable SECURITY DEFINER function created as an unintended timestamp oracle with no REVOKE (measured DEFINER bought nothing for the real caller set and was reverted to plain invoker rights, plus explicit REVOKEs added on the function and its 3 companion views); a TOCTOU gap where the migration\'s own preflight guarantees could expire before its first exclusive lock under the apply script\'s plain READ-COMMITTED BEGIN (fixed with an explicit LOCK TABLE as the literal first statement of both UP and DOWN); and a security regression this migration itself would have manufactured on the path into the irreversible go_live gate, where its own chairman_decisions data shift desynchronizes from an unmoved SQL predicate gating a required product-review approval (fixed by moving the predicate in step with the data it now governs, re-verified live). Confirmed via PostgreSQL lock-semantics analysis that the migration\'s trigger-disable-around-a-single-UPDATE pattern is NOT exploitable by a concurrent session (transactional, exclusively locked, correctly re-enabled). Found zero SQL injection surface. Flagged one MEDIUM, pre-existing (not introduced by this SD) hardening gap in fn_advance_venture_stage() as a completion-flag finding for independent follow-up rather than expanding this already-large EXEC pass.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 87,
    findings,
    warnings: [
      'The fn_advance_venture_stage() hardening gap (H-4: no authz preamble, fail-open catalog lookup, unpinned pg_temp) is pre-existing on the live function and NOT introduced by this SD -- but this migration file is already editing that function\'s header for 2 other reasons, so a future pass touching it again should close these while it is open.',
    ],
    recommendations: [
      'Before the chairman apply ceremony: re-run this review\'s ACL/RLS measurements fresh (grants can drift), and confirm the LOCK TABLE addition does not conflict with any other concurrent chairman-gated migration scheduled for the same window.',
      'Consider a dedicated follow-up SD for fn_advance_venture_stage()\'s pre-existing authz/fail-open/pg_temp gaps, mirroring the S-H3 fix already applied to its sibling advance_venture_stage().',
    ],
    summary,
    justification: 'CONDITIONAL_PASS rather than PASS because 3 real HIGH findings required fixes to code this SD authored or materially modified (not merely inherited), and while all 3 are now fixed and re-verified, a chairman signature on this file is a genuine point of no return that warrants a fresh look at ceremony time rather than treating this evidence as permanently current. CONDITIONAL_PASS rather than FAIL/BLOCKED because every finding was closed with a small, targeted, empirically re-verified fix; no exploit was demonstrated (only measured preconditions for 2 lower-confidence items already explicitly caveated in the underlying review and left unfixed as pre-existing, out-of-scope items); the migration cannot execute today regardless of any of this (chairman-approval PENDING, and its own FR-6 preflight independently and correctly refuses given 2 live real ventures in the shift range); and the fixes make the migration MORE conservative than round-1, not merely equally risky. Confidence 87: every HIGH finding and its fix was verified against live measurements (ACL queries, a full rolled-back-transaction UP/DOWN dry run confirming anon EXECUTE/SELECT are now false and product_review decisions land at the corrected stage), not inference; the deduction reflects that the underlying review\'s own H-4 pg_temp-shadowing analysis was explicitly caveated as unexecuted (measured preconditions only) and that not all 154 SECDEF functions repo-wide were audited for the same systemic pattern.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC',
      review_type: 'empirical_security_review_live_measurement',
      review_method: 'Task-tool SECURITY sub-agent: live ACL/RLS/trigger/lock-semantics measurement against dedlbzhpgkmetvhbkyzq (PostgreSQL 17.4), no exploit executed. This session: rolled-back-transaction dry run re-verifying all 3 fixes.',
      files_reviewed: [
        'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql',
        'database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber_DOWN.sql',
        'lib/eva/uat-stage-migration/*.mjs',
        'scripts/eva/uat-stage-migration-preconditions.mjs',
        'lib/eva/gate-bars.js',
      ],
      final_verification: 'Live rolled-back transaction: has_function_privilege(anon, translate_historical_stage_number, EXECUTE)=false; has_table_privilege(anon, venture_stage_transitions_current_scheme, SELECT)=false; product_review-approved chairman_decisions land at lifecycle_stage=24 post-apply, matching the corrected predicate.',
      not_fixed_pre_existing_flagged: 'fn_advance_venture_stage(): no authz preamble, fail-open catalog NOT FOUND handling, pg_temp not pinned last -- all pre-existing on the live function, verified against the original pre-this-SD capture, not introduced by this SD.',
    },
    phase: 'EXEC',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Former NSA security architect' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
