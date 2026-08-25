#!/usr/bin/env node
// SD-LEO-INFRA-STAGE-GATE-RETRY-001 -- LEAD-phase enrichment. Unlike several bare-title
// promotions handled earlier this session, this SD arrived with a genuinely detailed
// Solomon-sourced plan_content. This enrichment populates the still-placeholder DB fields
// (success_criteria measures, strategic_objectives, key_changes) from that plan_content plus
// direct code/DB verification (Explore evidence 3e547a89-26a5-490c-98be-947f14d6995b) --
// confirming the premise is real, not inventing new scope.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8077da1b-7888-4a91-aba8-bfe459e61334';

const NEW_DESCRIPTION = `Stage-gate retry class fix: bounded retries + override terminalization (family, not one venture)

## Type
infrastructure

**Provenance**: Solomon (c) on ruling thread b5d415ce -- the class (unbounded stage-gate retry + override-never-terminalizes) is a family defect distinct from the ApexNiche hotfix; minted separately so the class fix is never buried in a hotfix. Companion: SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001 (hotfix, already completed via QF-20260824-655) references this SD as its unpark condition. Sourced by Adam 0549d739.

## LEAD verification (2026-08-24, Explore evidence 3e547a89)
Confirmed against real code and live DB state, not assumed:
- No automatic retry ceiling/backoff exists on the stage-processing poll loop (lib/eva/stage-execution-worker.js's setInterval-driven _tick/_processVenture). The only kill-switch is a MANUAL, binary metadata.gating_decision.parked flag -- not a systemic bounded-retry mechanism.
- Authoritatively confirmed via ventures.metadata.gating_decision_history for ApexNiche (809ec7e7): a 2026-08-24 park entry states verbatim "the stage-21 gate never terminalizes after an override, so it replayed 7c706688 as a fresh eva_stage_gate_attempts row every ~30s, unbounded" and names THIS SD as the unpark_trigger. This is the DB's own record, not an inferred premise.
- The companion hotfix (already completed, QF-20260824-655) stopped ApexNiche's specific symptom via a venture-scoped manual park at the true entry point -- a point fix for one venture, NOT the class fix. The underlying defect (no retry ceiling anywhere, override never terminalizes any gate for any venture) remains real and unaddressed.
- OPEN ITEM for PLAN phase: the addendum's recordGateResult silent-failure finding (eva_stage_gate_results frozen for ApexNiche stage 21 since 2026-07-26 while eva_stage_gate_attempts kept inserting) needs direct re-verification before FR-2's override-terminalization design assumes that UPSERT path is a reliable write target.

## Problem
The EVA stage-gate evaluation path (lib/eva/eva-orchestrator.js, lib/eva/stage-execution-worker.js) has (a) no retry bound or backoff on gate re-evaluation -- a non-advancing venture retries indefinitely at fixed poll cadence; (b) a recorded chairman override RESOLVES a chairman_decisions row but never TERMINALIZES the underlying gate -- the next poll cycle re-evaluates and re-records the same override forever. ApexNiche is specimen 1 (575+ attempts, now parked); the class applies to every venture that hits a gate with a recorded override or a persistent non-advance.

## Scope (one SD)
- FR-1: Retry discipline on gate evaluation: attempt ceiling + exponential backoff (constants single-sourced), with a terminal MANUAL_REQUIRED-style state carrying a reason when the ceiling hits -- never silent infinite retry.
- FR-2: Override terminalization: a resolved_outcome=override attempt marks the gate SATISFIED (or explicitly consumed) so subsequent cycles do not re-evaluate/re-record; historical override decisions (7c706688 class) honored once. First re-verify eva_stage_gate_results' write reliability (LEAD open item above) before building on it.
- FR-3: Census-as-code: a check enumerating ventures currently in unbounded-retry posture (repeated identical attempts, N>threshold) -- specimen count at ship, wired so recurrence is visible.
- FR-4: Fixtures: (a) ceiling reached -> terminal state with reason, no further rows; (b) override -> gate terminal, zero re-records; (c) advancing venture unaffected.

## Out of scope
The ApexNiche hotfix (separate, already shipped via QF-20260824-655); gate criteria semantics.

## Key changes
- lib/eva/eva-orchestrator.js and/or lib/eva/stage-execution-worker.js: bounded-retry + backoff wrapper around gate re-evaluation, single-sourced constants.
- Override-resolution write path: mark the gate terminal on resolved_outcome=override, read on subsequent cycles to skip re-evaluation.
- A new or extended census check (script or query) enumerating ventures in unbounded-retry posture.

## Success criteria
- Zero ventures in unbounded-retry posture post-ship (FR-3 instrument at 0, measured).
- ApexNiche unpark path exercisable: gate re-evaluated ONCE under the fixed discipline.
`;

