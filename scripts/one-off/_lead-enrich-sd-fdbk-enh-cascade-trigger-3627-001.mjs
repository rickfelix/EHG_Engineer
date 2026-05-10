#!/usr/bin/env node
/**
 * One-off: LEAD enrichment for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001.
 *
 * Replaces auto-generated boilerplate (key_changes, success_criteria, etc.)
 * with the strategic content that emerged from LEAD code-reading on
 * 2026-05-10. Documents the actual offender (lib/exec-context-guard.mjs:183
 * schema-error fail-open) which differs from the source feedback's framing
 * (PR #3627 cascade trigger).
 *
 * Idempotent: re-running overwrites the same fields with the same values.
 */
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-FDBK-ENH-CASCADE-TRIGGER-3627-001';

const updates = {
  title: 'Repair assertSweepHandoffGate query: schema-error fail-open caused phantom-session SD state regressions',
  sd_type: 'bugfix',
  priority: 'high',
  target_application: 'EHG_Engineer',
  scope: [
    'IN-SCOPE:',
    '- lib/exec-context-guard.mjs assertSweepHandoffGate(): repair .or() clause referencing nonexistent column sd_phase_handoffs.sd_key',
    '- lib/exec-context-guard.mjs: distinguish schema-class DB errors (fail-CLOSED) from transient errors (fail-OPEN preserved)',
    '- regression test reproducing the witness scenario (sdKey input AND uuid input both block reset when accepted handoffs past target exist)',
    '',
    'OUT-OF-SCOPE:',
    '- changes to PR #3627 migration (functions only clear claim columns; not the actual offender)',
    '- changes to PHASE_RESET_MAP / STUCK_PENDING_APPROVAL / PHANTOM_IN_PROGRESS reset paths in stale-session-sweep.cjs (resets are intended; only the bypass-on-broken-guard is wrong)',
    '- broader changes to QF-20260423-909 PLAN-TO-LEAD-specific guard (works correctly via .in() lookup)'
  ].join('\n'),
  strategic_intent: 'Restore the sweep handoff override guard to actually block stale-session-sweep resets when accepted handoffs past the target reset phase exist. Currently the guard fails-open on every call due to a schema error in its query (referencing non-existent column sd_phase_handoffs.sd_key), making it functionally absent and allowing SD state corruption when phantom sessions are SWEEP_PID_DEAD-released.',
  rationale: [
    'Witnessed 2026-05-10 on SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001: PR #3659 had EXEC phases shipped + 3 sd_phase_handoffs accepted (LEAD-TO-PLAN, PLAN-TO-EXEC, PLAN-TO-LEAD) + sub-agent evidence + retrospective PUBLISHED, but when phantom-session 824a4401 was SWEEP_PID_DEAD-released, the SD state regressed to draft/LEAD/0% requiring manual user-authorized DB UPDATE to restore.',
    '',
    'Initial diagnosis (per source feedback c76f88ff) attributed the regression to PR #3627 cascade. Code reading reveals PR #3627 migration is clean — the four functions (create_or_replace_session, release_session, cleanup_stale_sessions, report_pid_validation_failure) only clear active_session_id/claiming_session_id/is_working_on. Further investigation pinpoints the actual offender: lib/exec-context-guard.mjs:183 references non-existent column sd_phase_handoffs.sd_key in its .or() clause, causing the entire query to fail with PostgrestError 42703 (column does not exist). The fail-open path at lines 187-189 returns {ok:true, dbError} on any DB error — schema-class errors get the same treatment as transient errors. Caller (isSweepResetAllowed) treats {ok:true} as ALLOW. Result: every sweep reset path silently bypasses the guard.',
    '',
    'Direct verification (Bash test 2026-05-10): assertSweepHandoffGate("SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD") returns {ok:true, dbError:"column sd_phase_handoffs.sd_key does not exist"} despite the SD having 3 accepted handoffs past LEAD in sd_phase_handoffs (LEAD-TO-PLAN to_phase=PLAN, PLAN-TO-EXEC to_phase=EXEC, PLAN-TO-LEAD to_phase=LEAD). The guard has been functionally absent since commit c4f25e4023 (2026-05-08), explaining why resets continue despite the documented protection in scripts/stale-session-sweep.cjs at lines 686 and 742.',
    '',
    'Repair: rewrite the .or() clause to use sd_id only (TEXT column storing UUIDs); resolve sd_key→UUID via strategic_directives_v2 lookup when caller passes a key-style identifier. Distinguish schema-class errors (fail-CLOSED) from transient errors (fail-OPEN preserved).'
  ].join('\n'),
  key_changes: [
    { change: 'FR-1: Repair assertSweepHandoffGate query in lib/exec-context-guard.mjs — replace .or(sd_id.eq.X,sd_key.eq.X) with sd_key->UUID resolution + sd_id-only lookup', type: 'fix' },
    { change: 'FR-2: Distinguish schema-class DB errors (PostgREST 42703 / column does not exist) from transient errors. Fail-CLOSED on schema (throw guard violation), fail-OPEN preserved for transient', type: 'fix' },
    { change: 'FR-3: Regression test (tests/unit/exec-context-guard-handoff-gate-query-repair.test.*) — covers (a) accepted handoffs past LEAD via sdKey input -> throws ACCEPTED_HANDOFF_OVERRIDE, (b) same via UUID input -> throws, (c) schema error -> throws, (d) transient error -> fail-OPEN preserved', type: 'test' }
  ],
  success_criteria: [
    { criterion: 'assertSweepHandoffGate(<sdKey>, "LEAD") throws ACCEPTED_HANDOFF_OVERRIDE when accepted handoffs past LEAD exist', measure: 'Manual rerun of bash assertion against SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 throws after fix (was: returned {ok:true,dbError})' },
    { criterion: 'assertSweepHandoffGate(<uuid>, "LEAD") throws ACCEPTED_HANDOFF_OVERRIDE when accepted handoffs past LEAD exist', measure: 'Manual: assertSweepHandoffGate("2a017ba5-ad88-4746-b2a8-0a8016c13835","LEAD") throws after fix' },
    { criterion: 'Schema-class DB error -> guard fails CLOSED (throws ExecContextError)', measure: 'Unit test mocks supabase to return error{code:"42703"} and asserts assertSweepHandoffGate throws' },
    { criterion: 'Transient DB error -> guard fails OPEN preserved', measure: 'Unit test mocks supabase to return error{code:"PGRST301"} and asserts returns {ok:true, dbError}' },
    { criterion: 'New regression test passes; existing exec-context-guard tests unchanged', measure: 'vitest run tests/unit/exec-context-guard*.test.* exits 0 with all tests pass; full lib/ test suite shows ZERO regression' },
    { criterion: 'Stale-session-sweep correctly skips reset on protected SDs', measure: 'Run sweep against test fixture; observe SKIP_RESET log line for STUCK_PENDING_APPROVAL and PHANTOM_IN_PROGRESS paths when guard fires' }
  ],
  strategic_objectives: [
    'Restore guard effectiveness: assertSweepHandoffGate must actually block resets when accepted handoffs past target exist',
    'Distinguish permanent (schema) vs transient DB errors so future schema drift is loudly surfaced instead of silently bypassed',
    'Pin via regression test to prevent re-occurrence of the column-name drift class'
  ],
  risks: [
    { risk: 'Closing fail-open for schema errors may surface latent issues in OTHER SDs that have valid past handoffs but were silently being reset', mitigation: 'Desired behavior — surfaces real bugs being masked. Sweep aborts loudly per existing assertSweepHandoffGate contract; affected SDs can be triaged individually', impact: 'medium', likelihood: 'medium' },
    { risk: 'sd_key->UUID lookup adds a DB round-trip per assertSweepHandoffGate call', mitigation: 'Cache lookup per sweep iteration (sweep already aggregates SDs in claimedSdStatus); latency impact bounded since sweep iteration count typically <100/cycle', impact: 'low', likelihood: 'low' },
    { risk: 'Schema-class error detection may misclassify non-schema errors as schema (over-fail-CLOSED)', mitigation: 'Match on specific PostgREST error code (42703) and message pattern; default unknown errors to fail-OPEN per existing contract', impact: 'low', likelihood: 'low' }
  ],
  key_principles: [
    'Repair the deployed guard rather than removing the resets — the resets are intentional queue-resurrection behavior, the bug is the guard not blocking when it should',
    'Fail-CLOSED on schema-class errors (permanent), fail-OPEN on transient errors (recoverable)',
    'Pin the fix with a regression test that exercises the exact PG schema (sd_phase_handoffs.sd_id is TEXT storing UUIDs, not sd_key)'
  ],
  smoke_test_steps: [
    'STEP 1: cd to EHG_Engineer worktree on the patched branch',
    'STEP 2: run "node --input-type=module -e \\"import {assertSweepHandoffGate} from \'./lib/exec-context-guard.mjs\'; ...\\"" against witness SD',
    'STEP 3: observe assertSweepHandoffGate throws ExecContextError(ACCEPTED_HANDOFF_OVERRIDE) (was: returned {ok:true, dbError})',
    'STEP 4: run "npm test -- exec-context-guard" — all regression cases pass',
    'STEP 5: visual: stale-session-sweep dry-run logs SKIP_RESET line for SDs with accepted handoffs past target'
  ].join('\n'),
  governance_metadata: {
    type_change_reason: 'LEAD code-reading 2026-05-10 confirmed this is a JS bug repair (lib/exec-context-guard.mjs:183 schema error in .or() clause) not a new feature. Reclassifying feature->bugfix to align validation profile (smoke_test_steps + 85% gate threshold) with the actual change shape.',
    type_change_at: new Date().toISOString(),
    type_change_actor: 'LEAD'
  },
  metadata: {
    source: 'feedback',
    source_id: 'c76f88ff-2aeb-462e-8563-fe8c236902be',
    created_via: 'leo-create-sd',
    feedback_type: 'enhancement',
    session_findings: {
      actual_offender_file: 'lib/exec-context-guard.mjs',
      actual_offender_line: 183,
      actual_offender_query: '.or("sd_id.eq.${sdKey},sd_key.eq.${sdKey}")',
      nonexistent_column: 'sd_phase_handoffs.sd_key',
      guard_added_in_commit: 'c4f25e4023 (2026-05-08)',
      witness_sd_key: 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001',
      witness_sd_uuid: '2a017ba5-ad88-4746-b2a8-0a8016c13835',
      witness_accepted_handoff_count: 3,
      feedback_misattribution: 'feedback c76f88ff blamed PR #3627 cascade trigger; actual offender is exec-context-guard.mjs query schema error',
      rca_method: 'direct invocation of assertSweepHandoffGate against witness SD reproduced fail-open returning {ok:true, dbError}',
      lead_enrichment_at: new Date().toISOString()
    }
  }
};

const { error } = await supabase
  .from('strategic_directives_v2')
  .update(updates)
  .eq('sd_key', SD_KEY);

if (error) {
  console.error('UPDATE_ERR:', error.message);
  process.exit(1);
}

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key, title, sd_type, priority, target_application')
  .eq('sd_key', SD_KEY)
  .maybeSingle();

console.log('OK: SD enriched');
console.log('  sd_key:', sd.sd_key);
console.log('  title:', sd.title);
console.log('  type:', sd.sd_type);
console.log('  priority:', sd.priority);
console.log('  target_application:', sd.target_application);
