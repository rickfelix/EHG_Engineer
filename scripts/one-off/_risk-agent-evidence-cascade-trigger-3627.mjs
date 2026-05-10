// One-off: write RISK sub-agent evidence row for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 (LEAD phase)
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sdId = '38f4e8aa-0610-4f0d-a344-1b1968fef6b1';

const summary = [
  'MEDIUM-LOW risk verdict for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001.',
  'Fix repairs a guard silently fail-open since 2026-05-08 (commit c4f25e4023) — restoring SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 FR-3 intended behavior, NOT introducing new contract.',
  'EMPIRICAL FINDING (live DB probes): sd_phase_handoffs.sd_key does not exist (PostgREST 42703 confirmed); sd_id is a string-typed column accepting SD-codes directly — NO UUID coercion, NO resolver round-trip, NO cache needed.',
  'This collapses FR-1 to dropping the .or() and using .eq(sd_id, sdKey). Q3 latency concern is moot.',
  'Top concern (Q2 MEDIUM 6/10): when guard becomes effective, OTHER currently-being-silently-reset SDs in fleet WILL start being protected — pre-stage fleet-audit query to disclose latent-bug-surface population BEFORE merge.',
  'Top concern (Q4 MEDIUM 5/10): match schema-class errors by SQLSTATE error.code (42703 / 42P01 / 42883), NOT error.message regex (Supabase version-dependent).',
  'Q5 (LOW-MEDIUM 4/10): future schema drift would fail loudly via fail-CLOSED instead of silently — NET POSITIVE vs status quo.',
  'Recommended scope additions:',
  ' (a) FR-1 simplified — single .eq() query, no resolver/cache;',
  ' (b) FR-2 fail-CLOSED limited to schema-class SQLSTATE codes {42703, 42P01, 42883};',
  ' (c) FR-3 stub-injection test (deterministic, no live DB) for both happy path and 42703 fail-CLOSED;',
  ' (d) NEW FR-4 (recommended): fleet pre-merge audit query enumerating SDs whose current_phase ranks below latest accepted handoff to_phase;',
  ' (e) NEW FR-5 (recommended): structured log line on fail-CLOSED for operator visibility.',
  'NO feature flag: fix restores intended behavior; flag itself would be new fail-open drift surface (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 class).',
  'Rollback: single-file atomic revert. Stage merge during low-sweep-activity window; observe 2 sweep cycles (~10 min) post-merge.'
].join(' ');

