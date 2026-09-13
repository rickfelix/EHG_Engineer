#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-INFRA-CLAIM-PARENT-CHILD-001, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed tracing claim_sd's claim-switch eviction
 * predicate, confirming the dual-pointer bug, and surveying the existing re-adopt and
 * chairman-gated-migration conventions the fix will reuse.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CLAIM-PARENT-CHILD-001';

const findings = [
  {
    id: 'claim-switch-predicate-confirmed-at-exact-lines',
    severity: 'HIGH',
    summary: 'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql: the parent-exclusion predicate `(v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id)` appears twice -- the capture SELECT (lines 437-442) that reads the session\'s OLD sd_key, and the claim-switch UPDATE (lines 446-458) that actually evicts. Both deliberately skip the parent. Because the capture SELECT also excludes the parent, v_evicted_sd_key is NULL and the symmetric-clear block (lines 462-514) never fires for it -- strategic_directives_v2 keeps BOTH the parent and child rows pointing at claiming_session_id, while the final UPDATE (lines 520-528) overwrites claude_sessions.sd_key to the child only. parent_preserved (line 587) is just `v_sd_parent_id IS NOT NULL` -- it reports "this SD has a parent" unconditionally, not "a parent-claim-switch was actually skipped".',
  },
  {
    id: 'migration-history-confirms-20260903-is-latest',
    severity: 'INFO',
    summary: 'grep for `CREATE OR REPLACE FUNCTION claim_sd` across database/migrations/ and database/chairman-gated/ returns 15 files under migrations/ only (chairman-gated has zero); sorted by filename date, 20260903_claim_sd_symmetric_clear_returning_fix.sql is last/newest. No later file touches claim_sd, confirming the SD\'s citation targets the live, authoritative definition.',
  },
  {
    id: 'claim-mirror-is-claude-sessions-sd-key-via-v-active-sessions',
    severity: 'INFO',
    summary: 'database/migrations/20260727_v_active_sessions_no_qf_fanout.sql lines 78-81: v_active_sessions selects cs.sd_key directly from claude_sessions, one row per session. This table/view can structurally only ever represent ONE claimed SD per session -- confirms this is "the mirror" the SD description says shows only the child, never both parent+child.',
  },
  {
    id: 'existing-re-adopt-mechanism-reusable-by-option-a',
    severity: 'INFO',
    summary: 'scripts/worker-checkin.cjs adoptOrphanInProgress() (~line 1535) with parentLeadPending() guard (~line 1586, SD-FDBK-INFRA-ORPHAN-ADOPT-RESUME-001) already re-adopts an UNCLAIMED orphan/parent SD on check-in. It does not yet special-case "child just reached terminal -> re-adopt the now-released parent for the same session" -- that is the specific extension option (a) needs, but the adoption primitive it would build on already exists and is tested. scripts/sd-start.js has no parent_sd_id-aware re-adopt logic today (its only "parent" hit is the unrelated force_parent_authority take-over branch).',
  },
  {
    id: 'no-existing-test-covers-this-bug',
    severity: 'HIGH',
    summary: 'tests/database/claim-sd-cross-table.test.js is the only file matching both "claim_sd" and "parent", and its sole match (TS-4, ~line 263) tests the unrelated force-takeover/no-parent-authority branch. No test exercises the claim-switch eviction\'s parent-exclusion predicate or asserts single-vs-dual claiming_session_id pointers after a parent-then-child claim sequence -- this SD\'s EXEC phase must add that coverage from zero, not extend an existing suite.',
  },
  {
    id: 'chairman-gated-migration-convention-confirmed',
    severity: 'INFO',
    summary: 'Precedent (e.g. database/chairman-gated/20260911_chairman_ratification_verifications.sql + _DOWN.sql sibling): header carries a `-- @chairman-gated` ceremony marker plus `-- @approved-by: <email>` (the line scripts/lib/migration-guards.js APPROVED_BY_RE actually enforces). DOWN sibling is same basename + `_DOWN.sql`, explicit rollback order (triggers -> functions -> policy -> table). Tiering is automatic via scripts/lib/migration-tier-classifier.mjs (FORBIDDEN_TOPLEVEL regex on DROP/TRUNCATE/UPDATE/GRANT etc.) -- this SD\'s fix (a CREATE OR REPLACE FUNCTION body edit, no DROP/schema change) should land as a Tier-2-shaped file under database/chairman-gated/ with a DOWN sibling restoring the pre-fix function body.',
  },
];

const warnings = [
  'This is a live, two-sided bug (commit 8fd59ab2c3c, 2026-08-03, recorded it as "STILL OPEN") that has already been rediscovered at least twice since without closure -- PLAN must write the PRD to reflect option (a) (release-then-re-adopt) as already the SD\'s own sourced recommendation, not re-open the design debate from scratch.',
  'The fix is a plpgsql function-body edit requiring a chairman ceremony to apply, not a JS-only change -- EXEC will stage the migration under database/chairman-gated/ and the SD should expect to reach LEAD-FINAL with a WAIT verdict on CHAIRMAN_APPLY_VERIFICATION (same pattern as other pending chairman-gated SDs observed live this session: SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001, SD-LEO-FIX-WIRE-SEVEN-RETROSPECTIVE-001), not a blocked/failed SD.',
];

const recommendations = [
  'PLAN should author the PRD around option (a): RELEASE the parent claiming_session_id symmetrically when a child is claimed (removing the parent-exclusion branch from both the capture SELECT and the claim-switch UPDATE), and extend worker-checkin.cjs\'s existing adoptOrphanInProgress()/parentLeadPending() re-adopt path to re-claim the parent for the same session once the child reaches a terminal status -- reusing the existing mechanism rather than inventing a second one.',
  'EXEC must add net-new test coverage (tests/database/claim-sd-cross-table.test.js or a sibling) asserting: claiming a child while holding the parent releases the parent\'s claiming_session_id (not just the mirror); and the re-adopt path correctly re-claims the parent once the child SD reaches a terminal status.',
  'EXEC should write the fix as database/chairman-gated/<date>_claim_sd_parent_child_single_pointer.sql + _DOWN.sql sibling, following the 20260911_chairman_ratification_verifications.sql header/rollback convention, and must NOT attempt to self-apply it -- staged only, pending the chairman ceremony.',
];

const summary = 'Explore-phase discovery for SD-LEO-INFRA-CLAIM-PARENT-CHILD-001 confirmed the dual-claiming_session_id bug at exact line numbers in claim_sd (database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql lines 437-458, 587), confirmed that migration is still the latest/authoritative definition, identified claude_sessions.sd_key (via v_active_sessions) as the single-valued claim mirror the SD description refers to, found zero existing test coverage for this specific bug, and located the existing orphan re-adopt mechanism (worker-checkin.cjs adoptOrphanInProgress/parentLeadPending) that option (a)\'s fix can extend rather than duplicate. Also surveyed the chairman-gated migration file/header convention this fix must follow since it changes a plpgsql function body and requires ceremony application, not self-apply.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 95,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql',
        'database/migrations/20260727_v_active_sessions_no_qf_fanout.sql',
        'scripts/worker-checkin.cjs',
        'scripts/sd-start.js',
        'tests/database/claim-sd-cross-table.test.js',
        'database/chairman-gated/20260911_chairman_ratification_verifications.sql',
        'scripts/lib/migration-guards.js',
        'scripts/lib/migration-tier-classifier.mjs',
      ],
      quick_fixes_reviewed: [],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
