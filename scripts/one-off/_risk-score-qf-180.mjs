import { computeRiskScore } from '../../lib/ship/review-risk-scorer.js';

const result = computeRiskScore(
  { linesChanged: 23, filesChanged: ['.claude/commands/checkin.md'] },
  1,
  undefined,
  'add a missing instruction to a worker-facing markdown doc naming a JSON field workers must read on every check-in'
);
console.log(JSON.stringify(result, null, 2));
