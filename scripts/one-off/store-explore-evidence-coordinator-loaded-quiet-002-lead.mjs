#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 — Explore evidence at the LEAD-TO-PLAN gate.
 *
 * Read-only codebase investigation to support PLAN-phase PRD authoring: current state of
 * lib/coordinator/quiet-tick.cjs, how decideCadence()'s output is consumed, what FR-1..FR-5
 * concretely require, and existing test coverage.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD = 'SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002';

const results = {
  verdict: 'PASS',
  confidence: 90,
  execution_time_ms: 0,
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'HIGH',
      issue: 'FR-6 (parked-seat wake-delivery preemption) remains structurally unresolved codebase-wide',
      evidence:
        'git log through 1f56db5c14f shows no commit since SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001 (9b4a806340c) has touched decideCadence, coordinator-quiet-tick.mjs wiring, or added any preemption path for an armed ScheduleWakeup. SD-LEO-INFRA-COORDINATOR-WAKE-ON-DIRECTIVE-001 (69df5941f9d) only hard-wakes the COORDINATOR loop on directive rows via decideCadence(hasUnactionedDirective) -- it sets the NEXT park length, it cannot preempt a park already armed, and it has no worker-seat analogue. This is consistent with -002 scope (FR-6 explicitly excluded per LEAD directive/risk_acceptance_b) but PLAN should carry the caveat forward verbatim.',
      location: 'lib/coordinator/quiet-tick.cjs:195-204 (doc comment), scripts/coordinator-quiet-tick.mjs',
      recommendation: 'Non-blocking for -002 given risk_acceptance_b. PLAN should not silently drop the caveat when writing FR-2/FR-3 acceptance criteria.',
    },
  ],
  recommendations: [
    'lib/coordinator/quiet-tick.cjs: decideCadence(s) (lines 65-98) has exactly 3 branches today -- hard-wake (15-45s), quiescent (<=900s), active (180-270s or widened desiredActiveS). No loadedAndQuiet branch exists.',
    'computeLoadedAndQuiet(s) (lines 219-230) is a separate, already-shipped/tested pure predicate (fail-closed: idleNow===0, rawUnclaimed===0 && openQfCount===0, claimableWithVerifyQfCount===0, unactionedDirective===false && undeliveredEscalation===false). It is never called outside tests/unit/coordinator/quiet-tick.test.js:32-72 -- decideCadence does not consume it and coordinator-quiet-tick.mjs does not invoke it.',
    'scripts/coordinator-quiet-tick.mjs main() (line 478-483) calls decideCadence with quiescent/partyOffsetS/hasUnactionedDirective/hasUndeliveredChairmanEscalation only -- no loadedAndQuiet field. gatherCapacityInputs() (scripts/lib/capacity-inputs.mjs) is not called anywhere in this file today; it is currently only consumed by coordinator-capacity-forecast.mjs and similar crons. The returned delaySeconds becomes result.nextWakeSeconds, logged in the QUIET_TICK= summary line (519) -- this is the value that drives the actual park delay.',
    'FR-1 (from parent PRD-e6db824d): fix periodic_process_registry.standard_loop:inbox.expected_interval_seconds durability. Machine-derived from scripts/coordinator-startup-check.mjs STANDARD_LOOPS cron (*/2 * * * * -> 120s, still present at line 161) via lib/periodic-liveness/enumerate-processes.mjs, and re-clobbered on every scripts/seed-periodic-process-registry.mjs run. Separate concern from FR-2/FR-3/FR-5 (about not producing a false OVERDUE liveness alert once the wake cadence widens), but must land before/with the band widening per TR-4 coupling in the parent PRD.',
    'FR-2: add the 4th decideCadence branch (loadedAndQuiet boolean -> [540,660]), precedence hard-wake > quiescent > loaded-and-quiet > active, never resolving to 300 (PROMPT_CACHE_TTL_S).',
    'FR-3: wire a fresh gatherCapacityInputs() call + predicate computation into coordinator-quiet-tick.mjs main() immediately before decideCadence(), not reused from the tick-start assessFleetActivity() call, to avoid staleness.',
    'FR-4: regression fixtures (byte-identical when loadedAndQuiet omitted, branch precedence, never-300 floor).',
    'FR-5: live two-sided proof (a loaded-and-quiet tick showing [540,660], an open-unclaimed tick showing [180,270]), pasted verbatim with timestamps.',
    'Existing tests: tests/unit/coordinator/quiet-tick.test.js covers computeLoadedAndQuiet (9 cases, passing) and the existing 3-branch decideCadence thoroughly (quiescent cap, active band, directive/escalation hard-wake, desiredActiveS, never-300 invariant). Nothing tests a loadedAndQuiet branch in decideCadence (does not exist yet). No fixture covers FR-6 (out of scope for this SD). Adjacent test files (quiet-tick-loop-parity, quiet-tick-salient-state-generalization, quiet-tick-parked-sms-stale, quiet-tick-token-parity-lint, Adam quiet-tick-tier-select) cover unrelated adjacent mechanisms.',
    'scripts/adam-quiet-tick.mjs is a second production caller of decideCadence, out of scope for this SD per the parent PRD; FR-2 AC-4 (byte-identical when loadedAndQuiet omitted) is what keeps Adam\'s seat unaffected by default.',
  ],
  detailed_analysis: [
    'Read-only Explore pass for SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-002 at the LEAD-TO-PLAN gate, in support of PLAN-phase PRD authoring.',
    '',
    'Confirmed the -002 SD picks up exactly where -001 (commit 9b4a806340c) left off: that commit shipped only the tested, inert computeLoadedAndQuiet() predicate and explicitly deferred FR-1 through FR-6 of the -001 PRD. No commits since then touch decideCadence, the coordinator-quiet-tick.mjs wiring, or the STANDARD_LOOPS inbox cron -- all deferred work remains outstanding.',
    '',
    'Full read of lib/coordinator/quiet-tick.cjs (246 lines): decideCadence (65-98) is pure, 3 branches today. computeLoadedAndQuiet (219-230) exported, fail-closed, zero callers outside its own tests.',
    '',
    'scripts/coordinator-quiet-tick.mjs: decideCadence call site at 478-483 has no loadedAndQuiet input; gatherCapacityInputs() not invoked in this file.',
    '',
    'FR-1..FR-6 numbering in the -002 SD scope text is distinct from older doc-comment FR labels inside quiet-tick.cjs itself (those refer to already-shipped mechanisms from SD-LEO-INFRA-FLEET-HIBERNATION-MECHANISM-001). The -002 FRs correspond to the deferred items in the -001 PRD (PRD-e6db824d).',
    '',
    'No blocking findings for LEAD-TO-PLAN. FR-6/preemption absence is expected and already covered by the coordinator\'s risk_acceptance_b; carried forward as a caveat only.',
  ].join('\n'),
  metadata: {
    gate: 'GATE_1_LEAD_PRE_APPROVAL',
    sd_uuid: '7d23f04f-d468-41a2-be35-388def3a6025',
    files_read: [
      'lib/coordinator/quiet-tick.cjs',
      'scripts/coordinator-quiet-tick.mjs',
      'scripts/coordinator-startup-check.mjs',
      'lib/periodic-liveness/enumerate-processes.mjs',
      'scripts/seed-periodic-process-registry.mjs',
      'scripts/lib/capacity-inputs.mjs',
      'tests/unit/coordinator/quiet-tick.test.js',
      'scripts/adam-quiet-tick.mjs',
    ],
    scope_type: 'read-only investigation, no code or DB writes performed by this pass',
  },
};

async function main() {
  const resolution = await resolveSubAgentRepo({
    sdId: SD,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
  });
  applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD,
    { name: 'Explore', code: 'Explore' },
    results,
    { phase: 'LEAD-TO-PLAN', sdKey: SD },
  );
  console.log(
    'STORED ID:', stored?.id,
    '| verdict:', stored?.verdict,
    '| phase:', stored?.phase,
    '| confidence:', stored?.confidence,
    '| repo_path:', stored?.metadata?.repo_path,
  );
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });
}
