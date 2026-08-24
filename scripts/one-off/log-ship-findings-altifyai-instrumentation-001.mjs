import { logFindings } from '../../lib/ship/review-findings-logger.js';
import { readFileSync } from 'node:fs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

async function main() {
  const { owner, name } = JSON.parse(readFileSync('.claude-work/ship-repo-resolved.json', 'utf8'));

  const findings = [
    {
      type: 'CRITICAL',
      title: 'Ledger write not gated on ventures UPDATE success',
      description: 'The raw ventures.current_lifecycle_stage UPDATE preceding the new eva_stage_gate_attempts ledger write never checked its own error, so a silently-failed UPDATE could still produce a durable "chairman_adjudicated" row for an advance that never happened. Fixed by binding { error: stageUpdateError } and gating the ledger write on !stageUpdateError.',
      verdict: 'CONFIRMED',
    },
    {
      type: 'WARNING',
      title: 'recordGateAttempt reasoning never referenced the actual chairman_decisions row',
      description: 'FR-1\'s own spec text called for reasoning to cite the chairman_decisions row reference, but no call site threaded a real decision id. Fixed by having _handleChairmanGate()\'s 2 genuine chairman_decision branches return decisionId, threaded through result._chairmanDecisionId and _advanceStage()\'s chairmanDecisionId context param (plus all 4 explicit call sites) into reasoning and a new metadata field.',
      verdict: 'PLAUSIBLE',
    },
  ];

  const result = await logFindings({
    prNumber: 7504,
    reviewTier: 'deep',
    riskScore: 0.71,
    findings,
    verdict: 'pass',
    sdKey: 'SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001',
    branch: 'feat/SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001',
    multiAgent: true,
    repo: `${owner}/${name}`,
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exit(1);
}

if (isMainModule(import.meta.url)) {
  main();
}
