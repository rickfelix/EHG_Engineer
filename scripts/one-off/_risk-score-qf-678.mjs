import { computeRiskScore } from '../../lib/ship/review-risk-scorer.js';

const result = computeRiskScore(
  { linesChanged: 67, filesChanged: ['scripts/modules/handoff/validation/ValidationOrchestrator.js', 'scripts/modules/handoff/validation/ValidationOrchestrator.orchestrator-child-parent-sd-id.test.js'] },
  1,
  undefined,
  'add a bare parent_sd_id check to an orchestrator-child gate-skip guard to match an existing sibling predicate'
);
console.log(JSON.stringify(result, null, 2));
