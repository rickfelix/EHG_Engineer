import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary: [
    'PLAN_TO_EXEC prospective review of TS-1..TS-10 against FR-1..FR-6/FR-10 and the four primitives being composed.',
    'The plan is unusually strong on the two edges it was designed for: TS-5 genuinely catches the is_demo OUT_OF_SCOPE bypass',
    '(verified: stage-gate-predicate.js:272-274 returns armed:false on the is_demo branch, so shouldEnforceBlock() yields false',
    'while verdict!==PASS yields blocked -- the two implementations provably diverge, so TS-5 is a real regression trap, not a tautology).',
    'TS-3 is realistic (attempt_number ordering is deterministic: 0/728 live NULL rows, and uq_chairman_decision_attempt was widened',
    'to include decision_type, so no ties within a venture+stage23+product_review group). The mocked-client strategy is achievable:',
    'zero module-scope createClient in the entire S23 import graph; checkStageGate takes an injected supabase and an explicit armed override.',
    'CONDITIONAL on three gaps: (1) no TS covers a MATCHING chairman override -- the stated hard fence is bypassable and the one-shot',
    'is burned on a read path; (2) FR-6 live-schema-gap census names only creative_assets.storage_path and misses',
    'chairman_decisions.override_key, which is ALSO absent live, making all of FR-4/TS-9 inert against the real DB;',
    '(3) TS-8 tests only the TTL upper bound, reproducing the exact fail-open defect class the composed predicate documents in its own rule (b).',
  ].join(' '),
  findings: [
    'Q1 TS-5 (is_demo) -- CORRECTLY DESIGNED, confirmed by source. stage-gate-predicate.js:272-274 returns {inScope:false, blocked:false, verdict:OUT_OF_SCOPE, reason:"is_demo", armed:false} -- armed is hardcoded false on this branch even when the caller passed armed:true. A naive shouldEnforceBlock(result) implementation therefore returns false (allow), while FR-3 verdict===VERDICT.PASS check returns false (deny). The two diverge, so TS-5 is a genuine regression trap. RECOMMEND the test assert the mechanism, not just the outcome: also assert result.armed===false on the returned predicate object, so the test fails loudly if a future predicate change makes the branch return armed:true and silently re-converges the two implementations.',
    'Q2 TS-3 (approval stickiness) -- REALISTIC, with one latent ordering caveat. requestProductReview (chairman-product-review.js:306) computes attemptNumber = prior ? (prior.attempt_number||1)+1 : null, and createOrReusePendingDecision:549 OMITS the column when null, falling through to a DB default of 1. Live probe: 728 chairman_decisions rows, 0 with NULL attempt_number, so ORDER BY attempt_number DESC (Postgres NULLS FIRST) has no live NULL row to mis-rank. Ties are prevented within the group because migration 20260704 widened uq_chairman_decision_attempt to (venture_id, lifecycle_stage, decision_type, attempt_number). CAVEAT: attempt_number is nullable-with-default, and NULLs are distinct in a unique index -- any future writer passing an explicit null would create multiple NULL rows that sort FIRST under DESC and resurrect the exact stickiness bug FR-2 exists to close. RECOMMEND the gate query add a deterministic secondary sort .order("created_at",{ascending:false}) and a TS pinning the NULL/tie case.',
    'Q3 TS-9 (override_key namespacing) -- COLLISION-SAFE, confirmed by sweep. Only two live checkStageGate call sites: email-campaigns.js:170 actorId=enrollment.campaign_id (bare UUID) and autonomy-gate.js:306 actorId=channelType:contentId composite. Zero occurrences of a "media-asset-view" prefix anywhere in lib/scripts/database. A bare UUID can never equal a "media-asset-view:"-prefixed string, so the prefix is safe against the realistic vector. The unrelated lib/governance/chairman-override-record.js override_key lives in feedback.metadata (different table, different shape) -- no collision. NOTE TS-9 tests the WEAKEST vector (an override keyed to a bare ventureId); the stronger residual is the channelType composite, since channelType is data-derived -- a channel literally named media-asset-view with contentId===ventureId would collide. Remote, worth one assertion, not a blocker.',
    'Q4 MISSING TEST -- HIGHEST SEVERITY: no scenario covers a MATCHING chairman override. FR-3 authorizes on verdict===VERDICT.PASS, but stage-gate-predicate.js:289-292 returns verdict=PASS with reason="chairman_override" when hasActiveOverride matches -- so a valid override makes an under-S24 venture media externally viewable, defeating the SD stated hard fence. Worse, because FR-3 hardcodes armed:true, hasActiveOverride is called with shouldConsume=true, issuing an atomic-claim UPDATE that BURNS the one-shot on a READ path: view #1 succeeds, view #2 is blocked again. The VALIDATION sub-agent flagged exactly this at LEAD (point 6c(ii), "one-shot override semantics are wrong-axis for a READ path" -- see scripts/one-off/store-validation-evidence-media-production-capability-001-b.mjs:35) and PLAN resolved only 6c(i) (collision, via FR-4). 6c(ii) is unaddressed by any FR or TS. REQUIRE before EXEC: an explicit PLAN decision -- either the gate ignores reason==="chairman_override" (treat as not-allowed, true hard fence), or it accepts it and a TS pins both the allow AND the second-view-blocked consumption behavior.',
    'Q4 MISSING TEST -- TS-8 covers only the TTL UPPER bound. FR-5 specifies cappedTtl = Math.min(ttlSeconds ?? DEFAULT, MAX_VIEW_URL_TTL_SECONDS). The ?? guard catches only null/undefined; 0, negative, NaN, and numeric strings all pass through -- Math.min(-1, MAX) = -1 and Math.min(NaN, MAX) = NaN reach createSignedUrl. This is the SAME fail-open defect class that stage-gate-predicate.js:246-253 documents at length in its own rule (b) (SECURITY findings M4/M7: non-integers silently evaluate to a permissive result). The SD is composing a module that documents this exact trap and is reproducing it. RECOMMEND a TS asserting Number.isInteger + lower-bound rejection for ttlSeconds in {0, -1, NaN, "3600", undefined}.',
    'Q4 MISSING TEST -- no scenario for predicate rule (d) unresolvable_stage (venture row absent, or current_lifecycle_stage null). This is a fail-closed path where both candidate implementations agree, so it is lower risk than TS-5, but FR-3 maps every non-PASS verdict to the single reason "lifecycle_stage_gate_blocked", which erases the distinction between "venture is legitimately at S10" and "venture could not be resolved at all" in the caller-visible reason. RECOMMEND one TS plus a distinct reason for the unresolvable case (observability, not enforcement).',
    'Q4 MISSING TEST -- no scenario for "latest S23 attempt is status=pending while an earlier attempt was approved" (a re-review in flight). FR-2 wording ("requires status=approved on that latest attempt") is fail-closed and correct, but a naive implementer writing .eq("status","approved").limit(1) satisfies TS-2, TS-3 and TS-6 while silently reintroducing stickiness for the pending case. Cheap TS, closes a real implementation shortcut.',
    'Q5 MOCKED-CLIENT STRATEGY -- ACHIEVABLE, verified. checkStageGate({supabase,...}) takes an injected client (documented "injected client (never module-scope)", stage-gate-predicate.js:233) and armed is an explicit boolean param that short-circuits isEnabled entirely (line 243), so TS-10 does not even strictly need to mock the flag module. chairman-product-review.js exposes supabase as the first positional param on every exported function. Critically, a grep for module-scope createClient across the full S23 import graph (chairman-product-review, chairman-decision-watcher, record-pending-decision.mjs, post-build-convergence-gate, stage-governance, sd-id-resolver) returns ZERO hits -- so importing PRODUCT_REVIEW_STAGE/PRODUCT_REVIEW_DECISION_TYPE pulls no live client and no env-at-import-time throw. The FR-6 strategy stands.',
    'LIVE SCHEMA GAP FR-6 MISSED: chairman_decisions.override_key DOES NOT EXIST live (probed: "column chairman_decisions.override_key does not exist"; migration database/migrations/20260825_stage_gate_predicate_additive_columns.sql is unapplied). FR-6 documents only creative_assets.storage_path (independently confirmed 42703). Consequence: hasActiveOverride lookup 42703s live, hits its error branch, and returns false -- fail-closed, so the fence still blocks (safe direction), but the ENTIRE FR-4/TS-9 override mechanism is inert against the real DB while TS-9 shows green against a mock. This is the classic green-suite-hides-an-unloadable-path pattern. REQUIRE: widen FR-6 census to name this second unapplied migration, and add a TS simulating a 42703 on the override lookup asserting the gate still returns allowed:false.',
  ],
  warnings: [
    'TS-1..TS-10 are all type:"unit" with a mocked supabase. Zero integration coverage is planned, which is defensible given both blocking schema gaps -- but it means NO test in this SD ever executes the real PostgREST query shapes (.order on attempt_number, the override atomic-claim UPDATE, storage.createSignedUrl). Recommend recording an explicit deferred-integration item so this is a tracked debt, not an invisible one.',
    'FR-3 requires actorType:"creative_asset_view", but stage-gate-predicate.js:230 documents the actorType enum as sd|qf|campaign|channel_publish and the value lands in audit_log.entity_type. VALIDATION raised this (point 6c) and no FR or TS resolves it. Confirm audit_log.entity_type has no CHECK constraint rejecting the new value before EXEC, or the FR-7 audit write fails (non-blocking by design, so it would fail SILENTLY).',
    'Zero decision_type=product_review rows exist live (0 found), so TS-2/TS-3/TS-6 have no real-data referent at all. Fixture shapes must be derived from the migration + writer code, not from an observed row.',
  ],
  recommendations: [
    'BEFORE EXEC (blocking): PLAN must rule on whether a chairman stage_gate_override may authorize an asset view. If yes, add a TS for the consume-on-read behavior; if no, FR-3 must additionally reject reason==="chairman_override". This is unresolved VALIDATION point 6c(ii).',
    'BEFORE EXEC: widen FR-6 to name chairman_decisions.override_key (migration 20260825) as a second unapplied-schema dependency alongside creative_assets.storage_path.',
    'Add 4 test scenarios: TS-11 matching-override behavior; TS-12 ttlSeconds lower-bound/NaN rejection; TS-13 unresolvable_stage (rule d); TS-14 latest-attempt-is-pending.',
    'Add a deterministic secondary sort (created_at DESC) to the FR-2 chairman_decisions query and pin it with a NULL/tie-case test.',
    'Per the VITEST-is-not-NODE pattern: add a plain node --input-type=module import() loadability check for lib/creative/asset-view-gate.js to the EXEC checklist, so a green vitest suite cannot mask an import the runtime cannot resolve.',
  ],
  validation_mode: 'prospective',
  metadata: {
    recorded_by: 'testing-agent (Task tool dispatch)',
    assessment_type: 'plan_to_exec_test_plan_review',
    prd_id: 'PRD-SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-B',
    scenarios_reviewed: 10,
    functional_requirements_reviewed: 7,
    scenarios_recommended_added: 4,
    blocking_items: 2,
    sources_verified: [
      'lib/governance/stage-gate-predicate.js',
      'lib/eva/chairman-product-review.js',
      'lib/eva/chairman-decision-watcher.js',
      'lib/creative/asset-storage.js',
      'lib/storage/private-signed-upload.js',
      'lib/marketing/ai/email-campaigns.js',
      'lib/marketing/autonomy-gate.js',
      'database/migrations/20260704_chairman_decisions_decision_type_uniqueness.sql',
      'database/migrations/20260825_stage_gate_predicate_additive_columns.sql',
      'live probe: chairman_decisions (728 rows, 0 null attempt_number, override_key ABSENT)',
      'live probe: creative_assets.storage_path ABSENT (42703)',
    ],
  },
};

const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('TESTING', SD_KEY, null, results, { phase: 'PLAN_TO_EXEC' });
console.log('Stored TESTING evidence id:', stored.id);
console.log('verdict:', results.verdict, '| repo_path:', results.metadata.repo_path);
