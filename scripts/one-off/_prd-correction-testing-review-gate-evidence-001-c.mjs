#!/usr/bin/env node
/**
 * PLAN-phase PRD correction for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C, per PLAN-phase TESTING
 * sub-agent test-strategy review (evidence baded1f3, CONDITIONAL_PASS, 6 conditions). Fixes:
 * FR-C2's predicate used status='OPEN' comparisons colliding with rca-gate.js's existing
 * BLOCKING_STATUSES semantics and a status value (RESOLVED) rca.js never actually produces;
 * corrects the "26 other codes" overclaim; adds the missing IN_REVIEW / blocking-mode test
 * scenarios; documents rca.js's pre-existing CHECK-constraint edge case as a disclosed risk;
 * names the injectable {supabase} seam FR-C1/FR-C3 need in rca.js.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prd, error: fetchErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, test_scenarios, risks, system_architecture')
  .eq('id', 'PRD-SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C')
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const frs = prd.functional_requirements.map((fr) => {
  if (fr.id !== 'FR-C2') return fr;
  return {
    ...fr,
    description: fr.description.replace(
      "status != 'OPEN'",
      "root_cause IS NOT NULL AND root_cause != '' (content-based, NOT status-based -- PLAN-phase TESTING review, evidence baded1f3, found rca.js:213 never writes status='RESOLVED' (it writes IN_REVIEW/CAPA_PENDING), and that a status!='OPEN' predicate would collide with exec-to-plan/gates/rca-gate.js:33's existing BLOCKING_STATUSES semantics, which already treats IN_REVIEW/CAPA_PENDING as UNRESOLVED -- the inverse reading FR-C2 would need. A root_cause-emptiness check avoids both problems and is also robust against rca.js's own pre-existing edge case (see risks): if rca.js's UPDATE silently fails a DB CHECK constraint on low-confidence IN_REVIEW rows (warnings.push-only, verdict still reports success), root_cause stays NULL/empty on the RCR row regardless of what the sub-agent's own verdict claims, so the content-based predicate correctly still fails the gate)"
    ),
    acceptance_criteria: fr.acceptance_criteria.map((ac) =>
      ac.includes("status != 'OPEN'") || ac.includes("status='OPEN'")
        ? ac.replace(/status\s*(!=|=)\s*'OPEN'/g, "root_cause emptiness")
        : ac
    ),
  };
});

// Fix FR-C1's overclaimed "26 other dispatchable codes" acceptance criterion.
const frsFixed = frs.map((fr) => {
  if (fr.id !== 'FR-C1') return fr;
  return {
    ...fr,
    acceptance_criteria: fr.acceptance_criteria.map((ac) =>
      ac.startsWith('All 26 other dispatchable')
        ? "PLAN-phase TESTING review (evidence baded1f3) corrected the count: 33 active codes exist in leo_sub_agents, 22 modules export execute() -- the regression check is a targeted assertion that a representative non-RCA code (e.g. RISK or STORIES) still receives the SD UUID unchanged, not an unrunnable blanket claim about 26 codes"
        : ac
    ),
  };
});

const testScenarios = [
  ...prd.test_scenarios.filter((ts) => !ts.expected?.includes("status='RESOLVED'") && !ts.scenario?.includes('26 non-RCA')),
  {
    scenario: "A synthetic sub_agent_execution_results row references a root_cause_reports row with status='IN_REVIEW' (the value rca.js:213 actually writes when confidence < 70) and a populated root_cause",
    expected: 'rca-required-after-retries-gate.js considers RCA satisfied -- the predicate is root_cause-emptiness, not a specific status value (PLAN-phase TESTING correction, evidence baded1f3: rca.js never writes status=RESOLVED; live data confirms IN_REVIEW is the dominant post-analysis status)',
  },
  {
    scenario: "FR-C2's gate is tested with app_config forced to enforcement_mode='blocking' (both RCA gates are advisory by default and short-circuit before the new predicate runs under advisory mode)",
    expected: "The content predicate is observably exercised end-to-end only under forced blocking mode -- a handoff-level test alone would read green before AND after the fix, per PLAN-phase TESTING review (evidence baded1f3)",
  },
  {
    scenario: 'A representative non-RCA dispatchable code (e.g. RISK) is invoked via the generic dispatcher after FR-C1 ships',
    expected: 'It still receives the SD UUID as its first argument, unchanged -- FR-C1\'s branch is scoped to code===\'RCA\' only',
  },
];

const risks = [
  ...prd.risks,
  {
    risk: "rca.js:213 writes status='IN_REVIEW'/'CAPA_PENDING' whenever confidence < 70, but the DB's valid_confidence_for_status CHECK constraint requires confidence >= 60 for those two statuses. A confidence in [60,70) with a low pattern_match_score can violate the constraint; rca.js:224-227 catches this into warnings[] only, without failing the verdict -- a pre-existing bug in rca.js, not introduced by this SD.",
    mitigation: "FR-C2's content predicate (root_cause non-empty on the linked RCR row) is robust to this by construction: if the UPDATE silently fails, root_cause stays NULL/empty on the RCR row regardless of the sub-agent's own reported verdict, so the gate correctly still fails. Not fixed here (pre-existing, orthogonal); disclosed via completion-flags as a genuine incidental finding, not absorbed into this SD's scope.",
  },
];

const systemArchitecture = prd.system_architecture +
  " FR-C1/FR-C3's testability requires lib/sub-agents/rca.js:45 (which currently builds its own Supabase client internally inside execute()) to accept an injectable {supabase} option, matching scripts/record-explore-evidence.js's existing injected-store precedent -- named explicitly per PLAN-phase TESTING review (evidence baded1f3) so EXEC does not have to rediscover this seam requirement mid-implementation.";

const { error: updateErr } = await supabase
  .from('product_requirements_v2')
  .update({
    functional_requirements: frsFixed,
    test_scenarios: testScenarios,
    risks,
    system_architecture: systemArchitecture,
  })
  .eq('id', 'PRD-SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-C');

if (updateErr) { console.error('update error:', updateErr); process.exit(1); }
console.log('OK: PRD corrected per PLAN-phase TESTING review (evidence baded1f3).');
