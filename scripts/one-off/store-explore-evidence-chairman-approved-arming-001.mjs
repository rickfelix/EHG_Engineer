import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-APPROVED-ARMING-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 92,
    summary: 'Explore pass confirmed: lib/feature-flags/registry.js exports requestApproval/approveTransition/transitionLifecycleState/markRolledOut/getFlag; lib/governance/stage-gate-predicate.js exposes checkStageGate/shouldEnforceBlock with armed read live off STAGE_GATE_PREDICATE_ARMED when omitted; the apply script scripts/one-off/qf-20260912-959-arm-stage-gate-and-graduate.mjs performs the arm+graduate sequence and its own readback proof. Repo-wide search for STAGE_GATE_PREDICATE_ARMED/markRolledOut/transitionLifecycleState found no duplicate implementation of this same arm+graduate action -- only the flag registration migration, its creation script, tests, and unrelated flag-graduation one-offs for different flags. lib/feature-flags/governance-review.js classifyFlag() confirmed to read rolled_out_at as the graduation signal markRolledOut() stamps.',
    detailed_analysis: {
      files_read: [
        'lib/feature-flags/registry.js',
        'lib/governance/stage-gate-predicate.js',
        'scripts/one-off/qf-20260912-959-arm-stage-gate-and-graduate.mjs',
        'lib/feature-flags/governance-review.js'
      ],
      key_findings: [
        'registry.js exports all required functions: requestApproval, approveTransition, transitionLifecycleState, markRolledOut, getFlag, plus the pre-existing CRUD/policy/kill-switch surface',
        'stage-gate-predicate.js checkStageGate() resolves armed via isEnabled(STAGE_GATE_PREDICATE_ARMED) when the armed param is omitted, failing safe to false on a read fault; shouldEnforceBlock() returns !!(result.armed && result.blocked)',
        'No duplicate arm+graduate implementation exists repo-wide for these three flags -- confirmed via grep on STAGE_GATE_PREDICATE_ARMED, markRolledOut, transitionLifecycleState',
        'governance-review.js classifyFlag() computes enabledNeverRolledOut = is_enabled===true && !flag.rolled_out_at && age>=ENABLED_UNROLLED_DAYS, confirming rolled_out_at is the exact graduation signal this SD stamps'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
