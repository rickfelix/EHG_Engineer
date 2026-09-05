import { computeRiskScore } from '../../lib/ship/review-risk-scorer.js';

const result = computeRiskScore(
  { linesChanged: 107, filesChanged: ['scripts/modules/phase-subagent-orchestrator/index.js', 'scripts/modules/phase-subagent-orchestrator/execution.js', 'scripts/modules/phase-subagent-orchestrator/index.phase-passthrough.test.js'] },
  2,
  undefined,
  'merge the orchestrator phase argument into sub-agent execution options so the phase actually reaches sub-agent evidence collection, fixing a fail-closed story-gate on every orchestrated TESTING run'
);
console.log(JSON.stringify(result, null, 2));
