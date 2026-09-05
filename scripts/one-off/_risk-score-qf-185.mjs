import { computeRiskScore } from '../../lib/ship/review-risk-scorer.js';

const result = computeRiskScore(
  { linesChanged: 117, filesChanged: ['scripts/modules/prd-quality-validation.js', 'scripts/modules/prd-quality-validation-placeholder-code-tokens.test.js'] },
  1,
  undefined,
  'strip function-call/file-path/constant code tokens before a PRD placeholder-content substring match so legitimate identifier references stop self-flagging'
);
console.log(JSON.stringify(result, null, 2));
