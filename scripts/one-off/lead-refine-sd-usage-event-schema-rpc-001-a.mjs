// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A — LEAD-phase content refinement.
// Replaces auto-generated decomposition placeholders with content grounded in
// LEAD-phase Explore research (fn_submit_venture_* precedent, Stage 23 dual-mirror,
// venture_telemetry incompatibility). See sub_agent_execution_results (Explore, LEAD-TO-PLAN)
// for full findings this content is derived from.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';

const description =
  "Child of SD-LEO-GEN-ALL-VENTURES-PRODUCED-001: builds the shared usage-event ingestion mechanism this decomposition slice owns -- a new venture_usage_events table plus a SECURITY DEFINER RPC (fn_submit_venture_usage_event) mirroring the ingest-key-bound push-rail pattern already live for fn_submit_venture_error and fn_submit_venture_feedback (per-venture ingest-secret verification, in-body rate limiting, RLS deny-by-absence, anon-callable, SQLSTATE 28000 on auth reject). Also adds the Stage 23 (Launch Readiness kill gate) required_artifacts wiring so a usage-signal artifact is enforced before a venture can clear its kill gate, updating both the DB-side fn_advance_venture_stage precondition and its JS mirror in lib/eva/stage-artifact-precondition.js per the existing dual-choke-point discipline. Infrastructure mechanism only -- venture-specific instrumentation is sibling child -E's scope.";

const scope =
  "IN SCOPE: (1) venture_usage_events table schema carrying AltifyAI's two migration-level correctness fixes over the apexniche-ai original (a combined event_type/event_name pairing CHECK constraint closing the independent-CHECK gap that lets inconsistent pairs through; a single consistent app-generated created_at with no DB-side default, avoiding TEXT-sort-order risk from mixed timestamp formats); (2) fn_submit_venture_usage_event(p_venture_id UUID, p_ingest_secret TEXT, p_event_type TEXT, p_event_name TEXT, p_properties JSONB) SECURITY DEFINER RPC, SET search_path = public, pg_temp, mirroring fn_submit_venture_feedback/fn_submit_venture_error exactly: venture_ingest_keys + _verify_venture_ingest_secret ownership check first (uniform SQLSTATE 28000 on any auth failure, no existence-enumeration oracle), in-body per-venture-per-hour + global-per-hour rate limiting (RLS is not evaluated for a SECURITY DEFINER function owned by a rolbypassrls role), REVOKE ALL FROM PUBLIC/authenticated + GRANT EXECUTE TO anon/service_role, a DO $verify$ grant-posture assertion, and NOTIFY pgrst reload -- staged under database/chairman-gated/ per the existing convention for this RPC family; (3) add a new artifact_type value to the venture_artifacts_artifact_type_check CHECK constraint and append it to venture_stages.required_artifacts for Stage 23 (gate_type='kill'), updating BOTH fn_advance_venture_stage's DB-side precondition AND its JS mirror lib/eva/stage-artifact-precondition.js (two independent choke points, per that file's own documented defense-in-depth discipline -- a change to only one does not actually gate anything). OUT OF SCOPE (owned by named siblings): wiring the telemetry-analytics capability's wired-verification signal in validate-venture-default-capabilities.js (sibling -C); the venture-stack-scan.js REQUIRED[] check (sibling -D); pointing AltifyAI's recordUsageEvent at this RPC as the live witness (sibling -E). Also out of scope: reusing/extending venture_telemetry -- confirmed architecturally incompatible (UNIQUE(application_id) one-row-per-venture rollup table, pull-direction from each venture's GET /v1/metrics, aggregate-verdict payload shape) versus the append-only anon-push event-log this SD needs.";

const success_criteria = [
  {
    criterion: 'venture_usage_events table exists with the two AltifyAI correctness fixes (combined event_type/event_name CHECK; app-generated created_at, no DB default)',
    measure: 'psql \\d venture_usage_events shows both constraints; a manual insert with a mismatched event_type/event_name pair is rejected at the DB level',
  },
  {
    criterion: 'fn_submit_venture_usage_event enforces the same ingest-key-bound auth contract as fn_submit_venture_feedback/fn_submit_venture_error',
    measure: 'A call with a correct ingest_secret returns {ok:true,id:...} and inserts a row; a call with a wrong secret raises SQLSTATE 28000 and inserts nothing; anon role has EXECUTE, authenticated does not (has_function_privilege checks)',
  },
  {
    criterion: 'Stage 23 kill gate enforces the new usage-signal required_artifacts entry at both choke points',
    measure: 'fn_advance_venture_stage blocks a Stage-23 advance missing the artifact with a named-artifact-type error; lib/eva/stage-artifact-precondition.js::checkStageArtifactPrecondition returns the same block for the same missing-artifact case (unit test asserts both)',
  },
];

