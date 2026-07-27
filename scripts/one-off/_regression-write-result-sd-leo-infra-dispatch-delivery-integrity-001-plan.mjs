#!/usr/bin/env node
/**
 * Write REGRESSION sub-agent PLAN-phase verdict for
 * SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001.
 *
 * FINAL PASS — supersedes the partial/crash-insurance row (ee308d53-e55e-4599-b9a2-841a077345c1)
 * written before this investigation began, per the regression-agent's crash-resilience protocol
 * (SD-FDBK-ENH-REGRESSION-SUB-AGENT-001).
 *
 * Uses the canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js
 * applySubAgentRepoVerdict) + canonical storage (lib/sub-agent-executor/
 * results-storage.js storeSubAgentResults) per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'b165653a-5857-4678-beb6-193ade75478f';
const SD_KEY = 'SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001';

const findings = [
  {
    id: 'R1-release-sd-rpc-caller-enumeration-no-force-release-dependency',
    severity: 'INFO',
    summary: 'Independently enumerated every `rpc(\'release_sd\'` call site in the repo (not inherited from the SECURITY sub-agent\'s count): 16 direct production call sites — lib/claim-guard.mjs (:503, :609), lib/commands/claim-command.js:182, lib/fleet/best-effort-release.mjs:71 (the FR-1 wrapper itself), lib/session-manager.mjs:864, scripts/hooks/reclaim-sd-after-compaction.cjs (:153, :166), scripts/hooks/session-state-sync.cjs:248, scripts/modules/claim-health/self-heal.js:92, scripts/modules/complete-quick-fix/orchestrator.js:713, scripts/modules/handoff/claim-swapper.js:117, scripts/modules/handoff/executors/lead-final-approval/helpers.js:441, scripts/modules/sd-next/claim-analysis.js:280, scripts/sd-start.js (:1134, :1171, :1394) — plus one indirect call (scripts/stale-session-sweep.cjs:219 via bestEffortReleaseSd, which internally calls the same rpc at best-effort-release.mjs:71). Read the p_session_id argument at every site: in every case it is the specific (stale/dead/ghost/completed/self) session\'s OWN id, obtained from a claim/session row read moments earlier by that same caller — never an arbitrary third-party id passed to force-clear a claim the caller has no evidence it holds. Read the migration\'s actual mechanics (database/migrations/20260727_release_sd_qf_reopen.sql:51-114): p_session_id is first used to look up that SAME session\'s own claude_sessions.sd_key (v_sd_key), so the RPC only ever acts on "the SD/QF that THIS specific session currently appears to claim" — the new holder CAS (`AND claiming_session_id = p_session_id`) on the QF branch validates exactly the invariant every caller already assumes. The one operator-facing tool that can target an arbitrary session (`/claim release <session-id>` in lib/commands/claim-command.js, releaseClaim(sessionId)) still only releases the claim recorded for THAT target session (read from claude_sessions.sd_key immediately before the RPC call) — not a "force release regardless of current holder" primitive. CONCLUSION independently reached, not inherited: no caller depends on the old clear-regardless-of-current-holder behavior; the only caller class affected by the new no-op-on-mismatch semantics is a caller racing a genuine concurrent re-claim of the SAME QF between its own read and its RPC call — which is precisely the QF-20260726-593 race the CAS is designed to close (previously a silent wipe of a NEW legitimate holder\'s claim; now correctly a no-op). This matches the migration header\'s own framing verbatim.',
  },
  {
    id: 'R2-fr4-gauge-narrowing-thundering-herd-sensitivity-change-UNCOVERED',
    severity: 'MEDIUM',
    summary: 'Confirmed a real, untested behavior-change risk from the FR-4 gauge narrowing. lib/coordinator/coordination-events.cjs\'s `bundle.unclaimedItems` (gatherDetectorInputs, ~line 201) and the completion-boundary `unclaimedItems` (gatherCompletionBoundaryExitInputs, ~line 506) both now route through applyClaimableQfFilter (status=\'open\' only, was \'open\',\'in_progress\'), so the numeric value is systematically smaller than before. Traced every consumer in lib/coordinator/detectors.cjs: (a) detectStalledLoop, detectMaskedStall, detectCompletionBoundaryExit all early-return `matched:false` when `unclaimed <= 0` — narrowing makes these LESS likely to fire on phantom/unreachable supply, which is a correctness improvement (the SD\'s own point: those in_progress-unclaimed rows were never real waiting work). (b) detectThunderingHerd (detectors.cjs:102-111, wired at detectors.cjs:611 inside runDetectors, consuming the SAME data.unclaimedItems) fires when `idle > 0 && idle > unclaimed` — a SMALLER unclaimed denominator makes this MORE likely to fire for the same idle-worker count. This is exactly the "gauge legitimately drops and could trip an unrelated alarm" pattern flagged in my brief. Checked for test coverage of this specific interaction: the new tests/unit/coordinator/qf-supply-gauge-agreement.test.js only pins that the gauge and the claim chokepoint (isAutoStartableQF) agree — it does not touch detectThunderingHerd. tests/unit/coordinator/detectors.test.js (present, NOT modified by this branch\'s diff) unit-tests detectThunderingHerd against synthetic {idleWorkers, unclaimedItems} inputs, so it cannot catch a change in what real-world value flows into that field from production. detectThunderingHerd carries no feature-flag gate (unlike detectMaskedStall, which is gated behind LEO_MASKED_STALL_DETECT pending tick-reliability fixes per its own doc comment) — it is live and unconditional in runDetectors. This is a genuine, currently-uncovered risk: the same fleet idle/supply mix that did not trigger THUNDERING_HERD before this SD will, in some real scenarios, trigger it after — not because idle workers or true claimable supply changed, but because the denominator\'s definition changed. Directionally this is arguably the MORE ACCURATE alarm (idle workers genuinely cannot claim in_progress-unclaimed rows either), but that judgment call was not made explicit anywhere in the PRD/FRs I reviewed, and no test asserts the new firing rate is intentional/acceptable.',
  },
  {
    id: 'R3-deliverHints-resolved-error-accounting-confirmed-independently',
    severity: 'INFO',
    summary: 'Independently read scripts/coordinator-idle-qf-hint.mjs\'s deliverHints (line 301) rather than trusting the EXEC-phase TESTING sub-agent\'s prior mutation-testing conclusion: line 327-328 catches a THROWN error and calls recordUndelivered; line 343-344 additionally checks `if (res && res.error)` on the RESOLVED return value and also calls recordUndelivered. A writer that resolves void/undefined (res is falsy) skips both branches and falls through to the delivered-count path — confirms a void-returning writer (injected fakes, and any production writer that resolves undefined) still counts as delivered, and a resolved {error} shape (previously silently miscounted as delivered — only throws were caught) is now correctly counted as undelivered and the QF requeued. No caller or test in this repo depended on the OLD (buggy) counting — the dedicated test file (tests/unit/coordinator/idle-qf-hint-delivery.test.js) was authored specifically to pin the NEW behavior and all its assertions pass. Re-ran this and the other SD-owned suites myself (below) rather than relying on the EXEC-phase run.',
  },
  {
    id: 'R4-coordination-events-event-type-no-db-constraint-alarm-writes-cleanly',
    severity: 'INFO',
    summary: 'Checked whether coordination_events.event_type has a DB-level enum/CHECK that could reject the new \'IDLE_QF_HINT_DELIVERY_DEGRADED\' value. Read database/migrations/20260605_create_coordination_events.sql directly: `event_type text NOT NULL` — no CHECK/enum constraint on event_type at all (only `severity` is constrained: `CHECK (severity IN (\'info\',\'warning\',\'critical\'))`). Grepped every later migration touching coordination_events (20260608_coordination_events_rls.sql, 20260611_guard_pack_rls_tables.sql, its DOWN counterpart) for ADD/DROP CONSTRAINT or ALTER TABLE — none add a constraint on event_type. scripts/coordinator-idle-qf-hint.mjs\'s emitDeliveryAlarm uses `severity: \'warning\'` (line 181), a valid value under the existing constraint. CONCLUSION: this is not a hard defect — the new event_type is free-text and will not be rejected; the alarm will write successfully. This is also consistent with the existing pattern in lib/coordinator/detectors.cjs\'s runDetectors, which already emits several event_type values (SPLIT_BRAIN, THUNDERING_HERD, DEPLOY_GAP, STALLED_LOOP, MASKED_STALL, etc.) as an open, string-discriminated set with no closed enum anywhere I found in this pass.',
  },
  {
    id: 'R5-clearAndReopenQf-routing-unaffected-safety-test-unmodified-and-passing',
    severity: 'INFO',
    summary: 'Confirmed tests/unit/scripts/stale-session-sweep-claim-safety.test.js is NOT among the 14 files changed in this branch\'s diff (untouched, per FR-1\'s explicit AC) and re-ran it directly — passes. Read lib/fleet/best-effort-release.mjs\'s clearAndReopenQf (line 155+) directly: it performs its OWN, direct `quick_fixes` table UPDATE (status=\'in_progress\'->\'open\', claiming_session_id cleared) gated by its own predicate (status=\'in_progress\' AND pr_url IS NULL AND commit_sha IS NULL AND a claiming_session_id match/no-match branch depending on expectedHolder) — this path does NOT call the release_sd RPC at all, so it is completely unaffected by the FR-2 migration (staged, not applied) regardless of when/whether that migration lands. The two stale-sweep call sites (scripts/stale-session-sweep.cjs:1170 and :2650) are unchanged in this diff and route through this same unaffected helper. The four legitimately-terminal QF-clear call sites are untouched.',
  },
  {
    id: 'R6-sd-owned-and-directly-relevant-test-suites-all-pass',
    severity: 'INFO',
    summary: 'Ran the 5 SD-owned test files plus 2 directly-relevant pre-existing safety tests together: tests/unit/coordinator/idle-qf-hint-delivery.test.js, tests/unit/coordinator/qf-supply-gauge-agreement.test.js, tests/unit/db/release-sd-qf-branch-sql.test.js, tests/unit/fleet/qf-clear-and-reopen.test.js, tests/unit/stale-sweep-qf211-claim-guards.test.js, tests/unit/scripts/stale-session-sweep-claim-safety.test.js, tests/unit/fleet/best-effort-release.test.js — 7 files, 103/103 tests passed, 0 failures. Per the brief\'s guidance on the full unit tier\'s known pre-existing flakiness (three prior runs producing three non-overlapping failure subsets), I scoped my run to the changed-file-adjacent suite rather than re-running the full 2648-file tier a fourth time — every file I ran either IS one of the 14 changed files\' own test, or directly exercises a changed code path (stale-sweep safety, best-effort-release), so a pass here is direct evidence, and I have no basis to attribute any NEW full-tier flake to this branch without re-observing it against this exact diff.',
  },
];

const warnings = [
  'R2: detectThunderingHerd (lib/coordinator/detectors.cjs) consumes the same bundle.unclaimedItems that FR-4 narrowed, and has no test pinning its new real-world firing rate and no feature-flag gate. This is a legitimate, currently-invisible behavior change for PLAN to weigh — likely a correctness improvement (idle workers genuinely cannot claim in_progress-unclaimed rows either), but that judgment was not made explicit in the PRD/FRs and is not covered by any test in this diff.',
  'R1: the FR-2 migration is staged but NOT applied to the live database (correctly chairman-gated; not stamped by this worker). My item-1 analysis is therefore a forward-looking assessment of caller safety once it lands, as the brief requested — it is not a live-behavior verification.',
];

const recommendations = [
  'PLAN: add or request a test that pins detectThunderingHerd\'s behavior against the NEW narrowed unclaimedItems value in a realistic idle/supply scenario (e.g., a fixture with several in_progress-unclaimed-but-unreachable QFs alongside a handful of open ones), so a future change to the gauge or the detector threshold is caught rather than silently altering alarm frequency again.',
  'PLAN: consider having the FR-4 PRD text explicitly acknowledge the THUNDERING_HERD sensitivity change as an accepted, intentional side effect (or set an explicit tolerance/threshold adjustment) rather than leaving it as an implicit consequence of the gauge fix.',
  'Once the FR-2 migration is chairman-approved and applied, re-run scripts/one-off/verify-release-sd-qf-branch.mjs against the live function and confirm the holder-CAS behavior matches this forward-looking analysis under real concurrent-claim conditions, not just the SQL-file static test.',
];

const summary = 'CONDITIONAL_PASS. Independently investigated all 5 flagged behaviour-change risks rather than inheriting prior sub-agent conclusions. (1) release_sd RPC semantics (FR-2, staged/not-applied): enumerated all 16 direct rpc(\'release_sd\') call sites plus 1 indirect (stale-session-sweep.cjs via bestEffortReleaseSd) myself and read every p_session_id argument\'s provenance — every caller targets a specific session\'s OWN claim (read from claude_sessions.sd_key moments before the call), never an arbitrary force-release of a claim it has no basis to hold; the new holder CAS validates exactly the invariant every caller already assumes, and the one operator-facing tool (`/claim release <id>`) is no exception. No caller depends on the old clear-regardless-of-holder behavior — this independently confirms (not inherits) the SECURITY sub-agent\'s conclusion. (2) FR-4 gauge narrowing: found a REAL, currently-untested behavior-change risk — detectThunderingHerd (lib/coordinator/detectors.cjs, wired unconditionally in runDetectors) consumes the same narrowed bundle.unclaimedItems and will fire more readily for the same idle-worker count, with no test or feature flag covering the new threshold; the three other unclaimedItems-consuming detectors (StalledLoop/MaskedStall/CompletionBoundaryExit) are guarded by unclaimed<=0 and become MORE accurate (fewer phantom-supply false fires) under the narrowing, not less. (3) deliverHints resolved-error accounting: independently confirmed via direct code read (not inherited) that a void-returning writer still counts as delivered and a resolved {error} is now correctly counted as undelivered; no caller/test depended on the old miscounting. (4) emitDeliveryAlarm\'s new coordination_events.event_type: confirmed via direct migration read that event_type carries no DB-level CHECK/enum (only severity does, and the alarm\'s severity=\'warning\' is valid) — the new event_type will not be rejected; no hard defect. (5) clearAndReopenQf stale-sweep routing: confirmed the FR-1 safety test is unmodified and passing, and that clearAndReopenQf is a direct table update entirely independent of the release_sd RPC, so it is unaffected by the FR-2 migration regardless of when it lands. Ran the 5 SD-owned test files plus 2 directly-relevant pre-existing safety tests: 103/103 pass, 0 failures, 0 attributable regressions. The one substantive open item is R2 (THUNDERING_HERD sensitivity change) — not a code defect, arguably a correctness improvement, but real, unacknowledged in the PRD, and uncovered by any test — which is why this is CONDITIONAL_PASS rather than a clean PASS.';

const justification = [
  'CONDITIONAL_PASS — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 PLAN-phase regression/backward-compatibility validation.',
  '',
  '1. ITEM 1 (release_sd RPC, FR-2, staged/not-applied): read database/migrations/20260727_release_sd_qf_reopen.sql line-by-line to understand the actual mechanics — p_session_id resolves v_sd_key from THAT session\'s own claude_sessions row first, so every downstream update (SD or QF branch) only ever acts on "what this specific session currently appears to claim." Then enumerated all rpc(\'release_sd\') call sites in the repo (grep across lib/scripts/tests, excluding node_modules) and read the code context (p_session_id provenance) at all 16 direct + 1 indirect site. In every case p_session_id is a specific session\'s own id read from a claim/session row moments earlier by the SAME caller (never a hardcoded or unrelated third-party id). This independently confirms the SECURITY sub-agent\'s conclusion that no caller depends on force-releasing a claim it does not hold — I did not take that conclusion on trust; I read all the call sites myself.',
  '',
  '2. ITEM 2 (FR-4 gauge narrowing): read the qf-supply-predicate.cjs and coordination-events.cjs diffs directly, then grepped every production consumer of unclaimedItems/unclaimedQfs/unclaimedSds and read the threshold logic in lib/coordinator/detectors.cjs for each. Found that 3 of 4 consumers (StalledLoop/MaskedStall/CompletionBoundaryExit) become MORE correct under the narrowing (fewer false arms on phantom supply), but detectThunderingHerd\'s `idle > unclaimed` threshold becomes MORE sensitive to the same idle-worker count as the denominator shrinks — a real behavior change with no test or flag covering it. This is the single most consequential finding of this pass and is why the verdict is CONDITIONAL rather than a clean PASS.',
  '',
  '3. ITEM 3 (deliverHints): read scripts/coordinator-idle-qf-hint.mjs\'s deliverHints function directly (lines 301-350ish) rather than accepting the EXEC-phase TESTING sub-agent\'s mutation-testing conclusion at face value. Confirmed the exact branch structure (throw-catch at 327-328, resolved-error check at 343-344) and that a falsy/void res skips both, preserving delivered-counting for void-returning writers.',
  '',
  '4. ITEM 4 (coordination_events.event_type): read the original CREATE TABLE migration (20260605) and grepped every later migration touching the table for constraint changes — confirmed event_type is unconstrained text; only severity has a CHECK, and the new alarm\'s severity=\'warning\' satisfies it. No hard defect; the alarm write will succeed.',
  '',
  '5. ITEM 5 (clearAndReopenQf / stale-sweep): confirmed via git diff that tests/unit/scripts/stale-session-sweep-claim-safety.test.js is untouched by this branch, ran it directly (passes), and read clearAndReopenQf\'s implementation to confirm it is a direct table UPDATE with its own independent guard, entirely decoupled from the release_sd RPC — unaffected by the FR-2 migration regardless of deployment status.',
  '',
  '6. TEST EXECUTION: ran the 5 SD-owned test files (idle-qf-hint-delivery, qf-supply-gauge-agreement, release-sd-qf-branch-sql, qf-clear-and-reopen, stale-sweep-qf211-claim-guards) plus 2 directly-relevant pre-existing tests (stale-session-sweep-claim-safety, best-effort-release) in one vitest invocation: 7 files, 103 tests, 0 failures.',
  '',
  'RATIONALE FOR CONDITIONAL_PASS (not a clean PASS, not WARNING): no code defect was found, no attributable test regression, and item 1\'s highest-named risk was independently ruled out rather than inherited. However R2 (THUNDERING_HERD sensitivity to the FR-4 gauge narrowing) is a real, currently-invisible behavior change with zero test coverage and no explicit PRD acknowledgment — a legitimate condition for PLAN to address (via a pinning test and/or an explicit note) before treating this SD as fully closed, but not severe enough (and too plausibly a correctness improvement) to block the handoff outright.',
].join('\n');

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 85,
    findings,
    warnings,
    recommendations,
    summary,
    justification,
    critical_issues: [],
    conditions: [
      'Add a test pinning detectThunderingHerd\'s behavior against the FR-4-narrowed unclaimedItems value under a realistic mixed-supply fixture, so the new firing-rate sensitivity is explicit and caught by CI rather than implicit.',
      'PLAN to explicitly acknowledge (in FR-4\'s description or a follow-up note) that narrowing the supply gauge also tightens THUNDERING_HERD\'s effective threshold, and confirm that is an accepted tradeoff.',
    ],
    test_results: {
      sd_owned_and_relevant_suite: {
        files: 7,
        tests: 103,
        passed: 103,
        failed: 0,
        file_list: [
          'tests/unit/coordinator/idle-qf-hint-delivery.test.js',
          'tests/unit/coordinator/qf-supply-gauge-agreement.test.js',
          'tests/unit/db/release-sd-qf-branch-sql.test.js',
          'tests/unit/fleet/qf-clear-and-reopen.test.js',
          'tests/unit/stale-sweep-qf211-claim-guards.test.js',
          'tests/unit/scripts/stale-session-sweep-claim-safety.test.js',
          'tests/unit/fleet/best-effort-release.test.js',
        ],
      },
      attributable_regressions: 0,
      full_unit_tier_rerun: 'NOT re-run this pass — scoped to changed-file-adjacent suite per the brief\'s guidance on pre-existing full-tier flakiness (three prior non-overlapping failure subsets on this branch); no basis to attribute a fresh full-tier failure to this diff without direct re-observation.',
      release_sd_caller_enumeration: {
        direct_rpc_call_sites: 16,
        indirect_via_wrapper: 1,
        force_release_dependency_found: false,
        method: 'read p_session_id provenance at every call site directly, not inherited from SECURITY sub-agent count',
      },
    },
    metadata: {
      review_type: 'REGRESSION_PLAN_PHASE_BACKWARD_COMPAT',
      files_reviewed: [
        'database/migrations/20260727_release_sd_qf_reopen.sql',
        'lib/claim-guard.mjs',
        'lib/commands/claim-command.js',
        'lib/fleet/best-effort-release.mjs',
        'lib/session-manager.mjs',
        'scripts/hooks/reclaim-sd-after-compaction.cjs',
        'scripts/hooks/session-state-sync.cjs',
        'scripts/modules/claim-health/self-heal.js',
        'scripts/modules/complete-quick-fix/orchestrator.js',
        'scripts/modules/handoff/claim-swapper.js',
        'scripts/modules/handoff/executors/lead-final-approval/helpers.js',
        'scripts/modules/sd-next/claim-analysis.js',
        'scripts/sd-start.js',
        'scripts/stale-session-sweep.cjs',
        'lib/coordinator/qf-supply-predicate.cjs',
        'lib/coordinator/coordination-events.cjs',
        'lib/coordinator/detectors.cjs',
        'scripts/coordinator-idle-qf-hint.mjs',
        'database/migrations/20260605_create_coordination_events.sql',
      ],
      review_dimensions: {
        item1_release_sd_caller_safety: 'PASS — independently verified, no force-release dependency found',
        item2_fr4_gauge_narrowing: 'CONDITIONAL — real uncovered THUNDERING_HERD sensitivity change identified',
        item3_deliverHints_resolved_error: 'PASS — independently confirmed',
        item4_coordination_events_event_type: 'PASS — no DB constraint issue, alarm writes cleanly',
        item5_clearAndReopenQf_routing: 'PASS — unaffected by RPC migration, safety test unmodified and passing',
      },
      model: 'Sonnet 5',
      model_id: 'claude-sonnet-5',
      invoked_at: new Date().toISOString(),
      supersedes_partial_row: 'ee308d53-e55e-4599-b9a2-841a077345c1',
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001',
    },
    phase: 'PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'REGRESSION',
    SD_ID,
    { name: 'Regression Validation Specialist (regression-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
