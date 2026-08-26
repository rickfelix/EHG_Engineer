// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A — VALIDATION sub-agent evidence (LEAD-TO-PLAN).
// Duplicate detection + overlapping-SD scan + existing-infrastructure reuse assessment.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'GATE 1 (LEAD pre-approval) duplicate check: NO DUPLICATE FOUND — the SD is clear to proceed to PLAN, subject to two ' +
    'named conditions. (Q1 DUPLICATES) Independently VERIFIED, not merely relayed, the prior Explore claim: to_regclass ' +
    "('public.venture_usage_events') and ('public.usage_events') both return NULL against the live engineer DB, and pg_proc " +
    'holds no fn_submit_venture_usage_event / fn_submit_venture_event (only fn_submit_venture_error, fn_submit_venture_feedback, ' +
    'fn_submit_venture_user_feedback, fn_submit_error_capture, fn_submit_internal_feedback). Repo-wide grep across the whole ' +
    'worktree (tracked + untracked) finds both target names ONLY inside this SD\'s own two authoring one-offs. Cross-repo check ' +
    'of ehg, altifyai and apexniche-ai found zero platform-side implementations. (Q1 venture_telemetry) The incompatibility claim ' +
    'is UPHELD on measured schema, not on the prior narrative: venture_telemetry carries UNIQUE(application_id) — which forbids ' +
    'more than one row per venture and therefore cannot hold an append-only event log by construction — plus pulled_at, ' +
    "source_url, http_status, ingest_status CHECK IN ('ok','skipped','version_mismatch','error'), raw_payload and kpis jsonb " +
    'NOT NULL DEFAULT {}. That is a pull-direction current-state rollup. REFUTING the SD would require multi-row-per-venture; the ' +
    'unique constraint forecloses it. (Q2 OVERLAPPING SDs) Scanned strategic_directives_v2 across title/description/scope on 11 ' +
    'terms. No SD duplicates this scope beyond the known parent and -B/-C/-D/-E siblings. BUT the scan surfaced a COLLISION that ' +
    'is not a duplicate and is more dangerous than one: SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (status=pending_approval, ' +
    'phase=LEAD_FINAL, i.e. authored and awaiting chairman apply) inserts a new UAT stage between 22 and 23 and RENUMBERS current ' +
    'stages 23-26 to 24-27. Live DB confirms it has NOT yet applied (stage 23 is still launch_readiness_gate / gate_type=kill / ' +
    'required_artifacts={launch_readiness_checklist}; there is no stage 27). Every choke point this SD must touch is ' +
    'stage_number-keyed and stage_key-blind — fn_advance_venture_stage line 155-157 SELECTs required_artifacts WHERE ' +
    'stage_number = p_from_stage; fn_stage_artifact_precondition line 21-22 does the same; lib/eva/stage-artifact-precondition.js ' +
    "lines 53-61 uses .eq('stage_number', stage) twice. So a migration written against stage_number = 23 silently retargets the " +
    'gate depending on merge order: if -B lands second, the usage-signal artifact ends up gating the NEW UAT stage while the ' +
    'Launch Readiness kill gate it was written for goes ungated — a gate that reads as wired and enforces nothing. (Q3 REUSE) The ' +
    'precedent pattern is GENUINELY reusable as a design template and NOT shareable as a literal function. Reusable: ' +
    'venture_ingest_keys exists, _verify_venture_ingest_secret exists (1 overload), and all three precedent RPCs are live with ' +
    'prosecdef=true, owner=postgres, rolbypassrls=true — which independently CONFIRMS the SD\'s own premise that RLS is not ' +
    'evaluated on this path, making in-body rate limiting mandatory rather than belt-and-braces. All three share the leading ' +
    '(p_venture_id uuid, p_ingest_secret text, ...) signature the proposed RPC conforms to, and the fn_submit_venture_<noun> ' +
    'naming favours fn_submit_venture_usage_event over the parent text\'s fn_submit_venture_event. NOT shareable: the three write ' +
    'different target tables with different payload shapes and there is no generic dispatcher among them; a fourth sibling is the ' +
    'correct shape, not a refactor into a shared writer.',
  findings: [
    { id: 'no-duplicate-table-or-rpc', severity: 'info', note: "VERIFIED against live DB, not just repo grep: to_regclass('public.venture_usage_events') IS NULL and to_regclass('public.usage_events') IS NULL; pg_proc has no fn_submit_venture_usage_event or fn_submit_venture_event. Repo-wide grep (tracked + untracked, whole worktree) hits ONLY scripts/one-off/lead-refine-sd-usage-event-schema-rpc-001-a.mjs and scripts/one-off/store-explore-evidence-usage-event-schema-rpc-001-a.mjs — this SD's own authoring artifacts. Explore pass CONFIRMED, not refuted." },
    { id: 'venture-telemetry-incompatible-confirmed-on-schema', severity: 'info', note: 'Explore claim independently re-measured and UPHELD on constraint evidence rather than narrative: pg_constraint shows uq_venture_telemetry_application UNIQUE (application_id), which makes a multi-row append-only event log impossible by construction. Column set (pulled_at, source_url, http_status, ingest_status CHECK, raw_payload, kpis jsonb NOT NULL DEFAULT {}, avg_confidence, dry_run_count) is a pull-direction current-state rollup. Not a reuse candidate. Not a duplicate.' },
    { id: 'stage-renumber-collision-with-uat-001-b', severity: 'critical', note: "BLOCKING-CLASS, PLAN MUST ABSORB. SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (status=pending_approval, phase=LEAD_FINAL) inserts a UAT stage between 22 and 23 and renumbers 23-26 -> 24-27. Live DB confirms NOT YET APPLIED (stage 23 = launch_readiness_gate, gate_type=kill, required_artifacts={launch_readiness_checklist}; no stage 27 exists). After it applies, stage_number 23 becomes the UAT stage and Launch Readiness becomes 24. This SD's scope text names 'Stage 23 (Launch Readiness kill gate)' by NUMBER. MITIGATION: key the venture_stages mutation on stage_key='launch_readiness_gate', never stage_number=23, and assert in the acceptance test that the new artifact landed on the row WHERE stage_key='launch_readiness_gate' AND gate_type='kill'. This aligns with -B's own FR-4 ('stage_key becomes the primary identifier in callers, numbers become display-order only') rather than fighting it. Also add an explicit merge-order note vs -B to the PRD." },
    { id: 'dual-choke-point-is-over-scoped', severity: 'high', note: "SCOPE CORRECTION. The SD scope says it will update 'BOTH fn_advance_venture_stage's DB-side precondition AND its JS mirror lib/eva/stage-artifact-precondition.js'. Measured prosrc shows BOTH read required_artifacts GENERICALLY from the table: fn_advance_venture_stage lines 155-177 does SELECT required_artifacts INTO v_canonical_array FROM venture_stages WHERE stage_number = p_from_stage, then a generic unnest()/NOT EXISTS existence check with no hardcoded artifact list; lib/eva/stage-artifact-precondition.js lines 53-56 does .select('required_artifacts') then stageConfig?.required_artifacts || []. Therefore appending the new value to venture_stages.required_artifacts plus widening venture_artifacts_artifact_type_check is SUFFICIENT — NO function-body edit and NO JS-mirror code edit is required. The dual-choke-point discipline remains correct as a VERIFICATION requirement (prove both paths pick the new artifact up) but not as an EDIT requirement. Editing two live gate paths for no functional reason is pure regression risk." },
    { id: 'third-artifact-source-legacy-table', severity: 'medium', note: 'fn_stage_artifact_precondition (lines 25-28) reads a SECOND source the SD does not mention: stage_artifact_requirements WHERE stage_number = p_stage AND is_blocking = true, merged with the canonical venture_stages.required_artifacts. fn_advance_venture_stage reads only the canonical source. PLAN should state explicitly that the new artifact is written to venture_stages.required_artifacts ONLY, and confirm no conflicting stage_artifact_requirements row exists for the launch-readiness stage, so the two enforcement paths cannot disagree.' },
    { id: 'closed-event-name-enum-does-not-port-to-shared-table', severity: 'high', note: "DESIGN RISK in the schema half of scope item (1). Measured the two venture-side sources: apexniche-ai/migrations/0002_usage_events.sql constrains event_name IN (niche_profile_created, content_project_initiated, generated_content_viewed, cascade_validation_run, synthetic_isolation_audit_run, page_view); altifyai/migrations/0004_create_usage_events_table.sql constrains event_name IN (page_view, image_uploaded, alt_text_generated, registration_completed). The vocabularies are DISJOINT except page_view. A single SHARED platform-side table cannot carry a closed event_name enum without requiring a chairman-gated migration for every new venture's event vocabulary. GOOD NEWS, measured: AltifyAI's combined pairing CHECK is already name-agnostic — (event_name='page_view' AND event_type='page_view') OR (event_name<>'page_view' AND event_type='conversion_event') — so the correctness fix the SD wants ports cleanly. Recommendation: port the PAIRING check and the closed event_type enum (page_view|conversion_event, a genuinely universal axis); do NOT port a closed event_name enum to the shared table." },
    { id: 'gdpr-erasure-cascade-does-not-cross-the-boundary', severity: 'medium', note: 'Both venture-side migrations explicitly commit to a Clerk-erasure / GDPR art.17 cascade via user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, and both headers call that contract load-bearing. The platform-side venture_usage_events keys on venture_id in a different database, so it CANNOT inherit that cascade. If the shared sink stores any user identifier, the erasure contract both source tables were designed around is silently broken at the boundary. PLAN should either exclude user identifiers from the shared sink entirely or specify an explicit erasure path. Flagging now because it reads as fine and is not.' },
    { id: 'no-overlapping-sd-beyond-known-siblings', severity: 'info', note: 'Scanned strategic_directives_v2 title/description/scope across 11 terms (usage, telemetry, ingest, event, analytic, instrument, Stage 23, launch readiness, kill gate, required_artifact, artifact). Nearest neighbours are all NON-overlapping: SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-H/-H1 (completed) delivered AltifyAI venture-side D1 telemetry — the SOURCE material this SD generalizes, not a duplicate of the platform-side sink; SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (completed) is the parent SD\'s stated origin and explicitly descoped the telemetry data source as "structurally unreachable today (no telemetry data source exists)" — which is exactly the gap this SD fills, corroborating its premise; SD-LEO-INFRA-RECONCILE-VENTURE-ARTIFACTS-001 (completed) touched venture_artifacts vs venture_documents, adjacent but not overlapping. -B is correctly cancelled as a duplicate of this SD.' },
    { id: 'precedent-reusable-as-template-not-as-shared-function', severity: 'info', note: 'Q3 answered on measured evidence. Reusable: venture_ingest_keys table exists; _verify_venture_ingest_secret exists (1 overload); fn_submit_venture_error, fn_submit_venture_feedback and fn_submit_venture_user_feedback are all live with prosecdef=true, owner=postgres, rolbypassrls=true — the rolbypassrls fact independently confirms the SD premise that RLS is NOT evaluated on this path, so in-body rate limiting is mandatory. All three share the leading (p_venture_id uuid, p_ingest_secret text, ...) signature the proposed RPC conforms to. NOT shareable as one function: the three write different tables with different payload shapes and no generic dispatcher exists among them. Adding a fourth sibling that mirrors the pattern is correct; refactoring into a shared writer is not in scope and should not be attempted.' },
    { id: 'artifact-type-check-has-no-usage-signal-value', severity: 'info', note: 'venture_artifacts_artifact_type_check currently enumerates ~135 values. No existing value covers a usage signal — nearest neighbours are launch_analytics_dashboard, postlaunch_analytics_dashboard, launch_health_scoring and launch_metrics, none of which is this. Confirms scope item (3) needs a genuinely new value, not reuse. Recommend the launch_* prefix for consistency with the rest of the launch-readiness stage family.' },
  ],
  metadata: {
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    duplicate_found: false,
    duplicate_check_method: 'live pg_catalog to_regclass + pg_proc scan, repo-wide grep (tracked+untracked), cross-repo grep (ehg, altifyai, apexniche-ai)',
    venture_usage_events_exists: false,
    fn_submit_venture_usage_event_exists: false,
    fn_submit_venture_event_exists: false,
    precedent_rpcs_live: ['fn_submit_venture_error', 'fn_submit_venture_feedback', 'fn_submit_venture_user_feedback'],
    precedent_rpcs_rolbypassrls_owner: true,
    venture_ingest_keys_exists: true,
    verify_venture_ingest_secret_exists: true,
    venture_telemetry_reuse_candidate: false,
    venture_telemetry_blocking_constraint: 'uq_venture_telemetry_application UNIQUE (application_id)',
    stage23_live_today: { stage_number: 23, stage_key: 'launch_readiness_gate', gate_type: 'kill', required_artifacts: ['launch_readiness_checklist'] },
    colliding_sd: 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B',
    colliding_sd_status: 'pending_approval/LEAD_FINAL',
    colliding_sd_effect: 'inserts UAT stage between 22 and 23; renumbers 23-26 -> 24-27; NOT YET APPLIED',
    choke_points_are_stage_number_keyed: true,
    choke_points_read_required_artifacts_generically: true,
    code_edit_required_at_choke_points: false,
    venture_side_precedent_migrations: ['altifyai/migrations/0004_create_usage_events_table.sql', 'apexniche-ai/migrations/0002_usage_events.sql'],
    overlapping_sds_beyond_known_siblings: [],
  },
  conditions: [
    'PRD MUST key the venture_stages required_artifacts mutation on stage_key = \'launch_readiness_gate\' (never stage_number = 23), and its acceptance test MUST assert the artifact landed on the row WHERE stage_key=\'launch_readiness_gate\' AND gate_type=\'kill\' — because SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B (pending_approval) renumbers 23 -> 24 and would otherwise silently retarget this gate at the new UAT stage.',
    'PRD MUST record an explicit merge-order/sequencing note versus SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B so whichever lands second does not invalidate the other.',
    'PRD SHOULD narrow scope item (3): both fn_advance_venture_stage and lib/eva/stage-artifact-precondition.js read required_artifacts generically from venture_stages, so appending the value plus widening venture_artifacts_artifact_type_check is sufficient — the dual choke point is a VERIFICATION requirement, not an EDIT requirement. Editing two live gate paths unnecessarily is regression risk.',
    'PRD SHOULD NOT port a closed event_name enum to the shared platform table (the two venture vocabularies are disjoint); port the name-agnostic pairing CHECK and the closed event_type enum only.',
    'PRD SHOULD state whether any user identifier crosses into the shared sink, since the GDPR/Clerk erasure cascade both venture-side source tables commit to cannot follow it across the database boundary.',
  ],
  justification:
    'CONDITIONAL_PASS rather than PASS. The question this gate exists to answer — does this already exist — is a clean NO on live-database evidence, so the SD is not duplicate work and should proceed to PLAN. The verdict is conditioned, not blocked, because the overlapping-SD scan surfaced a live sequencing collision (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B renumbers the very stage number this SD targets, and every enforcement path involved is stage_number-keyed and stage_key-blind) which would produce a gate that reads as wired while enforcing nothing, plus a measured over-scope in the stated dual-edit that PLAN should narrow before it reaches EXEC. Both are cheap to absorb at PRD time and expensive to discover at EXEC or after apply.',
  execution_time_ms: 900000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'VALIDATION',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
