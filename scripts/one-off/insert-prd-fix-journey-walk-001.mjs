import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-FIX-JOURNEY-WALK-001';

async function main() {
  const { data: sd, error: sdErr } = await supabase.from('strategic_directives_v2').select('id,scope,description').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const prd = {
    id: `PRD-${sd.id}`,
    directive_id: SD_KEY,
    sd_id: sd.id,
    title: 'Fix journey-walk swallowed-exception, vision-fidelity orchestrator-blindness, and per-wait-reason exemptFromWaitCeiling',
    status: 'approved',
    executive_summary: 'Three converging defects, found via RCA on a stuck orchestrator parent-completion, are fixed independently: (1) journey-walk-orchestrator.js silently swallows exceptions instead of stamping a result per its own documented contract; (2) vision-fidelity fabricates a 0% FAIL for orchestrator parents that have no product-shaped evidence to measure, corrected to a narrow orchestrator-only allowlist entry after live measurement showed the originally-proposed evidence-precondition would have been unsound system-wide; (3) a 24h WAIT ceiling escalates a long-lived, human-remediable journey-walk wait to a hard FAIL, corrected by moving exemptFromWaitCeiling onto the per-wait-reason result instead of the shared gate config.',
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'journey-walk-orchestrator.js must never leave a uat_test_runs row stuck in status=running on an exception',
        description: 'Wrap the body of the exported journey-walk function (lib/apa/journey-walk-orchestrator.js:72-144) in a real try/catch (not just the existing try/finally). On any throw after startSession() succeeds (line 86), call stampJourneyWalkResult with {status:"error", reason: err.message, ranAt: new Date().toISOString()} and mark the corresponding uat_test_runs row as failed/abandoned before rethrowing (or returning the error result, matching the pattern used by the existing !acquisition.ok and no_journey_steps paths at lines 58-68).',
        priority: 'must_have',
        acceptance_criteria: [
          'A test that forces runJourneyWalk (or any call after startSession) to throw results in stampJourneyWalkResult being called with status=error',
          'The same test asserts the uat_test_runs row for that call is NOT left in status=running afterward',
          'The existing !acquisition.ok and no_journey_steps stamped-result paths are unchanged (regression-safe)'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'VISION_FIDELITY_GATE must not fabricate a FAIL for orchestrator-type SDs from zero real implementation evidence',
        description: 'Add `orchestrator: { mode: "warn" }` to SD_TYPE_POLICIES in lib/sub-agents/vision-fidelity/severity-policy.js (lines 9-19), mirroring the existing infrastructure entry exactly. Scoped ONLY to sd_type=orchestrator (VALIDATION at LEAD measured metadata.branch_name/git_branch is NULL on 100% of SDs system-wide, not orchestrator-specific -- an unscoped evidence-presence precondition would create a large false-negative surface across every SD type with thin PRD acceptance_criteria). Do not touch readGitDiff() or loadPRD() in this SD -- the system-wide "no SD has ever had a real diff measured" defect is a separate, larger follow-up, explicitly out of scope here.',
        priority: 'must_have',
        acceptance_criteria: [
          'An orchestrator-type SD with a delegated-completion-only PRD and a real vision document no longer produces a hard FAIL verdict from VISION_FIDELITY_GATE, only a WARN',
          'A non-orchestrator SD (feature/bugfix/etc.) with thin acceptance_criteria is NOT affected -- its existing FAIL/WARN behavior is unchanged',
          'The change is a single allowlist entry addition, consistent with the file\'s own documented allowlist-only discipline (severity-policy.js:60-64)'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'exemptFromWaitCeiling must be settable per wait-reason, not only per gate, so a journey-walk WAIT is exempted from the 24h ceiling without also exempting a children-incomplete WAIT from the same gate',
        description: 'Extend buildWaitResult() (lib/handoff/wait-verdict.js:40-62) to accept and emit an exemptFromWaitCeiling boolean on the returned result object, set true only for the journey-walk WAIT reason inside prerequisite-check.js:288-310 (not for the children-incomplete or un-authored-planned-children WAIT reasons at lines 255-277 in the same file). Change the ceiling check at ValidationOrchestrator.js:388 to read (gateResult.exemptFromWaitCeiling === true || gate.exemptFromWaitCeiling === true), keeping the existing gate-level flag (exec-boundary-hold.js:84) working unchanged for its own use case.',
        priority: 'must_have',
        acceptance_criteria: [
          'A journey-walk WAIT with first_wait_at 25+ hours in the past and wait_attempts=1 does NOT auto-escalate to FAIL at the 24h ceiling',
          'A children-incomplete WAIT from the SAME gate, under the same wall-clock/attempts conditions, STILL escalates to FAIL at the 24h ceiling (negative control -- proves the exemption is scoped per-reason, not per-gate)',
          'The existing exec-boundary-hold.js gate-level exemption mechanism is unchanged and still passes its 3 existing pinning tests'
        ]
      }
    ],
    technical_requirements: [
      { id: 'TR-1', requirement: 'No new npm dependencies -- all three fixes are logic changes to existing files' },
      { id: 'TR-2', requirement: 'All three FRs are independently testable and independently revertible -- no FR depends on another shipping first' },
      { id: 'TR-3', requirement: 'db-sourced-findings.js:316-319\'s stale severity-list comment must be updated in the same diff as FR-1, since FR-1 causes it to newly emit a medium-severity uat_test finding on a crashed walk instead of silently returning [] (VALIDATION finding, desirable but must be documented)' }
    ],
    system_architecture: {
      overview: 'Three independent, surgical fixes to existing handoff-gate and journey-walk infrastructure. No new components; no schema changes beyond reading/writing existing columns (uat_test_runs.status, sd_phase_handoffs via the existing wait-verdict machinery).',
      components: ['lib/apa/journey-walk-orchestrator.js', 'lib/sub-agents/vision-fidelity/severity-policy.js', 'lib/handoff/wait-verdict.js', 'scripts/modules/handoff/validation/ValidationOrchestrator.js', 'scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js'],
      data_flow: 'journey-walk-orchestrator.js writes to uat_test_runs/uat_test_results (existing tables); severity-policy.js reads sd_type from the in-memory SD row already loaded by vision-fidelity/index.js; wait-verdict.js/ValidationOrchestrator.js exchange the wait-result object already passed through the existing gate pipeline (no new persistence).',
      integration_points: ['prerequisite-check.js (PLAN-TO-LEAD gate, calls buildWaitResult and reads journey_walk_result)', 'lib/eva/quality-findings/db-sourced-findings.js (consumes runVentureJourneyWalk return value, downstream of FR-1)']
    },
    test_scenarios: [
      { id: 'TS-1', scenario: 'journey walk throws after startSession succeeds', expected: 'stampJourneyWalkResult called with status=error; uat_test_runs row not left running' },
      { id: 'TS-2', scenario: 'journey walk throws before startSession (existing !acquisition.ok path)', expected: 'unchanged: existing stamped-result behavior preserved (regression)' },
      { id: 'TS-3', scenario: 'orchestrator SD with delegated-completion PRD + real vision doc runs VISION_FIDELITY_GATE', expected: 'WARN verdict, not FAIL' },
      { id: 'TS-4', scenario: 'non-orchestrator (feature) SD with thin acceptance_criteria runs VISION_FIDELITY_GATE', expected: 'unchanged: existing FAIL/WARN behavior, not silently upgraded to a pass' },
      { id: 'TS-5', scenario: 'journey-walk WAIT, wait_attempts=1, first_wait_at 25h ago', expected: 'exempt from 24h ceiling, does not escalate to FAIL' },
      { id: 'TS-6', scenario: 'children-incomplete WAIT (same gate), wait_attempts=1, first_wait_at 25h ago', expected: 'NOT exempt -- still escalates to FAIL at the 24h ceiling (negative control)' },
      { id: 'TS-7', scenario: 'exec-boundary-hold.js gate-level exemption (existing 3 tests)', expected: 'all 3 existing tests still pass unchanged' }
    ],
    acceptance_criteria: [
      'All 3 FRs individually verified per their own acceptance_criteria above',
      'Full unit suite passes with zero new regressions',
      'SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-002 (the SD that surfaced this RCA) is NOT re-attempted or fixed by this SD -- that happens naturally on its own next retry once these fixes ship, and is explicitly out of this SD\'s own acceptance scope'
    ],
    risks: [
      { risk: 'FR-2\'s orchestrator allowlist entry could mask a genuinely-undelivered orchestrator', impact: 'medium', likelihood: 'low', mitigation: 'prerequisite-check.js independently requires all children terminal before this gate is even reached -- defense in depth already exists at the children-completeness layer', rollback_plan: 'revert the single SD_TYPE_POLICIES entry; VISION_FIDELITY_GATE reverts to strict blocking for orchestrators' },
      { risk: 'FR-3\'s per-wait-reason exemption could be mis-scoped and accidentally exempt the wrong WAIT reason', impact: 'medium', likelihood: 'low', mitigation: 'TS-6 negative control specifically proves the children-incomplete WAIT from the SAME gate is NOT exempted', rollback_plan: 'revert buildWaitResult() extension; ValidationOrchestrator.js reverts to gate-level-only exemption check' },
      { risk: 'FR-1\'s newly-stamped error result changes db-sourced-findings.js behavior (silent [] -> a real finding)', impact: 'low', likelihood: 'high (intentional)', mitigation: 'severity-capped at medium so it cannot newly block any high/critical-gated flow; documented explicitly in TR-3', rollback_plan: 'revert FR-1; behavior returns to silent swallow (not recommended, but mechanically reversible)' }
    ],
    implementation_approach: {
      phases: ['FR-1: journey-walk-orchestrator.js exception handling', 'FR-2: severity-policy.js orchestrator allowlist entry', 'FR-3: wait-verdict.js + ValidationOrchestrator.js per-wait-reason exemption'],
      technical_decisions: [
        'FR-2 corrected from the originally-proposed evidence-presence precondition to a narrow SD_TYPE_POLICIES allowlist entry after VALIDATION measured branch_name is NULL on 100% of SDs system-wide, not just orchestrators',
        'FR-3 corrected from setting exemptFromWaitCeiling on the shared gate config to emitting it per-wait-reason on the result object, after VALIDATION found the gate config approach would exempt all 3 WAIT reasons sharing one gate, including children-incomplete'
      ]
    },
    integration_operationalization: {
      consumers: ['scripts/modules/handoff/executors/plan-to-lead/index.js (PLAN-TO-LEAD gate pipeline)', 'lib/eva/quality-findings/db-sourced-findings.js (consumes journey-walk return value)'],
      dependencies: ['No new dependencies -- all 3 fixes are logic changes to existing files'],
      data_contracts: ['uat_test_runs.status transitions to failed/abandoned instead of staying running forever on FR-1', 'wait-verdict result object gains an exemptFromWaitCeiling field on FR-3'],
      runtime_config: 'No feature flag needed (all 3 fixes are corrective, not behavior-toggled); standard PR merge to main',
      observability_rollout: 'uat_test_runs rows stuck in status=running for >1h become a signal worth a future follow-up dashboard check (not built in this SD)'
    },
    exploration_summary: {
      files_read: ['lib/apa/journey-walk-orchestrator.js', 'lib/sub-agents/vision-fidelity/index.js', 'lib/sub-agents/vision-fidelity/severity-policy.js', 'scripts/modules/handoff/executors/plan-to-lead/gates/prerequisite-check.js', 'scripts/modules/handoff/validation/ValidationOrchestrator.js', 'lib/handoff/wait-verdict.js', 'lib/eva/quality-findings/db-sourced-findings.js'],
      patterns_identified: ['journey-walk-orchestrator.js\'s existing stamped-result pattern for !acquisition.ok / no_journey_steps paths (lines 58-68) is the template FR-1 extends to the main-body throw case', 'severity-policy.js\'s existing allowlist-only discipline (never a denylist) is the template FR-2 follows'],
      key_decisions: ['FR-2 and FR-3 both corrected mid-LEAD after VALIDATION measurement disproved the RCA\'s initially-proposed approach -- see technical_decisions above'],
      exploration_date: '2026-08-31'
    }
  };

  const { error } = await supabase.from('product_requirements_v2').upsert(prd, { onConflict: 'id' });
  if (error) throw error;
  console.log('OK PRD inserted for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
