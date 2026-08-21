import { storeSubAgentResults } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const supabase = createSupabaseServiceClient();
const SD_KEY = 'SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001';
const SD_UUID = '7b8be04e-1f2b-431c-b33d-4574013a94e5';
const CODE = 'VALIDATION';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'LEAD-TO-PLAN approved with 3 mandatory PLAN corrections. Premise INDEPENDENTLY VERIFIED (both FR-5 bugs real; dead-UAT premise corroborated: uat_test_runs holds 1 row total). No duplicate SD across full in-flight population (41 non-terminal) or 2792 SDs since 2026-05-01. sd_type=infrastructure CORRECT. BUT FR-0/FR-2 rest on a wrong premise about which code exists: lib/eva/journey-walk-driver.js is a THIN MARKETLENS WRAPPER over the already-generic lib/apa/browser-executor.js (shipped by APA Child C), and it is local-serve-only so it CANNOT execute FR-0 against a deployed URL. Building "generalize the driver" would re-implement shipped APA infrastructure. Also found a 3rd phantom-column bug FR-5 does not name: lib/uat/result-recorder.js writes 11 columns absent from uat_test_runs, so the toolkit FR-2 wires in cannot record a run.',
  critical_issues: [],
  recommendations: [
    'FR-2 RETARGET (highest value): consume lib/apa/browser-executor.js runJourneyWalk(page, persona, STEPS, EXECUTORS, {baseUrl}) directly instead of "generalizing lib/eva/journey-walk-driver.js". Proof it is a wrapper: journey-walk-driver.js:25-28 imports genericExecuteJourneyStep/genericRunJourneyWalk from ../apa/browser-executor.js; :211-213 and :231-233 are pure pass-throughs; its own docstring :220-226 says "Delegates to lib/apa/browser-executor.js generic runJourneyWalk". The generic engine is ALREADY parameterized by (steps[], executors{}) - exactly the shape FR-1 metadata.journey_steps would supply. Corollary: FR-2 deliverable "remove the @wire-check-exempt marker" (journey-walk-driver.js:18-22) becomes MOOT - if FR-2 uses the generic engine, the MarketLens wrapper stays an unwired wrapper and its exemption remains valid.',
    'FR-0 INFEASIBLE AS WORDED - retarget before EXEC: "run the existing journey walker against https://altifyai.rickfelix2000.workers.dev/" cannot be done with journey-walk-driver.js, which is local-serve-only (MARKETLENS_SERVE_CONFIG port 3001 + startLocalMarketLensServer, :33-40). The deployed-URL path that already exists is lib/apa/live-instance-acquisition.mjs:55 acquireLiveInstance(url) (real Playwright, SSRF-guarded :26-40). FR-0 is therefore achievable with ZERO new library code: acquireLiveInstance(altifyUrl) + browser-executor runJourneyWalk with a hand-declared 5-step executor map. Recommend PLAN re-estimate FR-0 downward accordingly.',
    'NEW BUG for FR-5 (measured, not in the SD text): the UAT writer half is as dead as the reader half. lib/uat/result-recorder.js:70-84 startSession INSERTs executed_by, commit_sha, build_version, scenario_snapshot, total, passed, failed, skipped, defects_found, quick_fixes_created and :402-406 completeSession UPDATEs quality_gate - ALL 11 are absent from live uat_test_runs (probed individually; each returns "column does not exist"). So result-recorder.js throws on first call and CANNOT record a run. FR-2 states result-recorder "writes uat_test_runs" as settled fact; it does not. Either fold this into FR-5 (same phantom-column defect class as overall_result) or PLAN must add a column-reconciliation FR. Live columns are: total_tests, passed_tests, failed_tests, skipped_tests, pass_rate, status, run_id, suite_id, sd_id, prd_id, environment, browser, device_type, viewport_width/height, started_at, completed_at, duration_ms, triggered_by, trigger_source, machine_info, test_config, created_at, metadata.',
    'FR-3 COUNT ERROR: scope says "add a SECOND WAIT condition" - prerequisite-check.js ALREADY returns two WAIT verdicts (buildWaitResult at :235 incomplete children, and :263 un-authored planned children). The new one is the THIRD. Cosmetic, but worth fixing in an SD whose thesis is "measure, do not assume". FR-3 should reuse lib/handoff/wait-verdict.js buildWaitResult({score,max_score,wait_reason,issues,warnings,remediation,details}) - already imported at prerequisite-check.js:12, so zero new verdict plumbing.',
    'FR-1 SCHEMA CORRECTION: wireframe_screens is NOT a table and never was - see tombstone migration database/migrations/20260520_add_surface_columns_to_wireframe_screens.sql:7-12 ("public.wireframe_screens NEVER EXISTED... stored inside venture_artifacts JSONB"). Both wireframe_screens and blueprint_user_journey are artifact_type VALUES on venture_artifacts. Producer: lib/eva/stage-templates/stage-15.js:238; canonical screen normalizer: lib/eva/stage-templates/stage-15-screens.js:47-54 buildWireframeScreensPayload -> {screens:[{screen_id,screen_name,description,deviceType,page_type,surface}],screenCount,ia_sitemap}. A design SSOT already exists and already names UAT as a declared consumer: docs/design/user-journey-artifact-schema.md. FR-1 should conform to that schema rather than invent a journey_steps shape (confirmed: zero occurrences of journey_steps repo-wide today).',
    'DECLARE THE APA BOUNDARY before PLAN: SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001 (orchestrator, draft/PLAN_VERIFICATION) is the same problem statement one level up - "the verdict engine scores CLAIMS vs a rubric, never RUNS the app". Children A-D are COMPLETED (A sandbox harness, B assertion library, C browser executor, D persona coverage). Child E (draft/LEAD, feature) is "UI/UX Judgment + FINDINGS GATE ... findings-to-fix routing + behavioral_verdicts + gate" - adjacent to this SD FR-3 (a gate) and FR-4 (findings emission). NOT a duplicate: Child E judges UI/UX QUALITY (Fable-tier rubric), this SD gates journey REACHABILITY (did the deployed journey work at all). But PLAN must state that boundary explicitly, and should read docs/design/apa-automated-product-assessment-design.md (the APA SSOT) so FR-3/FR-4 do not build a second, competing findings-gate.',
    'FR-4 REUSE: lib/apa/standing-assessment-round.mjs ALREADY re-probes deployed ventures on a schedule - it lists live URLs from venture_deployments (status=routed, :69-97), runs the generic runJourneyWalk with GENERIC_JOURNEY_STEPS (:238-244), persists to apa_standing_assessments (:281-290), and is REGISTERED LIVE in lib/eva/eva-master-scheduler.js:483-488 as round apa_standing. PLAN should decide deliberately whether FR-4 is a new Stage-20 sub-step or an extension of this existing round. The declared emission path does exist as claimed: collectNonRepoFindings at lib/eva/quality-findings/db-sourced-findings.js:256, imported by stage-20-code-quality.js:37; FindingShape contract at lib/eva/quality-findings/finding-shape.js:65-75. Note stage-20 has NO dynamic sub-step registry - new checks are hand-added to the Promise.all array at stage-20-code-quality.js:740-752 plus CHECK_TYPES :224-227 and the IMPLEMENTED/DEFERRED category lists :237-244.',
    'FR-2 FREEBIE: lib/uat/selector-drift-recovery.js recoverFromDrift is ALREADY composed into lib/apa/browser-executor.js:28 via createResilientPage/withDriftRecovery (:67-111). If FR-2 consumes the generic engine, drift resilience comes for free - one of the five lib/uat modules FR-2 lists is already wired.'
  ],
  metadata: {
    validation_gate: 'GATE 1 - LEAD Pre-Approval',
    phase_validated: 'LEAD',
    independent_of_prior_findings: true,

    q1_duplicate_or_conflict: {
      answer: 'NO duplicate SD. Material ADJACENCY to the APA program requiring an explicit boundary statement.',
      method: 'Paginated FULL non-terminal population (41 SDs, no cap) + FULL population created >=2026-05-01 (2792 SDs, paginated), keyword-filtered IN MEMORY. First attempt used per-term .limit(60) which measured the cap not the population (results truncated at 2026-01 for an SD created 2026-08) and was discarded and redone.',
      in_flight_population: 41,
      recent_population_since_2026_05_01: 2792,
      exact_duplicate_found: false,
      adjacent_sds: [
        { sd: 'SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001', status: 'draft/PLAN_VERIFICATION', relation: 'Same problem statement one level up (runtime behavioral gate vs claims-only verdict engine). Children A-D COMPLETED = the runtime infra FR-2 proposes to build. Child E (draft/LEAD) owns "Findings Gate" = adjacent to FR-3/FR-4. NOT duplicate (Child E judges UI/UX quality; this SD gates journey reachability) but boundary MUST be declared.' },
        { sd: 'SD-LEO-INFRA-QUALITY-GATE-TYPE-001', status: 'active/EXEC', relation: 'Shares the "keying a gate by sd_type alone is wrong" theme; different gate (AI quality thresholds vs PLAN-TO-LEAD prerequisite-check). FR-3 independently reaches the same conclusion (key on metadata flag, not sd_type). No file conflict.' },
        { sd: 'SD-LEO-INFRA-ORCH-PARENT-LIFECYCLE-001', status: 'completed', relation: 'Authored the 2 existing WAIT conditions FR-3 extends. Extension, not duplication.' },
        { sd: 'SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001', status: 'completed', relation: 'Generalized the WAIT pattern to 3 more gates; produced lib/handoff/wait-verdict.js buildWaitResult that FR-3 should reuse.' },
        { sd: 'SD-UAT-* family (GEN/REC/DB/VALID/PLATFORM, Jan 2026)', status: 'completed', relation: 'BUILT the lib/uat toolkit FR-2 wires in. Confirms the leverage-existing framing; also the source of the phantom-column drift found below.' },
        { sd: 'SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 (+FR-B/FR-E)', status: 'completed', relation: 'Built the collectNonRepoFindings/FindingShape emission path FR-4 declares it will reuse. Reuse confirmed available.' }
      ]
    },

    q2_sd_type_correct: {
      answer: 'YES - infrastructure is correct.',
      rationale: 'All touched surfaces are harness/engine code with no customer-facing UI: scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js (gate), scripts/hooks/stop-subagent-enforcement/type-aware-validator.js (hook), lib/eva/*, lib/uat/*, lib/apa/*. target_application=EHG_Engineer. Not an orchestrator (no children, no parent_sd_id).',
      dogfooding_note: 'Transparency flag, NOT an objection: infrastructure is in EXEMPT_TYPES (lib/utils/sd-type-validation.js:334), so this SD - which repairs dead UAT enforcement - is itself UAT-exempt. This is self-consistent with its own declared OUT OF SCOPE ("a per-SD UAT gate on infrastructure SDs is type-exempt by design") and is defensible: it ships gate/hook code, not a clickable surface. FR-5 deliberately fixture-proves that infrastructure REMAINS exempt, so the exemption is an asserted invariant rather than an unexamined convenience.',
      decomposition_note: 'sd_type is correct, but 5 FRs spanning a falsifier run, a metadata emitter, a library rewire, a handoff gate, a stage sub-step and a hook bugfix will not fit the <=100 LOC PR target. PLAN should consider decomposition or a documented multi-PR sequence. This is a sizing observation, not a type objection.'
    },

    q3_reuse_opportunities: {
      answer: 'YES - substantial. Two of five FRs should shrink materially.',
      items: [
        'lib/apa/browser-executor.js - ALREADY-GENERIC runJourneyWalk/executeJourneyStep parameterized by (steps[], executors{}). Supersedes FR-2 "generalize journey-walk-driver.js" (that file is a pass-through wrapper: :25-28, :211-213, :231-233).',
        'lib/apa/live-instance-acquisition.mjs:55 acquireLiveInstance(url) - deployed-URL Playwright, SSRF-guarded. This is the FR-0 path; journey-walk-driver.js physically cannot reach a deployed URL.',
        'lib/apa/standing-assessment-round.mjs - already walks live deployed ventures on a registered scheduler round (eva-master-scheduler.js:483-488), persists to apa_standing_assessments. Candidate host for FR-4.',
        'lib/handoff/wait-verdict.js buildWaitResult - already imported at the exact file FR-3 edits (prerequisite-check.js:12, used :235 and :263). Zero new verdict plumbing.',
        'lib/eva/quality-findings/db-sourced-findings.js:256 collectNonRepoFindings + finding-shape.js:65-75 FindingShape - FR-4 emission path exists as claimed.',
        'lib/uat/selector-drift-recovery.js recoverFromDrift - ALREADY composed into browser-executor.js:28; free if FR-2 uses the generic engine.',
        'uat_test_runs.pass_rate + .status - the live replacements for the phantom overall_result in FR-5.',
        'venture_artifacts artifact_type=wireframe_screens / blueprint_user_journey + stage-15-screens.js:47-54 buildWireframeScreensPayload + docs/design/user-journey-artifact-schema.md - FR-1 source data and an existing schema SSOT that already names UAT as a consumer.'
      ]
    },

    q4_blocking_concerns: {
      answer: 'NONE BLOCKING for LEAD-TO-PLAN. 3 mandatory PLAN-phase corrections.',
      rationale: 'LEAD-TO-PLAN approves strategic intent. The intent, the measured premise and the chairman ruling are sound and independently re-verified here. The defects found are in HOW two FRs propose to build, which is exactly what PLAN exists to resolve - so they are carried as binding corrections rather than a rejection.',
      mandatory_plan_corrections: [
        'C1 - Retarget FR-2 onto lib/apa/browser-executor.js (do not re-generalize a wrapper over an already-generic engine).',
        'C2 - Retarget FR-0 onto acquireLiveInstance (journey-walk-driver.js cannot reach a deployed URL at all).',
        'C3 - Fold the 11 phantom columns in lib/uat/result-recorder.js into FR-5, or add a reconciliation FR - otherwise FR-2 wires in a recorder that throws.'
      ],
      non_blocking_corrections: [
        'FR-3 says "SECOND" WAIT condition; it is the THIRD (prerequisite-check.js:235, :263 already WAIT).',
        'FR-1 must read venture_artifacts, not a wireframe_screens table (never existed).',
        'Declare the APA Child E boundary so FR-3/FR-4 do not build a competing findings-gate.',
        'FR-2 deliverable "remove @wire-check-exempt" likely becomes moot under C1.'
      ]
    },

    premise_verification: {
      fr5_bug1_phantom_column: 'CONFIRMED. type-aware-validator.js:37 selects "id, status, overall_result"; :43 reads r.overall_result. Probed live: uat_test_runs.overall_result does not exist.',
      fr5_bug2_dead_comparison: 'CONFIRMED. type-aware-validator.js:28 calls getUATRequirement(sd.sd_type) with NO options; lib/utils/sd-type-validation.js:326+ returns an OBJECT ({status,uatRequired,uatExempt,reason,acceptsAutomatedEvidence}) unless options.returnLegacy is set. So :34 uatRequirement === "REQUIRED" is always false. The live-correct read is uatRequirement.status === "REQUIRED" or .uatRequired.',
      fr3_exempt_types_premise: 'CONFIRMED. lib/utils/sd-type-validation.js:334 EXEMPT_TYPES includes "orchestrator" (and "infrastructure"), so a type-keyed gate would exempt parent orchestrators and gate nothing. FR-3 keying on a metadata flag instead is correct.',
      dead_uat_enforcement: 'INDEPENDENTLY CORROBORATED. uat_test_runs contains exactly 1 row in total across the whole table.',
      journey_steps_greenfield: 'CONFIRMED. Zero occurrences of journey_steps repo-wide (only an unrelated uppercase JOURNEY_STEPS constant of MarketLens step names at lib/eva/persona-generator.js:24).'
    },

    evidence_method: 'Independent re-derivation. Did not rely on strategic_directives_v2.metadata.testing_agent_lead_findings or the prior Explore pass; every claim above was re-measured against the live DB (column probes, full-population SD sweeps) or cited to file:line read in this worktree.'
  },
  execution_time_ms: 0
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_UUID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: CODE,
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults(CODE, SD_UUID, { code: CODE }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('\nSTORED OK. id=', stored?.id || JSON.stringify(stored).slice(0, 300));