const key_changes = [
  {
    change: 'New database/chairman-gated/<date>_venture_usage_events_rpc.sql: venture_usage_events table + fn_submit_venture_usage_event SECURITY DEFINER RPC mirroring the fn_submit_venture_feedback/fn_submit_venture_error pattern',
    impact: 'Adds a shared, venture-agnostic usage-event sink where none exists today; no existing table/RPC is modified',
  },
  {
    change: 'New artifact_type value added to venture_artifacts_artifact_type_check + appended to venture_stages.required_artifacts for Stage 23',
    impact: 'Stage 23 (kill gate) advancement now requires a usage-signal artifact; existing required artifacts (e.g. launch_readiness_checklist) are unaffected',
  },
  {
    change: 'lib/eva/stage-artifact-precondition.js updated to recognize the new artifact_type in its Stage 23 check',
    impact: 'JS-side mirror stays in parity with the DB-side fn_advance_venture_stage precondition -- both must change together or the gate is not actually enforced end-to-end',
  },
];

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Apply the staged migration to a local/test Supabase instance and run its DO $verify$ block',
    expected_outcome: 'venture_usage_events table and fn_submit_venture_usage_event function exist; the grant-posture assertions (anon EXECUTE granted, authenticated/PUBLIC revoked) all pass',
  },
  {
    step_number: 2,
    instruction: 'Call fn_submit_venture_usage_event with a valid venture_id + its provisioned ingest_secret + event_type=\'page_view\' + event_name=\'page_view\'',
    expected_outcome: 'Returns {ok:true, id:<uuid>}; a matching row appears in venture_usage_events',
  },
  {
    step_number: 3,
    instruction: 'Repeat step 2 with an incorrect ingest_secret for the same venture_id',
    expected_outcome: 'Raises an exception with SQLSTATE 28000; no row is written to venture_usage_events',
  },
  {
    step_number: 4,
    instruction: 'Attempt to advance a test venture past Stage 23 with no usage-signal artifact present, via both fn_advance_venture_stage and checkStageArtifactPrecondition()',
    expected_outcome: 'Both paths block the advance and name the missing usage-signal artifact_type in their response/error',
  },
];

const risks = [
  {
    risk: 'Skipping the combined event_type/event_name CHECK constraint (or the app-generated-only created_at convention) would silently reintroduce the exact two correctness gaps AltifyAI already found and fixed once over the apexniche-ai original.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'PRD acceptance criteria and PLAN-phase schema review explicitly require both constraints; success_criteria above test the combined-CHECK rejection directly.',
  },
  {
    risk: 'Updating only one of the two Stage-23 required_artifacts choke points (DB fn_advance_venture_stage vs. JS stage-artifact-precondition.js) leaves the gate looking wired while one code path silently does not enforce it.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'Success criteria explicitly require a unit test asserting both paths block the same missing-artifact case; do not consider this SD complete with only one side updated.',
  },
  {
    risk: 'A second SD (SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001, in_progress) needs per-channel real-event-data numbers against this same event store per the parent SD\'s coordination note -- if this SD\'s schema/RPC contract changes late, that consumer could break.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'Keep the RPC signature and table schema stable once PLAN-phase PRD is approved; do not build a second competing store for the same purpose.',
  },
];

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    description,
    scope,
    success_criteria,
    key_changes,
    smoke_test_steps,
    risks,
  })
  .eq('sd_key', SD_KEY)
  .select('sd_key, description')
  .single();

if (error) {
  console.error('UPDATE_FAILED', error);
  process.exit(1);
}

console.log('UPDATED', data.sd_key);
console.log('DESCRIPTION_WORD_COUNT', data.description.split(/\s+/).filter(Boolean).length);
