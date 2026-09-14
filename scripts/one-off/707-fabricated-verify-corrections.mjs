#!/usr/bin/env node
/**
 * SD-LEO-FIX-REPLACE-707-FABRICATED-001 — VERIFY-phase corrections.
 *
 * A PLAN-TO-LEAD VALIDATION sub-agent found a real number error: success_criteria SC3's
 * "measure" field claimed the parity suite's baseline was "73/73" -- the actual count is 33
 * (tests/unit/gates/integration-section-parity.test.js has 33 tests). The 73 figure came from
 * an earlier LEAD-phase VALIDATION report that ran THREE test files combined (the parity suite
 * + two jsonb-merge suites, 73 tests total) -- it was miscopied into SC3 as if it described the
 * parity file alone. The substantive criterion (the gate verdict is unchanged) was always
 * correctly verified; only the stated measure's number was wrong. Corrected to the real count,
 * independently confirmed multiple times this session (33/33) by direct test runs.
 *
 * Also backfills real, specific evidence into the two sd_scope_deliverables rows (FR-1, FR-3)
 * that were auto-completed by generic sub-agent-pass triggers with vacuous evidence text
 * ("Sub-agent SECURITY verdict: PASS" / a handoff-gate reconciliation marker, neither of which
 * references the actual deliverable) -- same finding class the VALIDATION review flagged.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-FIX-REPLACE-707-FABRICATED-001';
const SD_ID = 'ee236dfb-9312-49fe-a16a-bc5717f38bab';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('success_criteria')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const correctedCriteria = sd.success_criteria.map((c) => {
  if (c.criterion === 'GATE_INTEGRATION_SECTION_VALIDATION verdict is unchanged (still scores as incomplete) on every corrected row') {
    return {
      ...c,
      measure: c.measure.replace('(73/73 baseline)', '(33/33 baseline)'),
    };
  }
  return c;
});

const { data: scData, error: scErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_criteria: correctedCriteria })
  .eq('sd_key', SD_KEY)
  .select('id, sd_key')
  .single();
if (scErr) { console.error('SUCCESS_CRITERIA UPDATE FAILED:', scErr); process.exit(1); }
console.log('success_criteria corrected (73/73 -> 33/33):', JSON.stringify(scData));

const deliverableFixes = [
  {
    id: '5a6cbf80-cd7d-4690-b1c8-4aee6e56ac0f', // FR-1: Replace the 707 fabricated rows
    completion_evidence: '707/707 rows corrected live (PR #8974, commit 6e5eec0fa6c): 0 rows remain matching integration_operationalization->consumers->0->>name=\'LEO Protocol Engine\'; 707 rows carry updated_by=\'backfill-707-fabricated-integration.mjs\'; 707/707 corrected values byte-exact match buildDefaultIntegrationOperationalization()\'s real output; governance_audit_log shows exactly 707 UPDATE rows with correct changed_by attribution and full old_values/new_values (independently re-verified by 3 separate reviews: EXEC-phase TESTING sub_agent_execution_results 61498cf3, EXEC-phase SECURITY fb2661ae, and VERIFY-phase VALIDATION).',
    completion_notes: 'Superseding the prior generic auto-completion stub ("Sub-agent SECURITY verdict: PASS") with the actual deliverable evidence, per VERIFY-phase VALIDATION finding.',
  },
  {
    id: '2d72a435-87eb-4735-90a3-c83eef295c9d', // FR-3: Regression/verification coverage
    completion_evidence: 'tests/unit/backfill-707-fabricated-integration.test.js (12 tests, commits 6e5eec0fa6c + aa268e9c1c3): proves the fabrication predicate matches only genuinely-fabricated rows (a true-negative case independently confirmed live by VERIFY-phase VALIDATION -- exactly one other row in the whole table contains the marker string, inside a differently-shaped consumers object that correctly does not match); proves the updated_at CAS guard skips a row that changed since being read; proves idempotency (a second write against an already-corrected row is a no-op). All 6 mutation-test mutants (keyset pagination, updated_by attribution, batch-boundary termination, write-guard predicate literal, FABRICATION_MARKER_VALUE constant, FABRICATION_PREDICATE_PATH constant) independently confirmed killed.',
    completion_notes: 'Superseding the prior vacuous auto-completion ("reconciled_evidence: plan_to_exec_passed", verified_by=NULL) with the actual deliverable evidence, per VERIFY-phase VALIDATION finding.',
  },
];

for (const d of deliverableFixes) {
  const { data, error } = await supabase
    .from('sd_scope_deliverables')
    .update({
      completion_evidence: d.completion_evidence,
      completion_notes: d.completion_notes,
      verified_by: 'VALIDATION',
      verified_at: new Date().toISOString(),
    })
    .eq('id', d.id)
    .eq('sd_id', SD_ID)
    .select('id, deliverable_name, completion_status')
    .single();
  if (error) { console.error('DELIVERABLE UPDATE FAILED:', d.id, error); process.exit(1); }
  console.log('Backfilled evidence:', JSON.stringify(data));
}
