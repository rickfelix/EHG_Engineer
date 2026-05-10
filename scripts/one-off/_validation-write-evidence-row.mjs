// One-off: Write VALIDATION sub-agent evidence row for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 LEAD phase
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '38f4e8aa-0610-4f0d-a344-1b1968fef6b1';
const SD_KEY = 'SD-FDBK-ENH-CASCADE-TRIGGER-3627-001';

const findings = {
  // 1. Duplicate-implementation check
  duplicate_check: {
    sd_title_matches: [
      { sd_key: 'SD-FDBK-ENH-CASCADE-TRIGGER-3627-001', status: 'draft/LEAD', verdict: 'this is the target SD itself' },
      { sd_key: 'SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001', status: 'completed', verdict: 'INTRODUCER — completed in PR #3600 (commit c4f25e4023, 2026-05-08); shipped the bug at line 183. Not a duplicate fix; defines the file.' }
    ],
    sd_body_matches: [{ sd_key: SD_KEY, verdict: 'self-reference only' }],
    qf_matches: 0,
    git_log_lib_exec_context_guard_mjs: ['c4f25e4023 (initial introduction, contains the bug)'],
    verdict: 'NO duplicate or prior fix exists. Target SD is the unique remediation. The file has had exactly one commit since introduction; no intervening patch addressed line 183.'
  },

  // 2. Overlapping in-flight SDs
  overlapping_sd_check: {
    in_flight_overlapping: [{ sd_key: SD_KEY, verdict: 'self only' }],
    introducer_sd: { sd_key: 'SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001', status: 'completed', overlap_risk: 'NONE — already completed; no concurrent edits' },
    witness_sd: { sd_key: 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001', uuid: '2a017ba5-ad88-4746-b2a8-0a8016c13835', overlap_risk: 'NONE — that SD touches lib/claim-lifecycle-release.mjs + ShippingExecutor + sd-start, not lib/exec-context-guard.mjs. The witness SD is a victim of this bug, not a touchpoint conflict.' },
    verdict: 'No overlapping in-flight work. Code path lib/exec-context-guard.mjs:assertSweepHandoffGate is exclusively owned by this SD.'
  },

  // 3. Existing infrastructure leverage
  infrastructure_leverage: {
    isSweepResetAllowed_wrapper: 'REUSABLE AS-IS at scripts/stale-session-sweep.cjs:102. Wraps assertSweepHandoffGate try/catch, returns boolean. Three call sites (lines 155, 686, 742) all flow through it. Repair the inner query and all three gates light up at once — no wrapper changes needed.',
    getExecContextGuard_lazy_import: 'REUSABLE AS-IS at scripts/stale-session-sweep.cjs:89. Dynamic import pattern preserves CJS-from-ESM compatibility. No changes needed.',
    ExecContextError_class: 'REUSABLE AS-IS at lib/exec-context-guard.mjs:50. Carries .code field (ACCEPTED_HANDOFF_OVERRIDE) that isSweepResetAllowed already filters on at line 108. No changes needed.',
    sibling_correct_pattern: 'PRECEDENT at scripts/stale-session-sweep.cjs:647-657 (QF-20260423-909). Uses .in("sd_id", [sd.id, sd.sd_key].filter(Boolean)) — the canonical pattern for "sd_phase_handoffs.sd_id stores BOTH uuid- and sd_key-style values". Recommend the repair adopt this same pattern.',
    verdict: 'All scaffolding can be preserved. Surgical repair: replace the .or() clause inside assertSweepHandoffGate with .in("sd_id", [sdKey]) — single-row fix.'
  },

  // 4. Strategic alignment
  strategic_alignment: {
    sd_type: { value: 'bugfix', verdict: 'CORRECT. This is a defect repair (broken since c4f25e4023, 2026-05-08), not new functionality. The contract of assertSweepHandoffGate is unchanged; only the implementation is repaired.' },
    priority: { value: 'high', verdict: 'JUSTIFIED. Silent corruption blast radius: 3 of 3 reset gates in stale-session-sweep.cjs (PHASE_RESET_MAP, STUCK_PENDING_APPROVAL line 686 — partially shadowed by inline QF-20260423-909, PHANTOM_IN_PROGRESS line 742) have been failing-open for 2+ days. Witness SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 was reset from PLAN-TO-LEAD-accepted state to draft/LEAD/0%, destroying 5 handoff records (3 accepted, 2 rejected). Any SD past LEAD with a phantom-released session is at risk. High priority is appropriate.' },
    not_feature_or_infrastructure: 'CONFIRMED — restoring contracted behavior of an existing function in an existing module. No new abstractions, no schema migration, no new module.'
  },

  // 5. Scope coherence
  scope_coherence: {
    in_scope_validated: [
      'lib/exec-context-guard.mjs:183 .or() clause repair — direct repro confirms bug',
      'distinguish schema-class DB errors (fail-CLOSED) from transient errors (fail-OPEN preserved) — sound: schema errors are permanent and should not silently allow resets',
      'regression test reproducing both sdKey and uuid input variants — addresses both code paths in the precedent pattern'
    ],
    out_of_scope_validated: [
      'PR #3627 migration: VALIDATED INNOCENT. Source feedback c76f88ff misattributed cause. The four migration functions (create_or_replace_session, release_session, cleanup_stale_sessions, report_pid_validation_failure) only NULL active_session_id/claiming_session_id/is_working_on; none touches status/current_phase/progress.',
      'PHASE_RESET_MAP / STUCK_PENDING_APPROVAL / PHANTOM_IN_PROGRESS reset paths in stale-session-sweep.cjs: VALIDATED. The resets themselves are intended behavior; the bug is solely that the broken guard was ALLOWING them when it should have blocked. Once the guard is repaired, the existing reset paths become correctly gated without modification.',
      'QF-20260423-909 PLAN-TO-LEAD inline guard at sweep:647-666: VALIDATED. Already works correctly via .in() pattern; not a duplicate concern. Repair this SD ships the same pattern in the central guard, retiring the need for that inline shadow eventually (but that retirement is OUT-OF-SCOPE here).'
    ],
    verdict: 'Scope is tight, coherent, and correctly excludes innocent code paths.'
  },

  // 6. Pattern recurrence
  pattern_recurrence: {
    PAT_LEO_INFRA_WRITER_CONSUMER_ASYMMETRY_001: {
      match: 'PARTIAL. The original pattern: writer-side migration drops/renames a column while reader-side queries still reference it. Here: the writer (db schema) NEVER had sd_phase_handoffs.sd_key — the consumer (assertSweepHandoffGate) referenced a column that never existed from day one of the introduced module. This is a closely related sub-pattern: assumed-column-without-verification.',
      severity_distinction: 'Witness count for the canonical writer/consumer asymmetry pattern in MEMORY.md is now in the 13-16 witness range. This case extends the pattern: not just post-migration drift, but pre-migration phantom assumption. Recommend filing as PAT-LEO-INFRA-PHANTOM-COLUMN-ON-INTRODUCTION-001 sub-pattern OR appending to the umbrella pattern.',
      prevention_suggestion: 'PRD should include a regression check that exercises the query against the live schema (the existing test stub in tests/unit/stale-sweep-handoff-override.test.* mocks supabase, so it could not have caught a real-schema 42703). The fix MUST add an integration-level test or a column existence assertion at module load.'
    },
    other_recurrence: {
      fail_open_on_unrecognized_error_class: 'Recurring anti-pattern. Documented in this codebase via QF-20260509-988 (governance lexical classifier drift) and several other "treat all errors as transient" sites. Fail-open is correct for transient errors but wrong for schema/permission errors. Repair must distinguish on error.code (PostgREST 42703 for column missing, 42P01 for table missing — both schema-class and permanent).'
    }
  },

  // 7. Direct repro evidence
  direct_repro: {
    invocation: 'assertSweepHandoffGate(supabase, "SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001", "LEAD")',
    actual_result: '{ok:true, dbError:"column sd_phase_handoffs.sd_key does not exist"}',
    expected_result: 'throw ExecContextError(ACCEPTED_HANDOFF_OVERRIDE) — witness has 5 handoffs (3 accepted past LEAD)',
    verified_by: 'Bash node import 2026-05-10 inside this validation run',
    sd_phase_handoffs_sd_key_probe: 'PostgrestError 42703: column sd_phase_handoffs.sd_key does not exist',
    sd_phase_handoffs_sd_id_probe: 'OK — column exists',
    witness_handoffs_count: 5,
    witness_accepted_past_LEAD: 3
  }
};

const recommendations = [
  'PRD MUST adopt the .in("sd_id", [sdKey]) pattern from stale-session-sweep.cjs:647-657 (QF-20260423-909 precedent) — single source of truth for the "sd_id stores both uuid and sd_key" contract.',
  'PRD MUST distinguish schema-class errors (PostgREST codes 42703 column-missing, 42P01 table-missing — fail-CLOSED, throw) from transient errors (network, 503, timeout — fail-OPEN preserved). The current single-bucket fail-open is the proximate cause of silent corruption.',
  'PRD MUST include a regression test that exercises the query against the live schema (not just a mocked supabase). Either an integration test, or a module-load assertion that probes column existence and fails loudly. Mocked-supabase unit tests CANNOT catch this class of bug — that is exactly how it shipped.',
  'EXEC SHOULD also add an explicit caller-side log in isSweepResetAllowed (stale-session-sweep.cjs:102) when the guard returns {ok:true, dbError} so future regressions emit a visible warning rather than silently allowing.',
  'OPTIONAL post-fix audit: query strategic_directives_v2 for SDs whose status/current_phase regressed during the bug window (commit c4f25e4023 timestamp through fix landing). Any SD with handoff records past current_phase is a candidate for restoration. SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 is one confirmed case.'
];

const warnings = [
  'The witness SD (SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001) was already restored manually in a prior session per memory project_sd_claim_lifecycle_release_001_completed_with_state_restoration.md. Do not double-restore. The post-fix audit (recommendation #5) should be additive — find OTHER victims, not re-touch this one.',
  'Source feedback c76f88ff-2aeb-462e-8563-fe8c236902be misattributed cause to PR #3627. The PRD should explicitly capture this misattribution as part of the change-story so future readers do not reverse the (correct) OUT-OF-SCOPE call on the migration. The source feedback should be resolved with a pointer to this SD when shipped.',
  'The two existing test files matching the pattern (tests/unit/stale-sweep-handoff-override.test.* — mentioned in stale-session-sweep.cjs comments) appear to use mocked supabase and so could not detect this real-schema bug. Treat as baseline pollution, not safety net. PRD should call this out so EXEC does not assume those tests provide regression coverage.'
];

const summary = `VALIDATION verdict: PASS (with warnings). Direct repro confirms the bug exactly as described: assertSweepHandoffGate(witnessSD, "LEAD") returns {ok:true, dbError:"column sd_phase_handoffs.sd_key does not exist"} despite witness having 3 accepted handoffs past LEAD. Bug shipped at commit c4f25e4023 (2026-05-08, PR #3600) and has been functionally absent since. No prior SD or QF addresses this; target SD is the unique remediation. SD type 'bugfix' and priority 'high' are correct given silent-corruption blast radius across all 3 sweep reset gates. IN-SCOPE / OUT-OF-SCOPE boundary is sharp and accurately exonerates PR #3627 and the intended sweep reset paths. Existing scaffolding (isSweepResetAllowed wrapper, getExecContextGuard lazy import, ExecContextError class) is reusable as-is — surgical fix targets only the .or() clause inside assertSweepHandoffGate, with adoption of the proven .in('sd_id', [sdKey]) precedent at stale-session-sweep.cjs:647 (QF-20260423-909). Recommendations focus on (1) reusing the precedent pattern, (2) fail-CLOSED on schema-class PostgREST errors (42703/42P01) while preserving fail-OPEN for transients, (3) regression test against live schema (mocked-supabase tests cannot catch this class of bug). Pattern recurrence: extends PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 to a phantom-column-on-introduction sub-pattern; the consumer assumed a column that never existed in the writer's schema.`;

const detailedAnalysis = JSON.stringify(findings, null, 2);

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'VALIDATION',
  sub_agent_name: 'Principal Systems Analyst',
  phase: 'LEAD',
  verdict: 'PASS',
  confidence: 92,
  summary,
  critical_issues: [],
  warnings,
  recommendations,
  detailed_analysis: detailedAnalysis,
  validation_mode: 'prospective',
  source: 'validation-agent',
  metadata: {
    sd_key: SD_KEY,
    invoked_by: 'orchestrator-validation-agent-spawn',
    session_id: 'd694138f-de06-478a-b758-18e8c1d84445',
    model: 'claude-opus-4-7[1m]',
    direct_repro_executed: true,
    sd_phase_handoffs_schema_probed: true,
    duplicate_search_executed: true,
    overlap_search_executed: true,
    introducer_sd: 'SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (commit c4f25e4023, PR #3600)',
    witness_sd: 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 (uuid 2a017ba5-ad88-4746-b2a8-0a8016c13835)',
    pattern_match: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (phantom-column-on-introduction sub-pattern)'
  }
};

console.log('--- Inserting validation evidence row ---');
const { data, error } = await sb.from('sub_agent_execution_results').insert(row).select('id, sub_agent_code, phase, verdict, confidence');
if (error) {
  console.error('Insert error:', error.message, error.code);
  console.error('Details:', JSON.stringify(error, null, 2));
  process.exit(1);
}
console.log('Inserted:', JSON.stringify(data, null, 2));
