import { computeRiskScore } from '../../lib/ship/review-risk-scorer.js';

const result = computeRiskScore(
  { linesChanged: 140, filesChanged: ['scripts/modules/handoff/HandoffOrchestrator.js', 'scripts/modules/handoff/HandoffOrchestrator.artifact-preflight.test.js'] },
  2,
  undefined,
  'let the existing rate-limited emergency handoff flag also clear a prerequisite preflight rejection, not just downstream gate failures'
);
console.log(JSON.stringify(result, null, 2));
