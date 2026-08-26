// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A — LEAD-phase round-2 correction.
// Incorporates VALIDATION sub-agent findings (row 668e925c-13dd-4ad0-bf8f-edf25610092b):
// (1) SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B will renumber stages 23-26 -> 24-27;
//     enforcement must key on stage_key='launch_readiness_gate', never stage_number=23.
// (2) fn_advance_venture_stage + stage-artifact-precondition.js already read
//     required_artifacts generically -- no function/JS code edits needed, only data
//     (CHECK constraint widen + required_artifacts array append).
// (3) event_name vocab is disjoint across ventures (apexniche vs altifyai) -- a closed
//     event_name CHECK won't port; keep the pairing CHECK (name-agnostic) + closed
//     event_type enum, drop closed event_name enum.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';

const scope =
  "IN SCOPE: (1) venture_usage_events table schema carrying AltifyAI's two migration-level correctness fixes over the apexniche-ai original -- a name-agnostic pairing CHECK ((event_name='page_view' AND event_type='page_view') OR (event_name<>'page_view' AND event_type='conversion_event')) closing the independent-CHECK gap that lets inconsistent pairs through, and a single consistent app-generated created_at with no DB-side default. event_type is a closed CHECK enum (page_view, conversion_event); event_name is intentionally left un-enumerated (free text validated app-side) because the apexniche-ai and AltifyAI event-name vocabularies are disjoint except 'page_view' -- a closed event_name CHECK on a shared cross-venture table would require a chairman-gated migration per new venture (VALIDATION sub-agent finding, confirmed via live vocab diff); (2) fn_submit_venture_usage_event(p_venture_id UUID, p_ingest_secret TEXT, p_event_type TEXT, p_event_name TEXT, p_properties JSONB) SECURITY DEFINER RPC, SET search_path = public, pg_temp, mirroring fn_submit_venture_feedback/fn_submit_venture_error exactly: venture_ingest_keys + _verify_venture_ingest_secret ownership check first (uniform SQLSTATE 28000 on any auth failure, no existence-enumeration oracle), in-body per-venture-per-hour + global-per-hour rate limiting (confirmed via live prosecdef/rolbypassrls check: RLS is never evaluated on this path, so in-body limiting is mandatory not belt-and-braces), REVOKE ALL FROM PUBLIC/authenticated + GRANT EXECUTE TO anon/service_role, a DO $verify$ grant-posture assertion, and NOTIFY pgrst reload -- staged under database/chairman-gated/ per the existing convention for this RPC family; (3) DATA-ONLY change to wire the new artifact_type into the Stage 23 (Launch Readiness) kill gate: widen venture_artifacts_artifact_type_check to include the new value, and append it to the launch_readiness_gate stage's required_artifacts array -- keyed by stage_key='launch_readiness_gate', NEVER by stage_number=23 (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, pending_approval/LEAD_FINAL, will renumber stages 23-26 to 24-27 by inserting a UAT stage; a stage_number-keyed migration would silently retarget onto the wrong stage depending on merge order). CONFIRMED NO CODE EDIT NEEDED: fn_advance_venture_stage and lib/eva/stage-artifact-precondition.js both already read required_artifacts generically (unnest/NOT EXISTS server-side, plain array read client-side) -- this SD adds data, not new gate logic; the dual-choke-point check in success_criteria below is a verification requirement (does the generic read pick up the new value at both paths), not a code-change requirement. OUT OF SCOPE (owned by named siblings): wiring the telemetry-analytics capability's wired-verification signal in validate-venture-default-capabilities.js (sibling -C); the venture-stack-scan.js REQUIRED[] check (sibling -D); pointing AltifyAI's recordUsageEvent at this RPC as the live witness (sibling -E). Also out of scope: reusing/extending venture_telemetry (confirmed architecturally impossible by its own UNIQUE(application_id) constraint, not just inconvenient); refactoring fn_submit_venture_error/feedback/user_feedback into a shared generic writer (VALIDATION sub-agent confirmed: three different target tables/payload shapes, no generic dispatcher -- a fourth sibling RPC is correct, a refactor is not); resolving the legacy stage_artifact_requirements fallback table's relationship to this change (PLAN phase must rule out conflict, not this LEAD scope); the cross-database-boundary GDPR/Clerk user-erasure cascade implication of a venture-originated event row referencing an external user id (flagged as a risk below, PRD must address retention/erasure policy explicitly).";

