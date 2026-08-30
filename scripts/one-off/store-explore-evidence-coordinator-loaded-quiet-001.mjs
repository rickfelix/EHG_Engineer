import 'dotenv/config';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001';
const REPO_PATH = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const CWD = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Explore agent mapped every function/constant/precedent this SD touches: decideCadence() (lib/coordinator/quiet-tick.cjs:65-98, PURE contract), coordinator-quiet-tick.mjs main() call ordering and existing hasUnactionedDirective/hasUndeliveredChairmanEscalation inputs, gatherCapacityInputs() in scripts/lib/capacity-inputs.mjs (predicate-input source), STANDARD_LOOPS/parseStandardLoops/cronToIntervalSeconds derivation chain for periodic_process_registry, and the QF-20260830-100 retire-with-provenance precedent. All findings corroborate and extend the VALIDATION sub-agent evidence.',
  detailed_analysis:
    '1) lib/coordinator/quiet-tick.cjs decideCadence(s) (lines 65-98) is contractually PURE per module docstring. Constants: MAX_QUIESCENT_PARK_S=900, ACTIVE_MIN_S=180, ACTIVE_MAX_S=270, PROMPT_CACHE_TTL_S=300 (never landed on exactly), DIRECTIVE_WAKE_MIN_S=15/MAX_S=45. desiredActiveS (QF-20260830-071/A3) already widens the active band caller-side: passing desiredActiveS yields [max(180,X-45), max(180,X)]. Test file tests/unit/coordinator/quiet-tick.test.js:64-120 documents the precedent regression-test shape to mirror (omitted-input byte-identical test at 65-75, wide-band test 77-82, unchanged-fixed-band test 84-90, hard-wake/quiescent-unaffected tests, never-300 test).\n\n2) scripts/coordinator-quiet-tick.mjs main() (365-522): assessFleetActivity() runs first (~372-381, sets quiescent flag from tick-start data), then runCoresFailSoft (~383-385), then hasUnactionedDirective/hasUndeliveredChairmanEscalation computed in parallel (~407-419) immediately before the decideCadence() call (~464-469: quiescent, partyOffsetS, hasUnactionedDirective, hasUndeliveredChairmanEscalation passed; no desiredActiveS/desiredQuiescentParkS passed today). This is where the new loaded-and-quiet boolean must be injected (fresh DB read right before this call), matching the ARM-time-freshness coordinator amendment.\n\n3) scripts/lib/capacity-inputs.mjs gatherCapacityInputs() (188-471) already returns idleNow, workers, claimsBySession, claimableCount (beltExtent="dispatchable-leaf"), rawUnclaimed, openQfCount, claimableWithVerifyQfCount -- exactly the four predicate inputs (a)-(c) the SD needs (predicate (d) is already the top-precedence hard-wake branch). Correction to VALIDATION\'s assumption: scripts/coordinator-idle-qf-hint.mjs does NOT call gatherCapacityInputs -- it does independent gathering via liveFleetWorkers. Actual callers: coordinator-capacity-forecast.mjs, cron/drive-report-sweep.mjs, cron/drive-report-hourly-sweep.mjs, adam-coordinator-health.mjs, lib/governance/drive-state/axes/fleet-health.cjs, lib/governance/demand-gate-emit.js.\n\n4) periodic_process_registry.standard_loop:inbox.expected_interval_seconds is machine-derived: seed-periodic-process-registry.mjs -> discoverAllProcesses -> lib/periodic-liveness/enumerate-processes.mjs parseStandardLoops() (110-135, regex text-scan of coordinator-startup-check.mjs, NOT an import) -> cronToIntervalSeconds() (25-46) applied to the inbox cron entry (coordinator-startup-check.mjs:161-162, cron="*/2 * * * *") -> 120s. A DB-only edit is non-durable: it will be silently overwritten on the next seed run, which also unconditionally resets currently_expected_active:true.\n\n5) QF-20260830-100 (commit d7480ba5b08, PR #7783) is the exact retire-with-provenance precedent: STANDARD_LOOPS entry removed (with an explanatory comment stub left behind), a new one-off script (scripts/one-off/qf-100-retire-singleton-relaunch-registry.mjs) flips currently_expected_active:false and merges retired_at/retired_reason INTO the existing liveness_source_ref JSON column (no dedicated top-level retirement columns exist), plus pinning-test count updates in tests/unit/coordinator-startup-check-session-arm-qf510.test.js and tests/unit/gha-loop-migration-parity.test.js, plus CLAUDE_COORDINATOR.md/manifest regeneration. Directly reusable as the shape for either retiring the inbox row (if folded into quiet-tick) or for editing its STANDARD_LOOPS cron entry as the durable source-of-truth edit.',
  execution_time_ms: 0,
  metadata: {
    repo_path: REPO_PATH,
    executed_from_cwd: CWD,
    phase: 'LEAD',
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    files_measured: [
      'lib/coordinator/quiet-tick.cjs',
      'tests/unit/coordinator/quiet-tick.test.js',
      'scripts/coordinator-quiet-tick.mjs',
      'scripts/lib/capacity-inputs.mjs',
      'scripts/coordinator-idle-qf-hint.mjs',
      'scripts/seed-periodic-process-registry.mjs',
      'scripts/coordinator-startup-check.mjs',
      'lib/periodic-liveness/enumerate-processes.mjs',
      'scripts/one-off/qf-100-retire-singleton-relaunch-registry.mjs',
      '.github/workflows/singleton-relaunch-cron.yml',
    ],
    corroborates_sub_agent: 'VALIDATION',
    evaluated_commit_sha: 'e97344bf240f0f759c3c2ebeda5501859ab67907',
  },
};

const subAgent = { code: 'Explore', name: 'Explore (codebase discovery)' };

const stored = await storeSubAgentResults('Explore', SD_ID, subAgent, results, { source: 'manual' });
console.log('Stored Explore evidence:', stored?.id || stored);
