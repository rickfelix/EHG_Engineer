#!/usr/bin/env node
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WORKER-WIND-DOWN-001';

const findings = [
  {
    id: 'sole-hook-touched',
    severity: 'INFO',
    summary: 'scripts/hooks/stop-loop-wakeup-reminder.cjs is the only file modified for this SD scope (the worker-side wind-down/completion path). No other hook or checkin script needed changes -- resolveCheckin (scripts/worker-checkin.cjs) was reused unmodified, satisfying the non-goal "any change to claim predicates themselves" is out of scope.',
  },
  {
    id: 'no-pre-existing-tests-for-new-surface',
    severity: 'INFO',
    summary: 'No test file referenced isSameTurnClaimEnabled, shouldAttemptSameTurnClaim, attemptSameTurnNextClaim, or recordSameTurnClaimAttempt prior to this SD -- new coverage added in tests/unit/hooks/stop-loop-same-turn-next-claim.test.js (26 tests), no pre-existing suite to reconcile.',
  },
  {
    id: 'coordinator-side-half-separate',
    severity: 'INFO',
    summary: 'SD description references a coordinator-side dispatch fix already committed in review row a9510e82, explicitly out of scope for this (worker-side) SD -- confirmed no coordinator dispatch files were touched.',
  },
];

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });
  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings,
    warnings: [],
    recommendations: [],
    summary: 'Explore-phase discovery for SD-LEO-INFRA-WORKER-WIND-DOWN-001 confirmed the sole in-scope file is scripts/hooks/stop-loop-wakeup-reminder.cjs, no pre-existing test coverage for the new same-turn-claim surface existed, and the coordinator-side half of this dispatch-efficiency fix is a separate, already-committed change.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: ['scripts/hooks/stop-loop-wakeup-reminder.cjs', 'scripts/worker-checkin.cjs', 'lib/checkin/steps/recover-stranded-final.cjs', 'lib/checkin/steps/adopt-orphan.cjs'],
    },
    phase: 'LEAD_TO_PLAN',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('Explore', SD_KEY, { name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' });
  console.log('EXPLORE EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