const success_criteria = [
  {
    criterion: 'venture_usage_events table exists with the pairing CHECK (name-agnostic) + closed event_type enum + app-generated created_at (no DB default); event_name is intentionally NOT a closed enum',
    measure: 'psql \\d venture_usage_events shows the pairing CHECK and the event_type CHECK; a manual insert with a mismatched event_type/event_name pair is rejected; an insert with a novel event_name (not in any existing venture vocab) and a valid event_type/pairing succeeds',
  },
  {
    criterion: 'fn_submit_venture_usage_event enforces the same ingest-key-bound auth contract as fn_submit_venture_feedback/fn_submit_venture_error',
    measure: 'A call with a correct ingest_secret returns {ok:true,id:...} and inserts a row; a call with a wrong secret raises SQLSTATE 28000 and inserts nothing; anon role has EXECUTE, authenticated does not (has_function_privilege checks)',
  },
  {
    criterion: "Stage 23 (launch_readiness_gate, keyed by stage_key not stage_number) kill gate enforces the new usage-signal required_artifacts entry via the EXISTING generic read paths in fn_advance_venture_stage and lib/eva/stage-artifact-precondition.js -- no code edit to either, only appended data",
    measure: "A test venture missing the usage-signal artifact is blocked from advancing past launch_readiness_gate by both fn_advance_venture_stage and checkStageArtifactPrecondition(); re-running the same test after SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B's stage renumbering (if it has landed) still targets the correct stage because the migration is stage_key-keyed",
  },
];

const key_changes = [
  {
    change: 'New database/chairman-gated/<date>_venture_usage_events_rpc.sql: venture_usage_events table (pairing CHECK + closed event_type enum, un-enumerated event_name) + fn_submit_venture_usage_event SECURITY DEFINER RPC mirroring the fn_submit_venture_feedback/fn_submit_venture_error pattern',
    impact: 'Adds a shared, venture-agnostic usage-event sink where none exists today; no existing table/RPC is modified',
  },
  {
    change: "New artifact_type value added to venture_artifacts_artifact_type_check + appended to the launch_readiness_gate stage's required_artifacts array, keyed by stage_key (never stage_number, per the pending stage-renumbering SD)",
    impact: 'Stage 23 (kill gate) advancement now requires a usage-signal artifact via existing generic gate-read logic; existing required artifacts (e.g. launch_readiness_checklist) are unaffected; no fn_advance_venture_stage or stage-artifact-precondition.js code changes required',
  },
];

const risks = [
  {
    risk: 'A closed event_name CHECK would not port across ventures with disjoint event vocabularies (apexniche-ai vs AltifyAI share only \'page_view\') -- would force a chairman-gated migration per new venture onboarding.',
    impact: 'medium',
    likelihood: 'high',
    mitigation: 'Scope explicitly leaves event_name un-enumerated (app-side validated allowlist per caller, as AltifyAI\'s track.js already does) and keeps only the name-agnostic pairing CHECK + closed event_type enum at the DB level.',
  },
  {
    risk: 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (pending_approval/LEAD_FINAL) will renumber venture_stages 23-26 to 24-27 by inserting a UAT stage. A stage_number=23-keyed migration for this SD would silently retarget onto the wrong stage depending on merge order, gating a stage other than Launch Readiness while it ships apparently-wired but non-functional.',
    impact: 'high',
    likelihood: 'medium',
    mitigation: 'All migration/config work in this SD keys on stage_key=\'launch_readiness_gate\', never stage_number. PLAN-phase PRD must state this explicitly as an acceptance criterion, and EXEC must verify against live venture_stages.stage_key at implementation time, not against this SD\'s LEAD-phase snapshot of stage_number=23.',
  },
  {
    risk: 'A venture-originated usage-event row references an external per-venture user identifier (e.g. a Clerk user_id from AltifyAI); GDPR/erasure requests against that identifier in the venture\'s own database cannot cascade into this shared EHG_Engineer table across the database boundary.',
    impact: 'medium',
    likelihood: 'low',
    mitigation: 'PRD must explicitly define a retention/erasure policy for venture_usage_events (e.g. no direct user identifiers stored, only venture-scoped aggregable properties) rather than relying on ON DELETE CASCADE, which cannot cross the database boundary.',
  },
  {
    risk: 'A legacy stage_artifact_requirements table (read by a related legacy precondition path but not by fn_advance_venture_stage) could hold a conflicting or stale required_artifacts list for Stage 23, creating two disagreeing sources of truth.',
    impact: 'low',
    likelihood: 'low',
    mitigation: 'PLAN phase must confirm stage_artifact_requirements does not need updating in parallel, or explicitly rule it out as dead/fallback-only per its existing deprecated-mirror status.',
  },
];

const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({ scope, success_criteria, key_changes, risks })
  .eq('sd_key', SD_KEY)
  .select('sd_key')
  .single();

if (error) {
  console.error('UPDATE_FAILED', error);
  process.exit(1);
}

console.log('UPDATED_ROUND2', data.sd_key);
