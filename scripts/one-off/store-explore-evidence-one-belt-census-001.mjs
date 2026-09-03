import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-ONE-BELT-CENSUS-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Codebase discovery for the belt-census module: located the dispatch choke\'s shared eligibility ' +
    'predicate (classifyAllDispatchIneligibility, lib/fleet/claim-eligibility.cjs:473), the dispatch- ' +
    'terminal status constants (lib/coordinator/dispatch.cjs:300-303), and the four candidate belt-reader ' +
    'call sites with their exact filter lines. Report was independently spot-checked by a follow-up ' +
    'validation-agent pass, which corrected two premises before they reached the PRD: (1) dispatch-terminal ' +
    'statuses (escalated, deferred) are NOT lifecycle-terminal for this SD\'s purpose -- they are exactly ' +
    'the buckets the census must surface, not exclude; (2) an undisclosed 27KB prior-art module, ' +
    'lib/fleet/belt-depth.cjs, already provides count-only belt-depth functions on the same shared ' +
    'predicate with ~10 live consumers -- the new module is a row-level sibling, not a duplicate or ' +
    'replacement. Both corrections are carried into the PRD (FR-2, FR-3).',
  critical_issues: [],
  warnings: [
    'The originally-described "7 belt readers" does not survive per-file measurement against main: only 4 ' +
    '(coordinator-idle-qf-hint.mjs, adam-quiet-tick.mjs, coordinator-quiet-tick.mjs, fleet-dashboard.mjs) ' +
    'genuinely need migration. adam-pm-board.mjs has zero references to strategic_directives_v2 or ' +
    'quick_fixes (reads a different table, adam_task_ledger) and drops out entirely. capacity-inputs.mjs ' +
    'and worker-checkin.cjs already reference belt-depth.cjs and may not need further migration -- PLAN/EXEC ' +
    'must re-verify each reader\'s current shape immediately before editing it, not trust this LEAD-phase ' +
    'research verbatim (fleet activity tonight is heavy; files may have moved).',
    'No shared "non-terminal status" constant exists repo-wide (~15 divergent literal status-exclusion sets ' +
    'found by grep). A real pre-existing drift bug was found in passing: lib/coordinator/reconcile-clone-tree-' +
    'exclusion.js:19 re-declares a differently-membered terminal-status set (swaps deferred for archived) vs ' +
    'dispatch.cjs\'s canonical one. Flagged as out-of-scope for this SD, worth a future QF.',
  ],
  recommendations: [
    'belt-census.cjs should mirror belt-depth.cjs\'s async dep-gate call pattern (evaluateDispatchEligibility) ' +
    'rather than re-deriving it, so dependency-blocked rows are never mis-bucketed as claimable.',
    'Re-use resolveHoldProvenance()/isHoldReleased() from claim-eligibility.cjs for the gated:<reason> bucket ' +
    'text rather than re-deriving hold-reason text.',
  ],
  detailed_analysis: {
    shared_predicate: 'classifyAllDispatchIneligibility, lib/fleet/claim-eligibility.cjs:473 (exported :1001) -- all-match variant returning every matching ineligibility axis, used because the census needs to see every held reason, not just the first.',
    dispatch_terminal_constants: 'lib/coordinator/dispatch.cjs:300-303 -- TERMINAL_SD_STATUSES={completed,cancelled,deferred}, TERMINAL_QF_STATUSES={completed,cancelled,escalated,closed}. Confirmed NOT reusable as the census extent filter (escalated/deferred must be buckets).',
    prior_art_belt_depth: 'lib/fleet/belt-depth.cjs, 402 lines, exports countDispatchableBacklog/countClaimableQuickFixes/countAutoStartableQuickFixes/countClaimableWithVerifyQuickFixes/countBeltDepth -- COUNT-only, SD+QF coverage varies by function, already on the shared predicate. Verified directly (not just via sub-agent report) by reading its exported function list.',
    prior_art_near_miss_sd_only: 'scripts/lib/claimable-leaves.mjs:73-159 computeClaimableLeaves -- SD-only, DB-round-trip-per-row bucketer via classifyDbFreeReason (wraps classifyDispatchIneligibility, first-match not all-match).',
    prior_art_near_miss_in_memory: 'scripts/lib/capacity-inputs.mjs:328-368 -- in-memory sibling of claimable-leaves.mjs, adds beltExtent label.',
    reader_candidates_measured: {
      'coordinator-idle-qf-hint.mjs:363': "confirmed .eq('status','open') on quick_fixes only -- migration target",
      'adam-quiet-tick.mjs:883-887': "confirmed ungated .eq('status','draft') SD read for beltZero -- migration target, worse than originally described (no eligibility gate at all)",
      'coordinator-quiet-tick.mjs:204-206': 'same shape as adam-quiet-tick.mjs -- migration target',
      'fleet-dashboard.cjs:491': "confirmed .in('status',['open','in_progress']) on quick_fixes -- migration target",
      'adam-pm-board.mjs': 'DROPPED -- zero references to strategic_directives_v2 or quick_fixes; reads adam_task_ledger, a different table/domain',
      'worker-checkin.cjs:970,1006': 'contested -- Explore found raw .in(status,[...]) allowlists; validation-agent found 4 existing belt-depth references. PLAN/EXEC must re-measure at implementation time.',
      'capacity-inputs.mjs': 'ALREADY MIGRATED to belt-depth.cjs per validation-agent (10 references) -- likely not a migration target for THIS SD',
    },
  },
  execution_time_ms: 240000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Codebase Discovery (Explore)' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
