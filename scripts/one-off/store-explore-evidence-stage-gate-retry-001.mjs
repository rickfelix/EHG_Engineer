#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-INFRA-STAGE-GATE-RETRY-001. This SD arrived unusually
// well-specified (Solomon-sourced plan_content with concrete FRs and a real specimen), unlike
// several bare-title roadmap promotions handled earlier this session. This evidence documents
// direct verification of the premise against live code and DB state before enrichment/PLAN.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8077da1b-7888-4a91-aba8-bfe459e61334';
const SD_KEY = 'SD-LEO-INFRA-STAGE-GATE-RETRY-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Explore (premise verification)',
    verdict: 'PASS',
    confidence: 88,
    critical_issues: [],
    warnings: [
      'The companion hotfix (SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001) already stopped ApexNiche\'s specific runaway via a venture-scoped manual park flag (QF-20260824-655) -- this SD\'s urgency for THAT venture is reduced, but the class defect (no automatic retry ceiling, override-never-terminalizes) remains real and unfixed for any other venture that would hit the same pattern.',
    ],
    recommendations: [
      'Keep FR-1..FR-4 as scoped in plan_content -- they are concrete and directly grounded in verified code behavior, not aspirational.',
    ],
    detailed_analysis:
      'MEASURED against the real lib/eva/stage-execution-worker.js and lib/eva/eva-orchestrator.js, and the live DB state, not just the plan_content prose. (a) CONFIRMED: no automatic retry ceiling/backoff exists on the stage-processing poll loop -- ' +
      '_processVenture() (stage-execution-worker.js:561) is invoked on a fixed setInterval cadence ' +
      '(this._pollTimer = setInterval(() => this._tick(), this._pollIntervalMs), line 261) with no per-venture attempt-count tracking gating re-entry into gate evaluation; the only kill-switch found is a MANUAL, binary metadata.gating_decision.parked flag (line 610), set by a human/hotfix script, not an automatic ceiling. (b) CONFIRMED, authoritatively, via the ventures table\'s own gating_decision_history for ApexNiche (809ec7e7-f688-4a0c-b9f8-c8a8291cf94d): a 2026-08-24 park entry explicitly states "the stage-21 gate never terminalizes after an override, so it replayed 7c706688 [a chairman override decision] as a fresh eva_stage_gate_attempts row every ~30s, unbounded" and names THIS SD (SD-LEO-INFRA-STAGE-GATE-RETRY-001) as the unpark_trigger ("shipped + stage-21 gate re-evaluated once"). This is not an inferred premise -- it is the DB\'s own authoritative record of why the venture is currently parked. (c) The companion hotfix (SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001, already completed/superseded, real fix QF-20260824-655) stopped the ApexNiche-specific symptom via a venture-scoped manual park check at the true entry point (_processVenture, before recordGateAttempt) -- confirmed via that SD\'s own metadata (runaway_stop_verified=true, zero new eva_stage_gate_attempts rows after the QF merged). This is a point fix for one venture\'s specific incident, NOT the class fix -- it does not add a retry ceiling or override terminalization to the general gate-evaluation path, so the underlying defect this SD targets remains real and would recur for any other venture hitting an override-then-repeat-poll pattern. (d) The addendum\'s recordGateResult silent-failure finding (eva_stage_gate_results frozen for ApexNiche stage 21 since 2026-07-26 despite eva_stage_gate_attempts still inserting) was not independently re-queried in this pass (DB query for the specific table state did not complete before this evidence was written) -- PLAN phase should re-verify this specific claim directly before FR-2\'s override-terminalization design assumes eva_stage_gate_results is a reliable write target, since if that UPSERT path is still silently failing, override-terminalization logic that writes to it would inherit the same silent-failure risk. (e) Cross-referenced _handleChairmanGate (stage-execution-worker.js:2407) and createOrReusePendingDecision -- confirmed a pending-decision REUSE mechanism already exists (avoiding a fresh chairman_decisions row per poll cycle), but found no evidence that a RESOLVED decision (an override) durably marks the underlying GATE as satisfied/terminal -- consistent with FR-2\'s premise that resolution only resolves the decision row, not the gate\'s re-evaluation eligibility.',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'This SD arrived with an unusually well-specified plan_content (Solomon-sourced, citing a real specimen and a real addendum finding) rather than a bare title. Direct code + DB verification confirms the core premise (no retry ceiling, override non-termination) is real, authoritatively corroborated by the ventures table\'s own gating_decision_history for the cited specimen -- not a fabricated or stale claim, unlike several other SDs enriched earlier this session. One open item (the recordGateResult silent-failure addendum) is flagged for PLAN-phase re-verification before FR-2\'s design proceeds.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'EXPLORE',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_UUID,
    { name: 'Explore (premise verification)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
