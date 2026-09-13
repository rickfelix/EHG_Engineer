import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults, getSupabaseClient } from '../lib/sub-agent-executor/index.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';

const SD = 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I';
const supabase = await getSupabaseClient();
const { data: subAgent } = await supabase.from('leo_sub_agents').select('*').eq('code', 'VALIDATION').maybeSingle();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,
  execution_time_ms: 0,
  summary: 'LEAD-phase validation of CAPA-001-I. Both mechanism pointers CONFIRMED (drifted line numbers). chairman_decisions 978b0c19 CONFIRMED verbatim. No duplicate-work risk on C2.1 provided it is scoped verify+run, not re-wire. Four scope defects must be resolved at PLAN before PRD: C2.3 fail-closed deadlock (4 of 7 capabilities have no ground-truth signal), C2.2 frame conflation (reader measures journey-reachability, D2 disposed built-ness; 2 of 5 unreachable screens undisposed), C2.4 premise defect (the cited shim does not do what C2.4 says it does), X4 unresolved venture repo pointer.',
  critical_issues: [
    'C2.3 FAIL-CLOSED DEADLOCK: verifyCapabilityWired (lib/eva/utils/validate-venture-default-capabilities.js:138) has a ground-truth signal for only 3 of the 7 EHG_VENTURE_DEFAULT_CAPABILITIES. cost-instrumentation, calm-decision-card, health-uptime-probe and operating-model-grounding all return {wired:false, reason:"capability_id X has no wired-verification signal"} (:152-154). Making all seven a REQUIRED stage-24 checklist input as written forces requiredFail=true so the verdict is HOLD permanently for every venture. PLAN must either design signals for the 4 uncovered capabilities (materially larger scope) or permit a tombstone/override with written reason, mirroring C2.2.',
    'C2.2 FRAME CONFLATION PLUS 2 UNDISPOSED SCREENS: computeCoverageSelfcheck (lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js:262-265) defines reached as referenced by some journey step screen_ref. It measures JOURNEY REACHABILITY, not BUILT-NESS. AltifyAI live artifact: screens_total=9, unreachable_screens=[screen-0,screen-1,screen-6,screen-7,screen-8] (FIVE). Mapping to wireframe_screens: screen-6=Integrations, screen-7=Account Settings, screen-8=Subscription and Billing (the three D2 disposed), but ALSO screen-0=Landing Page and screen-1=Signup/Registration, which are built (AltifyAI is live at altifyai.app and has a marketing_landing_hero artifact) and are journey ENTRY points, not unbuilt screens. The D2 dispositions cover 3 of 5. The C2.2 exit predicate (empty or tombstoned with a reason) cannot be met without a disposition class for the 2 entry-point screens, and applying a D2-style retired/via-Stripe reason to them would be false.'
  ],
  warnings: [
    { severity: 'HIGH', issue: 'C2.4 PREMISE DEFECT: the SD cites lib/eva/stage-execution-worker.js:1056 as the stage-keyed input shim the reconciliation table replaces. The shim is real and CONFIRMED at :1059-1064 (and a second, unnoted copy at :1587-1592): it remaps lifecycle stage numbers onto legacy stageNN param names (stage17: upstream.stage18Data, and so on) for evaluatePromotionGate. That is the promotion-gate upstream mapping, NOT a checklist-input path. A wireframes-to-surfaces-to-journeys-to-walked-steps reconciliation table does not replace it.', recommendation: 'PLAN must restate C2.4 as ADDING a persisted reconciliation artifact, and drop the replaces-the-shim framing or name the real surface it replaces.' },
    { severity: 'HIGH', issue: 'X4 UNRESOLVED REPO POINTER PLUS CROSS-REPO WRITE: ventures.repo_url IS NULL for AltifyAI (50763b6a-1fad-4e1e-b2fc-296a1d66ebf9), and resolve-venture-repo.js:48-55 treats repo_url as the SSOT. AltifyAI metadata has no lovable_artifact fallback either. Separately, no .github/workflows/stack-scan.yml template exists anywhere: DEFAULT_SCAFFOLD_MODULES (lib/eva/bridge/venture-scaffold-modules-writer.js:24) stamps a stack-scan MODULE (venture-stack-scan.js scanner plus a test template), not an Actions workflow. X4 also requires a write to a DIFFERENT GitHub repo, outside this worktree.', recommendation: 'PLAN must (a) name the authoritative AltifyAI repo identifier (synthetic_actor metadata appears to carry it, since synthetic-actor-guard.js already reads that repo with LEO_ALTIFYAI_UAT_READ_TOKEN), (b) decide whether to author a new stack-scan.yml workflow template or reuse deploy.yml, and (c) confirm credentials and authorization for a cross-repo commit.' },
    { severity: 'MEDIUM', issue: 'C2.1 IS NOT REACHABLE BY NORMAL PIPELINE MOTION. The wiring is already DONE and must not be redone: stage-23-dedicated-venture-uat.js:28 imports and :52 calls generateLegalDocsForVenture. SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 is status=completed. AltifyAI is ALREADY at current_lifecycle_stage=24, past the S23 producer step, and venture_legal_overrides has 0 rows for it. Its live S24 launch_readiness_checklist reads legal=fail Missing required legal documents: terms_of_service, privacy_policy, verdict=HOLD, 33 percent.', recommendation: 'Scope C2.1 as verify-and-RUN: invoke generateLegalDocsForVenture for AltifyAI (standalone CLI exists at legal-doc-producer.js:283) or re-run S23. Note ventures.metadata.gating_decision shows AltifyAI stage motion is chairman-gated (23 to 24 was parked, unparked 2026-09-13); a stage re-run may need a ceremony, whereas a direct producer invocation does not move the stage.' },
    { severity: 'MEDIUM', issue: 'NAMING TRAP for PLAN: the stage-24 checklist that C2.3 targets is implemented in a file named stage-23-launch-readiness.js. Per stage-key-registry.js:26-27, lifecycle 23=dedicated_venture_uat and 24=launch_readiness_gate; stage-24.js:20 imports analyzeStage23LaunchReadiness. Ordering is therefore CORRECT (producer at S23 precedes the REQUIRED legal check at S24) but the filename will mislead an implementer.', recommendation: 'PRD must reference lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js explicitly as the stage-24 analyzer.' },
    { severity: 'MEDIUM', issue: 'X2 SCOPE AMBIGUITY: GUIDED_TOUR_STOPS (lib/eva/chairman-product-review.js:49-56) CONFIRMED 6 stops with exactly 3 carrying artifactType null (signup, core_action, pricing_terms). buildGuidedTour (:117-120) emits {stop, note} TEXT ONLY, no screenshots. The 3 null stops are running-app surfaces with no counterpart in SURFACE_ARTIFACT_TYPES (:33-45).', recommendation: 'PLAN must decide whether the 3 null stops bind to existing visual_device_screenshots (AltifyAI has one at S22) or require new artifact types. X2 is otherwise feasible.' },
    { severity: 'LOW', issue: 'Field-name trap: wireframe_screens entries key on screen_id, NOT id. A reader written against .id silently yields undefined for every screen.', recommendation: 'Pin screen_id in the PRD and in any test fixture.' }
  ],
  recommendations: [
    'PROCEED to PLAN, but the PRD must resolve C2.3 and C2.2 before EXEC. Both have exit predicates that are unsatisfiable as currently written.',
    'C2.1 must be written as verify-and-run, never re-wire. The wiring exists and SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 is completed; re-wiring is the duplicate-work risk this gate exists to catch.',
    'Six FRs (C2.1 through C2.4, X2, X4) are independently gate-able in principle, but X4 is the weakest fit: it is a cross-repo write with an unresolved repo pointer and no existing workflow template. Consider splitting X4 or gating it behind the repo-pointer prerequisite.',
    'AltifyAI telemetry-analytics already reads not-wired (no usage events in 30 days), so even the 3 signal-backed capabilities would fail C2.3 for AltifyAI today. The PRD needs to state whether AltifyAI must PASS or merely be MEASURED.'
  ],
  metadata: {
    phase: 'LEAD',
    sd_key: SD,
    validation_type: 'LEAD_PRE_APPROVAL_gate1',
    mechanism_pointers: {
      'stage-23-launch-readiness.js:346': 'CONFIRMED but DRIFTED. REQUIRED_CATEGORIES includes legal at :51, legalDocsCheck at :256, case legal sets status=fail at :314-322, verdict HOLD at :392',
      'stage-execution-worker.js:1056': 'CONFIRMED within +/-5 lines. Stage-keyed legacy param remap at :1059-1064, SECOND UNNOTED COPY at :1587-1592; but it feeds evaluatePromotionGate, not a checklist input'
    },
    chairman_decision_978b0c19: 'CONFIRMED exists, id 978b0c19-2b25-4af4-862a-b9fb2d67f9e2, decision=approve, status=approved, ratification 0afc86e4-3aa5-4ad4-87f8-952a832cd48b; summary matches the D2 dispositions verbatim (Account Settings via auth provider profile component, Subscription and Billing via Stripe customer portal, Integrations retired with written reason)',
    duplicate_check: 'C2.1 wiring ALREADY EXISTS (stage-23-dedicated-venture-uat.js:28,52). SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001 status=completed. Duplicate risk is REAL if PLAN re-wires; NOT a duplicate if scoped verify+run.',
    altifyai_measured_state: {
      venture_id: '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9',
      current_lifecycle_stage: 24,
      launch_mode: 'simulated',
      repo_url: null,
      venture_legal_overrides_rows: 0,
      s24_verdict: 'HOLD',
      s24_readiness_pct: 33,
      s15_unreachable_screens: ['screen-0 Landing Page', 'screen-1 Signup/Registration', 'screen-6 Integrations', 'screen-7 Account Settings', 'screen-8 Subscription and Billing'],
      d2_disposed: 3,
      d2_undisposed: 2
    },
    backlog_items: 0,
    measured_at: new Date().toISOString(),
    measured_by: 'validation sub-agent (Opus 5), re-grepped against current worktree HEAD'
  }
};

const resolution = await resolveSubAgentRepo({ subAgentCode: 'VALIDATION', sdId: SD, targetApplication: 'EHG_Engineer', supabase });
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('VALIDATION', SD, subAgent, results, { phase: 'LEAD', sdKey: SD });
console.log('STORED id=', stored?.id, 'verdict=', stored?.verdict, 'phase=', stored?.phase);
