/**
 * VALIDATION (Principal Systems Analyst) LEAD_TO_PLAN due-diligence evidence for
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B. Independent second opinion on the
 * SD's corrected scope/success_criteria/risks/key_changes/dependencies.
 */
import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Independently re-verified all three of the SD mechanism_verifications against source and the live DB: all three are CORRECT. '
    + 'The composed S23(chairman_decisions)+S24(checkStageGate armed:true) design is the right architecture and is not expressible as a single '
    + 'stage-number comparison, so the two-check composition is justified, not redundant. CONDITIONAL because four concrete gaps must be closed at PLAN: '
    + '(1) a SECOND fail-open path in checkStageGate (rule (c) is_demo -> OUT_OF_SCOPE/blocked:false/armed:false) that key_changes does not account for -- '
    + 'it only overrides rule (a); 3 live is_demo ventures sit at stages 16/7/7, all below 24. '
    + '(2) creative_assets.storage_path is NOT live (42703 undefined_column, a Postgres pass-through, not a PGRST cache code) even though '
    + 'database/migrations/20260826_creative_assets_storage_path.sql is merged and self-declares "not chairman-gated" -- so the corrected description '
    + '"Child A already persists a storage_path" is code-true but schema-false, and the dependency status "resolved" overstates reality. '
    + '(3) success_criterion 1 as worded is falsified by the SD own FR-10 census and cannot be satisfied by this deliverable. '
    + '(4) checkStageGate required actorType/actorId params are unspecified in key_changes, and actorId doubles as a one-shot chairman override_key -- '
    + 'a security-relevant omission on a per-view read path.',
  findings: [
    'POINT 1 CONFIRMED (independent): persistAssetPrivately (lib/creative/asset-storage.js:110) destructures ONLY { path: storedPath } from uploadPrivateAndSign, discarding the signedUrl that private-signed-upload.js:36 returns; creative-brief.js:127 selects back only id, capability, generator. Repo-wide grep: the sole non-comment createSignedUrl implementation call site is private-signed-upload.js:33 (upload-time). No consumer reads creative_assets.storage_path at all -- theater-guard.js reads only consumed_at. The SD is correctly characterized as the FIRST read/view surface, not a retrofit of an existing leak.',
    'POINT 2 CONFIRMED (independent): leo_feature_flags has 0 rows for STAGE_GATE_PREDICATE_ARMED -- and 0 rows for ANY flag_key matching %STAGE_GATE%, so there is not even a disabled row to flip. checkStageGate line 243 defaults armed to isEnabled(), which fails safe to false. Rule (a) verified verbatim at lines 239-241: if (!ventureId) return { inScope:false, blocked:false, verdict:OUT_OF_SCOPE, reason:"no_venture_id", armed:false } -- never blocks an absent ventureId. The SD armed:true explicit override is honored (line 243 checks typeof armed === "boolean" first).',
    'POINT 3 CONFIRMED (independent), with a schema correction that PASSES: chairman-product-review.js:18-19 confirms PRODUCT_REVIEW_STAGE=23 / PRODUCT_REVIEW_DECISION_TYPE=product_review; recordProductReviewVerdict:346-358 sets chairman_decisions.status=approved. checkStageGate compares only ventures.current_lifecycle_stage against an integer requiredStage -- it structurally CANNOT express "a recorded chairman verdict exists", so the two-check composition is necessary, not scope creep. I verified the column name the SD assumes: chairman_decisions.lifecycle_stage IS the live column (stage_number and stage both return 42703). The SD query shape is correct.',
    'POINT 6a / NEW BLOCKING GAP -- SECOND FAIL-OPEN PATH: key_changes says checkAssetViewAuthorized overrides "stage-gate-predicate.js rule (a) OUT_OF_SCOPE default" but rule (c) (stage-gate-predicate.js:272-274) is an equally fail-open path: a venture with is_demo=true returns {inScope:false, blocked:false, verdict:OUT_OF_SCOPE, armed:false} -- and it returns armed:false EVEN WHEN armed:true was passed explicitly, so shouldEnforceBlock() also returns false. Live DB: 3 ventures have is_demo=true at current_lifecycle_stage 16, 7 and 7 -- all below 24. As specified, any asset belonging to a demo venture would pass the S24 leg unconditionally. PLAN must decide explicitly whether is_demo is in scope for a confidentiality fence (it almost certainly is -- is_demo governs external-CONTACT scope, a different axis from asset confidentiality) and treat verdict===OUT_OF_SCOPE as BLOCKED, not just blocked===true.',
    'POINT 6b / NEW -- PREMISE PARTIALLY REFUTED, DEPENDENCY OVERSTATED: creative_assets is live but creative_assets.storage_path is ABSENT. Probe returned code 42703 (Postgres undefined_column pass-through), NOT PGRST204/PGRST205, so this is genuine absence and not a PostgREST schema-cache artifact. database/migrations/20260826_creative_assets_storage_path.sql exists, is merged, and its own header says "self-applicable, not chairman-gated" -- it simply was never applied. Consequence: creative-brief.js:117-126 would 42703 on insert today, and its error handler only special-cases 42P01 (undefined_table), so it throws raw rather than the typed CreativeAssetsTableNotLiveError. The EXPLORE pass corrected a stale premise by reading merged CODE and over-corrected: at the SCHEMA level the original premise ("creative_assets has no storage_path column") is still true. dependencies[0].status="resolved" should become "resolved_in_code_pending_migration_apply", with applying that migration named as an explicit precondition.',
    'POINT 6c / NEW -- UNSPECIFIED SECURITY-RELEVANT PARAMS: key_changes writes checkStageGate({requiredStage:24, armed:true, ...}). The elided "..." hides two REQUIRED params. actorType documented enum is sd|qf|campaign|channel_publish -- none covers an asset view, and the value lands in audit_log.entity_type. More seriously, actorId IS the override_key: with armed:true, a blocked evaluation calls hasActiveOverride(..., shouldConsume=true) which CONSUMES a one-shot chairman stage_gate_override scoped to (override_key, venture_id). Two consequences PLAN must resolve: (i) an actorId colliding with another call site actorId for the same venture lets an override minted for e.g. an email campaign silently unlock asset viewing AND burns it; (ii) one-shot override semantics are wrong-axis for a READ path -- the override is spent on the first view, so the second view of the same asset is blocked again.',
    'POINT 4 PARTIAL FAIL -- success_criterion 1 IS NOT SATISFIABLE AS WORDED: "No produced asset (URL, storage path, or provenance handle) is externally reachable before its venture clears S23+S24" is an unrestricted claim over ALL produced assets. The SD own FR-10 census concedes venture-logos remains a public bucket. This criterion will be literally false at completion. It must be scoped to the creative_assets / creative-assets-private surface. Criteria 2 and 3 ARE testable against a primitive-only deliverable (pure function-level assertions, no UI needed) -- good. Criterion 4 is a documentation criterion and is satisfiable.',
    'POINT 4 / TESTABILITY BLOCKER: the creative-assets-private bucket DOES NOT EXIST yet. Live bucket census returned 8 buckets (idea-voice-files, chairman-feedback-audio, venture-files, vision-briefs[public], venture-logos[public], chairman-roadmap, chairman-daily-review, chairman-docs) -- none is creative-assets-private; it is created lazily by uploadPrivateAndSign on first upload, and creative_assets has 0 rows. Therefore smoke_test_steps[3] (mintAssetViewUrl returning a real signed URL with a clamped TTL) CANNOT pass against the live DB today -- createSignedUrl would fail "Bucket not found". Smoke steps 1-3 (the deny paths) are runnable; step 4 needs a mocked storage client or a bucket-creation precondition. No consumer UI is required by any criterion, so the primitive-only shape is otherwise sound.',
    'POINT 5 PARTIALLY REFUTED -- THE FR-10 CENSUS CONFLATES TWO UNLIKE CASES AND UNDER-JUSTIFIES THE REAL ONE: I re-ran the census myself. Non-comment public-URL producers are THREE, not two: lib/eva/logo-image-generator.js:66 (bucket venture-logos, minStage=7), lib/eva/stage-handlers/s11.js:239-258 (createBucket(venture-logos,{public:true}) + getPublicUrl at lifecycle stage 11, with NO stage gate on the URL itself), and scripts/archive/one-time/generate-vision-visualization.js:186 (vision-briefs). vision-briefs is genuinely out of scope -- an ARCHIVED one-time script about the chairman vision, not venture media. venture-logos is NOT: it generates a media asset via a generative provider (Imagen 3) FOR A VENTURE, mints a permanent unexpiring public URL, and persists that URL durably into venture_artifacts.artifact_data.logoUrl at S11 -- 12+ stages before S23+S24. Under the SD OWN scope wording ("a generated media asset ... is never externally reachable before its owning venture clears S23 AND S24"), venture-logos is squarely in scope. Calling it "unrelated" and "intentionally earlier stage gating" is an assertion, not a measured justification: minStage=7 gates GENERATION, not reachability, and s11.js has no reachability gate at all. I found no cited chairman decision or design doc establishing that AI-generated venture logos are intentionally world-readable at S11.',
    'POINT 5 MITIGATING CONTEXT (why this is CONDITIONAL, not FAIL): remediating venture-logos is legitimately separate work -- the persisted public logoUrl in venture_artifacts has live consumers, so changing it is a breaking migration, not a fence tweak. Deferring is defensible; labelling it "unrelated / out of scope" is not. The correct fix is a re-label plus a filed follow-up work item, not an expansion of this SD.',
    'POINT 6d / NEW -- APPROVAL STICKINESS AND SOFT DELETES UNADDRESSED: chairman_decisions carries deleted_at (soft delete) and attempt_number. The SD specifies the S23 leg only as "an approved product_review row" with no deleted_at IS NULL filter and no latest-attempt ordering. chairman-product-review.js:334-338 documents that re-review is armed by "leaving no APPROVED product_review decision behind" -- but an EXISTS-any-approved-row query is sticky: once a venture is approved at S23, a later send-back creates a new pending/rejected row while the old approved row survives, leaving the fence permanently open. Live data shows 2 approved product_review rows (attempt_number=1, deleted_at=null, lifecycle_stage=23) for 2 ventures. PLAN should specify: filter deleted_at IS NULL, and require the LATEST non-pending attempt to be approved rather than any approved row existing.',
    'POINT 6e / MINOR -- CONDITIONAL-PASS VERDICTS ADMITTED SILENTLY: recordProductReviewVerdict:347-351 maps BOTH approve (decision=approve) and approve_with_notes (decision=conditional_pass) to status=approved. A status-only query therefore admits conditional_pass. That is probably the intended behavior, but it is an unstated policy decision the PRD should record explicitly rather than inherit by accident.',
    'INTERNAL CONSISTENCY CHECK PASSED: scope, description, key_changes and smoke_test_steps agree with each other on module name (asset-view-gate.js), function names (checkAssetViewAuthorized / mintAssetViewUrl), the armed:true rationale, and the reason codes. risks[] correctly captures the two risks it names (consumer bypass; fleet-wide unarmed flag) and risk 2 "out of scope to arm the flag fleet-wide" is a legitimate boundary consistent with the predicate own chairman-commissioned header. No duplicate implementation exists -- asset-view-gate.js is genuinely new; no prior module composes an S23-verdict check with an S24 stage check.',
  ],
  warnings: [
    'BLOCKING-CLASS: checkStageGate rule (c) is_demo returns blocked:false AND armed:false even when armed:true is passed explicitly. A design that keys off blocked or shouldEnforceBlock() alone fails open for all 3 live is_demo ventures (stages 16/7/7). Treat verdict===OUT_OF_SCOPE as a BLOCK in this fence.',
    'creative_assets.storage_path is not live (verified 42703, not a PGRST cache code). The merged, self-declared-self-applicable migration 20260826_creative_assets_storage_path.sql was never applied. Child A is code-complete but data-incomplete -- the classic merged-not-applied gap.',
    'The creative-assets-private bucket does not exist in live storage, so any end-to-end mint test is unrunnable until the first real upload creates it.',
    'success_criterion 1 is an unrestricted claim contradicted by the SD own census; it will read as false at completion unless re-scoped.',
    'Passing armed:true at this call site diverges from the fleet-wide shadow-mode contract documented in the predicate header ("every call site must treat armed:false as never actually block"). The SD justifies this and I agree with the justification, but it makes this the first and only enforcing call site -- worth an explicit note in the module header so a future fleet-wide arming rollout does not double-count it.',
  ],
  recommendations: [
    'PLAN: make checkAssetViewAuthorized fail closed on BOTH OUT_OF_SCOPE paths -- rule (a) no_venture_id AND rule (c) is_demo. Assert this with a dedicated unit test per path; do not rely on shouldEnforceBlock().',
    'PLAN: re-scope success_criterion 1 to name its surface explicitly, e.g. "No creative_assets-produced asset (storage_path, signed URL, or provenance handle) is resolvable to bytes via any sanctioned read path before its venture clears S23+S24", and move the unrestricted fleet-wide claim into the FR-10 census as an explicitly deferred item.',
    'PLAN: re-label the FR-10 census. Split it: vision-briefs = genuinely unrelated (archived one-time chairman-vision script). venture-logos = IN SCOPE BY DEFINITION, DEFERRED -- it publishes AI-generated venture media to a permanent public URL at S11 and persists it in venture_artifacts. File a follow-up work item for venture-logos rather than classifying it "unrelated"; that reclassification is what turns this from scope-dodging into an honest deferral.',
    'PLAN: change dependencies[0].status from "resolved" to reflect code-vs-schema reality, and add applying database/migrations/20260826_creative_assets_storage_path.sql as an explicit precondition (or confirm it is genuinely unneeded because the fence never reads the column).',
    'PLAN: specify actorType and actorId for the checkStageGate call in the PRD. Recommend a dedicated, namespaced actorId (e.g. asset_view:<creative_asset_id>) that cannot collide with campaign_id or channelType:contentId keys used by the two shipped call sites, and decide explicitly whether a chairman stage_gate_override should be consumable by a read path at all -- one-shot semantics arguably should NOT apply to views.',
    'PLAN: specify the S23 query precisely -- decision_type=product_review, lifecycle_stage=23, venture_id=?, deleted_at IS NULL, ordered by attempt_number DESC with the LATEST non-pending attempt required to be status=approved. Record explicitly whether decision=conditional_pass counts as approved.',
    'PLAN: add a risk covering audit_log write amplification -- checkStageGate writes one audit_log row per in-scope evaluation, and a per-view read gate is far higher frequency than the publish-time call sites this predicate was designed for.',
    'PLAN: mark smoke_test_steps[3] as requiring either a mocked storage client or an explicit bucket-creation precondition, since creative-assets-private does not exist yet.',
  ],
  validation_mode: 'prospective',
  metadata: {
    recorded_by: 'validation-agent (Task tool dispatch)',
    assessment_type: 'lead_phase_due_diligence',
    independent_of: 'sub_agent_execution_results id=574c8aa5-9a7c-4e24-87a1-b4485ef9405c (EXPLORE)',
    explore_points_confirmed: [1, 2, 3],
    explore_points_refined: [
      'storage_path column not live (EXPLORE over-corrected the stale premise by reading merged code)',
      'FR-10 census is 3 producers not 2, and venture-logos is in-scope-by-definition rather than unrelated',
    ],
    new_gaps_found: [
      'is_demo rule (c) fail-open',
      'actorType/actorId unspecified + override consumption on a read path',
      'S23 approval stickiness / deleted_at',
      'creative-assets-private bucket absent',
      'success_criterion 1 unsatisfiable as worded',
    ],
    evidence_probes: {
      stage_gate_flag_rows: 0,
      chairman_decisions_stage_column: 'lifecycle_stage (stage_number/stage both 42703)',
      creative_assets_storage_path: 'ABSENT (42703 undefined_column, not PGRST cache)',
      is_demo_ventures_below_s24: 3,
      live_buckets_public: ['vision-briefs', 'venture-logos'],
      creative_assets_private_bucket_exists: false,
    },
  },
};

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_KEY, null, results, { phase: 'LEAD_TO_PLAN' });
console.log('Stored VALIDATION evidence id:', stored.id);
