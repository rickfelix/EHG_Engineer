#!/usr/bin/env node
// SD-LEO-INFRA-STAGE-GATE-RETRY-001 -- PLAN-phase PRD correction after the prospective
// TESTING sub-agent review (row 136b3c0e-8b75-46cc-b54d-b645af6588dd) falsified two of
// LEAD's premises with direct code + git evidence:
//
// 1. recordGateResult's UPSERT (eva-orchestrator.js:414, onConflict venture_id+stage_number
//    +gate_type) is NOT broken. The chairman-override write path never calls it at all --
//    stage-execution-worker.js:867 calls recordGateOverride, which (confirmed by direct read
//    of lib/eva/artifact-persistence-service.js:595-634) reliably writes gate_criteria.override
//    (verified present on both ApexNiche S21 rows, decision_id=7c706688, dated 2026-07-31) but
//    deliberately never touches resolved_outcome/updated_at -- those columns belong to a
//    DIFFERENT function (recordGateOutcome, :551, an unrelated FR-5 calibration mechanism).
//    So "resolved_outcome stays null despite 1900+ attempts" is not a silent write failure --
//    it is two different columns that nothing in the override path was ever meant to write.
// 2. The ~2h/454-attempt gap between the park flag (18:50:31Z) and the runaway actually
//    stopping (20:48:18Z) is fully explained by git history: the orchestrator guard merged
//    20:00:52Z (#7505, wrong path) and the actual worker-path guard merged 20:44:13Z (#7511,
//    QF-20260824-655) -- the last attempt fired ~4 min after that merge landed. Not a cache,
//    not deploy lag -- the fix simply didn't exist yet during that window.
//
// The REAL defect FR-3 must fix: stage-execution-worker.js:867's override path has no
// idempotency check -- it calls recordGateOverride again on every poll cycle even when
// gate_criteria.override.decision_id already matches, producing a fresh eva_stage_gate_attempts
// row every ~30s forever. The fix is a pre-check + skip, not a "broken upsert" repair -- and it
// must NOT route through recordGateResult (eva-orchestrator.js:1322-1334 deliberately omits
// details/criteria from that call to avoid clobbering the shared exit-gate gate_criteria used
// by other stages' pass/fail evaluation -- restoring it would flip S10/S13 gates from
// fail-correctly to pass-incorrectly).
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const PRD_ID = 'PRD-SD-LEO-INFRA-STAGE-GATE-RETRY-001';

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: prd, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, technical_requirements, test_scenarios, risks, metadata')
    .eq('id', PRD_ID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const fr = prd.functional_requirements.map((item) => {
    if (item.id === 'FR-1') {
      return {
        ...item,
        acceptance_criteria: [
          ...item.acceptance_criteria,
          'At least one test scenario exercises the backoff schedule itself (increasing intervals), not just the final ceiling-hit outcome -- a no-backoff hard stop at N must NOT pass the same scenario as a real backoff.',
        ],
      };
    }
    if (item.id === 'FR-3') {
      return {
        id: 'FR-3',
        title: 'Idempotent override short-circuit (corrected design, PLAN round 2)',
        description: 'CORRECTED after prospective TESTING review (evidence row 136b3c0e-8b75-46cc-b54d-b645af6588dd) falsified the LEAD-phase premise. recordGateOverride (lib/eva/artifact-persistence-service.js:595-634) already reliably writes gate_criteria.override on eva_stage_gate_results -- CONFIRMED present for ApexNiche S21 (decision_id=7c706688, dated 2026-07-31). The real defect: stage-execution-worker.js:867 calls recordGateOverride again on every poll cycle with no check for an already-recorded override, producing a fresh eva_stage_gate_attempts row every ~30s forever. FIX: before calling recordGateOverride, read the existing eva_stage_gate_results row for (venture_id, stage_number, gate_type) and short-circuit (skip re-recording, no new attempt) when gate_criteria.override.decision_id already equals the current decision_id. Do NOT route this through recordGateResult or restore details:/criteria: there -- eva-orchestrator.js:1322-1334 deliberately omits them to avoid clobbering the shared exit-gate gate_criteria used by other stages\' pass/fail evaluation (S10/S13); doing so would flip those gates from fail-correctly to pass-incorrectly.',
        priority: 'critical',
        acceptance_criteria: [
          'A resolved_outcome=override attempt, once gate_criteria.override.decision_id is recorded, produces NO further eva_stage_gate_attempts rows for that exact venture/stage/gate/decision_id on subsequent poll cycles',
          'gate_criteria.override is read fresh (not cached) on each poll before deciding whether to re-record',
          'A NEW override decision (different decision_id) for the same venture/stage/gate is still recorded -- the short-circuit is keyed on decision_id equality, not "any override present"',
          'recordGateResult\'s call site and its details:/criteria: omission at eva-orchestrator.js:1322-1334 are left untouched by this fix',
        ],
      };
    }
    return item;
  });
  // FR-4 positive control
  const frWithFr4Fix = fr.map((item) => {
    if (item.id === 'FR-4') {
      return {
        ...item,
        acceptance_criteria: [
          ...item.acceptance_criteria,
          'The census script has a positive-control test: seeded with a known unbounded-retry specimen, it must report >=1 (proving the query itself can detect the pattern, not just default to 0 like a broken query would).',
        ],
      };
    }
    return item;
  });

  const tr = prd.technical_requirements
    .filter((item) => item.id !== 'TR-2' && item.id !== 'TR-3')
    .concat([
      {
        id: 'TR-2',
        title: 'Idempotent override check keyed on gate_criteria.override.decision_id (corrected)',
        description: 'Replaces the round-1 TR-2 ("fix the UPSERT") which targeted a non-existent defect -- recordGateResult\'s onConflict clause (venture_id,stage_number,gate_type) already works correctly and throws on failure; it is simply never called by the override path. The actual fix belongs in stage-execution-worker.js\'s override branch (~:867): read gate_criteria.override.decision_id before calling recordGateOverride, skip the call (and therefore the eva_stage_gate_attempts write) when it already matches the current decision.',
      },
      {
        id: 'TR-3',
        title: 'Attempt-ceiling counter sourced from the DB, not in-process memory (corrected)',
        description: 'Replaces the round-1 TR-3, which incorrectly attributed the measured ~2h/454-attempt gap to a caching/fresh-read problem. Git history fully explains that gap (the effective guard commit, QF-20260824-655/#7511, merged at 20:44:13Z, ~4 min before the last attempt at 20:48:18Z -- the fix simply had not been deployed yet). The requirement itself still stands on its own merits: FR-1\'s attempt counter must be sourced by querying eva_stage_gate_attempts (or an equivalent durable counter), not an in-memory tally that resets on worker restart -- but this is an ordinary correctness requirement, not a fix for the propagation-gap incident, which had a different, already-understood cause.',
      },
    ]);

  const ts = prd.test_scenarios.map((item) => {
    if (item.id === 'TS-3') {
      return {
        id: 'TS-3',
        scenario: 'Chairman override resolves a stuck gate (gate_criteria.override.decision_id recorded), then a second poll cycle runs (CORRECTED)',
        type: 'unit',
        expected: 'The second cycle does not call recordGateOverride again and inserts zero new eva_stage_gate_attempts rows -- asserted via the idempotency short-circuit (TR-2), NOT via eva_stage_gate_results.updated_at/resolved_outcome, which nothing in the override path was ever designed to write (round-1 TS-3 asserted on those columns and would have failed even after a correct implementation).',
      };
    }
    if (item.id === 'TS-5') {
      return {
        ...item,
        type: 'manual_e2e',
        expected: 'MANUAL verification step only (not an automated CI regression test) -- it mutates real chairman-owned production venture state (ApexNiche) and is single-shot; re-running it accidentally could restart the actual runaway. Stage-21 gate re-evaluated exactly once, matching the recorded unpark_trigger. Perform once, post-ship, deliberately.',
      };
    }
    if (item.id === 'TS-6') {
      return {
        id: 'TS-6',
        scenario: 'Idempotency check reads gate_criteria.override fresh on each poll (CORRECTED scope)',
        type: 'unit',
        expected: 'Drive processOneStage(ventureId) (lib/eva/stage-execution-worker.js:372-379, the existing test seam) TWICE with a changed fake state between calls -- first call records the override (gate_criteria.override written), second call must observe it and skip re-recording. A single invocation cannot distinguish fresh-read from a stale cache, so the test must call twice. This replaces round-1 TS-6\'s now-refuted "guard against ~2h propagation delay" framing (that delay had a different, already-understood cause -- see TR-3).',
      };
    }
    return item;
  });

  const risks = prd.risks.map((item) => {
    if (item.risk.startsWith('eva_stage_gate_results')) {
      return {
        risk: 'CORRECTED (round 2): the eva_stage_gate_results write path is NOT broken -- recordGateResult\'s UPSERT is correct and recordGateOverride reliably writes gate_criteria.override (confirmed present on the real ApexNiche specimen). The actual risk is narrower: FR-3\'s idempotency check must key strictly on decision_id equality, not "any override present" -- an overly broad check would silently swallow a legitimate NEW override for the same gate.',
        severity: 'medium',
        mitigation: 'FR-3 acceptance criteria explicitly require a new decision_id to still be recorded; TS-3 exercises the same-decision_id skip path specifically.',
      };
    }
    if (item.risk.includes('~2h')) {
      return {
        risk: 'CORRECTED (round 2): the measured ~2h/454-attempt gap between the park flag and the runaway stopping is fully explained by git history (two sequential fix commits, the effective one merging ~4 min before the last attempt) -- not a caching or propagation-delay defect in the codebase. No corrective design action is needed for this specific incident; TR-3 is retained on its own correctness merits only (DB-sourced counters, not in-memory), not as an incident-specific mitigation.',
        severity: 'low',
        mitigation: 'None needed beyond TR-3\'s ordinary DB-sourcing requirement -- documented here so the now-refuted causal claim is not silently forgotten and re-asserted later.',
      };
    }
    return item;
  });

  const metadata = {
    ...prd.metadata,
    plan_round2_correction: {
      corrected_at: new Date().toISOString(),
      trigger: 'Prospective TESTING sub-agent review (sub_agent_execution_results id 136b3c0e-8b75-46cc-b54d-b645af6588dd) at PLAN-TO-EXEC gate.',
      summary: 'FR-3/TR-2/TR-3/TS-3/TS-6 corrected: the LEAD-phase "eva_stage_gate_results silent write failure" and "~2h cache/propagation delay" premises were both falsified by direct code + git evidence. Real defect: stage-execution-worker.js:867 lacks an idempotency check before re-calling recordGateOverride. FR-1 and FR-4 acceptance criteria extended to close two coverage gaps (backoff schedule scenario, census positive control) the same review found. TS-5 reclassified manual (mutates real production venture state, single-shot risk).',
    },
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({
      functional_requirements: frWithFr4Fix,
      technical_requirements: tr,
      test_scenarios: ts,
      risks,
      metadata,
    })
    .eq('id', PRD_ID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
  console.log('PRD revised (round 2) successfully.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
