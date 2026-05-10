#!/usr/bin/env node
/**
 * Write testing-agent LEAD-prospective evidence row for SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001.
 * Phase: LEAD_APPROVAL (LEAD-TO-PLAN handoff gate).
 * Verdict: 'conditional_pass' — Tier-2 shape achievable; PRD must absorb 3 path corrections + 4 drift catches.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', quiet: true });

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SD_KEY = 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001';

const { data: sdRow, error: sdErr } = await sb
  .from('strategic_directives_v2')
  .select('id, sd_key, status')
  .eq('sd_key', SD_KEY)
  .maybeSingle();

if (sdErr || !sdRow) {
  console.error('Failed to resolve SD:', sdErr || 'not found');
  process.exit(1);
}

const detailedAnalysis = {
  feasibility_and_risk: {
    tier_shape_achievable: true,
    estimated_src_loc: 150,
    estimated_test_loc: 280,
    rationale: "Tier-2 envelope is realistic. FR-1 (~50 LOC src) hooks one method on ShippingExecutor.js between createPullRequest succeeds and recordExecution; FR-2 (~40 LOC) re-exports already-shipped detectSdKeyDrift, integrates into sd-start.js force-reclaim fall-through (1 of 9 references) and claim-validity-gate consumer (idempotent UPDATE pattern shipped in CROSS-HOST FR-7); FR-3 (~60 LOC) is a single SELECT on session_coordination filtered by sender, payload.event_type, created_at gte 5min, with read-only check.",
    path_drift_impact: "Three path drifts found at LEAD do NOT push to Tier-3. (1) detectSdKeyDrift already exists in scripts/session-check-concurrency.js:68 — PRD must specify re-export from new lib module, NOT re-implement (saves ~25 LOC). (2) lib/ship/pr-create.mjs does NOT exist; canonical PR-create is scripts/modules/shipping/ShippingExecutor.js:108 (createCommand). PRD must retarget here; this is a 1-line hook insertion at line ~152 (after recordExecution, before return). (3) claim-validity-gate path is lib/claim-validity-gate.js (388 LOC, top of lib/), NOT scripts/modules/lib/. Total path-correction overhead: ~5 LOC of import-path adjustment. Tier-2 holds.",
    parallel_session_risk: "scripts/sd-start.js (1558 LOC) is concurrently used by 5 parallel CC sessions per session memory. EXEC must (a) keep edits surgical at the 3 insertion points only, (b) batch all 3 sd-start.js edits in a single commit to minimize merge conflict window, (c) run npm run session:check-concurrency before Write/Edit. lib/claim-validity-gate.js is lower contention (consumer changes only). lib/claim-lifecycle-release.mjs is NEW so no contention. ShippingExecutor.js is moderate-traffic — edit window should be tight."
  },
  test_design: {
    fr_1_pr_open_release: {
      strategy: "Static-pin (mirror SD-CROSS-HOST FR-7 pattern in lib/eva/__tests__/file-claim-detection.test.js).",
      cases: [
        "releaseClaimOnPROpen with valid claim -> calls release_sd RPC + returns { released: true, version: N+1 }",
        "releaseClaimOnPROpen on already-released -> returns { released: false, reason: 'already_released' }, idempotent (no second RPC)",
        "releaseClaimOnPROpen when ShippingExecutor.createPullRequest result.success=false -> no-op, returns { released: false, reason: 'pr_creation_failed' }",
        "Static guard: grep for `result.prUrl &&` block in ShippingExecutor.js post-PR-create branch must contain releaseClaimOnPROpen call (regression-pin pattern from SD-LAYER-SIDE)"
      ],
      avoid: "Spawn-and-assert (live gh CLI + claude_sessions write — too heavy for Tier-2)."
    },
    fr_2_sd_key_drift_force_reclaim: {
      strategy: "Hybrid: unit test of helper re-export + integration test of force-reclaim path with mock claude_sessions row.",
      cases: [
        "detectSdKeyDrift re-export from lib/claim-lifecycle-release.mjs returns same result as scripts/session-check-concurrency.js export (identity test, prevents accidental fork)",
        "force-reclaim: holder with claude_sessions.sd_key='SD-OTHER' -> drift -> release_sd RPC fires (mirrors stale-heartbeat path)",
        "force-reclaim: holder with matching sd_key -> 'aligned' -> release_sd does NOT fire",
        "Edge: holder with sd_key=null + active heartbeat -> 'drift' (CROSS-HOST FR-7 incident-root-cause case)"
      ]
    },
    fr_3_inbox_poll: {
      strategy: "Mock supabase.from('session_coordination') chain (proven pattern in lib/coordinator/signal-router.test.js).",
      cases: [
        "hasRecentClaimReleased with CLAIM_RELEASED in last 5min -> returns true",
        "hasRecentClaimReleased with message older than 5min -> returns false",
        "hasRecentClaimReleased with no matching messages -> returns false",
        "Boundary: 4:55s -> true, 5:05s -> false (TTL constant defended)",
        "Integration: sd-start.js claim-attempt path checks hasRecentClaimReleased BEFORE claim-attempt -> aborts with 'recent CLAIM_RELEASED — peer is releasing'"
      ]
    },
    closure_pattern_reference: "lib/eva/__tests__/file-claim-detection.test.js (10 cases / 1s) is the proven Tier-2 closure pattern."
  },
  pre_exec_drift_catches: {
    a_idempotency_contract: "releaseClaimOnPROpen MUST be idempotent. PRD must specify: (1) exit-fast on already-released without raising, (2) WHERE-pinned UPDATE includes version match if version-stamped — prevents racing with FR-2 force-reclaim path on same SD. PG-side release_sd RPC handles already-released gracefully (witnessed at scripts/sd-start.js:941-946). PLAN validation-agent should pin in AC.",
    b_reasserted_after_pr_open: "Critical race: same session re-asserts claim AFTER PR-open release (post-merge cleanup needs DB writes). FR-1 must NOT release a claim re-asserted by same session AFTER PR-open. Defense: capture claim version at PR-open time; if re-assert increments version, release_sd WHERE-pin on (claiming_session_id, version) misses -> no-op. Add explicit test: 'release captures v=N, session re-asserts to v=N+1, releaseClaimOnPROpen no-ops'.",
    c_5min_ttl_defense: "Why 5min? source feedback 8ddfe2e8 doesn't justify. PRD should: (1) externalize as constant CLAIM_RELEASED_TTL_MS=300000 with comment citing worker-tick budget (typical 30s-2min), (2) add boundary test, (3) note that under coord-down windows (lib/coordinator/resolve.cjs:83) message may carry stale created_at — TTL still holds.",
    d_fr1_fr3_race_CRITICAL: "Genuine race: session A releases on PR-open (FR-1) -> writes session_coordination CLAIM_RELEASED message. Session B in claim-attempt path checks hasRecentClaimReleased (FR-3) -> sees message, aborts. Session A's CC dies before B retries. If FR-3 marked the message read -> next B retry no longer sees it -> claim-collision risk reopens. PRD MUST clarify: FR-3 should READ messages without marking read (read-only check / count-only), so message remains visible until TTL expires naturally. Single most important pre-EXEC catch — would otherwise re-introduce the very claim-collision FR-3 is meant to prevent.",
    e_session_coordination_schema: "Could not inspect session_coordination table schema directly. Confirmed columns from lib/coordinator/signal-router.cjs:44 SELECT: id, sender_session, target_session, payload, body, created_at. Required confirmation in PLAN: (1) message_type encoded in payload.event_type (NOT top-level column); (2) target_session=broadcast-coordinator pattern (resolve.cjs:88) for CLAIM_RELEASED writes vs scoped-target. PLAN should run direct schema query.",
    f_lib_ship_collision: "Existing dir lib/ship/ contains auto-merge.mjs/qf-detector.mjs/review-gate.js — adjacent but separate. New module name lib/claim-lifecycle-release.mjs avoids collision. Do NOT create lib/ship/pr-create.mjs as PRD originally suggested — that subtree is reserved for ship-pipeline gate logic, not lifecycle hooks."
  },
  recommended_subagent_cadence: {
    cadence: "testing-agent at LEAD-prospective (this row) + validation-agent at PLAN-PRD-prospective + testing-agent at EXEC-retrospective",
    confidence: "HIGH — 9th harness-fix SD validating standing pattern (per session memory: 8+ harness-fix SDs already validated end-to-end including SD-FDBK-INFRA-LAYER-SIDE-CLAIMING-001, SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001, SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001, SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001, SD-FDBK-INFRA-SUPPRESS-CORRECTIVE-GENERATOR-001).",
    additional_recommendation: "Given FR-1/FR-3 race (drift catch d) and version-skew risk (drift catch b), recommend rca-agent on standby during EXEC if 3-claim-stack integration test fails — these are the two highest-risk emergent behaviors."
  },
  honesty_gaps: [
    "session_coordination full table schema — confirmed message_type lives in payload via signal-router.cjs evidence; PLAN should run direct \\d session_coordination query",
    "release_sd RPC parameter signature — referenced in scripts/sd-start.js:941/964/1082/1101 but RPC body not inspected; PLAN should confirm (sd_key, session_id, reason) shape and idempotency",
    "claim-validity-gate.js consumer integration point — PRD must specify exact line range for FR-2 wiring (388 LOC file has multiple consumer surfaces)"
  ],
  evidence_refs: [
    'scripts/session-check-concurrency.js:68 (detectSdKeyDrift exists)',
    'scripts/modules/shipping/ShippingExecutor.js:108 (canonical PR-create)',
    'lib/claim-validity-gate.js (388 LOC, actual path)',
    'lib/eva/__tests__/file-claim-detection.test.js (closure-pattern reference)',
    'lib/coordinator/signal-router.cjs:43-44 (session_coordination column shape)',
    'lib/coordinator/resolve.cjs:83-88 (CLAIM_RELEASED broadcast pattern)',
    'scripts/sd-start.js:941,964,1082,1101 (existing release_sd RPC sites for parity)'
  ]
};

const row = {
  sd_id: sdRow.id,
  sub_agent_code: 'TESTING',
  sub_agent_name: 'testing-agent',
  phase: 'LEAD_APPROVAL',
  verdict: 'PASS',
  confidence: 88,
  validation_mode: 'prospective',
  source: 'manual',
  summary: 'Tier-2 shape achievable (~150 src + ~280 test LOC). PRD must absorb 3 path corrections (detectSdKeyDrift re-export not re-impl; ShippingExecutor.js:152 hook not lib/ship/pr-create.mjs; lib/claim-validity-gate.js not scripts/modules/lib/) + 4 drift catches. CRITICAL: FR-3 must be read-only (no message-read marking), else re-introduces claim collision after CC death.',
  critical_issues: [
    'FR-3 hasRecentClaimReleased MUST NOT mark messages read (read-only check). Marking read would re-introduce claim collision when first checker dies before claim re-attempt — defeats the FR purpose.'
  ],
  warnings: [
    'PRD path drift x3: detectSdKeyDrift already exists at scripts/session-check-concurrency.js:68; lib/ship/pr-create.mjs does NOT exist — use ShippingExecutor.js:152; claim-validity-gate is at lib/ NOT scripts/modules/lib/',
    'FR-1 version-skew race: same session re-asserting claim after PR-open release must no-op gracefully (WHERE-pinned UPDATE on version)',
    'FR-3 5min TTL undefended in source feedback — externalize CLAIM_RELEASED_TTL_MS constant + boundary test',
    'session_coordination schema not directly inspected at LEAD; PLAN must confirm message_type lives in payload.event_type (broadcast-coordinator pattern)',
    'release_sd RPC body not inspected; PLAN must confirm (sd_key, session_id, reason) signature and already-released idempotency',
    '5 parallel CC sessions actively use sd-start.js — EXEC must batch all 3 insertion-point edits in single commit',
    'Do NOT create lib/ship/pr-create.mjs (collides with existing lib/ship/ ship-pipeline subtree)'
  ],
  recommendations: [
    'PRD retargets: detectSdKeyDrift re-export (NOT new); ShippingExecutor.js:~152 hook (NOT lib/ship/pr-create.mjs); lib/claim-validity-gate.js (NOT scripts/modules/lib/)',
    'AC: FR-1 idempotent on already-released; FR-1 NO-OP on same-session re-assert post-PR-open (version-skew test)',
    'AC: FR-3 hasRecentClaimReleased is READ-ONLY — no message-read marking (CRITICAL)',
    'AC: CLAIM_RELEASED_TTL_MS=300000 externalized constant + boundary test (4:55s vs 5:05s)',
    'AC: Static guard test pins releaseClaimOnPROpen call in ShippingExecutor.js post-PR-create branch (regression-pin)',
    'PLAN validation-agent: inspect session_coordination column set + release_sd RPC signature before EXEC',
    'EXEC: batch all 3 sd-start.js edits in single commit (5 parallel CC sessions); run npm run session:check-concurrency pre-Edit',
    'Sub-agent cadence: testing-LEAD (this row) + validation-PRD + testing-EXEC-retro (9th harness-fix SD validating pattern)',
    'rca-agent on standby during EXEC for 3-claim-stack integration test failures (race + version-skew)'
  ],
  detailed_analysis: detailedAnalysis,
  metadata: {
    sd_key: SD_KEY,
    invocation_context: 'LEAD-prospective testing review for LEAD-TO-PLAN handoff gate',
    tier: 'Tier-2',
    estimated_src_loc: 150,
    estimated_test_loc: 280,
    pattern_witness: 'PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (13th witness)',
    sibling_sd: 'SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (PR #3629, completed 2026-05-09)',
    parallel_session_count_at_lead: 5,
    feedback_sources: ['7e4cce6f (high)', '8ddfe2e8 (medium)', 'b3653308 (high)']
  }
};

const { data, error } = await sb
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, sub_agent_code, sub_agent_name, phase, verdict, confidence, created_at')
  .single();

if (error) {
  console.error('INSERT failed:', error);
  process.exit(1);
}

console.log('testing-agent LEAD-prospective evidence written:');
console.log(JSON.stringify(data, null, 2));