const detailedAnalysis = {
  overall_risk: 'MEDIUM-LOW',
  domain_scores: {
    technical_complexity: 3,
    security_risk: 2,
    performance_risk: 2,
    integration_risk: 5,
    data_migration_risk: 1,
    ui_ux_risk: 1
  },
  questions: {
    Q1_failclosed_contract_change: {
      score: 4,
      verdict: 'LOW',
      finding: 'Guard ALREADY documents fail-OPEN policy for transient errors (line 187-190). Restricting fail-CLOSED to schema-class SQLSTATE preserves transient-fail-OPEN. Blast radius if mis-classified: a single sweep iteration aborts loudly with error log; non-destructive — sweep is itself a resilience layer, not a critical path. CAVEAT: ensure detection matches error.code (PostgREST surfaces SQLSTATE) NOT error.message regex.'
    },
    Q2_latent_bug_surface: {
      score: 6,
      verdict: 'MEDIUM',
      finding: 'When guard becomes effective on /loop 5m schedule, OTHER currently-being-silently-reset SDs WILL start being blocked. Witness already documented (SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001). DESIRED: real bugs surfaced. RISK: unknown count of fleet-wide silent-reset victims. Mitigation: pre-stage SQL audit query enumerating SDs with current_phase ranking earlier than latest accepted handoff to_phase. Run audit BEFORE merge to PR-time-disclose impact, AND post-merge to confirm no surprise blocks.'
    },
    Q3_lookup_latency: {
      score: 1,
      verdict: 'LOW (NON-ISSUE)',
      finding: 'EMPIRICAL: sd_phase_handoffs.sd_id is a string-typed column accepting SD-code values directly (probed: sd_id=SD-LEO-INFRA-UNIFY-CONTEXT-PRESERVATION-001 returned 3 rows with no type error). NO UUID resolution needed. Fix collapses to dropping .or() and using .eq(sd_id, sdKey) — same single round-trip as today. NO cache needed.'
    },
    Q4_schema_class_detection: {
      score: 5,
      verdict: 'MEDIUM',
      finding: 'PostgREST surfaces PostgreSQL SQLSTATE in error.code field. Schema-class set: 42703 (undefined_column), 42P01 (undefined_table), 42883 (undefined_function). Matching by error.code is stable across Supabase/PostgREST versions; matching by error.message is not. Recommend a frozen Set([42703, 42P01, 42883]) plus a clear comment listing covered codes.'
    },
    Q5_future_schema_drift: {
      score: 4,
      verdict: 'LOW-MEDIUM',
      finding: 'If future migration renames sd_phase_handoffs.sd_id, new query .eq(sd_id, sdKey) breaks identically — but loudly via fail-CLOSED, NOT silently as today. If future migration ADDS sd_phase_handoffs.sd_key, no impact (current fix drops the .or() entirely). Optional mitigation: startup self-test probing known-safe sentinel SD on first call per-process; cache 0/1 healthy flag.'
    },
    Q6_test_coverage: {
      score: 3,
      verdict: 'LOW',
      finding: 'Stub-based unit test preferred: inject mock supabase client whose chain returns {error:{code:42703,message:...},data:null} for fail-CLOSED case AND {error:null,data:[{...accepted handoff past target...}]} for happy path. Deterministic, no live DB. PLUS: integration test reproducing witness scenario using SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 SD-code as input.'
    },
    Q7_rollback_complexity: {
      score: 2,
      verdict: 'LOW',
      finding: 'Single-file change (lib/exec-context-guard.mjs), single-function refactor (assertSweepHandoffGate), atomic git revert. NO feature flag because (a) fix restores intended behavior, NOT new behavior; (b) flag would itself be a fail-open drift surface (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 class — flags often forgotten in flipped state). Stage merge during low-sweep-activity window (sweep on /loop 5m so 10-minute observation post-merge is sufficient).'
    }
  },
  critical_issues: [],
  warnings: [
    'Q4: Use error.code SQLSTATE matching, NOT error.message regex (Supabase version-dependent)',
    'Q2: Pre-stage fleet-audit query before merge to disclose latent-bug surface',
    'Q3 EMPIRICAL: sd_phase_handoffs.sd_id is string-typed; no UUID resolution / cache needed — simplifies FR-1'
  ],
  mitigation_recommendations: [
    'FR-1 simplification: drop .or() and use .eq(sd_id, sdKey) — no resolver, no cache',
    'FR-2: fail-CLOSED match by SQLSTATE code set {42703, 42P01, 42883} via error.code',
    'FR-3: deterministic stub test for both happy path AND 42703 error injection',
    'FR-4 (NEW, recommended): fleet pre-merge audit SQL identifying SDs whose current_phase ranks below latest accepted handoff to_phase',
    'FR-5 (NEW, recommended): structured log line on guard fail-CLOSED — diagnostic visibility',
    'NO feature flag: fix restores intended behavior; flag would create new fail-open drift surface',
    'Stage merge during low-sweep-activity window and observe 2 sweep cycles (~10 minutes) post-merge'
  ],
  scope_additions: [
    'FR-4: fleet pre-merge audit query',
    'FR-5: structured log line on fail-CLOSED'
  ],
  feature_flag_recommendation: 'NONE — restoring intended behavior, atomic revert sufficient',
  issue_pattern_link: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (writer-side wrote .or() referring to consumer-side schema that did not exist; identical multi-witness asymmetry class)'
};

const { data, error } = await s.from('sub_agent_execution_results').insert({
  sd_id: sdId,
  sub_agent_code: 'RISK',
  sub_agent_name: 'risk-agent',
  phase: 'LEAD',
  verdict: 'PASS',
  confidence: 87,
  summary,
  critical_issues: [],
  warnings: detailedAnalysis.warnings,
  recommendations: detailedAnalysis.mitigation_recommendations,
  detailed_analysis: detailedAnalysis,
  metadata: {
    session_id: 'd694138f-de06-478a-b758-18e8c1d84445',
    empirical_probes: {
      probe_a_42703: 'CONFIRMED — column sd_phase_handoffs.sd_key does not exist',
      probe_b_uuid_coercion: 'NEGATIVE — sd_id accepts SD-code strings, no 22P02 error',
      probe_c_happy_path: 'CONFIRMED — .eq(sd_id, sd_code) returns accepted handoffs for known SD'
    },
    bmad_overall_risk: 'MEDIUM-LOW',
    domain_scores: detailedAnalysis.domain_scores
  }
}).select('id, verdict, confidence, sub_agent_code, phase, sd_id');

if (error) {
  console.error('INSERT ERROR:', error);
  process.exit(1);
}
console.log('EVIDENCE WRITTEN:', JSON.stringify(data, null, 2));
