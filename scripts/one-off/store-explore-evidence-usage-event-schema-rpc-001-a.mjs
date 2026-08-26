// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A — Explore sub-agent evidence (LEAD-TO-PLAN).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 92,
  summary:
    'Explore pass mapped the precedent RPC family (fn_submit_venture_error/fn_submit_venture_feedback/fn_submit_venture_user_feedback, ' +
    'database/chairman-gated/20260812_venture_ingest_key_binding.sql + 20260815_venture_user_feedback_ownership_rpc.sql) that this SD\'s ' +
    'fn_submit_venture_usage_event RPC must mirror: all three follow fn_submit_venture_<specific-noun> naming (confirming the child SD\'s ' +
    'own title over the parent SD text\'s more generic fn_submit_venture_event), all use SECURITY DEFINER + SET search_path + a ' +
    'venture_ingest_keys/_verify_venture_ingest_secret ownership check raising SQLSTATE 28000 first, in-body rate limiting (RLS is not ' +
    'evaluated for a rolbypassrls-owned SECURITY DEFINER function), and REVOKE-then-GRANT-to-anon/service_role. Confirmed the three ' +
    'precedent functions are LIVE in production despite their files carrying a "STAGED, NOT APPLIED" header banner -- a documented ' +
    'file-vs-live-state drift already flagged once in docs/audits/venture-ingest-anon-write-binding-audit.md. Confirmed AltifyAI\'s ' +
    'lib/events/track.js writes locally to a Cloudflare D1 table only (never reaches shared infra today), and its migration file\'s own ' +
    'header names the exact "two corrections... neither present in the apex source" the parent SD references: a combined event_type/' +
    'event_name pairing CHECK (apex has two independent CHECKs that jointly accept an inconsistent pair) and a single app-generated ' +
    'created_at with no DB-side default (apex risks TEXT-sort drift if formats mix). Confirmed venture_stages.required_artifacts is a ' +
    'flat text[] (Stage 23 currently {launch_readiness_checklist}), gate_type=\'kill\' for Stage 23, and enforcement is a documented ' +
    'dual choke point (fn_advance_venture_stage DB-side + lib/eva/stage-artifact-precondition.js JS mirror) that must both be updated ' +
    'or the gate does not actually fire end-to-end. Confirmed telemetry-analytics capability exists in venture-default-capabilities.js ' +
    'but has zero wired-verification coverage in validate-venture-default-capabilities.js (WIRED_CAPABILITY_FEEDBACK_TYPES only covers ' +
    'feedback-widget/error-capture-middleware) -- verifying the parent SD\'s premise. Confirmed venture_telemetry is NOT a reuse ' +
    'candidate: UNIQUE(application_id) one-row-per-venture rollup, pull-direction (EHG pulls from each venture\'s GET /v1/metrics), ' +
    'aggregate-verdict payload shape -- architecturally incompatible with the append-only anon-push event log this SD needs. These ' +
    'findings directly grounded the SD\'s description/scope/success_criteria refinement from auto-generated placeholders to concrete, ' +
    'code-verified content.',
  findings: [
    { id: 'rpc-naming-precedent', severity: 'info', note: "fn_submit_venture_error/feedback/user_feedback (database/chairman-gated/20260812_venture_ingest_key_binding.sql:393-688, 20260815_venture_user_feedback_ownership_rpc.sql:221-331) all follow fn_submit_venture_<noun> naming -- confirms this SD's fn_submit_venture_usage_event over the parent text's fn_submit_venture_event." },
    { id: 'file-vs-live-drift', severity: 'warning', note: 'All three precedent RPC files carry a "STAGED, NOT APPLIED. CHAIRMAN-GATED." header but are confirmed LIVE via has_function_privilege() per database/chairman-gated/README.md:215-221 and scripts/audit-rpc-execute-grants-buckets.json Bucket C. New migration for this SD should follow the same staging convention but this drift pattern is worth flagging in the PRD so the PLAN reader does not assume "staged header" means "not live."' },
    { id: 'altifyai-track-js-local-only', severity: 'info', note: 'altifyai/lib/events/track.js writes to a local Cloudflare D1 table (usage_events) only -- confirms the SD premise that recordUsageEvent currently reaches no shared infrastructure.' },
    { id: 'altifyai-two-fixes-identified', severity: 'info', note: "altifyai/migrations/0004_create_usage_events_table.sql header names the exact two fixes: combined event_type/event_name pairing CHECK, and app-generated-only created_at (no DB default). These are now encoded in this SD's schema success_criteria." },
    { id: 'stage23-dual-choke-point', severity: 'warning', note: 'venture_stages.required_artifacts (flat text[]) + venture_artifacts_artifact_type_check enforcement is split across fn_advance_venture_stage (DB) and lib/eva/stage-artifact-precondition.js (JS mirror) -- both must be updated together, confirmed by that file\'s own "defense-in-depth, not shared code path" header comment.' },
    { id: 'telemetry-analytics-unverified', severity: 'info', note: "lib/eva/utils/validate-venture-default-capabilities.js:109-118 confirms telemetry-analytics has zero wired-verification signal today (WIRED_CAPABILITY_FEEDBACK_TYPES covers only feedback-widget/error-capture-middleware) -- verifies parent SD's stated gap." },
    { id: 'venture-telemetry-incompatible', severity: 'info', note: 'venture_telemetry (database/migrations/20260529_venture_telemetry_consumer.sql) has UNIQUE(application_id), is pull-direction, and carries an aggregate-verdict payload shape -- confirmed not a reuse candidate for the append-only anon-push event log this SD needs.' },
  ],
  metadata: {
    precedent_rpcs_found: ['fn_submit_venture_error', 'fn_submit_venture_feedback', 'fn_submit_venture_user_feedback'],
    naming_convention_confirmed: 'fn_submit_venture_<specific-noun>',
    altifyai_write_target_today: 'Cloudflare D1 (local, not shared)',
    stage23_gate_type: 'kill',
    stage23_current_required_artifacts: ['launch_readiness_checklist'],
    telemetry_analytics_wired_verification_exists: false,
    venture_telemetry_reuse_candidate: false,
  },
  execution_time_ms: 600000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