const success_criteria = [
  { measure: '[VERIFIED]', criterion: 'Zero ventures in unbounded-retry posture post-ship (FR-3 census instrument reads 0, measured against live DB).' },
  { measure: '[VERIFIED]', criterion: 'ApexNiche unpark path is exercisable: the stage-21 gate is re-evaluated exactly ONCE under the fixed bounded-retry/override-terminalization discipline (no repeat).' },
];

const strategic_objectives = [
  'Fix the general stage-gate retry/override-terminalization defect class (bounded retries + override terminalization) that produced the ApexNiche runaway, so the underlying defect cannot recur for any other venture -- not just the one already point-patched by the companion hotfix',
  'Make unbounded-retry posture visible and monitorable (census-as-code) rather than only discoverable after a specimen accumulates hundreds of attempts',
];

const risks = [
  {
    risk: 'The addendum\'s recordGateResult silent-failure finding (eva_stage_gate_results possibly frozen/broken for 29+ days on ApexNiche stage 21) was flagged but not independently re-verified at LEAD -- if FR-2\'s override-terminalization design writes to that same UPSERT path, it could inherit a pre-existing silent-write-failure bug rather than fixing anything.',
    severity: 'high',
    mitigation: 'PLAN phase must directly re-query eva_stage_gate_results\' current state for the ApexNiche specimen before finalizing FR-2\'s write target, and add an explicit test proving the write path is NOT silently failing before relying on it for gate terminalization.',
  },
  {
    risk: 'A bounded-retry ceiling could incorrectly terminalize a venture that is genuinely still making progress through legitimate retries (e.g. transient infra errors), if the ceiling/backoff constants are too aggressive.',
    severity: 'medium',
    mitigation: 'FR-1 requires the ceiling to produce an explicit MANUAL_REQUIRED-style terminal state with a reason (never silent), so a human can distinguish a legitimately-exhausted venture from a false terminalization and intervene -- not an unrecoverable kill.',
  },
  {
    risk: 'This is shared, high-blast-radius orchestrator code (lib/eva/eva-orchestrator.js, lib/eva/stage-execution-worker.js) touched by many other SDs this session (including SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001\'s _advanceStage/_handleChairmanGate changes) -- a change here risks conflicting with or regressing concurrent/recent work on the same functions.',
    severity: 'medium',
    mitigation: 'PLAN phase must re-read the CURRENT state of _handleChairmanGate and the resolvedOutcome tagging added by the instrumentation-retrofit SD before designing FR-2, to build on top of (not conflict with) that recent, already-merged change.',
  },
];

async function run() {
  const supabase = createSupabaseServiceClient();

  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    needs_enrichment: [],
    enrichment_note: {
      enriched_at: new Date().toISOString(),
      reason: 'Populated previously-placeholder success_criteria/strategic_objectives/key_changes/risks from the existing well-specified plan_content, plus direct LEAD-phase code/DB verification (Explore evidence 3e547a89) confirming the premise is real -- authoritatively corroborated by ventures.metadata.gating_decision_history for the cited ApexNiche specimen, which explicitly names this SD as its unpark condition.',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({
      description: NEW_DESCRIPTION,
      success_criteria,
      strategic_objectives,
      risks,
      metadata: newMetadata,
    })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

  console.log('SD enriched successfully.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
