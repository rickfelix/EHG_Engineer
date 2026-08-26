// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A — DESIGN sub-agent evidence (PLAN).
// UI/UX surface confirmation + interface-contract (developer UX) review of the RPC
// response shape, the SQLSTATE 28000 reject path, and the properties JSONB payload.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A';
const PHASE = 'PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 92,
  summary:
    '(a) NO-UI PREMISE CONFIRMED, WITH ONE QUALIFICATION. Read the live strategic_directives_v2 row: scope enumerates three ' +
    'items (venture_usage_events table, fn_submit_venture_usage_event SECURITY DEFINER RPC, and a DATA-ONLY required_artifacts ' +
    'append keyed on stage_key=launch_readiness_gate). No component, page, route or user-facing surface appears anywhere in ' +
    'scope, description or success_criteria. Measured confirmation: zero .tsx/.jsx files in EHG_Engineer reference ' +
    'required_artifacts, launch_readiness_gate or venture_usage_events; all 30 consumers are lib/eva/*.js and scripts. ' +
    'QUALIFICATION: this SD builds no UI but it MUTATES DATA THAT EXISTING UI RENDERS. The EHG frontend (../ehg, APP001) has a ' +
    'live artifact/gate-evidence surface — src/components/ventures/building-mode/GateEvidencePanel.tsx, ArtifactsTab.tsx, ' +
    'src/components/artifacts/ArtifactPanel.tsx, src/hooks/useVentureArtifacts.ts, useStagePolicy.ts. Appending an entry to ' +
    'launch_readiness_gate.required_artifacts adds a new row to a gate checklist every operator sees. "No UI in scope" is true; ' +
    '"no UI impact" is not, and the PRD should not conflate them. ' +
    '(b) THE HIGH-ORDER FINDING IS NOT COSMETIC. This SD arms a KILL gate with an artifact type that nothing in the entire ' +
    'parent decomposition is described as producing, and does so in a way BOTH existing CI parity guards are structurally blind ' +
    'to. tests/unit/eva/artifact-type-producer-parity.test.js exists specifically to prevent this exact incident class — its ' +
    'header documents the truth_demand_thesis outage in these words: "declared, gate-enforced at S21, and writable by nothing — ' +
    'passed CI continuously while every venture reaching S21 blocked on it", and its failure message reads "a type that exists ' +
    'in name only, which a gate can then enforce and block a venture on forever." Both that test and ' +
    'artifact-type-db-parity.test.js scan ONLY the JS registry (Object.values(ARTIFACT_TYPES)); this SD\'s change is DB-only ' +
    '(CHECK constraint + venture_stages.required_artifacts). Follow the SD\'s "DATA-ONLY / no code edit needed" framing ' +
    'literally and NEITHER guard fires — the kill gate ships enforced-and-unsatisfiable with a green suite. Measured ' +
    'aggravator: fn_advance_venture_stage prosrc contains ZERO occurrences of "deviation", so the documented-skip escape hatch ' +
    'that lib/eva/stage-artifact-precondition.js:85 honours does NOT exist on the authoritative DB path. The operator dead-end ' +
    'is hard, not soft. From a UX standpoint this is the worst class of blocking state: unsatisfiable, with no in-product ' +
    'affordance to resolve it and no CI signal to warn anyone it shipped. ' +
    '(c) INTERFACE-CONTRACT (DEVELOPER UX) REVIEW. The RPC\'s JSONB return is the entire API surface for anon integrators and ' +
    'the SD says it mirrors fn_submit_venture_feedback/fn_submit_venture_error "exactly" — but those two DISAGREE WITH EACH ' +
    'OTHER, so "mirror exactly" is unresolvable as written and the PRD must pick. Measured from the precedent file: feedback ' +
    'returns exactly one shape {ok:true,id} and RAISES on every failure (ok is never false — a degenerate discriminator); error ' +
    'returns five shapes, RETURNS {ok:false,reason:invalid_error_hash} for bad input instead of raising, and omits id on the ' +
    'storm_suppressed branch. The precedent file\'s own COMMENT already warns this shape misleads callers. The 28000 message ' +
    'is deliberately uniform (anti-enumeration, correct — preserve it) but PostgREST HTTP status is the real integrator-facing ' +
    'surface and is unspecified everywhere. properties JSONB has no cap, no schema, no version key and no example, while the ' +
    'sibling caps p_context at 8000 octets with a {truncated:true} sentinel. None of these block PLAN; all are cheap now and ' +
    'expensive after ventures integrate against a shape that was never pinned.',
  findings: [
    {
      id: 'no-ui-surface-confirmed',
      severity: 'info',
      note:
        'PRIMARY QUESTION ANSWERED: YES, there is genuinely no UI/UX surface in this SD\'s scope. Read the live ' +
        'strategic_directives_v2 row (id 363c8fb9-67c6-4702-807b-fa227bf4637f, status=in_progress, current_phase=PLAN_PRD). ' +
        'scope/description enumerate only: (1) venture_usage_events table, (2) fn_submit_venture_usage_event RPC, (3) a ' +
        'DATA-ONLY required_artifacts append. No component, page, route, form, or user-facing surface named. success_criteria ' +
        'are all psql/has_function_privilege/gate-advance assertions. Independently measured, not just read: grep across ' +
        'EHG_Engineer for required_artifacts|launch_readiness_gate|venture_usage_events returns ZERO .tsx/.jsx hits; all 30 ' +
        'consumers are lib/eva/*.js + scripts. Standard DESIGN checks (component sizing 300-600 LOC, WCAG 2.1 AA contrast/ARIA/' +
        'keyboard nav, responsive breakpoints, loading/error/empty states, data-testid coverage) are NOT APPLICABLE — there is ' +
        'no component to size and no rendered surface to audit. No design-side objection to the SD proceeding.',
    },
    {
      id: 'no-ui-in-scope-is-not-no-ui-impact',
      severity: 'medium',
      note:
        'QUALIFICATION on the above, and the reason "no UI" should not be recorded unconditionally. This SD builds no UI but ' +
        'MUTATES DATA AN EXISTING UI RENDERS. The EHG frontend (../ehg, APP001, the port-8080 app) carries a live artifact and ' +
        'gate-evidence surface: src/components/ventures/building-mode/GateEvidencePanel.tsx, ' +
        'src/components/ventures/building-mode/ArtifactsTab.tsx, src/components/artifacts/ArtifactPanel.tsx, ' +
        'src/hooks/useVentureArtifacts.ts, src/hooks/useStagePolicy.ts, src/hooks/useStageDisplayData.ts, ' +
        'src/lib/gvos/artifact-resolver.ts. Measured live: venture_stages WHERE stage_key=launch_readiness_gate currently has ' +
        'required_artifacts=["launch_readiness_checklist"] — exactly ONE entry. This SD makes it two, i.e. it adds a visible row ' +
        'to a gate checklist for every venture reaching launch readiness. PRD should state the expected rendered label for the ' +
        'new type and confirm the EHG gate panel humanizes an unrecognised artifact_type rather than rendering a raw snake_case ' +
        'token or silently dropping it (src/lib/gvos/upstream-context.ts is documented in lib/eva/artifact-types.js as a ' +
        'two-sided allowlist contract with this repo — an unlisted type may be silently ignored there).',
    },
    {
      id: 'kill-gate-armed-with-no-producer-and-both-guards-are-blind',
      severity: 'critical',
      note:
        'BLOCKING-CLASS, PRD MUST ABSORB. This SD appends a required artifact to a KILL gate while explicitly deferring the ' +
        'producer ("OUT OF SCOPE ... pointing AltifyAI\'s recordUsageEvent at this RPC as the live witness (sibling -E)"). ' +
        'tests/unit/eva/artifact-type-producer-parity.test.js (SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 TS-7) exists to prevent ' +
        'precisely this; its header records the prior outage verbatim: "truth_demand_thesis — declared, gate-enforced at S21, ' +
        'and writable by nothing — passed CI continuously while every venture reaching S21 blocked on it", and its assertion ' +
        'message reads "A NEW artifact type was declared with no way to produce it ... a type that exists in name only, which a ' +
        'gate can then enforce and block a venture on forever." CRITICAL MECHANISM: both parity guards iterate ' +
        'Object.values(ARTIFACT_TYPES) — the JS registry ONLY. This SD\'s change is DB-only (widen ' +
        'venture_artifacts_artifact_type_check + append to venture_stages.required_artifacts). Taken literally, the SD\'s ' +
        '"CONFIRMED NO CODE EDIT NEEDED" path adds NO registry constant, so NEITHER guard sees the new type and both stay ' +
        'green while the kill gate becomes unsatisfiable — the exact "green suite fully compatible with the defect" control ' +
        'the producer-parity header calls out. SEPARATE, UNRESOLVED: the RPC writes venture_usage_events; sibling -E writes ' +
        'usage EVENTS via that RPC. Neither writes a venture_artifacts ROW of the new artifact_type, which is what the gate ' +
        'actually checks. On the scope text as written, NO sibling in the decomposition is assigned the producer. PRD MUST name ' +
        'the producer (who writes the venture_artifacts row, on what trigger, reading what from venture_usage_events) and MUST ' +
        'sequence the required_artifacts append AFTER that producer is live — or land the append behind a flag/deferred ' +
        'migration so the gate is never enforced before it is satisfiable.',
    },
    {
      id: 'db-kill-gate-has-no-deviation-escape-hatch',
      severity: 'high',
      note:
        'AGGRAVATES the finding above and makes the operator dead-end HARD rather than soft. This SD\'s own metadata ' +
        'mechanism_verifications records that lib/eva/stage-artifact-precondition.js:85 "treats a deviation-ledger record as an ' +
        'intentional documented skip rather than a hard block". MEASURED against live prosrc: fn_advance_venture_stage contains ' +
        'ZERO occurrences of the string "deviation". So the documented-skip affordance exists ONLY on the JS mirror, not on the ' +
        'authoritative DB path. A venture blocked at launch_readiness_gate by an unproducible required artifact therefore has NO ' +
        'recovery path through the platform\'s own escape hatch — the DB function refuses regardless. The two choke points ' +
        'DISAGREE about whether a documented skip is permitted, which is itself a defect worth recording. PRD should state ' +
        'explicitly which path is authoritative for a documented skip, and confirm the operator has SOME recovery affordance ' +
        'before a kill gate gains a new blocking requirement.',
    },
    {
      id: 'artifact-type-string-is-never-named-in-scope',
      severity: 'high',
      note:
        'PRD COMPLETENESS GAP with a naming-convention consequence. The SD scope and success_criteria refer to "the new ' +
        'artifact_type" and "a usage-signal artifact" but NEVER state the literal string. lib/eva/artifact-types.js declares a ' +
        'binding convention in its header — "Naming convention: {phase_prefix}_{descriptive_name}", with PHASE_PREFIXES.LAUNCH ' +
        '= launch for stages 22-26 — and an explicit in-file precedent that the prefix follows the PHASE not the stage name ' +
        '("Phase prefix LAUNCH retained (Stages 22-26 share the LAUNCH phase per PHASE_PREFIXES; do NOT add a separate GROWTH ' +
        'prefix)"). Measured: the live CHECK constraint enumerates ~135 values and every stage-23-adjacent one is launch_* ' +
        '(launch_readiness_checklist, launch_analytics_dashboard, launch_metrics, launch_health_scoring). PRD MUST pin the ' +
        'literal string and it SHOULD be launch_* (e.g. launch_usage_signal). Corroborates the LEAD-phase VALIDATION finding ' +
        'artifact-type-check-has-no-usage-signal-value, and adds the registry rule that makes launch_* binding rather than ' +
        'merely tidy.',
    },
    {
      id: 'ssot-registry-obligation-unmentioned-in-scope',
      severity: 'medium',
      note:
        'lib/eva/artifact-types.js opens with a hard contract: "All EVA modules MUST import artifact type constants from this ' +
        'file. No hardcoded artifact type strings elsewhere in the codebase." The SD scope carefully enumerates its file-level ' +
        'touches (fn_advance_venture_stage, lib/eva/stage-artifact-precondition.js) and concludes "no code edit needed" — but ' +
        'never mentions this registry at all. Shipping the DB value WITHOUT the registry constant leaves a live, gate-enforced ' +
        'artifact_type with no symbol in the declared SSOT. MEASURED CONSEQUENCES, stated precisely because the obvious stronger ' +
        'claim is WRONG: isValidArtifactType() returns false (lib/eva/artifact-types.js:518) and ' +
        'lib/eva/artifact-persistence-service.js:101 then emits a console.warn ONLY — it does NOT throw and the write ' +
        'proceeds, so this is a silent-warning path, not a hard rejection. getStageForArtifactType() returns null, so ' +
        'lib/eva/artifact-mapping-resolver.js:23 resolves lifecycle_stage to null for the type. Net effect is SSOT drift ' +
        'plus a null stage mapping and a warning nobody reads, rather than an outright failure. PRD must decide deliberately: add ARTIFACT_TYPES.LAUNCH_* + the ' +
        'ARTIFACT_TYPE_BY_STAGE[23] mapping, or record why the value is intentionally registry-absent. Silence is the one ' +
        'option that should be off the table.',
    },
    {
      id: 'chairman-gated-timing-vs-parity-tests',
      severity: 'medium',
      note:
        'SEQUENCING MECHANIC the PRD should pre-plan, because the migration is staged under database/chairman-gated/ and ' +
        'therefore does NOT apply at merge. tests/unit/eva/artifact-type-db-parity.test.js asserts registry-subset-of-constraint ' +
        'by reading the COMMITTED database/schema-reference-snapshot.json, not the live DB. Consequence: if EXEC adds the ' +
        'ARTIFACT_TYPES constant in the same PR as the staged (unapplied) migration, that test FAILS at merge unless a reasoned ' +
        'entry is added to database/artifact-type-parity-pending-chairman-gate.json — whose "allow" object is currently EMPTY ' +
        '({}), so this SD would be the first user of that mechanism. A second test then fails LATER if that entry is not ' +
        'REMOVED once the migration applies and the snapshot is regenerated (npm run schema:snapshot:lint). PRD should write ' +
        'this three-step sequence (add pending entry -> chairman applies -> regenerate snapshot + remove entry) into the ' +
        'acceptance criteria so it is not rediscovered as a red CI run.',
    },
    {
      id: 'rpc-response-contract-mirrors-two-disagreeing-precedents',
      severity: 'high',
      note:
        'API-CONSUMER INTERFACE DESIGN — the specific concern raised for this review. The JSONB return IS the entire API for ' +
        'anon integrators. Scope says the new RPC mirrors "fn_submit_venture_feedback/fn_submit_venture_error exactly", but ' +
        'measured from database/chairman-gated/20260812_venture_ingest_key_binding.sql those two are NOT consistent with each ' +
        'other, so the instruction is unresolvable as written. fn_submit_venture_feedback (line 509) returns exactly ONE shape, ' +
        '{ok:true,id}, and RAISES on every failure — meaning ok is never false and is a degenerate discriminator that costs a ' +
        'key on every response and discriminates nothing. fn_submit_venture_error returns FIVE shapes (lines 569, 625, 627, 653, ' +
        '672): {ok:false,reason:"invalid_error_hash"} RETURNED not raised (so bad input is a 200-with-ok-false on one RPC and a ' +
        'raised 22004 on its sibling), {ok:true,action:"aggregated",id}, {ok:true,action:"aggregated_rate_limited",id}, ' +
        '{ok:true,action:"storm_suppressed"} with NO id key, and {ok:true,action:"created",id}. The precedent file\'s own ' +
        'COMMENT (line 681) already concedes the shape misleads: "ok alone does not mean occurrence_count was incremented; a ' +
        'caller that only checks ok will silently undercount a suppressed repeat." RECOMMEND the PRD pin the literal response ' +
        'JSON for EVERY branch of the new RPC and state two invariants explicitly: whether id is always present, and whether ' +
        'invalid input raises or returns. Given usage events have no dedup/aggregation axis (no error_hash analogue), the ' +
        'feedback shape {ok:true,id} + raise-on-failure is the simpler correct choice; if any suppression branch is ever added, ' +
        'carry action from day one rather than bolting it on and breaking callers.',
    },
    {
      id: 'sqlstate-28000-clarity-and-the-postgrest-http-surface',
      severity: 'medium',
      note:
        'ERROR-MESSAGE CLARITY on the auth-reject path — the second concern raised for this review. The uniform, ' +
        'non-enumerating message is CORRECT and must be preserved: the precedent raises \'fn_submit_venture_feedback: ' +
        'unauthorized\' USING ERRCODE=28000 for BOTH a wrong secret and a nonexistent/inactive venture precisely so the two are ' +
        'indistinguishable (anti-enumeration-oracle, TS-6). Do NOT add a reason code or a distinguishing suffix to help ' +
        'debugging — that would reopen the oracle. Two clarity points that cost nothing security-wise: (1) KEEP the function-name ' +
        'prefix (\'fn_submit_venture_usage_event: unauthorized\'), because when an integrator wires several of these RPCs it is ' +
        'the only token that says WHICH call rejected, and the caller already knows which function it invoked; (2) the SD ' +
        'specifies SQLSTATE, but the anon integrator is a PostgREST HTTP client and never sees a SQLSTATE directly — they see an ' +
        'HTTP status and a PostgREST error envelope. The mapping for 28000 (auth reject), 22004 (invalid input) and 53400 (rate ' +
        'limited) is unspecified in scope and undocumented anywhere in the precedent file. PRD SHOULD document the ' +
        'HTTP-status-per-SQLSTATE table as the integrator-facing contract; that is the actual API surface, and rate-limited vs ' +
        'unauthorized must be distinguishable client-side or integrators will retry-storm a 28000.',
    },
    {
      id: 'properties-jsonb-not-self-describing-for-integrators',
      severity: 'medium',
      note:
        'DEVELOPER UX on the payload — the third concern raised for this review. p_properties JSONB is a fully untyped bag ' +
        'attached to a deliberately un-enumerated free-text event_name (scope justifies the open event_name well: the ' +
        'apexniche-ai and AltifyAI vocabularies are disjoint except page_view). But that means a future venture integrator has ' +
        'NO closed enum to read the vocabulary off AND no schema for the payload — there is nothing self-describing anywhere in ' +
        'the contract. Four concrete gaps, three with a measured in-repo precedent to copy: (1) NO SIZE CAP — the sibling ' +
        'fn_submit_venture_error caps p_context at octet_length 8000 and substitutes jsonb_build_object(\'truncated\',true) ' +
        '(line 575-577); mirror that rather than inventing one, and mirror the sentinel so consumers can detect truncation. ' +
        '(2) NO VERSION KEY — reserve schema_version (or equivalent) now so the shape can evolve without breaking consumers; ' +
        'retrofitting one across live ventures is far more expensive. (3) NO WORKED EXAMPLE — PRD should carry at least one ' +
        'concrete properties payload per event_type (page_view and conversion_event) as the integrator-facing contract, since ' +
        'no enum documents it. (4) NO RESERVED KEY FOR USER IDENTIFIERS — this connects directly to the GDPR/Clerk erasure risk ' +
        'the SD itself flags as PRD-must-address: if a user id can appear anywhere inside an unstructured properties bag, an ' +
        'erasure request cannot target it. Either forbid user identifiers in properties outright, or mandate a single reserved ' +
        'key so erasure has a deterministic path. Note the repo already has a strong precedent for self-describing failure ' +
        'contracts (lib/eva/contracts/describe-artifact-gap.js, written after an artifact-naming incident ran 6+ days); the same ' +
        'discipline applied to this payload now is cheap.',
    },
    {
      id: 'conversion-event-label-forces-a-misleading-taxonomy',
      severity: 'medium',
      note:
        'INFORMATION-ARCHITECTURE / LABELING concern on the pairing CHECK. The constraint as specified is (event_name=' +
        '\'page_view\' AND event_type=\'page_view\') OR (event_name<>\'page_view\' AND event_type=\'conversion_event\'). The ' +
        'CHECK shape is correct and closes the real gap the SD identifies — no objection to the mechanism. The LABEL is the ' +
        'problem: because event_name is deliberately open, this forces EVERY non-page_view event, forever, across all ventures, ' +
        'to be typed \'conversion_event\'. A diagnostic or neutral event (feature_used, search_performed, error_shown) is ' +
        'structurally required to declare itself a conversion. The predictable downstream misread is severe and silent: any ' +
        'analytics consumer that counts event_type=\'conversion_event\' as conversions will over-report by however many neutral ' +
        'events the ventures emit, and the value name is exactly what invites that query. RECOMMEND either renaming the ' +
        'non-page_view value to a structurally honest neutral term (custom_event / named_event) — cheapest now, before any rows ' +
        'exist and before the CHECK is chairman-applied — or, if the name must be retained for parity with the venture-side ' +
        'originals, the PRD MUST state in the column COMMENT that conversion_event is a structural "non-page-view" bucket and ' +
        'NOT an assertion that a conversion occurred. Note this is a naming choice that becomes expensive the moment it is ' +
        'baked into a chairman-gated CHECK constraint and live rows.',
    },
    {
      id: 'hardcoded-stage-upper-bound-corroborates-stage-key-condition',
      severity: 'info',
      note:
        'Incidental, measured while inspecting the gate path; outside this SD\'s scope but cheap for PLAN to note. ' +
        'fn_advance_venture_stage prosrc contains a hardcoded bound: IF p_to_stage < 1 OR p_to_stage > 26 THEN RETURN ' +
        'jsonb_build_object(\'success\', false, \'error\', \'Invalid to_stage\'). SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B ' +
        '(pending_approval) renumbers stages 23-26 to 24-27, which would make stage 27 unreachable through this function until ' +
        'that bound is widened. This is -B\'s defect to fix, not this SD\'s, but it independently corroborates the existing ' +
        'LEAD-phase condition that this SD key its mutation on stage_key=\'launch_readiness_gate\' and never on stage_number=23.',
    },
  ],
  metadata: {
    review_type: 'BACKEND_INFRA_NO_UI_SURFACE',
    ui_surface_in_scope: false,
    ui_surface_confirmed_via: 'live strategic_directives_v2 scope/description read + repo-wide tsx/jsx grep (0 hits)',
    sd_row_id: '363c8fb9-67c6-4702-807b-fa227bf4637f',
    sd_status_at_review: 'in_progress',
    sd_phase_at_review: 'PLAN_PRD',
    standard_design_checks_applicable: false,
    standard_design_checks_skipped: [
      'component_sizing_300_600_loc',
      'wcag_2_1_aa_contrast',
      'aria_and_keyboard_navigation',
      'responsive_breakpoints',
      'loading_error_empty_states',
      'data_testid_e2e_selectors',
      'shadcn_component_consistency',
    ],
    existing_ui_renders_mutated_data: true,
    existing_ui_components_affected: [
      '../ehg/src/components/ventures/building-mode/GateEvidencePanel.tsx',
      '../ehg/src/components/ventures/building-mode/ArtifactsTab.tsx',
      '../ehg/src/components/artifacts/ArtifactPanel.tsx',
      '../ehg/src/hooks/useVentureArtifacts.ts',
      '../ehg/src/hooks/useStagePolicy.ts',
      '../ehg/src/lib/gvos/artifact-resolver.ts',
      '../ehg/src/lib/gvos/upstream-context.ts',
    ],
    stage23_live_required_artifacts: ['launch_readiness_checklist'],
    stage23_stage_key: 'launch_readiness_gate',
    artifact_type_check_constraint_value_count_approx: 135,
    artifact_type_check_constraint_def_length: 4049,
    parity_guards_scan_js_registry_only: true,
    parity_guards: [
      'tests/unit/eva/artifact-type-db-parity.test.js',
      'tests/unit/eva/artifact-type-producer-parity.test.js',
    ],
    pending_chairman_gate_allowlist_file: 'database/artifact-type-parity-pending-chairman-gate.json',
    pending_chairman_gate_allowlist_currently_empty: true,
    fn_advance_venture_stage_deviation_mentions: 0,
    deviation_escape_hatch_js_only: true,
    artifact_type_string_named_in_scope: false,
    recommended_artifact_type_prefix: 'launch_',
    registry_ssot_file: 'lib/eva/artifact-types.js',
    registry_naming_convention: '{phase_prefix}_{descriptive_name}; PHASE_PREFIXES.LAUNCH covers stages 22-26',
    rpc_precedent_response_shapes: {
      fn_submit_venture_feedback: ['{ok:true,id}'],
      fn_submit_venture_error: [
        '{ok:false,reason:"invalid_error_hash"}',
        '{ok:true,action:"aggregated",id}',
        '{ok:true,action:"aggregated_rate_limited",id}',
        '{ok:true,action:"storm_suppressed"}',
        '{ok:true,action:"created",id}',
      ],
    },
    rpc_precedents_disagree_with_each_other: true,
    precedent_context_octet_cap: 8000,
    precedent_truncation_sentinel: '{"truncated":true}',
    postgrest_http_status_mapping_documented: false,
    sqlstates_in_contract: ['28000', '22004', '53400'],
  },
  conditions: [
    'PRD MUST name the PRODUCER of the new artifact_type — who writes the venture_artifacts row, on what trigger, reading what from venture_usage_events — and MUST sequence the required_artifacts append so the launch_readiness_gate KILL gate is never enforced before it is satisfiable. On the scope text as written, no sibling in the decomposition is assigned this; the RPC and sibling -E both write usage EVENTS, not the venture_artifacts row the gate checks. tests/unit/eva/artifact-type-producer-parity.test.js exists for exactly this incident class and is structurally blind to a DB-only change.',
    'PRD MUST pin the literal artifact_type string (absent from scope today) and it SHOULD carry the launch_ prefix per the binding convention in lib/eva/artifact-types.js ({phase_prefix}_{descriptive_name}, PHASE_PREFIXES.LAUNCH = stages 22-26).',
    'PRD MUST decide deliberately whether the new type is added to the ARTIFACT_TYPES registry + ARTIFACT_TYPE_BY_STAGE[23]. Omitting it is not free, though it is not fatal either (measured: lib/eva/artifact-persistence-service.js:101 only console.warns for an unregistered type, it does not throw) - the cost is SSOT drift against the registry header contract, a null lifecycle_stage from getStageForArtifactType(), and invisibility to both CI parity guards.',
    'PRD MUST pin the RPC\'s literal JSONB response for EVERY branch, and state whether id is always present and whether invalid input raises or returns. "Mirror fn_submit_venture_feedback/fn_submit_venture_error exactly" is unresolvable as written because those two precedents disagree with each other on both points.',
    'PRD SHOULD document the PostgREST HTTP status for each SQLSTATE (28000 / 22004 / 53400). The anon integrator never sees a SQLSTATE; rate-limited must be client-distinguishable from unauthorized or integrators will retry-storm an auth reject.',
    'PRD SHOULD specify the properties JSONB contract: an octet_length cap with a {truncated:true} sentinel mirroring fn_submit_venture_error\'s 8000-byte precedent, a reserved schema_version key, at least one worked example payload per event_type, and an explicit rule on user identifiers so the GDPR/erasure risk the SD already flags has a deterministic target.',
    'PRD SHOULD address the conversion_event label: because event_name is open, the pairing CHECK forces every non-page_view event to be typed a conversion, and any consumer counting event_type=\'conversion_event\' will silently over-report. Either rename to a neutral value (custom_event) before the CHECK is chairman-applied and rows exist, or document in the column COMMENT that it is a structural non-page-view bucket, not a business assertion.',
    'PRD SHOULD pre-plan the chairman-gated parity sequence: add a reasoned entry to database/artifact-type-parity-pending-chairman-gate.json (currently empty) if the registry constant lands before the migration applies, then regenerate the snapshot (npm run schema:snapshot:lint) and REMOVE that entry after apply — a stale entry fails CI on its own dedicated test.',
    'PRD SHOULD note that "no UI in scope" does not mean "no UI impact": the required_artifacts append adds a visible row to the launch-readiness gate checklist rendered by the EHG frontend (GateEvidencePanel.tsx / ArtifactsTab.tsx). Confirm an unrecognised artifact_type humanizes rather than rendering raw or being silently dropped by the src/lib/gvos/upstream-context.ts allowlist.',
  ],
  justification:
    'CONDITIONAL_PASS, not PASS, and deliberately not a block. The question this review was asked to answer first — is there a UI/UX surface — is a clean NO on measured evidence (live SD scope read plus a repo-wide tsx/jsx grep returning zero hits), so every standard DESIGN check is correctly not applicable and there is no design-side objection to the SD proceeding to PRD. The verdict is conditioned rather than clean because looking at this SD through an interface lens surfaced one blocking-class problem that is not cosmetic and that the SD\'s own framing actively steers into: it arms a KILL gate with an artifact type nothing in the decomposition is described as producing, and does it DB-only, which is the one shape both existing CI parity guards cannot see because both iterate the JS registry. The repo already paid for this exact lesson — artifact-type-producer-parity.test.js was written after a declared-but-unproducible type blocked every venture at S21 while CI stayed green — and the DB gate has no deviation escape hatch (measured: zero "deviation" occurrences in fn_advance_venture_stage prosrc), so the resulting operator state is an unsatisfiable blocker with no in-product recovery, which is the worst blocking-state UX a gate can produce. The remaining conditions are ordinary interface-contract hygiene on the parts of this SD that ARE an interface even without pixels: the RPC cannot "mirror both precedents exactly" because the two precedents disagree with each other on whether bad input raises or returns and on whether id is always present; the integrator experiences HTTP statuses rather than the SQLSTATEs the scope specifies; and an untyped properties bag hung off a deliberately open event_name is not self-describing enough for the future venture integrators it exists to serve. All are cheap to fix at PRD time and expensive once a chairman-gated CHECK constraint and live venture integrations exist.',
  execution_time_ms: 1080000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'DESIGN',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('DESIGN', SD_ID, { name: 'Senior Design Sub-Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
